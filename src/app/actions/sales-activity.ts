'use server';

/**
 * Sales agent working day (Start Day / End Day) and Admin's activity and
 * report views. Migration 057. All timestamps are set here on the server.
 *
 * - Agents submit only their own check-in and end-of-day report, once per
 *   working day (Pakistan date).
 * - End Day reports use the existing daily_work_reports table (052).
 * - Admin views are Super Admin only and follow the selected company.
 */

import { createAdminClient } from '@/utils/supabase/server';
import { getSession, type SessionPayload } from '@/lib/auth/session';
import { isSuperAdminSession, SUPER_ADMIN_USERNAME } from '@/lib/auth/super-admin';
import { actionError } from '@/lib/user-facing-error';
import { closeStaleSessions, isTrackedSalesAgent } from '@/lib/auth/activity-tracking';
import { addDaysYmd, isValidYmd, karachiDayEndExclusiveUtc, karachiDayStartUtc, karachiTodayYmd } from '@/lib/contact-date-range';
import { dailyReportDeadline } from '@/lib/analytics/daily-report-status';
import { resolveInquiryAttachmentContentType } from '@/lib/inquiry-storage';
import {
  WORK_LOG_BUCKET,
  WORK_LOG_COLUMNS,
  ensureWorkLogBucket,
  isAllowedAttachment,
  safeFileName,
  toWorkLogEntries,
  type StoredAttachment,
  type WorkLogRow,
} from '@/lib/sales-activity-storage';
import {
  WORK_LOG_MAX_FILES,
  WORK_LOG_MAX_TOTAL_BYTES,
  isWorkLogType,
  type WorkLogEntry,
} from '@/lib/sales-work-log-types';
import { getDistributionTracking, type TrackedLead } from '@/app/actions/lead-distribution';

type Supabase = Awaited<ReturnType<typeof createAdminClient>>;

const SETUP_REQUIRED = { setupRequired: true as const };
const MAX_TEXT = 4000;
const OFFSET_MS = 5 * 60 * 60 * 1000;
const karachiDate = (iso: string) => new Date(Date.parse(iso) + OFFSET_MS).toISOString().slice(0, 10);

function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = String(error.message || '');
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    error.code === '42703' ||
    message.includes('sales_agent_') ||
    message.includes('support_request')
  );
}

const text = (value: unknown) => String(value ?? '').trim().slice(0, MAX_TEXT);

// ---------------------------------------------------------------------------
// Agent side
// ---------------------------------------------------------------------------

type AgentContext = {
  supabase: Supabase;
  session: SessionPayload;
  agent: { id: string; name: string };
  today: string;
};

async function requireAgent(): Promise<AgentContext | { error: string }> {
  const session = await getSession();
  if (!session || !isTrackedSalesAgent(session)) return { error: 'Only sales agents can start or end a working day.' };
  const supabase = await createAdminClient();
  const { resolveSalesAgentForSession } = await import('@/lib/legacy-user-bridge');
  const agent = await resolveSalesAgentForSession(supabase, session);
  if (!agent?.id) return { error: 'Your login is not linked to a sales agent. Ask Admin to check your account.' };
  return {
    supabase,
    session,
    agent: { id: String(agent.id), name: String(agent.name || agent.username || session.fullName || session.username) },
    today: karachiTodayYmd(),
  };
}

export type DayStats = {
  leadsAssigned: number | null;
  inquiriesSent: number | null;
  contactsAdded: number | null;
  followUpsCompleted: number | null;
  quotationsSent: number | null;
};

/** Today's counts from the system's own records (null when a source is unavailable). */
async function todayStats(supabase: Supabase, agentId: string, day: string): Promise<DayStats> {
  const from = karachiDayStartUtc(day);
  const to = karachiDayEndExclusiveUtc(day);
  const count = async (query: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await query;
    return error ? null : n ?? 0;
  };
  const [leadsAssigned, inquiriesSent, contactsAdded, followUpsCompleted, quotationsSent] = await Promise.all([
    count(
      supabase
        .from('lead_distribution_leads')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_sales_agent_id', agentId)
        .gte('assigned_at', from)
        .lt('assigned_at', to)
    ),
    count(
      supabase
        .from('lead_inquiries')
        .select('id, leads!inner(sales_agent_id)', { count: 'exact', head: true })
        .eq('leads.sales_agent_id', agentId)
        .eq('sent_to_accounting', true)
        .gte('sent_at', from)
        .lt('sent_at', to)
    ),
    count(
      supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('salesperson_id', agentId)
        .gte('created_at', from)
        .lt('created_at', to)
    ),
    count(
      supabase
        .from('crm_activities')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', agentId)
        .eq('status', 'done')
        .gte('completed_at', from)
        .lt('completed_at', to)
    ),
    count(
      supabase
        .from('quotations')
        .select('id', { count: 'exact', head: true })
        .eq('salesperson_id', agentId)
        .gte('sent_to_customer_at', from)
        .lt('sent_to_customer_at', to)
    ),
  ]);
  return { leadsAssigned, inquiriesSent, contactsAdded, followUpsCompleted, quotationsSent };
}

export type MyWorkDay = {
  workDate: string;
  startedAt: string | null;
  endedAt: string | null;
  stats: DayStats;
};

