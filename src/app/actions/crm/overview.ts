'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { isSuperAdminSession } from '@/lib/auth/super-admin';
import { applyOrganizationFilter } from '@/lib/admin-organization-context';
import { resolveCrmOrganizationScope } from '@/app/actions/crm/shared';
import { getContactsPage } from '@/app/actions/contacts';
import { CONTACTS_LIST_OR_FILTER } from '@/lib/contacts-list-filter';
import { actionError } from '@/lib/user-facing-error';

export type CrmPipelineTotals = {
  contacts: number;
  inquiriesSent: number;
  approved: number;
  rejected: number;
  /** sent_at of each counted inquiry, for the chart over time. */
  inquirySentAt: string[];
};

export type CrmPipelineTotalsFilters = {
  /** ISO timestamps; from inclusive, to exclusive. */
  from?: string | null;
  to?: string | null;
  /** sales_agents.id, or 'unassigned'. */
  assignee?: string | null;
};

/**
 * Contact and inquiry totals for Super Admin's pipeline summary, counted exactly
 * as the Contacts page and the All Inquiries page count them. Read-only.
 */
export async function getCrmPipelineTotals(
  filters: CrmPipelineTotalsFilters = {}
): Promise<{ totals: CrmPipelineTotals } | { error: string }> {
  try {
    if (!isSuperAdminSession(await getSession())) return { error: 'Access Denied' };
    const scope = await resolveCrmOrganizationScope();
    if ('error' in scope) return { error: scope.error };

    const assignee = filters.assignee && filters.assignee !== 'all' ? filters.assignee : undefined;

    const supabase = await createAdminClient();

    // Contacts: the number the Contacts module shows.
    // - A salesperson picked: that person's own Contacts page lists every
    //   contact assigned to them, in any company, so count the same way.
    // - Admin view: the Contacts page lists nothing there, so count the same
    //   contacts across every company.
    // - Otherwise: the Contacts page's own count for this company ("All (N)").
    const countAcrossCompanies = scope.isGlobalAdminView || (assignee !== undefined && assignee !== 'unassigned');
    const contactsResult: Promise<{ totalCount: number } | { error: string }> = countAcrossCompanies
      ? (async () => {
          let q = supabase.from('contacts').select('id', { count: 'exact', head: true }).or(CONTACTS_LIST_OR_FILTER);
          if (filters.from) q = q.gte('created_at', filters.from);
          if (filters.to) q = q.lt('created_at', filters.to);
          if (assignee) q = assignee === 'unassigned' ? q.is('salesperson_id', null) : q.eq('salesperson_id', assignee);
          const { count, error } = await q;
          return error ? { error: actionError(error, 'Unable to count contacts') } : { totalCount: count ?? 0 };
        })()
      : getContactsPage({
          page: 1,
          pageSize: 1,
          includeSourceCounts: false,
          createdAtGte: filters.from ?? undefined,
          createdAtLt: filters.to ?? undefined,
          salespersonId: assignee,
        });

    // Inquiries: the All Inquiries list — sent to accounting, with a lead.
    let inquiries = supabase
      .from('lead_inquiries')
      .select('approval_status, sent_at, leads!inner(sales_agent_id)')
      .eq('sent_to_accounting', true);
    inquiries = applyOrganizationFilter(inquiries, scope.isGlobalAdminView ? null : scope.organizationId);
    if (filters.from) inquiries = inquiries.gte('sent_at', filters.from);
    if (filters.to) inquiries = inquiries.lt('sent_at', filters.to);
    if (assignee) {
      inquiries =
        assignee === 'unassigned'
          ? inquiries.is('leads.sales_agent_id', null)
          : inquiries.eq('leads.sales_agent_id', assignee);
    }

    const [contacts, inquiryRows] = await Promise.all([contactsResult, inquiries]);
    if ('error' in contacts && contacts.error) return { error: contacts.error };
    if (inquiryRows.error) return { error: actionError(inquiryRows.error, 'Unable to load inquiry totals') };

    const rows = inquiryRows.data ?? [];
    const statuses = rows.map((row) => String(row.approval_status || ''));
    return {
      totals: {
        contacts: 'totalCount' in contacts ? contacts.totalCount : 0,
        inquiriesSent: statuses.length,
        approved: statuses.filter((s) => s === 'approved').length,
        rejected: statuses.filter((s) => s === 'rejected').length,
        inquirySentAt: rows.map((row) => (row.sent_at ? String(row.sent_at) : '')).filter(Boolean),
      },
    };
  } catch (err) {
    return { error: actionError(err, 'Unable to load pipeline totals') };
  }
}
