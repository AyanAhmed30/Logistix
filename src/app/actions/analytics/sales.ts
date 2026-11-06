'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { canViewEmployee, resolveAnalyticsAccess } from '@/lib/analytics/access';
import type { SessionPayload } from '@/lib/auth/session';
import { applyCrmVisibilityFilter } from '@/lib/crm-visibility';
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