export async function getMyWorkDay(): Promise<MyWorkDay | typeof SETUP_REQUIRED | { error: string }> {
  try {
    const ctx = await requireAgent();
    if ('error' in ctx) return ctx;
    const { supabase, agent, today } = ctx;
    const [checkIn, report, stats] = await Promise.all([
      supabase.from('sales_agent_day_checkins').select('submitted_at').eq('sales_agent_id', agent.id).eq('work_date', today).maybeSingle(),
      supabase
        .from('daily_work_reports')
        .select('submitted_at')
        .eq('sales_agent_id', agent.id)
        .eq('department', 'sales')
        .eq('report_date', today)
        .eq('status', 'submitted')
        .limit(1)
        .maybeSingle(),
      todayStats(supabase, agent.id, today),
    ]);
    if (isMissingTable(checkIn.error)) return SETUP_REQUIRED;
    return {
      workDate: today,
      startedAt: checkIn.data?.submitted_at ? String(checkIn.data.submitted_at) : null,
      endedAt: report.data?.submitted_at ? String(report.data.submitted_at) : null,
      stats,
    };
  } catch (err) {
    return { error: actionError(err, 'Unable to load your working day') };
  }
}

async function notifyAdmin(
  supabase: Supabase,
  input: { sender: string; eventType: string; title: string; message: string; payload: Record<string, unknown> }
) {
  const { error } = await supabase.from('inquiry_lifecycle_notifications').insert({
    lead_id: null,
    sender_role: 'sales_agent',
    sender_username: input.sender,
    recipient_role: 'admin',
    recipient_username: SUPER_ADMIN_USERNAME,
    event_type: input.eventType,
    title: input.title,
    message: input.message.slice(0, 500),
    href: '/admin/dashboard',
    payload: input.payload,
  });
  if (error) console.error('[sales-activity] admin notification not saved', error.code, error.message);
}

export type StartDayInput = {
  internetOk: boolean;
  previousTasks: 'yes' | 'no' | 'partial';
  hasIssue: boolean;
  issueText?: string;
};

export async function submitStartDay(input: StartDayInput): Promise<{ startedAt: string } | typeof SETUP_REQUIRED | { error: string }> {
  try {
    const ctx = await requireAgent();
    if ('error' in ctx) return ctx;
    const { supabase, session, agent, today } = ctx;
    const previousTasks = input?.previousTasks;
    if (typeof input?.internetOk !== 'boolean') return { error: 'Answer the internet question.' };
    if (previousTasks !== 'yes' && previousTasks !== 'no' && previousTasks !== 'partial') {
      return { error: "Answer the previous day's tasks question." };
    }
    const issueText = input.hasIssue ? text(input.issueText) : '';
    if (input.hasIssue && !issueText) return { error: 'Describe the problem.' };

    const now = new Date().toISOString();
    const { error } = await supabase.from('sales_agent_day_checkins').insert({
      sales_agent_id: agent.id,
      app_user_id: session.appUserId ?? null,
      username: session.username,
      organization_id: session.organizationId ?? null,
      work_date: today,
      submitted_at: now,
      internet_ok: input.internetOk,
      previous_tasks: previousTasks,
      has_issue: Boolean(input.hasIssue),
      issue_text: issueText || null,
    });
    if (isMissingTable(error)) return SETUP_REQUIRED;
    if (error?.code === '23505') return { error: 'You have already started today.' };
    if (error) return { error: actionError(error, 'Your Start Day could not be saved') };

    const payload = { salesAgentId: agent.id, workDate: today };
    await notifyAdmin(supabase, {
      sender: session.username,
      eventType: 'agent_day_started',
      title: 'Working Day Started',
      message: `${agent.name} started the working day.`,
      payload,
    });
    if (issueText || !input.internetOk) {
      await notifyAdmin(supabase, {
        sender: session.username,
        eventType: 'agent_issue_reported',
        title: 'Sales Agent Reported an Issue',
        message: `${agent.name}: ${!input.internetOk ? 'internet is not working. ' : ''}${issueText}`.trim(),
        payload,
      });
    }
    return { startedAt: now };
  } catch (err) {
    return { error: actionError(err, 'Your Start Day could not be saved') };
  }
}

export type EndDayInput = {
  completedWork: string;
  hasPendingTasks: boolean;
  pendingTasks?: string;
  hadProblems: boolean;
  problems?: string;
  needsSupport: boolean;
  support?: string;
  nextDayPlan: string;
};

