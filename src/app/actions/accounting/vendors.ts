'use server';

import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/utils/supabase/server';
import { sessionHasAccountingAccess } from '@/lib/accounting-page-access';
import type { ContactWithRelations, ContactTag } from '@/app/actions/contacts';

/**
 * Accounting Vendors — same Contacts rows (vendor_rank > 0).
 */
export async function getAccountingVendors(opts?: {
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  try {
    const session = await getSession();
    if (!session || !sessionHasAccountingAccess(session)) {
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
      if (scope.status === 403) {
        return { vendors: [] as ContactWithRelations[], total: 0, page: 1, pageSize: 40 };
      }
      return { error: scope.error };
    }

    if (scope && !('error' in scope) && !scope.organizationId) {
      return { vendors: [] as ContactWithRelations[], total: 0, page: 1, pageSize: 40 };
    }

    const page = Math.max(1, opts?.page || 1);
    const pageSize = Math.min(50, Math.max(10, opts?.pageSize || 40));
    const supabase = await createAdminClient();

    let query = supabase
      .from('contacts')
      .select(
        'id, name, company_name, company_type, email, phone, mobile, city, country, lead_id_formatted, organization_id, vendor_rank, customer_rank, parent_id',
        { count: 'exact' }
      )
      .gt('vendor_rank', 0)
      .is('parent_id', null);

    if (scope && !('error' in scope) && scope.organizationId) {
      query = applyOrganizationFilter(query, scope.organizationId);
    }

    const needle = String(opts?.search || '').trim();
    if (needle) {
      const like = `%${needle}%`;
      query = query.or(
        `name.ilike.${like},company_name.ilike.${like},email.ilike.${like},phone.ilike.${like},mobile.ilike.${like},lead_id_formatted.ilike.${like},city.ilike.${like},country.ilike.${like}`
      );
    }

    query = query
      .order('name', { ascending: true })
      .range((page - 1) * pageSize, page * pageSize - 1);

    const { data: rows, error, count } = await query;

    if (error && isMissingOrganizationColumnError(error)) {
      return {
        error:
          'Contacts organization column is missing. Run add_organization_id_to_core_tables.sql.',
      };
    }
    if (error) return { error: error.message };

    const filtered = rows || [];
    const contactIds = filtered.map((c) => c.id);
    const tagLinks: { contact_id: string; tag_id: string }[] = [];
    const tags: ContactTag[] = [];

    if (contactIds.length > 0) {
      const { data: links } = await supabase
        .from('contact_tag_links')
        .select('contact_id, tag_id')
        .in('contact_id', contactIds);
      if (links?.length) tagLinks.push(...links);
      const tagIds = [...new Set(tagLinks.map((l) => l.tag_id))];
      if (tagIds.length) {
        const { data: tagRows } = await supabase
          .from('contact_tags')
          .select('*')
          .in('id', tagIds);
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

    const vendors: ContactWithRelations[] = filtered.map((c) => ({
      ...(c as ContactWithRelations),
      tags: tagsByContact.get(c.id) || [],
      children: [],
    }));

    return {
      vendors,
      total: count ?? vendors.length,
      page,
      pageSize,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load vendors',
    };
  }
}
