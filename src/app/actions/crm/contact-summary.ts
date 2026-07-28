'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { resolveCrmOrganizationScope } from '@/app/actions/crm/shared';
import {
  CRM_CONTACT_MEETING_ACTIVITY_TYPES,
  CRM_CONTACT_TASK_ACTIVITY_TYPES,
  resolveOpportunityIdsForContact,
} from '@/lib/crm-contact-opportunities';

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
  smart_counts: {
    opportunities: number;
    sales: number;
    meetings: number;
    tasks: number;
    documents: number;
  };
};

export type ContactDocumentItem = {
  id: string;
  name: string;
  url: string | null;
  source: 'opportunity_chatter' | 'quotation';
  source_label: string;
  performed_by: string;
  created_at: string;
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
    smart_counts: {
      opportunities: 0,
      sales: 0,
      meetings: 0,
      tasks: 0,
      documents: 0,
    },
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
  const orgOpts =
    'error' in scope
      ? { organizationId: null as string | null, isGlobalAdminView: false }
      : {
          organizationId: scope.organizationId,
          isGlobalAdminView: scope.isGlobalAdminView,
        };

  const linkedOppIds = await resolveOpportunityIdsForContact(supabase, id, orgOpts);

  let opportunitiesRaw: Record<string, unknown>[] = [];
  if (linkedOppIds.length) {
    let oppQuery = supabase
      .from('crm_opportunities')
      .select('id, name, expected_revenue, probability, stage_id, organization_id, updated_at')
      .in('id', linkedOppIds)
      .order('updated_at', { ascending: false });

    if (orgOpts.organizationId && !orgOpts.isGlobalAdminView) {
      oppQuery = oppQuery.eq('organization_id', orgOpts.organizationId);
    }

    const { data: oppRows, error: oppError } = await oppQuery;
    if (oppError) {
      if (/does not exist|relation/i.test(oppError.message)) {
        return { summary: emptySummary() };
      }
      return { error: oppError.message };
    }
    opportunitiesRaw = oppRows || [];
  }
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
  let meetings_count = 0;
  let tasks_count = 0;
  let documents_count = 0;

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

    let countActQuery = supabase
      .from('crm_activities')
      .select('id, activity_type')
      .in('opportunity_id', oppIds);
    if (!('error' in scope) && !scope.isGlobalAdminView) {
      countActQuery = countActQuery.eq('organization_id', scope.organizationId);
    }
    const { data: allActs } = await countActQuery;
    for (const row of allActs || []) {
      const t = String(row.activity_type || '');
      if ((CRM_CONTACT_MEETING_ACTIVITY_TYPES as readonly string[]).includes(t)) {
        meetings_count += 1;
      } else if ((CRM_CONTACT_TASK_ACTIVITY_TYPES as readonly string[]).includes(t)) {
        tasks_count += 1;
      }
    }

    let docQuery = supabase
      .from('crm_opportunity_chatter')
      .select('id', { count: 'exact', head: true })
      .in('opportunity_id', oppIds)
      .eq('entry_type', 'attachment');
    if (!('error' in scope) && !scope.isGlobalAdminView) {
      docQuery = docQuery.eq('organization_id', scope.organizationId);
    }
    const { count: docCount } = await docQuery;
    documents_count = docCount || 0;
  }

  const { data: contactRow } = await supabase
    .from('contacts')
    .select('name')
    .eq('id', id)
    .maybeSingle();
  let salesQuery = supabase
    .from('quotations')
    .select('id', { count: 'exact', head: true })
    .eq('contact_id', id);
  if (!('error' in scope) && !scope.isGlobalAdminView) {
    salesQuery = salesQuery.eq('organization_id', scope.organizationId);
  }
  let { count: salesCount } = await salesQuery;
  const nameFilter = contactRow?.name ? String(contactRow.name).trim() : '';
  if (!salesCount && nameFilter) {
    let legacyQuery = supabase
      .from('quotations')
      .select('id', { count: 'exact', head: true })
      .is('contact_id', null)
      .ilike('customer_name', nameFilter);
    if (!('error' in scope) && !scope.isGlobalAdminView) {
      legacyQuery = legacyQuery.eq('organization_id', scope.organizationId);
    }
    const legacy = await legacyQuery;
    salesCount = legacy.count || 0;
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
      smart_counts: {
        opportunities: opportunities.length,
        sales: salesCount || 0,
        meetings: meetings_count,
        tasks: tasks_count,
        documents: documents_count,
      },
    },
  };
}

/** Documents linked to a contact via opportunity chatter attachments. */
export async function getContactDocuments(contactId: string): Promise<
  { documents: ContactDocumentItem[] } | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  const id = String(contactId || '').trim();
  if (!id) return { error: 'Contact id is required.' };

  const scope = await resolveCrmOrganizationScope();
  const supabase = await createAdminClient();
  const orgOpts =
    'error' in scope
      ? { organizationId: null as string | null, isGlobalAdminView: false }
      : {
          organizationId: scope.organizationId,
          isGlobalAdminView: scope.isGlobalAdminView,
        };

  const oppIds = await resolveOpportunityIdsForContact(supabase, id, orgOpts);
  if (!oppIds.length) return { documents: [] };

  const { data: opps } = await supabase
    .from('crm_opportunities')
    .select('id, name')
    .in('id', oppIds);
  const oppNameById = new Map((opps || []).map((o) => [String(o.id), String(o.name || '')]));

  let docQuery = supabase
    .from('crm_opportunity_chatter')
    .select('id, body, performed_by, created_at, metadata, opportunity_id')
    .in('opportunity_id', oppIds)
    .eq('entry_type', 'attachment')
    .order('created_at', { ascending: false });
  if (!('error' in scope) && !scope.isGlobalAdminView) {
    docQuery = docQuery.eq('organization_id', scope.organizationId);
  }
  const { data: rows, error } = await docQuery;
  if (error) return { error: error.message };

  const documents: ContactDocumentItem[] = (rows || []).map((row) => {
    const metadata = (row.metadata || {}) as Record<string, unknown>;
    const url = typeof metadata.url === 'string' ? metadata.url : null;
    const fileName = typeof metadata.filename === 'string' ? metadata.filename : null;
    const oppName = oppNameById.get(String(row.opportunity_id)) || 'Opportunity';
    return {
      id: String(row.id),
      name: fileName || String(row.body || 'Attachment'),
      url,
      source: 'opportunity_chatter' as const,
      source_label: oppName,
      performed_by: String(row.performed_by || ''),
      created_at: String(row.created_at || ''),
    };
  });

  return { documents };
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