export async function submitEndDay(input: EndDayInput): Promise<{ endedAt: string } | typeof SETUP_REQUIRED | { error: string }> {
  try {
    const ctx = await requireAgent();
    if ('error' in ctx) return ctx;
    const { supabase, session, agent, today } = ctx;

    const completedWork = text(input?.completedWork);
    const pendingTasks = input?.hasPendingTasks ? text(input.pendingTasks) : '';
    const problems = input?.hadProblems ? text(input.problems) : '';
    const support = input?.needsSupport ? text(input.support) : '';
    const nextDayPlan = text(input?.nextDayPlan);
    if (!completedWork) return { error: 'Describe the work you completed today.' };
    if (input.hasPendingTasks && !pendingTasks) return { error: 'Explain the pending tasks.' };
    if (input.hadProblems && !problems) return { error: 'Describe the problems you faced.' };
    if (input.needsSupport && !support) return { error: 'Describe the support you need.' };

    const { data: started, error: startError } = await supabase
      .from('sales_agent_day_checkins')
      .select('id')
      .eq('sales_agent_id', agent.id)
      .eq('work_date', today)
      .maybeSingle();
    if (isMissingTable(startError)) return SETUP_REQUIRED;
    if (!started) return { error: 'Start your day first, then end it.' };

    const { data: settings } = await supabase
      .from('daily_report_settings')
      .select('organization_id, deadline_local')
      .or(session.organizationId ? `organization_id.is.null,organization_id.eq.${session.organizationId}` : 'organization_id.is.null');
    const setting =
      (settings || []).find((s) => s.organization_id && s.organization_id === session.organizationId) ??
      (settings || []).find((s) => !s.organization_id);
    const deadline = setting?.deadline_local ? dailyReportDeadline(today, String(setting.deadline_local)) : null;

    const now = new Date();
    const stats = await todayStats(supabase, agent.id, today);
    const { error } = await supabase.from('daily_work_reports').insert({
      organization_id: session.organizationId ?? null,
      department: 'sales',
      employee_username: session.username,
      employee_name: agent.name,
      app_user_id: session.appUserId ?? null,
      sales_agent_id: agent.id,
      report_date: today,
      status: 'submitted',
      work_summary: completedWork,
      pending_tasks: pendingTasks,
      issues_summary: problems,
      support_request: support,
      tomorrow_plan: nextDayPlan,
      system_counts: stats,
      deadline_at: deadline ? deadline.toISOString() : null,
      submitted_at: now.toISOString(),
      is_late: deadline ? now > deadline : false,
    });
    if (isMissingTable(error)) return SETUP_REQUIRED;
    if (error?.code === '23505') return { error: 'You have already submitted today’s report.' };
    if (error) return { error: actionError(error, 'Your report could not be saved') };

    const payload = { salesAgentId: agent.id, workDate: today };
    await notifyAdmin(supabase, {
      sender: session.username,
      eventType: 'agent_day_ended',
      title: 'End-of-Day Report Submitted',
      message: `${agent.name} submitted the end-of-day report.`,
      payload,
    });
    if (problems) {
      await notifyAdmin(supabase, {
        sender: session.username,
        eventType: 'agent_issue_reported',
        title: 'Sales Agent Reported an Issue',
        message: `${agent.name}: ${problems}`,
        payload,
      });
    }
    if (support) {
      await notifyAdmin(supabase, {
        sender: session.username,
        eventType: 'agent_support_requested',
        title: 'Sales Agent Needs Support',
        message: `${agent.name}: ${support}`,
        payload,
      });
    }
    return { endedAt: now.toISOString() };
  } catch (err) {
    return { error: actionError(err, 'Your report could not be saved') };
  }
}

// ---------------------------------------------------------------------------
// Agent side: manual work logs (migration 058)
// ---------------------------------------------------------------------------

export type LogContactOption = { id: string; name: string; customerId: string | null };

/** The agent's own contacts (salesperson = this agent) in the current company, by name or Customer ID. */
export async function searchMyLogContacts(
  query: string
): Promise<{ contacts: LogContactOption[] } | { error: string }> {
  try {
    const ctx = await requireAgent();
    if ('error' in ctx) return ctx;
    const { supabase, session, agent } = ctx;
    const needle = String(query || '').replace(/[%,()*\\]/g, ' ').trim().slice(0, 80);
    let q = supabase
      .from('contacts')
      .select('id, name, lead_id_formatted')
      .eq('salesperson_id', agent.id)
      .order('name')
      .limit(20);
    if (session.organizationId) q = q.eq('organization_id', session.organizationId);
    if (needle) q = q.or(`name.ilike.%${needle}%,lead_id_formatted.ilike.%${needle}%`);
    const { data, error } = await q;
    if (error) return { error: actionError(error, 'Unable to search your customers') };
    return {
      contacts: (data || []).map((c) => ({
        id: String(c.id),
        name: String(c.name || 'Unnamed'),
        customerId: c.lead_id_formatted ? String(c.lead_id_formatted) : null,
      })),
    };
  } catch (err) {
    return { error: actionError(err, 'Unable to search your customers') };
  }
}

/** The agent's own logs for one Pakistan day (today by default), newest first. */
export async function getMyWorkLogs(
  date?: string
): Promise<{ date: string; logs: WorkLogEntry[] } | typeof SETUP_REQUIRED | { error: string }> {
  try {
    const ctx = await requireAgent();
    if ('error' in ctx) return ctx;
    const { supabase, agent, today } = ctx;
    const day = date && isValidYmd(date) && date <= today ? date : today;
    const { data, error } = await supabase
      .from('sales_agent_work_logs')
      .select(WORK_LOG_COLUMNS)
      .eq('sales_agent_id', agent.id)
      .gte('logged_at', karachiDayStartUtc(day))
      .lt('logged_at', karachiDayEndExclusiveUtc(day))
      .order('logged_at', { ascending: false })
      .limit(500);
    if (isMissingTable(error)) return SETUP_REQUIRED;
    if (error) return { error: actionError(error, 'Unable to load your logs') };
    const logs = await toWorkLogEntries(supabase, (data || []) as WorkLogRow[], new Map([[agent.id, agent.name]]));
    return { date: day, logs };
  } catch (err) {
    return { error: actionError(err, 'Unable to load your logs') };
  }
}

/**
 * Save one manual log. FormData: activityType, customType, contactId,
 * description, files (0–5). The agent, company and time come from the session
 * and the server clock, never from the form.
 */
