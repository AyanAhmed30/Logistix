'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { canViewEmployee, resolveAnalyticsAccess } from '@/lib/analytics/access';
import type { SessionPayload } from '@/lib/auth/session';
import { applyCrmVisibilityFilter } from '@/lib/crm-visibility';
import { isLostStage, isWonStage } from '@/lib/crm-pipeline-filter';
import { actionError } from '@/lib/user-facing-error';

export type AnalyticsPeriod = { from: string; to: string };

export type SalesAgentMetrics = {
  sales_agent_id: string;
  total_contacts: number;
  new_contacts: number;
  followups_scheduled: number;
  followups_completed: number;
  followups_pending: number;
  followups_overdue: number;
  inquiries_submitted: number;
  inquiries_pending: number;
  inquiries_approved: number;
  inquiries_rejected: number;
  quotations_created: number;
  quotations_sent: number;
  quotations_open: number;
};

export type OperationsOverview = {
  received: number;
  submitted_to_admin: number;
  approved: number;
  rejected: number;
  flagged: number;
  at_operations: number;
  with_admin: number;
  admin_calculating: number;
  avg_operations_seconds: number | null;
  avg_admin_decision_seconds: number | null;
  avg_turnaround_seconds: number | null;
};

export type AnalyticsSeriesPoint = {
  day: string;
  contacts_added: number;
  followups_completed: number;
  quotations_sent: number;
  inquiries_received: number;
  operations_submitted: number;
  approved: number;
  rejected: number;
};

export type PagedResult<T> = { rows: T[]; total: number; page: number; pageSize: number };

const PAGE_SIZE = 25;
const DENIED = { error: 'Access Denied' } as const;

function emptyMetrics(id: string): SalesAgentMetrics {
  return {
    sales_agent_id: id,
    total_contacts: 0,
    new_contacts: 0,
    followups_scheduled: 0,
    followups_completed: 0,
    followups_pending: 0,
    followups_overdue: 0,
    inquiries_submitted: 0,
    inquiries_pending: 0,
    inquiries_approved: 0,
    inquiries_rejected: 0,
    quotations_created: 0,
    quotations_sent: 0,
    quotations_open: 0,
  };
}

function toCounts<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
  }
  return out as T;
}

function validPeriod(period: AnalyticsPeriod): boolean {
  return !Number.isNaN(Date.parse(period.from)) && !Number.isNaN(Date.parse(period.to));
}

function safePage(page: number | undefined): number {
  return Number.isInteger(page) && (page as number) > 0 ? (page as number) : 1;
}

async function fetchMetrics(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  organizationId: string | null,
  period: AnalyticsPeriod | null,
  agentId: string | null
): Promise<{ rows: SalesAgentMetrics[] } | { error: string }> {
  const { data, error } = await supabase.rpc('analytics_sales_agent_metrics', {
    p_organization_id: organizationId,
    p_from: period?.from ?? null,
    p_to: period?.to ?? null,
    p_sales_agent_id: agentId,
  });
  if (error) return { error: actionError(error) };
  return { rows: ((data || []) as SalesAgentMetrics[]).map(toCounts) };
}

async function fetchSeries(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  organizationId: string | null,
  period: AnalyticsPeriod,
  agentId: string | null
): Promise<AnalyticsSeriesPoint[]> {
  const { data } = await supabase.rpc('analytics_daily_series', {
    p_from: period.from,
    p_to: period.to,
    p_organization_id: organizationId,
    p_sales_agent_id: agentId,
  });
  return ((data || []) as AnalyticsSeriesPoint[]).map(toCounts);
}

/** Agents shown for an organization: linked to it, or with work recorded in it. */
async function organizationAgentIds(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  organizationId: string,
  agents: Array<{ id: string; app_user_id: string | null }>,
  metrics: SalesAgentMetrics[]
): Promise<Set<string>> {
  const { data } = await supabase
    .from('user_organizations')
    .select('user_id')
    .eq('organization_id', organizationId);
  const members = new Set((data || []).map((r) => String(r.user_id)));
  const ids = new Set(
    agents.filter((a) => a.app_user_id && members.has(a.app_user_id)).map((a) => a.id)
  );
  for (const m of metrics) {
    if (
      m.total_contacts > 0 ||
      m.followups_pending > 0 ||
      m.inquiries_submitted > 0 ||
      m.inquiries_pending > 0 ||
      m.quotations_created > 0
    ) {
      ids.add(m.sales_agent_id);
    }
  }
  return ids;
}

export type AnalyticsEmployee = { id: string; name: string };

/** Names for the employee picker. Admin views only. */
export async function getSalesEmployees() {
  const access = resolveAnalyticsAccess(await getSession());
  if (access.kind !== 'admin') return DENIED;

  const supabase = await createAdminClient();
  const organizationId = access.organizationId;
  const [metrics, agentsResult] = await Promise.all([
    organizationId ? fetchMetrics(supabase, organizationId, null, null) : Promise.resolve({ rows: [] }),
    supabase.from('sales_agents').select('id, name, username, app_user_id').order('name'),
  ]);
  if ('error' in metrics) return { error: metrics.error };
  if (agentsResult.error) return { error: actionError(agentsResult.error) };

  const agents = (agentsResult.data || []).map((a) => ({
    id: String(a.id),
    name: String(a.name || a.username || 'Unnamed'),
    app_user_id: a.app_user_id ? String(a.app_user_id) : null,
  }));
  const visible = organizationId
    ? await organizationAgentIds(supabase, organizationId, agents, metrics.rows)
    : null;

  const employees: AnalyticsEmployee[] = agents
    .filter((a) => !visible || visible.has(a.id))
    .map(({ id, name }) => ({ id, name }));
  return { employees };
}

