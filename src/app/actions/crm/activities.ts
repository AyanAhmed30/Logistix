'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { requireAnyChildModule, isAccessDenied } from '@/lib/auth/require-access';
import {
  resolveCrmOrganizationScope,
  requireCrmOrganizationScope,
  revalidateCrmPipelinePaths,
} from '@/app/actions/crm/shared';
import { resolveSalesAgentForSession } from '@/lib/legacy-user-bridge';
import { logOpportunityChatterAudit } from '@/app/actions/crm/chatter';
import type {
  CrmActivityListFilters,
  CrmActivityUpsertInput,
  CrmActivityType,
  CrmScheduledActivity,
  CrmActivitiesSummary,
} from '@/app/actions/crm/types';
import {
  CRM_CONTACT_MEETING_ACTIVITY_TYPES,
  resolveOpportunityIdsForContact,
} from '@/lib/crm-contact-opportunities';

const ACTIVITY_TYPES: CrmActivityType[] = ['call', 'meeting', 'email', 'follow-up', 'todo'];

function mapActivity(row: Record<string, unknown>): CrmScheduledActivity {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    opportunity_id: String(row.opportunity_id),
    activity_type: (ACTIVITY_TYPES.includes(row.activity_type as CrmActivityType)
      ? row.activity_type
      : 'todo') as CrmActivityType,
    summary: String(row.summary || ''),
    notes: row.notes ? String(row.notes) : null,
    due_date: row.due_date ? String(row.due_date) : null,
    assigned_to: row.assigned_to ? String(row.assigned_to) : null,
    assigned_to_name: null,
    status: (['scheduled', 'done', 'cancelled'].includes(String(row.status))
      ? row.status
      : 'scheduled') as CrmScheduledActivity['status'],
    completed_at: row.completed_at ? String(row.completed_at) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

async function enrichActivities(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return [] as CrmScheduledActivity[];

  const supabase = await createAdminClient();
  const agentIds = [...new Set(rows.map((r) => r.assigned_to).filter(Boolean))] as string[];
  const oppIds = [...new Set(rows.map((r) => r.opportunity_id).filter(Boolean))] as string[];

  const [agentsRes, oppsRes] = await Promise.all([
    agentIds.length
      ? supabase.from('sales_agents').select('id, name').in('id', agentIds)
      : Promise.resolve({ data: [] }),
    oppIds.length
      ? supabase.from('crm_opportunities').select('id, name, contact_id').in('id', oppIds)
      : Promise.resolve({ data: [] }),
  ]);

  const agentMap = new Map(
    (agentsRes.data || []).map((a) => [String(a.id), String(a.name || '')])
  );
  const oppMap = new Map(
    (oppsRes.data || []).map((o) => [
      String(o.id),
      { name: String(o.name || ''), contact_id: o.contact_id ? String(o.contact_id) : null },
    ])
  );

  const contactIds = [...new Set([...oppMap.values()].map((o) => o.contact_id).filter(Boolean))] as string[];
  let contactMap = new Map<string, string>();
  if (contactIds.length) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, name, company_name')
      .in('id', contactIds);
    contactMap = new Map(
      (contacts || []).map((c) => [String(c.id), String(c.company_name || c.name || '')])
    );
  }

  return rows.map((row) => {
    const base = mapActivity(row);
    const opp = oppMap.get(base.opportunity_id);
    return {
      ...base,
      assigned_to_name: base.assigned_to ? agentMap.get(base.assigned_to) || null : null,
      opportunity_name: opp?.name || null,
      customer_name: opp?.contact_id ? contactMap.get(opp.contact_id) || null : null,
    };
  });
}

async function getSessionAgentId() {
  const session = await getSession();
  if (!session) return null;
  const supabase = await createAdminClient();
  const agent = await resolveSalesAgentForSession(supabase, session);
  return agent?.id ?? null;
}

export async function getCrmActivitiesSummary(): Promise<
  { summary: CrmActivitiesSummary } | { error: string }