export async function saveWorkLog(
  formData: FormData
): Promise<{ log: WorkLogEntry } | typeof SETUP_REQUIRED | { error: string }> {
  try {
    const ctx = await requireAgent();
    if ('error' in ctx) return ctx;
    const { supabase, session, agent } = ctx;

    const activityType = String(formData.get('activityType') || '');
    if (!isWorkLogType(activityType)) return { error: 'Choose an activity type.' };
    const customType = activityType === 'other' ? text(formData.get('customType')).slice(0, 80) : '';
    if (activityType === 'other' && !customType) return { error: 'Enter the activity type.' };
    const description = text(formData.get('description'));
    if (!description) return { error: 'Describe what you did.' };

    // The contact must be one of the agent's own, in the current company.
    const contactId = String(formData.get('contactId') || '').trim();
    let contactName: string | null = null;
    if (contactId) {
      let q = supabase.from('contacts').select('id, name').eq('id', contactId).eq('salesperson_id', agent.id);
      if (session.organizationId) q = q.eq('organization_id', session.organizationId);
      const { data: contact } = await q.maybeSingle();
      if (!contact) return { error: 'Choose one of your own leads or customers.' };
      contactName = String(contact.name || '');
    }

    const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length > WORK_LOG_MAX_FILES) return { error: `Attach at most ${WORK_LOG_MAX_FILES} files.` };
    if (files.reduce((sum, f) => sum + f.size, 0) > WORK_LOG_MAX_TOTAL_BYTES) {
      return { error: 'Attachments can be at most 10 MB in total.' };
    }
    const blocked = files.find((f) => !isAllowedAttachment(f));
    if (blocked) return { error: `${blocked.name} is not a supported file. Use images, PDF, Word, Excel, text or CSV.` };

    // Check the table exists before uploading anything.
    const probe = await supabase.from('sales_agent_work_logs').select('id', { head: true, count: 'exact' }).limit(1);
    if (isMissingTable(probe.error)) return SETUP_REQUIRED;

    const id = crypto.randomUUID();
    const uploaded: StoredAttachment[] = [];
    if (files.length) {
      if (!(await ensureWorkLogBucket(supabase))) return { error: 'Attachments could not be stored. Try again.' };
      for (const [i, file] of files.entries()) {
        const path = `${session.organizationId || 'no-company'}/${agent.id}/${id}/${i + 1}-${safeFileName(file.name)}`;
        const type = resolveInquiryAttachmentContentType(file);
        const { error } = await supabase.storage.from(WORK_LOG_BUCKET).upload(path, file, { contentType: type, upsert: false });
        if (error) {
          console.error('[sales-activity] attachment upload failed', error.message);
          if (uploaded.length) await supabase.storage.from(WORK_LOG_BUCKET).remove(uploaded.map((u) => u.path));
          return { error: `${file.name} could not be uploaded. Try again.` };
        }
        uploaded.push({ path, name: file.name.slice(0, 200), type, size: file.size });
      }
    }

    const { data, error } = await supabase
      .from('sales_agent_work_logs')
      .insert({
        id,
        sales_agent_id: agent.id,
        app_user_id: session.appUserId ?? null,
        username: session.username,
        organization_id: session.organizationId ?? null,
        activity_type: activityType,
        custom_type: customType || null,
        contact_id: contactId || null,
        contact_name: contactName,
        description,
        attachments: uploaded,
        logged_at: new Date().toISOString(),
      })
      .select(WORK_LOG_COLUMNS)
      .single();
    if (error || !data) {
      if (uploaded.length) await supabase.storage.from(WORK_LOG_BUCKET).remove(uploaded.map((u) => u.path));
      if (isMissingTable(error)) return SETUP_REQUIRED;
      return { error: actionError(error, 'Your log could not be saved') };
    }
    const [log] = await toWorkLogEntries(supabase, [data as WorkLogRow], new Map([[agent.id, agent.name]]));
    return { log };
  } catch (err) {
    return { error: actionError(err, 'Your log could not be saved') };
  }
}

// ---------------------------------------------------------------------------
// Admin side (Super Admin, selected company)
// ---------------------------------------------------------------------------

type AdminContext = { supabase: Supabase; organizationId: string | null };

async function requireAdmin(): Promise<AdminContext | { error: string }> {
  const session = await getSession();
  if (!session || !isSuperAdminSession(session)) return { error: 'Access Denied' };
  return { supabase: await createAdminClient(), organizationId: session.organizationId ?? null };
}

export type AgentOption = { id: string; name: string };

/** Sales agents of the selected company (members, or owners of its contacts); all agents in the Admin view. */
async function agentsInScope(supabase: Supabase, organizationId: string | null): Promise<AgentOption[]> {
  const { data: agents } = await supabase.from('sales_agents').select('id, name, username, app_user_id').order('name');
  const list = (agents || []).map((a) => ({
    id: String(a.id),
    name: String(a.name || a.username || 'Unnamed'),
    appUserId: a.app_user_id ? String(a.app_user_id) : null,
  }));
  if (!organizationId) return list.map(({ id, name }) => ({ id, name }));
  const [members, owners] = await Promise.all([
    supabase.from('user_organizations').select('user_id').eq('organization_id', organizationId),
    supabase.from('contacts').select('salesperson_id').eq('organization_id', organizationId).not('salesperson_id', 'is', null).limit(20000),
  ]);
  const memberIds = new Set((members.data || []).map((m) => String(m.user_id)));
  const ownerIds = new Set((owners.data || []).map((c) => String(c.salesperson_id)));
  return list.filter((a) => (a.appUserId && memberIds.has(a.appUserId)) || ownerIds.has(a.id)).map(({ id, name }) => ({ id, name }));
}

export type DateFilter = { agentId?: string | null; from: string; to: string };