export type SalesTeamAgentRow = {
  id: string;
  name: string;
  metrics: SalesAgentMetrics;
  /** When this agent last sent an inquiry, any time (not limited to the period). */
  lastInquiryAt: string | null;
};

export type SalesTeamOverview = {
  agents: SalesTeamAgentRow[];
  /** Contacts with no sales agent, so agent totals add up to the Contacts page. */
  unassigned: { total: number; added: number };
  series: AnalyticsSeriesPoint[];
};

/**
 * The whole sales team for one period: one row per agent (the same metrics as
 * each agent's own dashboard), unassigned contacts, and the team's daily trend.
 * Admin views only. With agentId, the trend is limited to that agent.
 */
export async function getSalesTeamOverview(period: AnalyticsPeriod, agentId: string | null = null) {
  const access = resolveAnalyticsAccess(await getSession());
  if (access.kind !== 'admin' || !validPeriod(period)) return DENIED;

  try {
    const supabase = await createAdminClient();
    const organizationId = access.organizationId;

    const unassignedCount = (inPeriod: boolean) => {
      let query = supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .is('salesperson_id', null)
        .or('parent_id.is.null,company_type.eq.person');
      if (organizationId) query = query.eq('organization_id', organizationId);
      if (inPeriod) query = query.gte('created_at', period.from).lt('created_at', period.to);
      return query;
    };

    let latest = supabase
      .from('lead_inquiries')
      .select('sent_at, leads!inner(sales_agent_id)')
      .not('sent_at', 'is', null)
      .not('leads.sales_agent_id', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(5000);
    if (organizationId) latest = latest.eq('organization_id', organizationId);

    const [metrics, agentsResult, series, unassignedTotal, unassignedAdded, latestInquiries] = await Promise.all([
      fetchMetrics(supabase, organizationId, period, null),
      supabase.from('sales_agents').select('id, name, username, app_user_id').order('name'),
      fetchSeries(supabase, organizationId, period, agentId),
      unassignedCount(false),
      unassignedCount(true),
      latest,
    ]);
    if ('error' in metrics) return { error: metrics.error };
    if (agentsResult.error) return { error: actionError(agentsResult.error) };
    if (unassignedTotal.error) return { error: actionError(unassignedTotal.error) };

    const agents = (agentsResult.data || []).map((a) => ({
      id: String(a.id),
      name: String(a.name || a.username || 'Unnamed'),
      app_user_id: a.app_user_id ? String(a.app_user_id) : null,
    }));
    // Same rule as the agent list: linked to the organization, or with work in it.
    // Uses all-time metrics so an agent with no activity this period still shows.
    let visible: Set<string> | null = null;
    if (organizationId) {
      const allTime = await fetchMetrics(supabase, organizationId, null, null);
      if ('error' in allTime) return { error: allTime.error };
      visible = await organizationAgentIds(supabase, organizationId, agents, allTime.rows);
    }

    const byId = new Map(metrics.rows.map((row) => [row.sales_agent_id, row]));
    // Rows arrive newest first, so the first per agent is the latest.
    const lastSent = new Map<string, string>();
    for (const row of latestInquiries.data || []) {
      const lead = row.leads as { sales_agent_id?: string | null } | Array<{ sales_agent_id?: string | null }> | null;
      const owner = Array.isArray(lead) ? lead[0]?.sales_agent_id : lead?.sales_agent_id;
      if (owner && row.sent_at && !lastSent.has(String(owner))) lastSent.set(String(owner), String(row.sent_at));
    }
    const rows: SalesTeamAgentRow[] = agents
      .filter((a) => !visible || visible.has(a.id))
      .map((a) => ({
        id: a.id,
        name: a.name,
        metrics: byId.get(a.id) ?? emptyMetrics(a.id),
        lastInquiryAt: lastSent.get(a.id) ?? null,
      }));

    return {
      agents: rows,
      unassigned: { total: unassignedTotal.count ?? 0, added: unassignedAdded.count ?? 0 },
      series,
    } satisfies SalesTeamOverview;
  } catch (err) {
    return { error: actionError(err, 'Unable to load sales analytics') };
  }
}

type AgentContext = {
  supabase: Awaited<ReturnType<typeof createAdminClient>>;
  organizationId: string | null;
  agent: { id: string; name: string; username: string | null };
};

/** Every per-agent action goes through this check. */
async function requireAgent(agentId: string): Promise<AgentContext | typeof DENIED> {
  const session = await getSession();
  const access = resolveAnalyticsAccess(session);
  if (access.kind === 'denied') return DENIED;

  const supabase = await createAdminClient();
  const { data: agent } = await supabase
    .from('sales_agents')
    .select('id, name, username, app_user_id')
    .eq('id', agentId)
    .maybeSingle();
  if (!agent) return DENIED;

  const linkedToMe =
    access.kind === 'self' &&
    access.departments.includes('sales') &&
    Boolean(agent.app_user_id) &&
    agent.app_user_id === session?.appUserId;
  if (!linkedToMe && !canViewEmployee(access, 'sales', String(agent.username || ''))) return DENIED;

  const organizationId = access.organizationId;
  if (access.kind === 'admin' && organizationId) {
    const [member, owned] = await Promise.all([
      agent.app_user_id
        ? supabase
            .from('user_organizations')
            .select('user_id', { count: 'exact', head: true })
            .eq('organization_id', organizationId)
            .eq('user_id', agent.app_user_id)
        : Promise.resolve({ count: 0 }),
      supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('salesperson_id', agentId),
    ]);
    if (!member.count && !owned.count) return DENIED;
  }

  return {
    supabase,
    organizationId,
    agent: {
      id: String(agent.id),
      name: String(agent.name || agent.username || 'Unnamed'),
      username: agent.username ? String(agent.username) : null,
    },
  };
}

/** Sent inquiries by their send time, drafts by when they were created. */
function inquiryPeriodFilter(period: AnalyticsPeriod): string {
  const { from, to } = period;
  return `and(sent_at.gte.${from},sent_at.lt.${to}),and(sent_at.is.null,created_at.gte.${from},created_at.lt.${to})`;
}

function cleanSearch(value: string | undefined): string {
  return String(value || '').replace(/[%_,.()"\\]/g, ' ').trim();
}

export type CrmPipelineStageCount = {
  name: string;
  isWon: boolean;
  isLost: boolean;
  count: number;
};

/**
 * The agent's current opportunities per CRM Kanban stage. Stages are read from
 * crm_pipeline_stages for the active organization. In the all-organizations view
 * each organization has its own stage rows, so same-named stages are merged, as
 * the Kanban does. Ownership uses the Kanban's own Own Documents rule.
 */
async function fetchCrmPipeline(ctx: AgentContext): Promise<CrmPipelineStageCount[]> {
  const { supabase, organizationId, agent } = ctx;

  let stagesQuery = supabase
    .from('crm_pipeline_stages')
    .select('id, name, sequence, is_won, is_lost')
    .order('sequence', { ascending: true });
  if (organizationId) stagesQuery = stagesQuery.eq('organization_id', organizationId);
  const { data: stages } = await stagesQuery;

  const groups = new Map<string, { name: string; isWon: boolean; isLost: boolean; ids: string[] }>();
  for (const stage of stages || []) {
    const key = String(stage.name || '').trim().toLowerCase();
    const group = groups.get(key);
    if (group) group.ids.push(String(stage.id));
    else {
      groups.set(key, {
        name: String(stage.name || ''),
        isWon: Boolean(stage.is_won),
        isLost: Boolean(stage.is_lost),
        ids: [String(stage.id)],
      });
    }
  }

  const visibility = {
    mode: 'assigned' as const,
    session: { username: agent.username ?? '' } as SessionPayload,
    salesAgentId: agent.id,
  };

  return Promise.all(
    [...groups.values()].map(async ({ ids, ...stage }) => {
      let query = supabase
        .from('crm_opportunities')
        .select('id', { count: 'exact', head: true })
        .in('stage_id', ids);
      if (organizationId) query = query.eq('organization_id', organizationId);
      const { count } = await applyCrmVisibilityFilter(query, visibility);
      return { ...stage, count: count ?? 0 };
    })
  );
}

export async function getSalesAgentDetail(agentId: string, period: AnalyticsPeriod) {
  if (!validPeriod(period)) return DENIED;
  const ctx = await requireAgent(agentId);
  if ('error' in ctx) return ctx;
  const { supabase, organizationId, agent } = ctx;

  const [selected, series, issues, pipeline] = await Promise.all([
    fetchMetrics(supabase, organizationId, period, agentId),
    fetchSeries(supabase, organizationId, period, agentId),
    supabase
      .from('daily_work_report_issues')
      .select('contact_id, daily_work_reports!inner(sales_agent_id)')
      .eq('daily_work_reports.sales_agent_id', agentId)
      .not('contact_id', 'is', null),
    fetchCrmPipeline(ctx),
  ]);

  if ('error' in selected) return { error: selected.error };

  return {
    agent,
    metrics: selected.rows[0] ?? emptyMetrics(agentId),
    series,
    pipeline,
    contactsWithIssues: new Set((issues.data || []).map((r) => String(r.contact_id))).size,
  };
}

export type AgentContactRow = {
  id: string;
  name: string;
  customerId: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  totalInquiries: number;
  approved: number;
  rejected: number;
  pending: number;
  lastInquiryAt: string | null;
  latestStatus: string | null;
};

const PENDING_STATUSES = new Set(['sent', 'sent_to_admin', 'calculated_by_admin']);

export async function getAgentContacts(
  agentId: string,
  options: { page?: number; search?: string; period?: AnalyticsPeriod | null }
) {
  const ctx = await requireAgent(agentId);
  if ('error' in ctx) return ctx;
  const { supabase, organizationId } = ctx;
  const page = safePage(options.page);
  const start = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from('contacts')
    .select('id, name, lead_id_formatted, phone, email, company_name', { count: 'exact' })
    .eq('salesperson_id', agentId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(start, start + PAGE_SIZE - 1);
  if (organizationId) query = query.eq('organization_id', organizationId);
  if (options.period && validPeriod(options.period)) {
    query = query.gte('created_at', options.period.from).lt('created_at', options.period.to);
  }
  const topLevel = 'parent_id.is.null,company_type.eq.person';
  const needle = cleanSearch(options.search);
  if (needle) {
    const like = `%${needle}%`;
    const matches = `name.ilike.${like},company_name.ilike.${like},phone.ilike.${like},email.ilike.${like},lead_id_formatted.ilike.${like}`;
    query = query.or(`and(or(${topLevel}),or(${matches}))`);
  } else {
    query = query.or(topLevel);
  }

  const { data, error, count } = await query;
  if (error) return { error: actionError(error) };
  const contacts = data || [];
  const ids = contacts.map((c) => String(c.id));

  const { data: leads } = ids.length
    ? await supabase.from('leads').select('id, contact_id').in('contact_id', ids)
    : { data: [] };
  const leadToContact = new Map((leads || []).map((l) => [String(l.id), String(l.contact_id)]));

  let inquiriesQuery = leadToContact.size
    ? supabase
        .from('lead_inquiries')
        .select('lead_id, approval_status, sent_at, created_at')
        .in('lead_id', [...leadToContact.keys()])
        .eq('is_current_version', true)
        .order('created_at', { ascending: false })
    : null;
  if (inquiriesQuery && organizationId) inquiriesQuery = inquiriesQuery.eq('organization_id', organizationId);
  const { data: inquiries } = inquiriesQuery ? await inquiriesQuery : { data: [] };

  type Stats = Pick<AgentContactRow, 'totalInquiries' | 'approved' | 'rejected' | 'pending' | 'lastInquiryAt' | 'latestStatus'>;
  const stats = new Map<string, Stats>();
  for (const inquiry of inquiries || []) {
    const contactId = leadToContact.get(String(inquiry.lead_id));
    if (!contactId) continue;
    const entry = stats.get(contactId) ?? {
      totalInquiries: 0,
      approved: 0,
      rejected: 0,
      pending: 0,
      lastInquiryAt: null,
      latestStatus: null,
    };
    const status = String(inquiry.approval_status);
    entry.totalInquiries += 1;
    if (status === 'approved') entry.approved += 1;
    if (status === 'rejected') entry.rejected += 1;
    if (PENDING_STATUSES.has(status)) entry.pending += 1;
    // Rows arrive newest first.
    if (!entry.latestStatus) {
      entry.latestStatus = status;
      entry.lastInquiryAt = String(inquiry.sent_at || inquiry.created_at);
    }
    stats.set(contactId, entry);
  }

  const rows: AgentContactRow[] = contacts.map((c) => {
    const id = String(c.id);
    return {
      id,
      name: String(c.name || ''),
      customerId: c.lead_id_formatted ? String(c.lead_id_formatted) : null,
      phone: c.phone ? String(c.phone) : null,
      email: c.email ? String(c.email) : null,
      company: c.company_name ? String(c.company_name) : null,
      totalInquiries: 0,
      approved: 0,
      rejected: 0,
      pending: 0,
      lastInquiryAt: null,
      latestStatus: null,
      ...stats.get(id),
    };
  });

  return { rows, total: count ?? 0, page, pageSize: PAGE_SIZE } satisfies PagedResult<AgentContactRow>;
}

export type AgentInquiryRow = {
  inquiryId: string;
  reference: string | null;
  customerId: string | null;
  customer: string | null;
  product: string | null;
  approvalStatus: string;
  submittedAt: string | null;
  operationsSubmittedAt: string | null;
  operationsActor: string | null;
  decidedAt: string | null;
  decision: string | null;
  turnaroundSeconds: number | null;
  flagCount: number;
};

type InquiryBase = {
  id: string;
  inquiry_reference: string | null;
  product_name: string | null;
  approval_status: string;
  sent_at: string | null;
  created_at: string;
  lead_name: string | null;
  lead_number: string | null;
};

async function attachTimings(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  inquiries: InquiryBase[]
): Promise<AgentInquiryRow[]> {
  const ids = inquiries.map((i) => i.id);
  const { data } = ids.length
    ? await supabase.from('analytics_inquiry_timings').select('*').in('inquiry_id', ids)
    : { data: [] };
  const timing = new Map((data || []).map((t) => [String(t.inquiry_id), t]));

  return inquiries.map((i) => {
    const t = timing.get(i.id);
    return {
      inquiryId: i.id,
      reference: i.inquiry_reference,
      customerId: i.lead_number,
      customer: i.lead_name,
      product: i.product_name,
      approvalStatus: i.approval_status,
      submittedAt: t?.first_submitted_at ?? i.sent_at,
      operationsSubmittedAt: t?.last_operations_submitted_at ?? null,
      operationsActor: t?.operations_actor ?? null,
      decidedAt: t?.decided_at ?? null,
      decision: t?.decision ?? null,
      turnaroundSeconds: t?.turnaround_seconds == null ? null : Number(t.turnaround_seconds),
      flagCount: Number(t?.flag_count || 0),
    };
  });
}

function toInquiryBase(row: Record<string, unknown>): InquiryBase {
  const lead = row.leads as { name?: string | null; lead_id_formatted?: string | null } | null;
  return {
    id: String(row.id),
    inquiry_reference: (row.inquiry_reference as string | null) ?? null,
    product_name: (row.product_name as string | null) ?? null,
    approval_status: String(row.approval_status),
    sent_at: (row.sent_at as string | null) ?? null,
    created_at: String(row.created_at),
    lead_name: lead?.name ?? null,
    lead_number: lead?.lead_id_formatted ?? null,
  };
}

export async function getAgentInquiries(
  agentId: string,
  options: { page?: number; period: AnalyticsPeriod; status?: string | null; search?: string }
) {
  if (!validPeriod(options.period)) return DENIED;
  const ctx = await requireAgent(agentId);
  if ('error' in ctx) return ctx;
  const { supabase, organizationId } = ctx;
  const page = safePage(options.page);
  const start = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from('lead_inquiries')
    .select(
      'id, inquiry_reference, product_name, approval_status, sent_at, created_at, leads!inner(sales_agent_id, name, lead_id_formatted)',
      { count: 'exact' }
    )
    .eq('leads.sales_agent_id', agentId)
    .eq('is_current_version', true)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(start, start + PAGE_SIZE - 1);
  if (organizationId) query = query.eq('organization_id', organizationId);
  if (options.status) query = query.eq('approval_status', options.status);

  const needle = cleanSearch(options.search);
  if (needle) {
    const like = `%${needle}%`;
    const { data: matchedLeads } = await supabase
      .from('leads')
      .select('id')
      .eq('sales_agent_id', agentId)
      .ilike('name', like)
      .limit(150);
    const leadIds = (matchedLeads || []).map((l) => String(l.id));
    const byCustomer = leadIds.length ? `,lead_id.in.(${leadIds.join(',')})` : '';
    const matches = `inquiry_reference.ilike.${like},product_name.ilike.${like}${byCustomer}`;
    query = query.or(`and(or(${inquiryPeriodFilter(options.period)}),or(${matches}))`);
  } else {
    query = query.or(inquiryPeriodFilter(options.period));
  }

  const { data, error, count } = await query;
  if (error) return { error: actionError(error) };

  const rows = await attachTimings(supabase, (data || []).map(toInquiryBase));
  return { rows, total: count ?? 0, page, pageSize: PAGE_SIZE } satisfies PagedResult<AgentInquiryRow>;
}

/** Every inquiry for one of this agent's contacts, for the contact panel. */
export async function getContactInquiryHistory(agentId: string, contactId: string) {
  const ctx = await requireAgent(agentId);
  if ('error' in ctx) return ctx;
  const { supabase, organizationId } = ctx;

  let contactQuery = supabase
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('salesperson_id', agentId);
  if (organizationId) contactQuery = contactQuery.eq('organization_id', organizationId);
  const { data: contact } = await contactQuery.maybeSingle();
  if (!contact) return DENIED;

  const { data: leads } = await supabase.from('leads').select('id').eq('contact_id', contactId);
  const leadIds = (leads || []).map((l) => String(l.id));
  if (!leadIds.length) return { rows: [] as AgentInquiryRow[] };

  let query = supabase
    .from('lead_inquiries')
    .select('id, inquiry_reference, product_name, approval_status, sent_at, created_at, leads(name, lead_id_formatted)')
    .in('lead_id', leadIds)
    .eq('is_current_version', true)
    .order('created_at', { ascending: false })
    .limit(100);
  if (organizationId) query = query.eq('organization_id', organizationId);

  const { data, error } = await query;
  if (error) return { error: actionError(error) };
  return { rows: await attachTimings(supabase, (data || []).map(toInquiryBase)) };
}

export type TimelineItem = { at: string; label: string; detail: string | null };

const EVENT_LABELS: Record<string, string> = {
  submitted: 'Inquiry submitted',
  resubmitted: 'Inquiry resubmitted',
  operations_submitted: 'Operations responded',
  admin_calculated: 'Admin calculated',
  approved: 'Inquiry approved',
  rejected: 'Inquiry rejected',
  flagged: 'Inquiry flagged',
};

/** Recorded events only; nothing is inferred from current record states. */
export async function getAgentTimeline(agentId: string, period: AnalyticsPeriod) {
  if (!validPeriod(period)) return DENIED;
  const ctx = await requireAgent(agentId);
  if ('error' in ctx) return ctx;
  const { supabase, organizationId } = ctx;
  const LIMIT = 60;

  const scoped = <Q,>(query: Q): Q =>
    organizationId
      ? (query as unknown as { eq: (column: string, value: string) => Q }).eq('organization_id', organizationId)
      : query;
  const between = <Q,>(query: Q, column: string): Q => {
    const q = query as unknown as {
      gte: (c: string, v: string) => { lt: (c: string, v: string) => Q };
    };
    return q.gte(column, period.from).lt(column, period.to);
  };

  const [contacts, followupsCreated, followupsDone, quotationsCreated, quotationsSent, events, reports] =
    await Promise.all([
      between(scoped(supabase.from('contacts').select('name, created_at').eq('salesperson_id', agentId)), 'created_at')
        .order('created_at', { ascending: false })
        .limit(LIMIT),
      between(scoped(supabase.from('crm_activities').select('summary, created_at').eq('assigned_to', agentId)), 'created_at')
        .order('created_at', { ascending: false })
        .limit(LIMIT),
      between(
        scoped(supabase.from('crm_activities').select('summary, completed_at').eq('assigned_to', agentId).eq('status', 'done')),
        'completed_at'
      )
        .order('completed_at', { ascending: false })
        .limit(LIMIT),
      between(scoped(supabase.from('quotations').select('quotation_number, created_at').eq('salesperson_id', agentId)), 'created_at')
        .order('created_at', { ascending: false })
        .limit(LIMIT),
      between(
        scoped(supabase.from('quotations').select('quotation_number, sent_to_customer_at').eq('salesperson_id', agentId)),
        'sent_to_customer_at'
      )
        .order('sent_to_customer_at', { ascending: false })
        .limit(LIMIT),
      between(
        scoped(supabase.from('inquiry_workflow_events').select('event_type, occurred_at, actor').eq('sales_agent_id', agentId)),
        'occurred_at'
      )
        .order('occurred_at', { ascending: false })
        .limit(LIMIT),
      between(
        scoped(
          supabase
            .from('daily_work_reports')
            .select('report_date, submitted_at')
            .eq('sales_agent_id', agentId)
            .eq('status', 'submitted')
        ),
        'submitted_at'
      )
        .order('submitted_at', { ascending: false })
        .limit(LIMIT),
    ]);

  const items: TimelineItem[] = [
    ...(contacts.data || []).map((c) => ({ at: String(c.created_at), label: 'Contact created', detail: c.name ? String(c.name) : null })),
    ...(followupsCreated.data || []).map((f) => ({ at: String(f.created_at), label: 'Follow-up created', detail: f.summary ? String(f.summary) : null })),
    ...(followupsDone.data || []).map((f) => ({ at: String(f.completed_at), label: 'Follow-up completed', detail: f.summary ? String(f.summary) : null })),
    ...(quotationsCreated.data || []).map((q) => ({ at: String(q.created_at), label: 'Quotation created', detail: q.quotation_number ? String(q.quotation_number) : null })),
    ...(quotationsSent.data || []).map((q) => ({ at: String(q.sent_to_customer_at), label: 'Quotation sent', detail: q.quotation_number ? String(q.quotation_number) : null })),
    ...(events.data || []).map((e) => ({ at: String(e.occurred_at), label: EVENT_LABELS[String(e.event_type)] ?? String(e.event_type), detail: e.actor ? String(e.actor) : null })),
    ...(reports.data || []).map((r) => ({ at: String(r.submitted_at), label: 'Daily report submitted', detail: String(r.report_date) })),
  ];

  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  return { items: items.slice(0, LIMIT), truncated: items.length > LIMIT };
}

// ---------------------------------------------------------------------------
// Sales funnel for one agent: everything the agent dashboard shows above the
// record tables, for the period and the period just before it.
// ---------------------------------------------------------------------------

export type FunnelWindow = {
  contactsAdded: number;
  inquiriesReceived: number;
  receivedFromMobile: number;
  /** Received in the period and still a draft, not sent to Operations. */
  receivedStillDraft: number;
  inquiriesSent: number;
  approved: number;
  rejected: number;
  quotationsSent: number;
  quotedValue: number;
  salesOrders: number;
  salesOrderValue: number;
  activitiesLogged: number;
  activitiesDone: number;
  avgApprovalSeconds: number | null;
};

export type FunnelSeriesPoint = {
  day: string;
  contacts_added: number;
  quoted_value: number;
  sales_order_value: number;
};

export type FunnelStage = {
  name: string;
  isWon: boolean;
  isLost: boolean;
  count: number;
  addedInPeriod: number;
  expectedRevenue: number;
  avgAgeSeconds: number | null;
};

export type SalesAgentFunnel = {
  agent: { id: string; name: string };
  sources: string[];
  hasUnsourced: boolean;
  current: FunnelWindow;
  /** The same length of time just before the period; null for "All time". */
  previous: FunnelWindow | null;
  totalContacts: number;
  inProgress: number;
  series: FunnelSeriesPoint[];
  pipeline: FunnelStage[];
  activityTypes: Array<{ type: string; logged: number; done: number }>;
  rejectionReasons: Array<{ at: string; reason: string }>;
};

const DAY_MS = 86_400_000;
const KARACHI_MS = 5 * 3_600_000;
const karachiDay = (iso: string) => new Date(Date.parse(iso) + KARACHI_MS).toISOString().slice(0, 10);

type FunnelRange = { from: string; to: string };
const within = (iso: unknown, w: FunnelRange) =>
  typeof iso === 'string' && iso !== '' && iso >= w.from && iso < w.to;

/**
 * source: a contact source, '__none__' for contacts without one, or null for all.
 * Every record follows the source of its contact.
 */
export async function getSalesAgentFunnel(
  agentId: string,
  period: AnalyticsPeriod,
  options: FunnelOptions = {}
): Promise<SalesAgentFunnel | { error: string }> {
  if (!validPeriod(period)) return DENIED;
  const ctx = await requireAgent(agentId);
  if ('error' in ctx) return ctx;
  return buildSalesFunnel(ctx.supabase, ctx.organizationId, ctx.agent, period, options);
}

/**
 * The same funnel for the whole sales team in the active company. Admin views
 * only. Contacts include those without a sales agent, so the total matches the
 * Contacts page, and inquiries match the All Inquiries page.
 */
export async function getSalesTeamFunnel(
  period: AnalyticsPeriod,
  options: FunnelOptions = {}
): Promise<SalesAgentFunnel | { error: string }> {
  const access = resolveAnalyticsAccess(await getSession());
  if (access.kind !== 'admin' || !validPeriod(period)) return DENIED;
  const supabase = await createAdminClient();
  return buildSalesFunnel(supabase, access.organizationId, null, period, options);
}

type FunnelOptions = { source?: string | null; allTime?: boolean };

/** agent null = every agent (and unassigned contacts) in the organization scope. */
async function buildSalesFunnel(
  supabase: AgentContext['supabase'],
  organizationId: string | null,
  agent: AgentContext['agent'] | null,
  period: AnalyticsPeriod,
  options: FunnelOptions
): Promise<SalesAgentFunnel | { error: string }> {
  try {
    const LIMIT = 5000;

    let stagesQuery = supabase.from('crm_pipeline_stages').select('id, name, sequence, is_won, is_lost').order('sequence');
    if (organizationId) stagesQuery = stagesQuery.eq('organization_id', organizationId);

    let opportunitiesQuery = supabase
      .from('crm_opportunities')
      .select('id, stage_id, expected_revenue, created_at, contact_id')
      .limit(LIMIT);
    if (organizationId) opportunitiesQuery = opportunitiesQuery.eq('organization_id', organizationId);

    let contactsQuery = supabase
      .from('contacts')
      .select('id, source, created_at')
      .or('parent_id.is.null,company_type.eq.person')
      .limit(LIMIT);
    if (organizationId) contactsQuery = contactsQuery.eq('organization_id', organizationId);
    if (agent) contactsQuery = contactsQuery.eq('salesperson_id', agent.id);

    let inquiriesQuery = supabase
      .from('lead_inquiries')
      .select('id, created_at, sent_at, approval_status, customer_submitted, leads!inner(sales_agent_id, contact_id)')
      .or('is_current_version.is.null,is_current_version.eq.true')
      .limit(LIMIT);
    if (organizationId) inquiriesQuery = inquiriesQuery.eq('organization_id', organizationId);
    if (agent) inquiriesQuery = inquiriesQuery.eq('leads.sales_agent_id', agent.id);

    let eventsQuery = supabase
      .from('inquiry_workflow_events')
      .select('inquiry_id, event_type, occurred_at')
      .in('event_type', ['approved', 'rejected'])
      .limit(LIMIT);
    if (organizationId) eventsQuery = eventsQuery.eq('organization_id', organizationId);
    if (agent) eventsQuery = eventsQuery.eq('sales_agent_id', agent.id);

    let quotationsQuery = supabase
      .from('quotations')
      .select('total_amount, status, created_at, sent_to_customer_at, contact_id')
      .limit(LIMIT);
    if (organizationId) quotationsQuery = quotationsQuery.eq('organization_id', organizationId);
    if (agent) quotationsQuery = quotationsQuery.eq('salesperson_id', agent.id);

    let activitiesQuery = supabase
      .from('crm_activities')
      .select('activity_type, status, created_at, completed_at, opportunity_id')
      .limit(LIMIT);
    if (organizationId) activitiesQuery = activitiesQuery.eq('organization_id', organizationId);
    if (agent) activitiesQuery = activitiesQuery.eq('assigned_to', agent.id);

    let timingsQuery = supabase
      .from('analytics_inquiry_timings')
      .select('inquiry_id, decided_at, turnaround_seconds')
      .not('decided_at', 'is', null)
      .limit(LIMIT);
    if (organizationId) timingsQuery = timingsQuery.eq('organization_id', organizationId);
    if (agent) timingsQuery = timingsQuery.eq('sales_agent_id', agent.id);

    const [contacts, inquiries, events, quotations, opportunities, stages, activities, timings] = await Promise.all([
      contactsQuery,
      inquiriesQuery,
      eventsQuery,
      quotationsQuery,
      // Ownership uses the Kanban's own Own Documents rule, as fetchCrmPipeline does.
      agent
        ? applyCrmVisibilityFilter(opportunitiesQuery, {
            mode: 'assigned',
            session: { username: agent.username ?? '' } as SessionPayload,
            salesAgentId: agent.id,
          })
        : opportunitiesQuery,
      stagesQuery,
      activitiesQuery,
      timingsQuery,
    ]);
    for (const result of [contacts, inquiries, quotations, opportunities, stages]) {
      if (result.error) return { error: actionError(result.error, 'Unable to load sales analytics') };
    }

    // --- Source filter
    const sourceOf = new Map<string, string | null>();
    for (const c of contacts.data || []) sourceOf.set(String(c.id), c.source ? String(c.source) : null);
    const sources = [...new Set([...sourceOf.values()].filter((v): v is string => Boolean(v)))].sort();
    const hasUnsourced = [...sourceOf.values()].some((v) => !v);
    const source = options.source || null;
    const keep = (contactId: unknown) => {
      if (!source) return true;
      const value = contactId ? sourceOf.get(String(contactId)) : undefined;
      if (value === undefined) return false; // not one of this agent's contacts
      return source === '__none__' ? value === null : value === source;
    };

    const contactRows = (contacts.data || []).filter((c) => keep(c.id));
    const inquiryRows = (inquiries.data || [])
      .map((row) => {
        const lead = row.leads as { contact_id?: string | null } | Array<{ contact_id?: string | null }> | null;
        const contactId = Array.isArray(lead) ? lead[0]?.contact_id : lead?.contact_id;
        return { ...row, contactId: contactId ?? null };
      })
      .filter((row) => keep(row.contactId));
    const inquiryIds = new Set(inquiryRows.map((row) => String(row.id)));
    const eventRows = (events.data || []).filter((e) => !source || inquiryIds.has(String(e.inquiry_id)));
    const quotationRows = (quotations.data || []).filter((q) => keep(q.contact_id));
    const opportunityRows = (opportunities.data || []).filter((o) => keep(o.contact_id));
    const opportunityIds = new Set(opportunityRows.map((o) => String(o.id)));
    const activityRows = (activities.data || []).filter(
      (a) => !source || (a.opportunity_id && opportunityIds.has(String(a.opportunity_id)))
    );
    const timingRows = (timings.data || []).filter((t) => !source || inquiryIds.has(String(t.inquiry_id)));

    // --- Windows
    const current: FunnelRange = { from: period.from, to: period.to };
    const length = Date.parse(period.to) - Date.parse(period.from);
    const previous: FunnelRange | null = options.allTime
      ? null
      : { from: new Date(Date.parse(period.from) - length).toISOString(), to: period.from };

    const summarize = (w: FunnelRange): FunnelWindow => {
      const decisions = (type: string) =>
        new Set(eventRows.filter((e) => e.event_type === type && within(e.occurred_at, w)).map((e) => String(e.inquiry_id)))
          .size;
      const sent = quotationRows.filter((q) => within(q.sent_to_customer_at, w));
      const orders = quotationRows.filter((q) => q.status === 'sales_order' && within(q.created_at, w));
      const turnarounds = timingRows
        .filter((t) => within(t.decided_at, w) && t.turnaround_seconds !== null)
        .map((t) => Number(t.turnaround_seconds));
      const received = inquiryRows.filter((i) => within(i.created_at, w));
      return {
        contactsAdded: contactRows.filter((c) => within(c.created_at, w)).length,
        inquiriesReceived: received.length,
        receivedFromMobile: received.filter((i) => i.customer_submitted).length,
        receivedStillDraft: received.filter((i) => String(i.approval_status) === 'draft').length,
        inquiriesSent: inquiryRows.filter((i) => within(i.sent_at, w)).length,
        approved: decisions('approved'),
        rejected: decisions('rejected'),
        quotationsSent: sent.length,
        quotedValue: sent.reduce((sum, q) => sum + Number(q.total_amount || 0), 0),
        salesOrders: orders.length,
        salesOrderValue: orders.reduce((sum, q) => sum + Number(q.total_amount || 0), 0),
        activitiesLogged: activityRows.filter((a) => within(a.created_at, w)).length,
        activitiesDone: activityRows.filter((a) => a.status === 'done' && within(a.completed_at, w)).length,
        avgApprovalSeconds: turnarounds.length
          ? Math.round(turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length)
          : null,
      };
    };

    // --- Daily series for the period (Karachi days)
    const firstDay = karachiDay(period.from);
    const lastDay = karachiDay(new Date(Date.parse(period.to) - 1).toISOString());
    const points = new Map<string, FunnelSeriesPoint>();
    for (let t = Date.parse(`${firstDay}T00:00:00Z`); ; t += DAY_MS) {
      const day = new Date(t).toISOString().slice(0, 10);
      points.set(day, { day, contacts_added: 0, quoted_value: 0, sales_order_value: 0 });
      if (day >= lastDay) break;
    }
    for (const c of contactRows) {
      if (!within(c.created_at, current)) continue;
      const point = points.get(karachiDay(String(c.created_at)));
      if (point) point.contacts_added += 1;
    }
    for (const q of quotationRows) {
      if (!within(q.sent_to_customer_at, current)) continue;
      const point = points.get(karachiDay(String(q.sent_to_customer_at)));
      if (!point) continue;
      point.quoted_value += Number(q.total_amount || 0);
      if (q.status === 'sales_order') point.sales_order_value += Number(q.total_amount || 0);
    }

    // --- Pipeline: same-named stages merge, as on the Kanban's Admin view.
    const now = Date.now();
    type StageGroup = FunnelStage & { ids: Set<string>; ageTotal: number };
    const groups = new Map<string, StageGroup>();
    const stageGroup = new Map<string, StageGroup>();
    for (const stage of stages.data || []) {
      const key = String(stage.name || '').trim().toLowerCase();
      let group = groups.get(key);
      if (!group) {
        const shape = { name: String(stage.name || ''), is_won: Boolean(stage.is_won), is_lost: Boolean(stage.is_lost) };
        group = {
          name: shape.name,
          isWon: isWonStage(shape),
          isLost: isLostStage(shape),
          count: 0,
          addedInPeriod: 0,
          expectedRevenue: 0,
          avgAgeSeconds: null,
          ids: new Set(),
          ageTotal: 0,
        };
        groups.set(key, group);
      }
      group.ids.add(String(stage.id));
      stageGroup.set(String(stage.id), group);
    }
    for (const o of opportunityRows) {
      const group = stageGroup.get(String(o.stage_id));
      if (!group) continue; // the stage was deleted
      group.count += 1;
      group.expectedRevenue += Number(o.expected_revenue || 0);
      if (within(o.created_at, current)) group.addedInPeriod += 1;
      group.ageTotal += Math.max(0, (now - Date.parse(String(o.created_at))) / 1000);
    }
    const pipeline: FunnelStage[] = [...groups.values()].map((group) => ({
      name: group.name,
      isWon: group.isWon,
      isLost: group.isLost,
      count: group.count,
      addedInPeriod: group.addedInPeriod,
      expectedRevenue: group.expectedRevenue,
      avgAgeSeconds: group.count ? Math.round(group.ageTotal / group.count) : null,
    }));

    // --- Activities by type in the period
    const types = new Map<string, { type: string; logged: number; done: number }>();
    for (const a of activityRows) {
      const type = String(a.activity_type || 'other');
      const entry = types.get(type) ?? { type, logged: 0, done: 0 };
      if (within(a.created_at, current)) entry.logged += 1;
      if (a.status === 'done' && within(a.completed_at, current)) entry.done += 1;
      types.set(type, entry);
    }

    // --- Written rejection reasons in the period, newest first
    let rejectionReasons: Array<{ at: string; reason: string }> = [];
    const ids = [...inquiryIds].slice(0, 1000);
    if (ids.length) {
      const { data } = await supabase
        .from('inquiry_confirmations')
        .select('rejection_reason, reviewed_at, updated_at')
        .in('inquiry_id', ids)
        .not('rejection_reason', 'is', null);
      rejectionReasons = (data || [])
        .map((r) => ({ at: String(r.reviewed_at || r.updated_at), reason: String(r.rejection_reason || '').trim() }))
        .filter((r) => r.reason && within(r.at, current))
        .sort((a, b) => (a.at < b.at ? 1 : -1))
        .slice(0, 5);
    }

    return {
      agent: agent ? { id: agent.id, name: agent.name } : { id: 'team', name: 'Sales team' },
      sources,
      hasUnsourced,
      current: summarize(current),
      previous: previous ? summarize(previous) : null,
      totalContacts: contactRows.length,
      inProgress: inquiryRows.filter((i) => PENDING_STATUSES.has(String(i.approval_status))).length,
      series: [...points.values()],
      pipeline,
      activityTypes: [...types.values()].sort((a, b) => b.logged - a.logged || a.type.localeCompare(b.type)),
      rejectionReasons,
    };
  } catch (err) {
    return { error: actionError(err, 'Unable to load sales analytics') };
  }
}
