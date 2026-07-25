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

    let query = supabase
      .from('contacts')
      .select('*')
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
      const { data: linkRows } = await supabase
        .from('contact_tag_links')
        .select('contact_id, tag_id')
        .in('contact_id', contactIds);

      tagLinks = linkRows || [];

      const tagIds = [...new Set(tagLinks.map((l) => l.tag_id))];
      if (tagIds.length > 0) {
        const { data: tagRows } = await supabase.from('contact_tags').select('*').in('id', tagIds);
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