function resolveRange(filter: DateFilter): { fromYmd: string; toYmd: string; from: string; to: string } | null {
  if (!isValidYmd(filter.from) || !isValidYmd(filter.to) || filter.from > filter.to) return null;
  // At most 93 days per view.
  const fromYmd = filter.from < addDaysYmd(filter.to, -92) ? addDaysYmd(filter.to, -92) : filter.from;
  return { fromYmd, toYmd: filter.to, from: karachiDayStartUtc(fromYmd), to: karachiDayEndExclusiveUtc(filter.to) };
}

export type ActivityDayRow = {
  date: string;
  agentId: string;
  agentName: string;
  /** Null when the day has manual logs but no tracked login. */
  firstLogin: string | null;
  lastActivity: string | null;
  lastEnd: string | null;
  activeSeconds: number;
  inactiveSeconds: number;
  sessions: number;
  openSessions: number;
  autoLogouts: number;
  manualLogouts: number;
  /** Manual work logs saved that day, and how many of them have attachments. */
  workLogs: number;
  workLogsWithFiles: number;
  /** Leads Admin assigned to the agent that day (Lead Distribution). */
  leadsAssigned: number;
};

export async function getActivityLogs(
  filter: DateFilter
): Promise<{ rows: ActivityDayRow[]; agents: AgentOption[] } | typeof SETUP_REQUIRED | { error: string }> {
  try {
    const ctx = await requireAdmin();
    if ('error' in ctx) return ctx;
    const { supabase, organizationId } = ctx;
    const range = resolveRange(filter);
    if (!range) return { error: 'Choose a valid date range.' };

    await closeStaleSessions(supabase);
    const agents = await agentsInScope(supabase, organizationId);
    let query = supabase
      .from('sales_agent_sessions')
      .select('id, sales_agent_id, started_at, last_activity_at, active_seconds, ended_at, end_reason, organization_id')
      .gte('started_at', range.from)
      .lt('started_at', range.to)
      .order('started_at', { ascending: true })
      .limit(10000);
    if (organizationId) query = query.eq('organization_id', organizationId);
    if (filter.agentId) query = query.eq('sales_agent_id', filter.agentId);
    let logQuery = supabase
      .from('sales_agent_work_logs')
      .select('sales_agent_id, logged_at, attachments')
      .gte('logged_at', range.from)
      .lt('logged_at', range.to)
      .limit(20000);
    if (organizationId) logQuery = logQuery.eq('organization_id', organizationId);
    if (filter.agentId) logQuery = logQuery.eq('sales_agent_id', filter.agentId);
    let assignedQuery = supabase
      .from('lead_distribution_leads')
      .select('assigned_sales_agent_id, assigned_at')
      .eq('status', 'assigned')
      .not('assigned_sales_agent_id', 'is', null)
      .gte('assigned_at', range.from)
      .lt('assigned_at', range.to)
      .limit(20000);
    if (organizationId) assignedQuery = assignedQuery.eq('organization_id', organizationId);
    if (filter.agentId) assignedQuery = assignedQuery.eq('assigned_sales_agent_id', filter.agentId);
    const [{ data, error }, logRes, assignedRes] = await Promise.all([query, logQuery, assignedQuery]);
    const assigned = assignedRes.error ? [] : assignedRes.data || [];
    if (isMissingTable(error)) return SETUP_REQUIRED;
    if (error) return { error: actionError(error, 'Unable to load activity') };
    // Work logs need migration 058; without it the sessions still show.
    if (logRes.error && !isMissingTable(logRes.error)) console.error('[sales-activity] work logs not loaded', logRes.error.code);
    const logs = logRes.error ? [] : logRes.data || [];

    const names = new Map(agents.map((a) => [a.id, a.name]));
    const missing = [
      ...new Set(
        [
          ...[...(data || []), ...logs].map((s) => String(s.sales_agent_id)),
          ...assigned.map((a) => String(a.assigned_sales_agent_id)),
        ].filter((id) => !names.has(id))
      ),
    ];
    if (missing.length) {
      const { data: extra } = await supabase.from('sales_agents').select('id, name, username').in('id', missing);
      for (const a of extra || []) names.set(String(a.id), String(a.name || a.username || 'Unnamed'));
    }

    const rows = new Map<string, ActivityDayRow>();
    const rowFor = (date: string, agentId: string): ActivityDayRow => {
      const key = `${date}|${agentId}`;
      const existing = rows.get(key);
      if (existing) return existing;
      const row: ActivityDayRow = {
        date,
        agentId,
        agentName: names.get(agentId) ?? 'Unknown agent',
        firstLogin: null,
        lastActivity: null,
        lastEnd: null,
        activeSeconds: 0,
        inactiveSeconds: 0,
        sessions: 0,
        openSessions: 0,
        autoLogouts: 0,
        manualLogouts: 0,
        workLogs: 0,
        workLogsWithFiles: 0,
        leadsAssigned: 0,
      };
      rows.set(key, row);
      return row;
    };
    for (const s of data || []) {
      const end = s.ended_at ? String(s.ended_at) : null;
      const span = (Date.parse(end ?? String(s.last_activity_at)) - Date.parse(String(s.started_at))) / 1000;
      const active = Number(s.active_seconds || 0);
      const row = rowFor(karachiDate(String(s.started_at)), String(s.sales_agent_id));
      if (!row.firstLogin) row.firstLogin = String(s.started_at); // sessions are in start order
      row.sessions += 1;
      row.activeSeconds += active;
      row.inactiveSeconds += Math.max(0, Math.round(span) - active);
      if (!row.lastActivity || String(s.last_activity_at) > row.lastActivity) row.lastActivity = String(s.last_activity_at);
      if (end && (!row.lastEnd || end > row.lastEnd)) row.lastEnd = end;
      if (!end) row.openSessions += 1;
      if (s.end_reason === 'inactivity') row.autoLogouts += 1;
      if (s.end_reason === 'logout') row.manualLogouts += 1;
    }
    for (const log of logs) {
      const at = String(log.logged_at);
      const row = rowFor(karachiDate(at), String(log.sales_agent_id));
      row.workLogs += 1;
      if (Array.isArray(log.attachments) && log.attachments.length) row.workLogsWithFiles += 1;
      if (!row.lastActivity || at > row.lastActivity) row.lastActivity = at;
    }
    for (const lead of assigned) {
      rowFor(karachiDate(String(lead.assigned_at)), String(lead.assigned_sales_agent_id)).leadsAssigned += 1;
    }
    return {
      rows: [...rows.values()].sort((a, b) => b.date.localeCompare(a.date) || a.agentName.localeCompare(b.agentName)),
      agents,
    };
  } catch (err) {
    return { error: actionError(err, 'Unable to load activity') };
  }
}

