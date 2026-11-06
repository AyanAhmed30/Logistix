'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { resolveAnalyticsAccess } from '@/lib/analytics/access';
import { getSalesInquiryDetail, type SalesInquiryDetail } from '@/app/actions/crm/all-inquiries';

export type InquiryTimelineEntry = {
  at: string;
  label: string;
  actor: string | null;
  remark: string | null;
  tone: 'neutral' | 'success' | 'danger' | 'warning';
};

const DENIED = { error: 'Access Denied' } as const;

const EVENT_LABELS: Record<string, { label: string; tone: InquiryTimelineEntry['tone'] }> = {
  submitted: { label: 'Submitted to Operations', tone: 'neutral' },
  resubmitted: { label: 'Resubmitted to Operations', tone: 'neutral' },
  operations_opened: { label: 'Operations opened the inquiry', tone: 'neutral' },
  operations_submitted: { label: 'Operations submitted to Admin', tone: 'neutral' },
  admin_review_opened: { label: 'Admin opened it for review', tone: 'neutral' },
  admin_calculated: { label: 'Admin completed the calculation', tone: 'neutral' },
  approved: { label: 'Approved by Admin', tone: 'success' },
  rejected: { label: 'Rejected by Admin', tone: 'danger' },
  flagged: { label: 'Flag raised', tone: 'warning' },
};

const LOG_LABELS: Record<string, string> = {
  log_note: 'Note added',
  activity: 'Activity scheduled',
  calculator_updated: 'Calculation updated',
};

/**
 * Complete inquiry for the Analytics module. The record comes from the same action
 * the CRM detail page uses, so its access rules still apply on top of this check.
 */
export async function getAnalyticsInquiryDetail(inquiryId: string) {
  const session = await getSession();
  const access = resolveAnalyticsAccess(session);
  if (access.kind === 'denied') return DENIED;
  if (access.kind === 'self' && !access.departments.includes('sales')) return DENIED;

  const supabase = await createAdminClient();
  const { data: scope } = await supabase
    .from('lead_inquiries')
    .select('organization_id')
    .eq('id', inquiryId)
    .maybeSingle();
  if (!scope) return { error: 'Inquiry not found' };
  if (access.organizationId && scope.organization_id !== access.organizationId) return DENIED;

  const result = await getSalesInquiryDetail(inquiryId);
  if ('error' in result) return { error: result.error };
  const inquiry: SalesInquiryDetail = result.inquiry;

  const [events, logs, confirmations] = await Promise.all([
    supabase
      .from('inquiry_workflow_events')
      .select('event_type, occurred_at, actor, actor_role, confirmation_id')
      .eq('inquiry_id', inquiryId),
    supabase
      .from('inquiry_logs')
      .select('action, performed_at, performed_by, new_values')
      .eq('inquiry_id', inquiryId)
      .in('action', Object.keys(LOG_LABELS)),
    supabase.from('inquiry_confirmations').select('id, rejection_reason, created_at').eq('inquiry_id', inquiryId),
  ]);

  const reasonById = new Map(
    (confirmations.data || []).map((c) => [String(c.id), (c.rejection_reason as string | null) ?? null])
  );
  const flagByTime = new Map((inquiry.flags || []).map((f) => [Date.parse(f.created_at), f.message]));

  const timeline: InquiryTimelineEntry[] = [
    ...(events.data || []).map((e) => {
      const known = EVENT_LABELS[String(e.event_type)] ?? { label: String(e.event_type), tone: 'neutral' as const };
      const customer = e.actor_role === 'customer';
      return {
        at: String(e.occurred_at),
        label: customer && e.event_type === 'submitted' ? 'Customer submitted to Operations' : known.label,
        actor: e.actor ? String(e.actor) : null,
        remark:
          e.event_type === 'rejected' && e.confirmation_id
            ? reasonById.get(String(e.confirmation_id)) ?? null
            : e.event_type === 'flagged'
              ? flagByTime.get(Date.parse(String(e.occurred_at))) ?? null
              : null,
        tone: known.tone,
      };
    }),
    ...(logs.data || []).map((log) => {
      const values = (log.new_values || {}) as Record<string, unknown>;
      return {
        at: String(log.performed_at),
        label: LOG_LABELS[String(log.action)],
        actor: log.performed_by ? String(log.performed_by) : null,
        remark: typeof values.note === 'string' ? values.note : typeof values.summary === 'string' ? values.summary : null,
        tone: 'neutral' as const,
      };
    }),
  ].sort((a, b) => (a.at < b.at ? -1 : 1));

  const latestSubmission = Math.max(
    0,
    ...(confirmations.data || []).map((c) => (c.created_at ? Date.parse(String(c.created_at)) : 0))
  );

  return { inquiry, timeline, latestSubmission };
}

/**
 * Records the first time Operations or Admin opens an inquiry. Audit only: failure
 * is ignored so it can never interrupt the panel that called it.
 */
export async function recordInquiryOpened(inquiryId: string, stage: 'operations' | 'admin') {
  try {
    const session = await getSession();
    if (!session || !inquiryId) return;

    const eventType = stage === 'admin' ? 'admin_review_opened' : 'operations_opened';
    const supabase = await createAdminClient();

    const { count } = await supabase
      .from('inquiry_workflow_events')
      .select('id', { count: 'exact', head: true })
      .eq('inquiry_id', inquiryId)
      .eq('event_type', eventType);
    if (count) return;

    const { data: inquiry } = await supabase
      .from('lead_inquiries')
      .select('organization_id, leads(sales_agent_id)')
      .eq('id', inquiryId)
      .maybeSingle();
    if (!inquiry) return;

    const lead = inquiry.leads as unknown as { sales_agent_id?: string | null } | null;
    await supabase.from('inquiry_workflow_events').insert({
      inquiry_id: inquiryId,
      organization_id: inquiry.organization_id,
      event_type: eventType,
      occurred_at: new Date().toISOString(),
      actor: session.username || null,
      actor_role: stage,
      sales_agent_id: lead?.sales_agent_id ?? null,
    });
  } catch {
    // Audit tracking must never affect the workflow.
  }
}
