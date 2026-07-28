import type { createAdminClient } from '@/utils/supabase/server';

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminClient>>;

/** Scheduled customer-facing activity types shown under Contact → Meetings. */
export const CRM_CONTACT_MEETING_ACTIVITY_TYPES = ['meeting', 'call', 'email'] as const;

/** Task-style activity types shown under Contact → Tasks. */
export const CRM_CONTACT_TASK_ACTIVITY_TYPES = ['todo', 'follow-up'] as const;

async function fetchOpportunityIds(
  supabase: SupabaseAdmin,
  organizationId: string | null | undefined,
  isGlobalAdminView: boolean | undefined,
  filters: { contact_id?: string; contact_person_id?: string; parent_id?: string }
): Promise<string[]> {
  let query = supabase.from('crm_opportunities').select('id');

  if (filters.contact_id) query = query.eq('contact_id', filters.contact_id);
  if (filters.contact_person_id) query = query.eq('contact_person_id', filters.contact_person_id);
  if (filters.parent_id) {
    query = query.eq('contact_id', filters.parent_id);
    if (filters.contact_person_id) {
      query = query.eq('contact_person_id', filters.contact_person_id);
    }
  }

  if (organizationId && !isGlobalAdminView) {
    query = query.eq('organization_id', organizationId);
  }

  const { data } = await query;
  return (data || []).map((row) => String(row.id));
}

/**
 * Resolve CRM opportunity ids linked to a contact:
 * - direct customer (contact_id)
 * - contact person on an opportunity (contact_person_id)
 * - person linked to a company (parent company's opportunities)
 */
export async function resolveOpportunityIdsForContact(
  supabase: SupabaseAdmin,
  contactId: string,
  options?: { organizationId?: string | null; isGlobalAdminView?: boolean }
): Promise<string[]> {
  const id = String(contactId || '').trim();
  if (!id) return [];

  const { data: contact } = await supabase
    .from('contacts')
    .select('id, parent_id')
    .eq('id', id)
    .maybeSingle();

  const parentId = contact?.parent_id ? String(contact.parent_id) : null;

  const batches = await Promise.all([
    fetchOpportunityIds(supabase, options?.organizationId, options?.isGlobalAdminView, {
      contact_id: id,
    }),
    fetchOpportunityIds(supabase, options?.organizationId, options?.isGlobalAdminView, {
      contact_person_id: id,
    }),
    parentId
      ? fetchOpportunityIds(supabase, options?.organizationId, options?.isGlobalAdminView, {
          parent_id: parentId,
          contact_person_id: id,
        })
      : Promise.resolve([]),
    parentId
      ? fetchOpportunityIds(supabase, options?.organizationId, options?.isGlobalAdminView, {
          contact_id: parentId,
        })
      : Promise.resolve([]),
  ]);

  return [...new Set(batches.flat())];
}