export type ActivityEvent = { at: string; type: 'login' | 'inactive' | 'active' | 'logout' | 'expired'; sessionId: string };

export type DaySession = {
  id: string;
  startedAt: string;
  lastActivityAt: string;
  endedAt: string | null;
  endReason: 'logout' | 'inactivity' | null;
  activeSeconds: number;
};

export type DayLead = TrackedLead & {
  /** CRM stage of the lead's latest opportunity. */
  leadStatus: string | null;
};

export type DayTimelineKind =
  | ActivityEvent['type']
  | 'work_log'
  | 'start_day'
  | 'end_day'
  | 'lead_assigned'
  | 'inquiry_sent'
  | 'inquiry_to_admin'
  | 'inquiry_calculated'
  | 'inquiry_approved'
  | 'inquiry_rejected';

export type DayTimelineItem = {
  at: string;
  kind: DayTimelineKind;
  title: string;
  /** Lead / customer, inquiry number or log text. */
  detail: string | null;
  attachments: number;
};

export type AgentDayDetail = {
  date: string;
  agentId: string;
  agentName: string;
  sessions: DaySession[];
  events: ActivityEvent[];
  summary: Pick<
    ActivityDayRow,
    'firstLogin' | 'lastEnd' | 'activeSeconds' | 'inactiveSeconds' | 'sessions' | 'openSessions' | 'autoLogouts' | 'manualLogouts'
  >;
  /** Null until migration 058 is run. */
  workLogs: WorkLogEntry[] | null;
  report: DailyReportRow | null;
  /** Null when no company is selected (leads are distributed per company). */
  leads: DayLead[] | null;
  timeline: DayTimelineItem[];
};

/**
 * Everything one sales agent did on one Pakistan day: sessions and their
 * events, manual work logs (with signed attachment links), Start / End Day,
 * leads assigned that day with their inquiries, and one combined timeline.
 */
