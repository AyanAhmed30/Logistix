'use server';

import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/utils/supabase/server';
import { sessionHasSalesAccess } from '@/lib/auth/require-access';
import type { ContactWithRelations, ContactTag } from '@/app/actions/contacts';

/**
 * Sales Customers — Contacts with customer_rank > 0 (same Contacts table).
 * No duplicate Customers API/table.
 */
export async function getSalesCustomers(search?: string) {
  try {
    const session = await getSession();
    if (!session || !sessionHasSalesAccess(session)) {
      return { error: 'Unauthorized' };
    }

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

    let query = supabase
      .from('contacts')
      .select('*')
      .gt('customer_rank', 0)
      .or('parent_id.is.null,and(company_type.eq.person,contact_kind.eq.contact)');

    if (scope && !('error' in scope) && scope.organizationId) {
      query = applyOrganizationFilter(query, scope.organizationId);
    }

    try {
      const { resolveSalesAccessRole, salesRoleSeesAllOrgRecords } = await import(
        '@/lib/sales-roles'
      );
      const role = resolveSalesAccessRole(session as never);
      if (role && !salesRoleSeesAllOrgRecords(role)) {
        const { resolveCurrentSalespersonId } = await import(
          '@/app/actions/sales/automation'
        );
        const agentId = await resolveCurrentSalespersonId();
        if (agentId) {
          query = query.or(
            `salesperson_id.eq.${agentId},created_by.eq.${session.username}`
          );
        } else {
          query = query.eq('created_by', session.username);
        }
      }
    } catch {
      // best-effort
    }

    query = query.order('name', { ascending: true });

    const needle = String(search || '').trim();
    if (needle) {
      const like = `%${needle}%`;
      query = query.or(
        `name.ilike.${like},email.ilike.${like},phone.ilike.${like},company_name.ilike.${like},country.ilike.${like}`
      );
    }

    const { data: contacts, error } = await query;

    if (error && isMissingOrganizationColumnError(error)) {
      return {
        error:
          'Contacts organization column is missing. Run add_organization_id_to_core_tables.sql.',
      };
    }

    if (error) return { error: error.message };

    const rows = contacts || [];
    const contactIds = rows.map((c) => c.id);
    let tagLinks: { contact_id: string; tag_id: string }[] = [];
    let tags: ContactTag[] = [];

    if (contactIds.length > 0) {
      const { data: links } = await supabase
        .from('contact_tag_links')
        .select('contact_id, tag_id')
        .in('contact_id', contactIds);
      tagLinks = links || [];
      const tagIds = [...new Set(tagLinks.map((l) => l.tag_id))];
      if (tagIds.length > 0) {
        const { data: tagRows } = await supabase
          .from('contact_tags')
          .select('*')
          .in('id', tagIds);
        tags = (tagRows || []) as ContactTag[];
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

    const customers: ContactWithRelations[] = rows.map((c) => ({
      ...(c as ContactWithRelations),
      tags: tagsByContact.get(c.id) || [],
      children: [],
    }));

    return { customers };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load customers',
    };
  }
}
