'use server';

import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/utils/supabase/server';
import { requireAnyChildModule, isAccessDenied } from '@/lib/auth/require-access';
import type { ContactWithRelations, ContactTag } from '@/app/actions/contacts';

/**
 * CRM Customers — same contact list as the Contacts module
 * (org-scoped top-level contacts / persons), not limited to customer_rank.
 */
export async function getCrmCustomers(search?: string) {
  try {
    const auth = await requireAnyChildModule(['crm-customers']);
    if (isAccessDenied(auth)) return { error: auth.error };

    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };

    const {
      requireAdminOrganizationScope,
      applyOrganizationFilter,
      isMissingOrganizationColumnError,
      sessionUsesOrganizationScope,
    } = await import('@/lib/admin-organization-context');

    const scope = sessionUsesOrganizationScope(session.role)
      ? await requireAdminOrganizationScope()
      : null;
    if (scope && 'error' in scope) {
      if (scope.status === 403) return { customers: [] as ContactWithRelations[] };
      return { error: scope.error };
    }

    if (scope && !('error' in scope) && !scope.organizationId) {
      return { customers: [] as ContactWithRelations[] };
    }

    const supabase = await createAdminClient();

    // Avoid stacked .or() filters (PostgREST Bad Request).
    let query = supabase
      .from('contacts')
      .select('*')
      .is('parent_id', null);

    if (scope && !('error' in scope) && scope.organizationId) {
      query = applyOrganizationFilter(query, scope.organizationId);
    }

    query = query.order('name', { ascending: true });

    const { data: rows, error } = await query;

    if (error && isMissingOrganizationColumnError(error)) {
      return {
        error:
          'Contacts organization column is missing. Run add_organization_id_to_core_tables.sql.',
      };
    }

    if (error) return { error: error.message };

    let filtered = rows || [];

    try {
      const {
        resolveSalesAccessRole,
        salesRoleSeesAllOrgRecords,
      } = await import('@/lib/sales-roles');
      const role = resolveSalesAccessRole(session as never);
      if (role && !salesRoleSeesAllOrgRecords(role)) {
        const { resolveCurrentSalespersonId } = await import(
          '@/app/actions/sales/automation'
        );
        const agentId = await resolveCurrentSalespersonId();
        const username = String(session.username || '').trim();
        filtered = filtered.filter((c) => {
          if (agentId && c.salesperson_id === agentId) return true;
          if (username && c.created_by === username) return true;
          return false;
        });
      }
    } catch {
      // best-effort
    }

    const needle = String(search || '').trim().toLowerCase();
    if (needle) {
      filtered = filtered.filter((c) => {
        const hay = [c.name, c.email, c.phone, c.company_name, c.country]
          .map((v) => String(v || '').toLowerCase())
          .join(' ');
        return hay.includes(needle);
      });
    }

    const contactIds = filtered.map((c) => c.id);
    const tagLinks: { contact_id: string; tag_id: string }[] = [];
    const tags: ContactTag[] = [];

    if (contactIds.length > 0) {
      const IN_CHUNK = 120;
      for (let i = 0; i < contactIds.length; i += IN_CHUNK) {
        const chunk = contactIds.slice(i, i + IN_CHUNK);
        const { data: linkRows } = await supabase
          .from('contact_tag_links')
          .select('contact_id, tag_id')
          .in('contact_id', chunk);
        if (linkRows?.length) tagLinks.push(...linkRows);
      }

      const tagIds = [...new Set(tagLinks.map((l) => l.tag_id))];
      for (let i = 0; i < tagIds.length; i += IN_CHUNK) {
        const chunk = tagIds.slice(i, i + IN_CHUNK);
        const { data: tagRows } = await supabase
          .from('contact_tags')
          .select('*')
          .in('id', chunk);
        if (tagRows?.length) tags.push(...(tagRows as ContactTag[]));
      }
    }

    const tagById = new Map(tags.map((t) => [t.id, t]));
    const tagsByContact = new Map<string, ContactTag[]>();
    for (const link of tagLinks) {
      const tag = tagById.get(link.tag_id);
      if (!tag) continue;
      const list = tagsByContact.get(link.contact_id) || [];
      list.push(tag);
      tagsByContact.set(link.contact_id, list);
    }

    const customers: ContactWithRelations[] = filtered.map((c) => ({
      ...(c as ContactWithRelations),
      tags: tagsByContact.get(c.id) || [],
      children: [],
    }));

    return { customers };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load CRM customers' };
  }
}

/** Search customers for the CRM global search bar. */
export async function searchCrmCustomers(query: string) {
  return getCrmCustomers(query);
}

export async function getCrmCustomerById(contactId: string) {
  try {
    const auth = await requireAnyChildModule(['crm-customers']);
    if (isAccessDenied(auth)) return { error: auth.error };

    const { getContactById } = await import('@/app/actions/contacts');
    const result = await getContactById(contactId);
    if ('error' in result && result.error) return { error: result.error };
    if (!('contact' in result) || !result.contact) return { error: 'Contact not found.' };

    return { contact: result.contact };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load customer' };
  }
}