export async function getAgentDayDetail(
  agentId: string,
  date: string
): Promise<AgentDayDetail | typeof SETUP_REQUIRED | { error: string }> {
  try {
    const ctx = await requireAdmin();
    if ('error' in ctx) return ctx;
    const { supabase, organizationId } = ctx;
    const id = String(agentId || '');
    if (!id || !isValidYmd(date)) return { error: 'Choose a valid agent and date.' };
    const from = karachiDayStartUtc(date);
    const to = karachiDayEndExclusiveUtc(date);

    await closeStaleSessions(supabase, { agentId: id });

    let sessionQuery = supabase
      .from('sales_agent_sessions')
      .select('id, started_at, last_activity_at, active_seconds, ended_at, end_reason')
      .eq('sales_agent_id', id)
      .gte('started_at', from)
      .lt('started_at', to)
      .order('started_at', { ascending: true });
    let logQuery = supabase
      .from('sales_agent_work_logs')
      .select(WORK_LOG_COLUMNS)
      .eq('sales_agent_id', id)
      .gte('logged_at', from)
      .lt('logged_at', to)
      .order('logged_at', { ascending: true })
      .limit(1000);
    let sentQuery = supabase
      .from('lead_inquiries')
      .select('id, inquiry_reference, sent_at, leads!inner(sales_agent_id)')
      .eq('leads.sales_agent_id', id)
      .eq('sent_to_accounting', true)
      .gte('sent_at', from)
      .lt('sent_at', to)
      .limit(500);
    if (organizationId) {
      sessionQuery = sessionQuery.eq('organization_id', organizationId);
      logQuery = logQuery.eq('organization_id', organizationId);
      sentQuery = sentQuery.eq('organization_id', organizationId);
    }

    const [agentRes, sessionRes, logRes, sentRes, reportRes, trackingRes] = await Promise.all([
      supabase.from('sales_agents').select('name, username').eq('id', id).maybeSingle(),
      sessionQuery,
      logQuery,
      sentQuery,
      getDailyReports({ agentId: id, from: date, to: date }),
      organizationId
        ? getDistributionTracking({ agentId: id, dateFrom: from, dateTo: to, assignedOnly: true })
        : Promise.resolve(null),
    ]);
    if (isMissingTable(sessionRes.error)) return SETUP_REQUIRED;
    if (sessionRes.error) return { error: actionError(sessionRes.error, 'Unable to load the day') };
    const agentName = String(agentRes.data?.name || agentRes.data?.username || 'Unknown agent');

    // Sessions and their events.
    const sessions: DaySession[] = (sessionRes.data || []).map((s) => ({
      id: String(s.id),
      startedAt: String(s.started_at),
      lastActivityAt: String(s.last_activity_at),
      endedAt: s.ended_at ? String(s.ended_at) : null,
      endReason: s.end_reason === 'logout' || s.end_reason === 'inactivity' ? s.end_reason : null,
      activeSeconds: Number(s.active_seconds || 0),
    }));
    let events: ActivityEvent[] = [];
    if (sessions.length) {
      const { data } = await supabase
        .from('sales_agent_session_events')
        .select('session_id, event_type, occurred_at')
        .in('session_id', sessions.map((s) => s.id))
        .order('occurred_at', { ascending: true });
      events = (data || []).map((e) => ({
        at: String(e.occurred_at),
        type: e.event_type as ActivityEvent['type'],
        sessionId: String(e.session_id),
      }));
    }
    const summary: AgentDayDetail['summary'] = {
      firstLogin: sessions[0]?.startedAt ?? null,
      lastEnd: null,
      activeSeconds: 0,
      inactiveSeconds: 0,
      sessions: sessions.length,
      openSessions: 0,
      autoLogouts: 0,
      manualLogouts: 0,
    };
    for (const s of sessions) {
      const span = Math.round((Date.parse(s.endedAt ?? s.lastActivityAt) - Date.parse(s.startedAt)) / 1000);
      summary.activeSeconds += s.activeSeconds;
      summary.inactiveSeconds += Math.max(0, span - s.activeSeconds);
      if (!s.endedAt) summary.openSessions += 1;
      else if (!summary.lastEnd || s.endedAt > summary.lastEnd) summary.lastEnd = s.endedAt;
      if (s.endReason === 'inactivity') summary.autoLogouts += 1;
      if (s.endReason === 'logout') summary.manualLogouts += 1;
    }

    // Manual logs (migration 058).
    const workLogs = logRes.error
      ? null
      : await toWorkLogEntries(supabase, (logRes.data || []) as WorkLogRow[], new Map([[id, agentName]]));
    if (logRes.error && !isMissingTable(logRes.error)) console.error('[sales-activity] work logs not loaded', logRes.error.code);

    const report = 'rows' in reportRes ? reportRes.rows.find((r) => r.date === date && r.agentId === id) ?? null : null;

    // Leads assigned that day, each with its CRM stage.
    let leads: DayLead[] | null = null;
    if (trackingRes && 'leads' in trackingRes) {
      const contactIds = [...new Set(trackingRes.leads.map((l) => l.contactId).filter((c): c is string => Boolean(c)))];
      const stageByContact = new Map<string, string>();
      if (contactIds.length) {
        const { data: opps } = await supabase
          .from('crm_opportunities')
          .select('contact_id, stage_id, updated_at')
          .in('contact_id', contactIds)
          .eq('organization_id', organizationId as string)
          .order('updated_at', { ascending: false });
        const stageIds = [...new Set((opps || []).map((o) => o.stage_id).filter(Boolean).map(String))];
        const { data: stages } = stageIds.length
          ? await supabase.from('crm_pipeline_stages').select('id, name').in('id', stageIds)
          : { data: [] as Array<{ id: string; name: string }> };
        const stageName = new Map((stages || []).map((s) => [String(s.id), String(s.name)]));
        for (const o of opps || []) {
          const contact = String(o.contact_id);
          const name = stageName.get(String(o.stage_id));
          if (name && !stageByContact.has(contact)) stageByContact.set(contact, name);
        }
      }
      leads = trackingRes.leads
        .map((l) => ({ ...l, leadStatus: l.contactId ? stageByContact.get(l.contactId) ?? null : null }))
        .sort((a, b) => String(a.assignedAt).localeCompare(String(b.assignedAt)));
    } else if (trackingRes && 'error' in trackingRes) {
      console.error('[sales-activity] assigned leads not loaded');
    }

    // One timeline, in real time order.
    const inDay = (iso: string | null | undefined): iso is string => Boolean(iso) && (iso as string) >= from && (iso as string) < to;
    const timeline: DayTimelineItem[] = [];
    const add = (at: string, kind: DayTimelineKind, title: string, detail: string | null = null, attachments = 0) =>
      timeline.push({ at, kind, title, detail, attachments });
    for (const e of events) {
      add(
        e.at,
        e.type,
        {
          login: 'Logged in',
          inactive: 'Became inactive',
          active: 'Active again',
          logout: 'Logged out',
          expired: 'Logged out automatically after 25 minutes without activity',
        }[e.type]
      );
    }
    for (const log of workLogs ?? []) {
      add(log.loggedAt, 'work_log', log.typeLabel, [log.contactName, log.description].filter(Boolean).join(' · '), log.attachments.length);
    }
    if (report?.checkIn) add(report.checkIn.submittedAt, 'start_day', 'Started the working day');
    if (report?.endOfDay) add(report.endOfDay.submittedAt, 'end_day', 'Submitted the end-of-day report');
    const seen = new Set<string>();
    for (const lead of leads ?? []) {
      if (inDay(lead.assignedAt)) add(lead.assignedAt, 'lead_assigned', 'Lead assigned', lead.name);
      for (const q of lead.inquiries) {
        const label = `Inquiry ${q.reference ?? ''} · ${lead.name}`.replace('  ', ' ');
        const steps: Array<[string | null, DayTimelineKind, string]> = [
          [q.sentToOperationsAt, 'inquiry_sent', 'Inquiry sent to Operations'],
          [q.sentToAdminAt, 'inquiry_to_admin', 'Operations sent the calculation to Admin'],
          [q.calculatedByAdminAt, 'inquiry_calculated', 'Inquiry calculated by Admin'],
          [q.approvedAt, 'inquiry_approved', 'Inquiry approved by Admin'],
          [q.rejectedAt, 'inquiry_rejected', 'Inquiry rejected by Admin'],
        ];
        for (const [at, kind, title] of steps) {
          if (!inDay(at)) continue;
          seen.add(`${q.id}|${kind}`);
          add(at, kind, title, label);
        }
      }
    }
    // Inquiries the agent sent that day from other leads or customers.
    for (const q of sentRes.data || []) {
      if (!q.sent_at || seen.has(`${q.id}|inquiry_sent`)) continue;
      add(String(q.sent_at), 'inquiry_sent', 'Inquiry sent to Operations', q.inquiry_reference ? `Inquiry ${q.inquiry_reference}` : null);
    }
    timeline.sort((a, b) => a.at.localeCompare(b.at));

    return { date, agentId: id, agentName, sessions, events, summary, workLogs, report, leads, timeline };
  } catch (err) {
    return { error: actionError(err, 'Unable to load the day') };
  }
}

