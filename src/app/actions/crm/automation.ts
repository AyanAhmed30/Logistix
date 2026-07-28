'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { requireAnyChildModule, isAccessDenied } from '@/lib/auth/require-access';
import {
  requireCrmOrganizationScope,
  resolveCrmOrganizationScope,
} from '@/app/actions/crm/shared';
import {
  DEFAULT_CRM_LOST_REASONS,
  DEFAULT_STAGE_ACTIVITY_RULES,
  computeLeadScore,
} from '@/lib/crm-automation';
import type { CrmActivityType } from '@/app/actions/crm/types';

export type CrmLostReason = {
  id: string;
  organization_id: string;
  name: string;
  sequence: number;
  is_active: boolean;
};

export type CrmEmailTemplate = {
  id: string;
  organization_id: string;
  name: string;
  subject: string;
  body: string;
  is_active: boolean;
};

export type CrmDuplicateMatch = {
  id: string;
  name: string;
  email: string | null;
  customer_name: string | null;
  match_on: Array<'name' | 'customer' | 'email'>;
};

/** Ensure default lost reasons exist for an organization. */
export async function ensureDefaultLostReasons(organizationId: string) {
  const supabase = await createAdminClient();
  const { data: existing } = await supabase
    .from('crm_lost_reasons')
    .select('name')
    .eq('organization_id', organizationId);

  const have = new Set((existing || []).map((r) => String(r.name).toLowerCase()));
  const toInsert = DEFAULT_CRM_LOST_REASONS.filter((n) => !have.has(n.toLowerCase())).map(
    (name, i) => ({
      organization_id: organizationId,
      name,
      sequence: i + 1,
      is_active: true,
    })
  );

  if (toInsert.length) {
    await supabase.from('crm_lost_reasons').insert(toInsert);
  }
}

/** Seed stage activity rules for Qualified / Proposition. */
export async function ensureDefaultStageActivityRules(organizationId: string) {
  const supabase = await createAdminClient();
  const { data: stages } = await supabase
    .from('crm_pipeline_stages')
    .select('id, name')
    .eq('organization_id', organizationId);

  if (!stages?.length) return;

  const { data: existing } = await supabase
    .from('crm_stage_activity_rules')
    .select('stage_id, activity_type')
    .eq('organization_id', organizationId);

  const have = new Set(
    (existing || []).map((r) => `${r.stage_id}:${r.activity_type}`)
  );

  const rows = [];
  for (const rule of DEFAULT_STAGE_ACTIVITY_RULES) {
    const stage = stages.find(
      (s) => String(s.name).toLowerCase() === rule.stageName.toLowerCase()
    );
    if (!stage) continue;
    const key = `${stage.id}:${rule.activity_type}`;
    if (have.has(key)) continue;
    rows.push({
      organization_id: organizationId,
      stage_id: stage.id,
      activity_type: rule.activity_type,
      summary_template: rule.summary_template,
      due_in_days: rule.due_in_days,
      is_active: true,
    });
  }

  if (rows.length) {
    await supabase.from('crm_stage_activity_rules').insert(rows);
  }
}

