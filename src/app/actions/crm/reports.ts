'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { requireAnyChildModule, isAccessDenied } from '@/lib/auth/require-access';
import { resolveCrmOrganizationScope } from '@/app/actions/crm/shared';
import { ensureDefaultCrmStages } from '@/app/actions/crm/stages';

export type CrmReportFilters = {
  salespersonId?: string | null;
  stageId?: string | null;
  contactId?: string | null;
  tag?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
};

export type CrmReportNamedCount = { name: string; count: number; value?: number };

export type CrmReportsDashboard = {
  total_opportunities: number;
  open_opportunities: number;
  won_opportunities: number;
  lost_opportunities: number;
  total_expected_revenue: number;
  open_expected_revenue: number;
  won_revenue: number;
  win_rate: number;
  activity_summary: {
    scheduled: number;
    done: number;
    overdue: number;
  };
  by_stage: CrmReportNamedCount[];
  revenue_forecast: CrmReportNamedCount[];
  win_vs_lost: CrmReportNamedCount[];
  activities_by_type: CrmReportNamedCount[];
  salesperson_performance: Array<{
    name: string;
    open: number;
    won: number;
    lost: number;
    revenue: number;
    win_rate: number;
  }>;
  lost_reasons: CrmReportNamedCount[];
  stage_analysis: Array<{
    name: string;
    count: number;
    revenue: number;
    avg_probability: number;
  }>;
};

function emptyDashboard(): CrmReportsDashboard {
  return {
    total_opportunities: 0,
    open_opportunities: 0,
    won_opportunities: 0,
    lost_opportunities: 0,
    total_expected_revenue: 0,
    open_expected_revenue: 0,
    won_revenue: 0,
    win_rate: 0,
    activity_summary: { scheduled: 0, done: 0, overdue: 0 },
    by_stage: [],
    revenue_forecast: [],
    win_vs_lost: [
      { name: 'Won', count: 0, value: 0 },
      { name: 'Lost', count: 0, value: 0 },
    ],
    activities_by_type: [],
    salesperson_performance: [],
    lost_reasons: [],
    stage_analysis: [],
  };
}