> {
  const auth = await requireAnyChildModule(['crm-activities', 'crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await resolveCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const supabase = await createAdminClient();
  const now = new Date().toISOString();

  let query = supabase
    .from('crm_activities')
    .select('id, due_date, status')
    .eq('status', 'scheduled');

  if (!scope.isGlobalAdminView) {
    query = query.eq('organization_id', scope.organizationId);
  }

  const { data, error } = await query;
  if (error) return { error: error.message };

  const rows = data || [];
  const scheduled_count = rows.length;
  const overdue_count = rows.filter(
    (r) => r.due_date && String(r.due_date) < now
  ).length;

  return { summary: { scheduled_count, overdue_count } };
}

export async function getCrmActivities(filters: CrmActivityListFilters = {}) {
  const auth = await requireAnyChildModule(['crm-activities', 'crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await resolveCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error, activities: [] as CrmScheduledActivity[] };

  const supabase = await createAdminClient();
  let query = supabase.from('crm_activities').select('*').order('due_date', { ascending: true });

  if (!scope.isGlobalAdminView) {
    query = query.eq('organization_id', scope.organizationId);
  }

  const { resolveCrmVisibilityScope } = await import('@/lib/crm-visibility');
  const visibility = await resolveCrmVisibilityScope(scope.session);
  if (visibility.mode === 'assigned' && (!filters.assignedTo || filters.assignedTo === 'all')) {
    query = query.eq('assigned_to', visibility.salesAgentId);
  }

  if (filters.activityType && filters.activityType !== 'all') {
    if (filters.activityType === 'tasks') {
      query = query.in('activity_type', ['todo', 'follow-up']);
    } else if (filters.activityType === 'meetings') {
      query = query.in('activity_type', [...CRM_CONTACT_MEETING_ACTIVITY_TYPES]);
    } else {
      query = query.eq('activity_type', filters.activityType);
    }
  }

  if (filters.contactId) {
    const contactOppIds = await resolveOpportunityIdsForContact(supabase, filters.contactId, {
      organizationId: scope.isGlobalAdminView ? null : scope.organizationId,
      isGlobalAdminView: scope.isGlobalAdminView,
    });
    if (!contactOppIds.length) return { activities: [] as CrmScheduledActivity[] };
    query = query.in('opportunity_id', contactOppIds);
  }

  if (filters.status === 'completed' || filters.status === 'done') {
    query = query.eq('status', 'done');
  } else if (filters.status === 'cancelled') {
    query = query.eq('status', 'cancelled');
  } else if (filters.status === 'scheduled') {
    query = query.eq('status', 'scheduled');
  } else if (filters.status && filters.status !== 'all') {
    query = query.eq('status', 'scheduled');
  }

  if (filters.assignedTo && filters.assignedTo !== 'all') {
    if (filters.assignedTo === 'me') {
      const agentId = await getSessionAgentId();
      if (!agentId) return { activities: [] };
      query = query.eq('assigned_to', agentId);
    } else {
      query = query.eq('assigned_to', filters.assignedTo);
    }
  }

  const { data, error } = await query;
  if (error) return { error: error.message };

  let activities = await enrichActivities((data || []) as Record<string, unknown>[]);

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  if (filters.status === 'overdue') {
    activities = activities.filter(
      (a) => a.status === 'scheduled' && a.due_date && new Date(a.due_date) < startOfToday
    );
  } else if (filters.status === 'today') {
    activities = activities.filter((a) => {
      if (a.status !== 'scheduled' || !a.due_date) return false;
      const d = new Date(a.due_date);
      return d >= startOfToday && d <= endOfToday;
    });
  } else if (filters.status === 'upcoming') {
    activities = activities.filter((a) => {
      if (a.status !== 'scheduled' || !a.due_date) return false;
      return new Date(a.due_date) > endOfToday;
    });
  } else if (filters.status === 'completed') {
    activities = activities.filter((a) => a.status === 'done');
  }

  return { activities };
}

export async function getCrmActivitiesForOpportunity(opportunityId: string) {
  const auth = await requireAnyChildModule(['crm-pipeline', 'crm-activities']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await resolveCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const supabase = await createAdminClient();
  let query = supabase
    .from('crm_activities')
    .select('*')
    .eq('opportunity_id', opportunityId)
    .order('due_date', { ascending: true });

  if (!scope.isGlobalAdminView) {
    query = query.eq('organization_id', scope.organizationId);
  }

  const { data, error } = await query;
  if (error) return { error: error.message };

  const activities = await enrichActivities((data || []) as Record<string, unknown>[]);
  const next = activities.find((a) => a.status === 'scheduled') || null;
  return { activities, next_activity: next };
}

export async function createCrmActivity(input: CrmActivityUpsertInput) {
  const auth = await requireAnyChildModule(['crm-pipeline', 'crm-activities']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await requireCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const summary = String(input.summary || '').trim();
  if (!summary) return { error: 'Activity summary is required.' };
  if (!input.opportunity_id) return { error: 'Opportunity is required.' };
  if (!input.assigned_to) return { error: 'Assigned user is required.' };
  if (!ACTIVITY_TYPES.includes(input.activity_type)) return { error: 'Invalid activity type.' };

  const supabase = await createAdminClient();
  const { data: opp } = await supabase
    .from('crm_opportunities')
    .select('id, organization_id')
    .eq('id', input.opportunity_id)
    .eq('organization_id', scope.organizationId)
    .maybeSingle();

  if (!opp) return { error: 'Opportunity not found.' };

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('crm_activities')
    .insert({
      organization_id: scope.organizationId,
      opportunity_id: input.opportunity_id,
      activity_type: input.activity_type,
      summary,
      notes: input.notes || null,
      due_date: input.due_date || null,
      assigned_to: input.assigned_to,
      status: 'scheduled',
      created_by: scope.session.username,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error || !data) return { error: error?.message || 'Failed to schedule activity.' };

  await logOpportunityChatterAudit({
    opportunityId: input.opportunity_id,
    organizationId: scope.organizationId,
    performedBy: scope.session.username,
    body: `Activity scheduled: ${summary}`,
    metadata: { event: 'activity_scheduled', activity_id: data.id },
  });

  const [activity] = await enrichActivities([data as Record<string, unknown>]);
  await revalidateCrmPipelinePaths();
  revalidatePath('/crm/activities');
  return { activity };
}

export async function updateCrmActivity(input: CrmActivityUpsertInput) {
  const auth = await requireAnyChildModule(['crm-pipeline', 'crm-activities']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const id = input.id ? String(input.id) : '';
  if (!id) return { error: 'Activity id is required.' };

  const scope = await requireCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const summary = String(input.summary || '').trim();
  if (!summary) return { error: 'Activity summary is required.' };

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('crm_activities')
    .update({
      activity_type: input.activity_type,
      summary,
      notes: input.notes || null,
      due_date: input.due_date || null,
      assigned_to: input.assigned_to,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', scope.organizationId)
    .select('*')
    .single();

  if (error || !data) return { error: error?.message || 'Failed to update activity.' };

  const [activity] = await enrichActivities([data as Record<string, unknown>]);
  await revalidateCrmPipelinePaths();
  revalidatePath('/crm/activities');
  return { activity };
}

export async function deleteCrmActivity(activityId: string) {
  const auth = await requireAnyChildModule(['crm-pipeline', 'crm-activities']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await requireCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from('crm_activities')
    .delete()
    .eq('id', activityId)
    .eq('organization_id', scope.organizationId);

  if (error) return { error: error.message };
  await revalidateCrmPipelinePaths();
  revalidatePath('/crm/activities');
  return { success: true as const };
}

export async function markCrmActivityDone(activityId: string) {
  const auth = await requireAnyChildModule(['crm-pipeline', 'crm-activities']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await requireCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const supabase = await createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('crm_activities')
    .update({ status: 'done', completed_at: now, updated_at: now })
    .eq('id', activityId)
    .eq('organization_id', scope.organizationId)
    .select('*')
    .single();

  if (error || !data) return { error: error?.message || 'Failed to complete activity.' };

  await logOpportunityChatterAudit({
    opportunityId: String(data.opportunity_id),
    organizationId: scope.organizationId,
    performedBy: scope.session.username,
    body: `Activity completed: ${data.summary}`,
    metadata: { event: 'activity_completed', activity_id: activityId },
  });

  const [activity] = await enrichActivities([data as Record<string, unknown>]);
  await revalidateCrmPipelinePaths();
  revalidatePath('/crm/activities');
  return { activity };
}

export async function rescheduleCrmActivity(activityId: string, dueDate: string) {
  const auth = await requireAnyChildModule(['crm-pipeline', 'crm-activities']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await requireCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('crm_activities')
    .update({
      due_date: dueDate,
      status: 'scheduled',
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', activityId)
    .eq('organization_id', scope.organizationId)
    .select('*')
    .single();

  if (error || !data) return { error: error?.message || 'Failed to reschedule activity.' };

  const [activity] = await enrichActivities([data as Record<string, unknown>]);
  await revalidateCrmPipelinePaths();
  revalidatePath('/crm/activities');
  return { activity };
}
