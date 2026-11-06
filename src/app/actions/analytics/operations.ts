'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { canViewEmployee, resolveAnalyticsAccess } from '@/lib/analytics/access';
import { hasDepartmentAccess, parsePermissionKeys } from '@/lib/module-permissions';
import type {
  AnalyticsEmployee,
  AnalyticsPeriod,
  AnalyticsSeriesPoint,
  OperationsOverview,
  PagedResult,
  TimelineItem,
} from '@/app/actions/analytics/sales';

export type OperationsEmployeeMetrics = {
  actor: string;
  inquiries_processed: number;
  submissions: number;
  approved: number;
  rejected: number;
  flags_raised: number;
  avg_operations_seconds: number | null;
};

export type OperationsInquiryRow = {
  inquiryId: string;
  reference: string | null;
  customer: string | null;
  salesAgent: string | null;
  approvalStatus: string;
  decision: string | null;
  flagCount: number;
  receivedAt: string | null;
  respondedAt: string | null;
  decidedAt: string | null;
  operationsSeconds: number | null;
  waitingSeconds: number | null;
};

const PAGE_SIZE = 25;
const DENIED = { error: 'Access Denied' } as const;

const numeric = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const validPeriod = (p: AnalyticsPeriod) => !Number.isNaN(Date.parse(p.from)) && !Number.isNaN(Date.parse(p.to));
const cleanSearch = (value: string | undefined) => String(value || '').replace(/[%_,.()"\\]/g, ' ').trim();

function normalizeOverview(row: Record<string, unknown> | undefined): OperationsOverview {
  const n = (key: string) => Number(row?.[key] ?? 0);
  return {
    received: n('received'),
    submitted_to_admin: n('submitted_to_admin'),
    approved: n('approved'),
    rejected: n('rejected'),
    flagged: n('flagged'),
    at_operations: n('at_operations'),
    with_admin: n('with_admin'),
    admin_calculating: n('admin_calculating'),
    avg_operations_seconds: numeric(row?.avg_operations_seconds),
    avg_admin_decision_seconds: numeric(row?.avg_admin_decision_seconds),
    avg_turnaround_seconds: numeric(row?.avg_turnaround_seconds),
  };
}

function normalizeEmployee(row: Record<string, unknown>): OperationsEmployeeMetrics {
  return {
    actor: String(row.actor),
    inquiries_processed: Number(row.inquiries_processed ?? 0),
    submissions: Number(row.submissions ?? 0),
    approved: Number(row.approved ?? 0),
    rejected: Number(row.rejected ?? 0),
    flags_raised: Number(row.flags_raised ?? 0),
    avg_operations_seconds: numeric(row.avg_operations_seconds),
  };
}

function normalizeSeries(rows: unknown): AnalyticsSeriesPoint[] {
  return ((rows || []) as Array<Record<string, unknown>>).map((r) => ({
    day: String(r.day),
    contacts_added: Number(r.contacts_added ?? 0),
    followups_completed: Number(r.followups_completed ?? 0),
    quotations_sent: Number(r.quotations_sent ?? 0),
    inquiries_received: Number(r.inquiries_received ?? 0),
    operations_submitted: Number(r.operations_submitted ?? 0),
    approved: Number(r.approved ?? 0),
    rejected: Number(r.rejected ?? 0),
  }));
}

/**
 * Names for the employee picker: legacy Operations users, portal users with
 * Operations access, and anyone recorded as having submitted Operations work.
 * The id is the username, the only link the workflow records.
 */
export async function getOperationsEmployees() {
  const access = resolveAnalyticsAccess(await getSession());
  if (access.kind !== 'admin') return DENIED;

  const supabase = await createAdminClient();
  const organizationId = access.organizationId;

  const [opsUsers, portalUsers, worked, members] = await Promise.all([
    supabase.from('operations_users').select('name, username, app_user_id'),
    supabase.from('app_users').select('id, username, full_name, permissions'),
    supabase.rpc('analytics_operations_employee_metrics', { p_organization_id: organizationId }),
    organizationId
      ? supabase.from('user_organizations').select('user_id').eq('organization_id', organizationId)
      : Promise.resolve({ data: null }),
  ]);

  if (opsUsers.error) return { error: opsUsers.error.message };

  const memberIds = members.data ? new Set(members.data.map((m) => String(m.user_id))) : null;
  const inScope = (appUserId: unknown) => !memberIds || (Boolean(appUserId) && memberIds.has(String(appUserId)));

  const allNames = new Map<string, string>();
  const employees = new Map<string, string>();

  for (const user of portalUsers.data || []) {
    const key = String(user.username || '').toLowerCase();
    if (!key) continue;
    const name = String(user.full_name || user.username);
    allNames.set(key, name);
    if (inScope(user.id) && hasDepartmentAccess(parsePermissionKeys(user.permissions), 'operations')) {
      employees.set(key, name);
    }
  }
  for (const user of opsUsers.data || []) {
    const key = String(user.username || '').toLowerCase();
    if (!key) continue;
    const name = String(user.name || user.username);
    allNames.set(key, name);
    if (inScope(user.app_user_id)) employees.set(key, name);
  }
  for (const row of (worked.data || []) as Array<{ actor: string }>) {
    const key = String(row.actor).toLowerCase();
    if (!employees.has(key)) employees.set(key, allNames.get(key) ?? row.actor);
  }

  const list: AnalyticsEmployee[] = [...employees.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { employees: list };
}

export async function getOperationsEmployeeDetail(username: string, period: AnalyticsPeriod) {
  const access = resolveAnalyticsAccess(await getSession());
  if (!validPeriod(period) || !canViewEmployee(access, 'operations', username)) return DENIED;
  if (access.kind === 'denied') return DENIED;

  const supabase = await createAdminClient();
  const organizationId = access.organizationId;

  const { data: settingsRows } = await supabase
    .from('daily_report_settings')
    .select('organization_id, inquiry_pending_alert_hours');
  const settings =
    (settingsRows || []).find((r) => organizationId && r.organization_id === organizationId) ||
    (settingsRows || []).find((r) => r.organization_id === null);
  const alertHours = Number(settings?.inquiry_pending_alert_hours ?? 24);
  const overdueBefore = new Date(Date.now() - alertHours * 3_600_000).toISOString();

  const timings = () => {
    const query = supabase.from('analytics_inquiry_timings').select('inquiry_id', { count: 'exact', head: true });
    return organizationId ? query.eq('organization_id', organizationId) : query;
  };
  const attributed = (status: string) =>
    timings()
      .ilike('operations_actor', username)
      .eq('approval_status', status)
      .gte('first_submitted_at', period.from)
      .lt('first_submitted_at', period.to);

  const [employee, series, overview, opsUser, portalUser, withAdmin, approved, rejected, overdue] = await Promise.all([
    supabase.rpc('analytics_operations_employee_metrics', {
      p_organization_id: organizationId,
      p_from: period.from,
      p_to: period.to,
      p_actor: username,
    }),
    supabase.rpc('analytics_daily_series', {
      p_from: period.from,
      p_to: period.to,
      p_organization_id: organizationId,
      p_actor: username,
    }),
    supabase.rpc('analytics_operations_overview', {
      p_organization_id: organizationId,
      p_from: period.from,
      p_to: period.to,
    }),
    supabase.from('operations_users').select('name').ilike('username', username).limit(1),
    supabase.from('app_users').select('full_name').ilike('username', username).limit(1),
    attributed('sent_to_admin'),
    attributed('approved'),
    attributed('rejected'),
    timings().eq('approval_status', 'sent').lt('first_submitted_at', overdueBefore),
  ]);

  if (employee.error) return { error: employee.error.message };

  const row = (employee.data as Array<Record<string, unknown>> | null)?.[0];
  const queues = normalizeOverview(overview.data?.[0]);
  return {
    name: String(opsUser.data?.[0]?.name || portalUser.data?.[0]?.full_name || username),
    metrics: normalizeEmployee(row ?? { actor: username.toLowerCase() }),
    series: normalizeSeries(series.data),
    alertHours,
    teamQueue: queues.at_operations,
    teamOverdue: overdue.count ?? 0,
    workflow: {
      withAdmin: withAdmin.count ?? 0,
      approved: approved.count ?? 0,
      rejected: rejected.count ?? 0,
    },
  };
}

/**
 * Attributed mode lists inquiries this person sent to Admin. Shared mode lists the
 * team queue, which belongs to nobody. An employee can only ask for their own
 * attributed records, whatever the client sends.
 */
export async function getOperationsInquiries(options: {
  username: string;
  shared?: boolean;
  page?: number;
  period: AnalyticsPeriod;
  status?: string | null;
  search?: string;
}) {
  const access = resolveAnalyticsAccess(await getSession());
  if (!validPeriod(options.period) || !canViewEmployee(access, 'operations', options.username)) return DENIED;
  if (access.kind === 'denied') return DENIED;

  const page = Number.isInteger(options.page) && (options.page as number) > 0 ? (options.page as number) : 1;
  const start = (page - 1) * PAGE_SIZE;
  const supabase = await createAdminClient();

  let query = supabase
    .from('analytics_inquiry_timings')
    .select('*', { count: 'exact' })
    .order('first_submitted_at', { ascending: Boolean(options.shared) })
    .order('inquiry_id', { ascending: false })
    .range(start, start + PAGE_SIZE - 1);

  if (access.organizationId) query = query.eq('organization_id', access.organizationId);

  if (options.shared) {
    query = query.eq('approval_status', 'sent');
  } else {
    query = query
      .ilike('operations_actor', options.username)
      .gte('first_submitted_at', options.period.from)
      .lt('first_submitted_at', options.period.to);
    if (options.status) query = query.eq('approval_status', options.status);
  }

  const needle = cleanSearch(options.search);
  if (needle) {
    const like = `%${needle}%`;
    const [byReference, byCustomer] = await Promise.all([
      supabase.from('lead_inquiries').select('id').ilike('inquiry_reference', like).limit(150),
      supabase.from('leads').select('id').ilike('name', like).limit(150),
    ]);
    const inquiryIds = (byReference.data || []).map((r) => String(r.id));
    const leadIds = (byCustomer.data || []).map((l) => String(l.id));
    if (!inquiryIds.length && !leadIds.length) {
      return { rows: [], total: 0, page, pageSize: PAGE_SIZE } satisfies PagedResult<OperationsInquiryRow>;
    }
    const clauses = [
      inquiryIds.length ? `inquiry_id.in.(${inquiryIds.join(',')})` : '',
      leadIds.length ? `lead_id.in.(${leadIds.join(',')})` : '',
    ].filter(Boolean);
    query = query.or(clauses.join(','));
  }

  const { data, error, count } = await query;
  if (error) return { error: error.message };

  const timings = data || [];
  const inquiryIds = timings.map((t) => String(t.inquiry_id));
  const leadIds = [...new Set(timings.map((t) => String(t.lead_id)))];
  const agentIds = [...new Set(timings.map((t) => t.sales_agent_id).filter(Boolean).map(String))];

  const [refs, leads, agents] = await Promise.all([
    inquiryIds.length
      ? supabase.from('lead_inquiries').select('id, inquiry_reference').in('id', inquiryIds)
      : Promise.resolve({ data: [] }),
    leadIds.length
      ? supabase.from('leads').select('id, name').in('id', leadIds)
      : Promise.resolve({ data: [] }),
    agentIds.length
      ? supabase.from('sales_agents').select('id, name').in('id', agentIds)
      : Promise.resolve({ data: [] }),
  ]);
  const refById = new Map((refs.data || []).map((r) => [String(r.id), r.inquiry_reference as string | null]));
  const leadName = new Map((leads.data || []).map((l) => [String(l.id), String(l.name || '')]));
  const agentName = new Map((agents.data || []).map((a) => [String(a.id), String(a.name || '')]));

  const now = Date.now();
  const rows: OperationsInquiryRow[] = timings.map((t) => ({
    inquiryId: String(t.inquiry_id),
    reference: refById.get(String(t.inquiry_id)) ?? null,
    customer: leadName.get(String(t.lead_id)) ?? null,
    salesAgent: t.sales_agent_id ? agentName.get(String(t.sales_agent_id)) ?? null : null,
    approvalStatus: String(t.approval_status),
    decision: t.decision ?? null,
    flagCount: Number(t.flag_count || 0),
    receivedAt: t.first_submitted_at,
    respondedAt: t.last_operations_submitted_at,
    decidedAt: t.decided_at,
    operationsSeconds: numeric(t.operations_seconds),
    waitingSeconds: t.first_submitted_at ? (now - Date.parse(t.first_submitted_at)) / 1000 : null,
  }));

  return { rows, total: count ?? 0, page, pageSize: PAGE_SIZE } satisfies PagedResult<OperationsInquiryRow>;
}

const ACTIVITY_LABELS: Record<string, string> = {
  operations_submitted: 'Sent to Admin',
  flagged: 'Raised a flag',
};

/** What the workflow recorded against this username. */
export async function getOperationsActivity(username: string, period: AnalyticsPeriod) {
  const access = resolveAnalyticsAccess(await getSession());
  if (!validPeriod(period) || !canViewEmployee(access, 'operations', username)) return DENIED;
  if (access.kind === 'denied') return DENIED;

  const LIMIT = 60;
  const supabase = await createAdminClient();
  let query = supabase
    .from('inquiry_workflow_events')
    .select('event_type, occurred_at, inquiry_id', { count: 'exact' })
    .ilike('actor', username)
    .in('event_type', ['operations_submitted', 'flagged'])
    .gte('occurred_at', period.from)
    .lt('occurred_at', period.to)
    .order('occurred_at', { ascending: false })
    .limit(LIMIT);
  if (access.organizationId) query = query.eq('organization_id', access.organizationId);

  const { data, error, count } = await query;
  if (error) return { error: error.message };

  const inquiryIds = [...new Set((data || []).map((e) => String(e.inquiry_id)))];
  const { data: refs } = inquiryIds.length
    ? await supabase.from('lead_inquiries').select('id, inquiry_reference').in('id', inquiryIds)
    : { data: [] };
  const refById = new Map((refs || []).map((r) => [String(r.id), r.inquiry_reference as string | null]));

  const items: TimelineItem[] = (data || []).map((e) => ({
    at: String(e.occurred_at),
    label: ACTIVITY_LABELS[String(e.event_type)] ?? String(e.event_type),
    detail: refById.get(String(e.inquiry_id)) ?? null,
  }));
  return { items, truncated: (count ?? 0) > LIMIT };
}

export type OperationsAdminInquiryRow = {
  inquiryId: string;
  reference: string | null;
  customerId: string | null;
  customer: string | null;
  salesAgent: string | null;
  actor: string | null;
  approvalStatus: string;
  flagCount: number;
  receivedAt: string | null;
  respondedAt: string | null;
  decidedAt: string | null;
};

/** Summary cards for the whole team. Admin calculation stays separate from approval. */
export async function getOperationsAdminSummary(period: AnalyticsPeriod) {
  const access = resolveAnalyticsAccess(await getSession());
  if (access.kind !== 'admin' || !validPeriod(period)) return DENIED;

  const supabase = await createAdminClient();
  let calculated = supabase
    .from('analytics_inquiry_timings')
    .select('inquiry_id', { count: 'exact', head: true })
    .eq('admin_calculated', true)
    .gte('last_calculation_at', period.from)
    .lt('last_calculation_at', period.to);
  if (access.organizationId) calculated = calculated.eq('organization_id', access.organizationId);

  const [overview, calculatedCount] = await Promise.all([
    supabase.rpc('analytics_operations_overview', {
      p_organization_id: access.organizationId,
      p_from: period.from,
      p_to: period.to,
    }),
    calculated,
  ]);
  if (overview.error) return { error: overview.error.message };

  const row = normalizeOverview(overview.data?.[0]);
  return {
    received: row.received,
    submitted: row.submitted_to_admin,
    approved: row.approved,
    rejected: row.rejected,
    calculated: calculatedCount.count ?? 0,
  };
}

export async function getOperationsAdminInquiries(options: {
  page?: number;
  period: AnalyticsPeriod;
  search?: string;
  status?: string | null;
  salesAgentId?: string | null;
  actor?: string | null;
  flags?: 'any' | 'multiple' | null;
}) {
  const access = resolveAnalyticsAccess(await getSession());
  if (access.kind !== 'admin' || !validPeriod(options.period)) return DENIED;

  const page = Number.isInteger(options.page) && (options.page as number) > 0 ? (options.page as number) : 1;
  const start = (page - 1) * PAGE_SIZE;
  const supabase = await createAdminClient();
  const empty = { rows: [], total: 0, page, pageSize: PAGE_SIZE } satisfies PagedResult<OperationsAdminInquiryRow>;

  let query = supabase
    .from('analytics_inquiry_timings')
    .select('*', { count: 'exact' })
    .gte('first_submitted_at', options.period.from)
    .lt('first_submitted_at', options.period.to)
    .order('first_submitted_at', { ascending: false })
    .order('inquiry_id', { ascending: false })
    .range(start, start + PAGE_SIZE - 1);

  if (access.organizationId) query = query.eq('organization_id', access.organizationId);
  if (options.status) query = query.eq('approval_status', options.status);
  if (options.salesAgentId) query = query.eq('sales_agent_id', options.salesAgentId);
  if (options.actor) query = query.ilike('operations_actor', options.actor);
  if (options.flags === 'any') query = query.gte('flag_count', 1);
  if (options.flags === 'multiple') query = query.gte('flag_count', 2);

  const needle = cleanSearch(options.search);
  if (needle) {
    const like = `%${needle}%`;
    const [byReference, byCustomer] = await Promise.all([
      supabase.from('lead_inquiries').select('id').ilike('inquiry_reference', like).limit(150),
      supabase.from('leads').select('id').or(`name.ilike.${like},lead_id_formatted.ilike.${like}`).limit(150),
    ]);
    const inquiryIds = (byReference.data || []).map((r) => String(r.id));
    const leadIds = (byCustomer.data || []).map((l) => String(l.id));
    if (!inquiryIds.length && !leadIds.length) return empty;
    query = query.or(
      [
        inquiryIds.length ? `inquiry_id.in.(${inquiryIds.join(',')})` : '',
        leadIds.length ? `lead_id.in.(${leadIds.join(',')})` : '',
      ]
        .filter(Boolean)
        .join(',')
    );
  }

  const { data, error, count } = await query;
  if (error) return { error: error.message };

  const timings = data || [];
  const inquiryIds = timings.map((t) => String(t.inquiry_id));
  const leadIds = [...new Set(timings.map((t) => String(t.lead_id)))];
  const agentIds = [...new Set(timings.map((t) => t.sales_agent_id).filter(Boolean).map(String))];

  const [refs, leads, agents] = await Promise.all([
    inquiryIds.length
      ? supabase.from('lead_inquiries').select('id, inquiry_reference').in('id', inquiryIds)
      : Promise.resolve({ data: [] }),
    leadIds.length
      ? supabase.from('leads').select('id, name, lead_id_formatted').in('id', leadIds)
      : Promise.resolve({ data: [] }),
    agentIds.length
      ? supabase.from('sales_agents').select('id, name').in('id', agentIds)
      : Promise.resolve({ data: [] }),
  ]);
  const refById = new Map((refs.data || []).map((r) => [String(r.id), r.inquiry_reference as string | null]));
  const leadById = new Map((leads.data || []).map((l) => [String(l.id), l]));
  const agentName = new Map((agents.data || []).map((a) => [String(a.id), String(a.name || '')]));

  const rows: OperationsAdminInquiryRow[] = timings.map((t) => {
    const lead = leadById.get(String(t.lead_id));
    return {
      inquiryId: String(t.inquiry_id),
      reference: refById.get(String(t.inquiry_id)) ?? null,
      customerId: lead?.lead_id_formatted ? String(lead.lead_id_formatted) : null,
      customer: lead?.name ? String(lead.name) : null,
      salesAgent: t.sales_agent_id ? agentName.get(String(t.sales_agent_id)) ?? null : null,
      actor: t.operations_actor ?? null,
      approvalStatus: String(t.approval_status),
      flagCount: Number(t.flag_count || 0),
      receivedAt: t.first_submitted_at,
      respondedAt: t.last_operations_submitted_at,
      decidedAt: t.decided_at,
    };
  });

  return { rows, total: count ?? 0, page, pageSize: PAGE_SIZE } satisfies PagedResult<OperationsAdminInquiryRow>;
}

/** What the logged-in employee can open under Analytics. */
export async function getMyAnalyticsProfile() {
  const session = await getSession();
  const access = resolveAnalyticsAccess(session);
  if (access.kind !== 'self' || !session) return DENIED;

  let salesAgentId: string | null = null;
  if (access.departments.includes('sales')) {
    const supabase = await createAdminClient();
    const byAppUser = session.appUserId
      ? await supabase.from('sales_agents').select('id').eq('app_user_id', session.appUserId).limit(1)
      : { data: [] };
    const byUsername = byAppUser.data?.length
      ? byAppUser
      : await supabase.from('sales_agents').select('id').ilike('username', access.username).limit(1);
    salesAgentId = byUsername.data?.[0]?.id ? String(byUsername.data[0].id) : null;
  }

  return {
    sales: access.departments.includes('sales'),
    salesAgentId,
    operations: access.departments.includes('operations'),
    username: access.username,
  };
}