export async function getCrmLostReasons() {
  const auth = await requireAnyChildModule(['crm-pipeline', 'crm-reports']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await requireCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  await ensureDefaultLostReasons(scope.organizationId);
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('crm_lost_reasons')
    .select('*')
    .eq('organization_id', scope.organizationId)
    .eq('is_active', true)
    .order('sequence', { ascending: true });

  if (error) {
    if (/does not exist|relation/i.test(error.message)) {
      return {
        reasons: DEFAULT_CRM_LOST_REASONS.map((name, i) => ({
          id: `fallback-${i}`,
          organization_id: scope.organizationId,
          name,
          sequence: i + 1,
          is_active: true,
        })) as CrmLostReason[],
      };
    }
    return { error: error.message };
  }

  return {
    reasons: (data || []).map((r) => ({
      id: String(r.id),
      organization_id: String(r.organization_id),
      name: String(r.name),
      sequence: Number(r.sequence) || 0,
      is_active: Boolean(r.is_active),
    })) as CrmLostReason[],
  };
}

export async function getCrmEmailTemplates() {
  const auth = await requireAnyChildModule(['crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await requireCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('crm_email_templates')
    .select('*')
    .eq('organization_id', scope.organizationId)
    .order('name', { ascending: true });

  if (error) {
    if (/does not exist|relation/i.test(error.message)) {
      return { templates: [] as CrmEmailTemplate[], comingSoon: true as const };
    }
    return { error: error.message };
  }

  return {
    templates: (data || []).map((t) => ({
      id: String(t.id),
      organization_id: String(t.organization_id),
      name: String(t.name),
      subject: String(t.subject || ''),
      body: String(t.body || ''),
      is_active: Boolean(t.is_active),
    })) as CrmEmailTemplate[],
    comingSoon: true as const,
  };
}

export async function checkCrmOpportunityDuplicates(input: {
  name: string;
  contactId: string;
  excludeId?: string | null;
}): Promise<{ duplicates: CrmDuplicateMatch[] } | { error: string }> {
  const auth = await requireAnyChildModule(['crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await resolveCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const name = String(input.name || '').trim();
  const contactId = String(input.contactId || '').trim();
  if (!name || !contactId) return { duplicates: [] };

  const supabase = await createAdminClient();
  let query = supabase
    .from('crm_opportunities')
    .select('id, name, email, contact_id, stage_id')
    .eq('contact_id', contactId)
    .ilike('name', name)
    .limit(20);

  if (!scope.isGlobalAdminView) {
    query = query.eq('organization_id', scope.organizationId);
  }
  if (input.excludeId) {
    query = query.neq('id', input.excludeId);
  }

  const { data, error } = await query;
  if (error) return { error: error.message };

  const stageIds = [
    ...new Set((data || []).map((row) => row.stage_id).filter(Boolean)),
  ] as string[];
  const activeStageIds = new Set<string>();
  if (stageIds.length) {
    const { data: stages } = await supabase
      .from('crm_pipeline_stages')
      .select('id, is_won, is_lost')
      .in('id', stageIds);
    for (const stage of stages || []) {
      if (!stage.is_won && !stage.is_lost) {
        activeStageIds.add(String(stage.id));
      }
    }
  }

  const contactIds = [
    ...new Set((data || []).map((r) => r.contact_id).filter(Boolean)),
  ] as string[];
  let contactMap = new Map<string, string>();
  if (contactIds.length) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, name, company_name')
      .in('id', contactIds);
    contactMap = new Map(
      (contacts || []).map((c) => [
        String(c.id),
        String(c.company_name || c.name || ''),
      ])
    );
  }

  const duplicates: CrmDuplicateMatch[] = [];
  for (const row of data || []) {
    if (!activeStageIds.has(String(row.stage_id))) continue;

    const rowName = String(row.name || '').trim();
    if (rowName.toLowerCase() !== name.toLowerCase()) continue;

    duplicates.push({
      id: String(row.id),
      name: rowName,
      email: row.email ? String(row.email) : null,
      customer_name: row.contact_id
        ? contactMap.get(String(row.contact_id)) || null
        : null,
      match_on: ['name', 'customer'],
    });
  }

  return { duplicates };
}

/** Recalculate and persist lead_score for an opportunity. */
export async function refreshOpportunityLeadScore(opportunityId: string) {
  const supabase = await createAdminClient();
  const { data: opp } = await supabase
    .from('crm_opportunities')
    .select('id, expected_revenue, probability, stage_id, organization_id')
    .eq('id', opportunityId)
    .maybeSingle();
  if (!opp) return;

  const { data: stage } = await supabase
    .from('crm_pipeline_stages')
    .select('is_won, is_lost')
    .eq('id', opp.stage_id)
    .maybeSingle();

  const { data: acts } = await supabase
    .from('crm_activities')
    .select('status')
    .eq('opportunity_id', opportunityId);

  const total = acts?.length || 0;
  const done = (acts || []).filter((a) => a.status === 'done').length;
  const score = computeLeadScore({
    probability: Number(opp.probability) || 0,
    expectedRevenue: Number(opp.expected_revenue) || 0,
    isWon: Boolean(stage?.is_won),
    isLost: Boolean(stage?.is_lost),
    activitiesTotal: total,
    activitiesDone: done,
  });

  await supabase
    .from('crm_opportunities')
    .update({ lead_score: score, updated_at: new Date().toISOString() })
    .eq('id', opportunityId);

  return { lead_score: score };
}

/** Create follow-up activities from stage automation rules. */
export async function runStageActivityAutomation(input: {
  organizationId: string;
  opportunityId: string;
  stageId: string;
  assignedTo: string | null;
  performedBy: string;
}) {
  const supabase = await createAdminClient();
  await ensureDefaultStageActivityRules(input.organizationId);

  const { data: rules } = await supabase
    .from('crm_stage_activity_rules')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('stage_id', input.stageId)
    .eq('is_active', true);

  if (!rules?.length) return { created: 0 };

  const now = new Date();
  let created = 0;

  for (const rule of rules) {
    const due = new Date(now);
    due.setDate(due.getDate() + (Number(rule.due_in_days) || 2));
    due.setHours(9, 0, 0, 0);

    const { error } = await supabase.from('crm_activities').insert({
      organization_id: input.organizationId,
      opportunity_id: input.opportunityId,
      activity_type: rule.activity_type as CrmActivityType,
      summary: String(rule.summary_template || 'Follow up'),
      due_date: due.toISOString(),
      assigned_to: input.assignedTo,
      status: 'scheduled',
      created_by: input.performedBy,
      updated_at: now.toISOString(),
    });

    if (!error) created += 1;
  }

  return { created };
}
