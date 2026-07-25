'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { resolveCrmOrganizationScope } from '@/app/actions/crm/shared';

export type ContactCrmOpportunitySummary = {
  id: string;
  name: string;
  stage_name: string | null;
  expected_revenue: number;
  probability: number;
  is_won: boolean;
  is_lost: boolean;
  is_open: boolean;
  updated_at: string;
};

export type ContactCrmActivitySummary = {
  id: string;
  summary: string;
  activity_type: string;
  status: string;
  due_date: string | null;
  opportunity_id: string;
  opportunity_name: string | null;
};

export type ContactCrmSummary = {
  total_opportunities: number;
  open_opportunities: number;
  won_opportunities: number;
  lost_opportunities: number;
  expected_revenue_open: number;
  opportunities: ContactCrmOpportunitySummary[];
  recent_activities: ContactCrmActivitySummary[];
};

function emptySummary(): ContactCrmSummary {
  return {
    total_opportunities: 0,
    open_opportunities: 0,
    won_opportunities: 0,
    lost_opportunities: 0,
    expected_revenue_open: 0,
    opportunities: [],
    recent_activities: [],
  };
}

/**
 * CRM stats for a Contact — org-scoped, uses crm_opportunities + crm_activities.
 */
export async function getContactCrmSummary(contactId: string): Promise<
  { summary: ContactCrmSummary } | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const id = String(contactId || '').trim();
  if (!id) return { error: 'Contact id is required.' };

  const scope = await resolveCrmOrganizationScope();
  const supabase = await createAdminClient();

  let oppQuery = supabase
    .from('crm_opportunities')
    .select('id, name, expected_revenue, probability, stage_id, organization_id, updated_at')
    .eq('contact_id', id)
    .order('updated_at', { ascending: false });

  if (!('error' in scope) && !scope.isGlobalAdminView) {
    oppQuery = oppQuery.eq('organization_id', scope.organizationId);
  }

  const { data: oppRows, error: oppError } = await oppQuery;
  if (oppError) {
    if (/does not exist|relation/i.test(oppError.message)) {
      return { summary: emptySummary() };
    }
    return { error: oppError.message };
  }

  const opportunitiesRaw = oppRows || [];
  const stageIds = [...new Set(opportunitiesRaw.map((o) => o.stage_id).filter(Boolean))];
  let stageMap = new Map<string, { name: string; is_won: boolean; is_lost: boolean }>();

  if (stageIds.length) {
    const { data: stages } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, is_won, is_lost')
      .in('id', stageIds);
    stageMap = new Map(
      (stages || []).map((s) => [
        String(s.id),
        {
          name: String(s.name || ''),
          is_won: Boolean(s.is_won),
          is_lost: Boolean(s.is_lost),
        },
      ])
    );
  }

  const opportunities: ContactCrmOpportunitySummary[] = opportunitiesRaw.map((o) => {
    const stage = stageMap.get(String(o.stage_id));
    const is_won = Boolean(stage?.is_won);
    const is_lost = Boolean(stage?.is_lost);
    return {
      id: String(o.id),
      name: String(o.name || ''),
      stage_name: stage?.name || null,
      expected_revenue: Number(o.expected_revenue) || 0,
      probability: Number(o.probability) || 0,
      is_won,
      is_lost,
      is_open: !is_won && !is_lost,
      updated_at: String(o.updated_at || ''),
    };
  });

  const open = opportunities.filter((o) => o.is_open);
  const won = opportunities.filter((o) => o.is_won);
  const lost = opportunities.filter((o) => o.is_lost);

  const oppIds = opportunities.map((o) => o.id);
  let recent_activities: ContactCrmActivitySummary[] = [];

  if (oppIds.length) {
    let actQuery = supabase
      .from('crm_activities')
      .select('id, summary, activity_type, status, due_date, opportunity_id')
      .in('opportunity_id', oppIds)
      .order('due_date', { ascending: false })
      .limit(10);

    if (!('error' in scope) && !scope.isGlobalAdminView) {
      actQuery = actQuery.eq('organization_id', scope.organizationId);
    }

    const { data: acts } = await actQuery;
    const oppNameById = new Map(opportunities.map((o) => [o.id, o.name]));
    recent_activities = (acts || []).map((a) => ({
      id: String(a.id),
      summary: String(a.summary || ''),
      activity_type: String(a.activity_type || ''),
      status: String(a.status || ''),
      due_date: a.due_date ? String(a.due_date) : null,
      opportunity_id: String(a.opportunity_id),
      opportunity_name: oppNameById.get(String(a.opportunity_id)) || null,
    }));
  }

  return {
    summary: {
      total_opportunities: opportunities.length,
      open_opportunities: open.length,
      won_opportunities: won.length,
      lost_opportunities: lost.length,
      expected_revenue_open: open.reduce((sum, o) => sum + o.expected_revenue, 0),
      opportunities: opportunities.slice(0, 20),
      recent_activities,
    },
  };
}

/** Ensure a contact is marked as customer when used in CRM opportunities. */
export async function ensureContactIsCustomer(contactId: string) {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from('contacts')
    .select('id, customer_rank')
    .eq('id', contactId)
    .maybeSingle();

  if (!data) return;
  if (Number(data.customer_rank) > 0) return;

  await supabase
    .from('contacts')
    .update({ customer_rank: 1, updated_at: new Date().toISOString() })
    .eq('id', contactId);
}