export type DailyReportRow = {
  date: string;
  agentId: string;
  agentName: string;
  checkIn: {
    submittedAt: string;
    internetOk: boolean;
    previousTasks: 'yes' | 'no' | 'partial';
    issue: string | null;
  } | null;
  endOfDay: {
    submittedAt: string;
    completedWork: string;
    pendingTasks: string;
    problems: string;
    support: string;
    nextDayPlan: string;
    isLate: boolean;
    stats: Partial<DayStats>;
  } | null;
};

/** One row per agent and day in the range, including days with nothing submitted. */
export async function getDailyReports(
  filter: DateFilter
): Promise<{ rows: DailyReportRow[]; agents: AgentOption[] } | typeof SETUP_REQUIRED | { error: string }> {
  try {
    const ctx = await requireAdmin();
    if ('error' in ctx) return ctx;
    const { supabase, organizationId } = ctx;
    const range = resolveRange(filter);
    if (!range) return { error: 'Choose a valid date range.' };
    const agents = await agentsInScope(supabase, organizationId);
    const scoped = filter.agentId ? agents.filter((a) => a.id === filter.agentId) : agents;
    const agentIds = scoped.map((a) => a.id);
    if (!agentIds.length) return { rows: [], agents };

    let checkInQuery = supabase
      .from('sales_agent_day_checkins')
      .select('sales_agent_id, work_date, submitted_at, internet_ok, previous_tasks, has_issue, issue_text, organization_id')
      .in('sales_agent_id', agentIds)
      .gte('work_date', range.fromYmd)
      .lte('work_date', range.toYmd);
    let reportQuery = supabase
      .from('daily_work_reports')
      .select('sales_agent_id, report_date, submitted_at, work_summary, pending_tasks, issues_summary, support_request, tomorrow_plan, is_late, system_counts, organization_id')
      .eq('department', 'sales')
      .eq('status', 'submitted')
      .in('sales_agent_id', agentIds)
      .gte('report_date', range.fromYmd)
      .lte('report_date', range.toYmd);
    if (organizationId) {
      checkInQuery = checkInQuery.eq('organization_id', organizationId);
      reportQuery = reportQuery.eq('organization_id', organizationId);
    }
    const [checkIns, reports] = await Promise.all([checkInQuery, reportQuery]);
    if (isMissingTable(checkIns.error) || isMissingTable(reports.error)) return SETUP_REQUIRED;
    if (checkIns.error) return { error: actionError(checkIns.error, 'Unable to load reports') };
    if (reports.error) return { error: actionError(reports.error, 'Unable to load reports') };

    const checkInBy = new Map((checkIns.data || []).map((c) => [`${c.work_date}|${c.sales_agent_id}`, c]));
    const reportBy = new Map((reports.data || []).map((r) => [`${r.report_date}|${r.sales_agent_id}`, r]));
    const today = karachiTodayYmd();
    const rows: DailyReportRow[] = [];
    for (let day = range.toYmd > today ? today : range.toYmd; day >= range.fromYmd; day = addDaysYmd(day, -1)) {
      for (const agent of scoped) {
        const c = checkInBy.get(`${day}|${agent.id}`);
        const r = reportBy.get(`${day}|${agent.id}`);
        rows.push({
          date: day,
          agentId: agent.id,
          agentName: agent.name,
          checkIn: c
            ? {
                submittedAt: String(c.submitted_at),
                internetOk: Boolean(c.internet_ok),
                previousTasks: c.previous_tasks as 'yes' | 'no' | 'partial',
                issue: c.has_issue ? String(c.issue_text || '') : null,
              }
            : null,
          endOfDay: r
            ? {
                submittedAt: String(r.submitted_at),
                completedWork: String(r.work_summary || ''),
                pendingTasks: String(r.pending_tasks || ''),
                problems: String(r.issues_summary || ''),
                support: String(r.support_request || ''),
                nextDayPlan: String(r.tomorrow_plan || ''),
                isLate: Boolean(r.is_late),
                stats: (r.system_counts || {}) as Partial<DayStats>,
              }
            : null,
        });
      }
    }
    return { rows, agents };
  } catch (err) {
    return { error: actionError(err, 'Unable to load reports') };
  }
}