export async function getCrmReportsDashboard(
  filters: CrmReportFilters = {}
): Promise<{ dashboard: CrmReportsDashboard } | { error: string }> {
  const auth = await requireAnyChildModule(['crm-reports', 'crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await resolveCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const supabase = await createAdminClient();

  if (!scope.isGlobalAdminView) {
    await ensureDefaultCrmStages(scope.organizationId);
  }

  let oppQuery = supabase.from('crm_opportunities').select(
    'id, name, expected_revenue, probability, stage_id, salesperson_id, contact_id, tags, created_at, updated_at, organization_id, lost_reason'
  );

  if (!scope.isGlobalAdminView) {
    oppQuery = oppQuery.eq('organization_id', scope.organizationId);
  }
  if (filters.salespersonId) oppQuery = oppQuery.eq('salesperson_id', filters.salespersonId);
  if (filters.stageId) oppQuery = oppQuery.eq('stage_id', filters.stageId);
  if (filters.contactId) oppQuery = oppQuery.eq('contact_id', filters.contactId);
  if (filters.dateFrom) oppQuery = oppQuery.gte('created_at', filters.dateFrom);
  if (filters.dateTo) oppQuery = oppQuery.lte('created_at', `${filters.dateTo}T23:59:59.999Z`);

  const { resolveCrmVisibilityScope, applyCrmVisibilityFilter } = await import(
    '@/lib/crm-visibility'
  );
  const visibility = await resolveCrmVisibilityScope(scope.session);
  if (!filters.salespersonId) {
    oppQuery = applyCrmVisibilityFilter(oppQuery, visibility);
  }

  const { data: oppRows, error: oppError } = await oppQuery;
  if (oppError) {
    if (/does not exist|relation/i.test(oppError.message)) {
      return { dashboard: emptyDashboard() };
    }
    return { error: oppError.message };
  }

  let opportunities = oppRows || [];

  if (filters.tag) {
    const needle = filters.tag.trim().toLowerCase();
    opportunities = opportunities.filter((o) => {
      const tags = Array.isArray(o.tags) ? o.tags.map((t) => String(t).toLowerCase()) : [];
      return tags.some((t) => t.includes(needle));
    });
  }

  const stageIds = [...new Set(opportunities.map((o) => o.stage_id).filter(Boolean))];
  const agentIds = [...new Set(opportunities.map((o) => o.salesperson_id).filter(Boolean))] as string[];

  const [stagesRes, agentsRes] = await Promise.all([
    stageIds.length
      ? supabase
          .from('crm_pipeline_stages')
          .select('id, name, sequence, is_won, is_lost')
          .in('id', stageIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    agentIds.length
      ? supabase.from('sales_agents').select('id, name').in('id', agentIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);

  const stageMap = new Map(
    (stagesRes.data || []).map((s) => [
      String(s.id),
      {
        name: String(s.name || ''),
        sequence: Number(s.sequence) || 0,
        is_won: Boolean(s.is_won),
        is_lost: Boolean(s.is_lost),
      },
    ])
  );
  const agentMap = new Map(
    (agentsRes.data || []).map((a) => [String(a.id), String(a.name || 'Unassigned')])
  );

  type Enriched = {
    id: string;
    expected_revenue: number;
    probability: number;
    stage_name: string;
    is_won: boolean;
    is_lost: boolean;
    is_open: boolean;
    salesperson_name: string;
    lost_reason: string | null;
  };

  const enriched: Enriched[] = opportunities.map((o) => {
    const stage = stageMap.get(String(o.stage_id));
    const is_won = Boolean(stage?.is_won);
    const is_lost = Boolean(stage?.is_lost);
    return {
      id: String(o.id),
      expected_revenue: Number(o.expected_revenue) || 0,
      probability: Number(o.probability) || 0,
      stage_name: stage?.name || 'Unknown',
      is_won,
      is_lost,
      is_open: !is_won && !is_lost,
      salesperson_name: o.salesperson_id
        ? agentMap.get(String(o.salesperson_id)) || 'Unassigned'
        : 'Unassigned',
      lost_reason: o.lost_reason ? String(o.lost_reason) : null,
    };
  });

  const open = enriched.filter((o) => o.is_open);
  const won = enriched.filter((o) => o.is_won);
  const lost = enriched.filter((o) => o.is_lost);
  const closed = won.length + lost.length;
  const win_rate = closed > 0 ? Math.round((won.length / closed) * 10000) / 100 : 0;

  const byStageMap = new Map<string, { count: number; value: number; seq: number }>();
  for (const o of enriched) {
    const stage = stageMap.get(
      String(opportunities.find((r) => String(r.id) === o.id)?.stage_id || '')
    );
    const key = o.stage_name;
    const prev = byStageMap.get(key) || { count: 0, value: 0, seq: stage?.sequence ?? 99 };
    prev.count += 1;
    prev.value += o.expected_revenue;
    byStageMap.set(key, prev);
  }

  const by_stage: CrmReportNamedCount[] = [...byStageMap.entries()]
    .sort((a, b) => a[1].seq - b[1].seq)
    .map(([name, v]) => ({ name, count: v.count, value: v.value }));

  const revenue_forecast = open.map((o) => ({
    name: o.stage_name,
    count: 1,
    value: (o.expected_revenue * o.probability) / 100,
  }));
  const forecastByStage = new Map<string, number>();
  for (const row of revenue_forecast) {
    forecastByStage.set(row.name, (forecastByStage.get(row.name) || 0) + (row.value || 0));
  }
  const revenue_forecast_agg: CrmReportNamedCount[] = [...forecastByStage.entries()].map(
    ([name, value]) => ({ name, count: 0, value: Math.round(value * 100) / 100 })
  );

  const stageAnalysisMap = new Map<
    string,
    { count: number; revenue: number; probSum: number; seq: number }
  >();
  for (const o of enriched) {
    const prev = stageAnalysisMap.get(o.stage_name) || {
      count: 0,
      revenue: 0,
      probSum: 0,
      seq: 99,
    };
    prev.count += 1;
    prev.revenue += o.expected_revenue;
    prev.probSum += o.probability;
    stageAnalysisMap.set(o.stage_name, prev);
  }
  const stage_analysis = [...stageAnalysisMap.entries()].map(([name, v]) => ({
    name,
    count: v.count,
    revenue: v.revenue,
    avg_probability: v.count ? Math.round((v.probSum / v.count) * 100) / 100 : 0,
  }));

  const spMap = new Map<
    string,
    { open: number; won: number; lost: number; revenue: number }
  >();
  for (const o of enriched) {
    const prev = spMap.get(o.salesperson_name) || { open: 0, won: 0, lost: 0, revenue: 0 };
    if (o.is_won) prev.won += 1;
    else if (o.is_lost) prev.lost += 1;
    else prev.open += 1;
    prev.revenue += o.expected_revenue;
    spMap.set(o.salesperson_name, prev);
  }
  const salesperson_performance = [...spMap.entries()].map(([name, v]) => {
    const closedSp = v.won + v.lost;
    return {
      name,
      open: v.open,
      won: v.won,
      lost: v.lost,
      revenue: v.revenue,
      win_rate: closedSp > 0 ? Math.round((v.won / closedSp) * 10000) / 100 : 0,
    };
  });

  // Lost reasons — group by persisted lost_reason when available
  const lostReasonMap = new Map<string, { count: number; value: number }>();
  for (const o of lost) {
    const reason = o.lost_reason || 'Lost (no reason captured)';
    const prev = lostReasonMap.get(reason) || { count: 0, value: 0 };
    prev.count += 1;
    prev.value += o.expected_revenue;
    lostReasonMap.set(reason, prev);
  }
  const lost_reasons: CrmReportNamedCount[] = [...lostReasonMap.entries()].map(
    ([name, v]) => ({ name, count: v.count, value: v.value })
  );

  // Activities
  const oppIds = enriched.map((o) => o.id);
  const activity_summary = { scheduled: 0, done: 0, overdue: 0 };
  let activities_by_type: CrmReportNamedCount[] = [];

  if (oppIds.length) {
    let actQuery = supabase
      .from('crm_activities')
      .select('id, activity_type, status, due_date, opportunity_id')
      .in('opportunity_id', oppIds);

    if (!scope.isGlobalAdminView) {
      actQuery = actQuery.eq('organization_id', scope.organizationId);
    }

    const { data: acts } = await actQuery;
    const now = new Date().toISOString();
    const typeMap = new Map<string, number>();
    for (const a of acts || []) {
      const status = String(a.status);
      if (status === 'done') activity_summary.done += 1;
      else if (status === 'scheduled') {
        activity_summary.scheduled += 1;
        if (a.due_date && String(a.due_date) < now) activity_summary.overdue += 1;
      }
      const t = String(a.activity_type || 'todo');
      typeMap.set(t, (typeMap.get(t) || 0) + 1);
    }
    activities_by_type = [...typeMap.entries()].map(([name, count]) => ({ name, count }));
  }

  return {
    dashboard: {
      total_opportunities: enriched.length,
      open_opportunities: open.length,
      won_opportunities: won.length,
      lost_opportunities: lost.length,
      total_expected_revenue: enriched.reduce((s, o) => s + o.expected_revenue, 0),
      open_expected_revenue: open.reduce((s, o) => s + o.expected_revenue, 0),
      won_revenue: won.reduce((s, o) => s + o.expected_revenue, 0),
      win_rate,
      activity_summary,
      by_stage,
      revenue_forecast: revenue_forecast_agg,
      win_vs_lost: [
        { name: 'Won', count: won.length, value: won.reduce((s, o) => s + o.expected_revenue, 0) },
        { name: 'Lost', count: lost.length, value: lost.reduce((s, o) => s + o.expected_revenue, 0) },
      ],
      activities_by_type,
      salesperson_performance,
      lost_reasons,
      stage_analysis,
    },
  };
}
