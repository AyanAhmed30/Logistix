import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPER_ADMIN_USERNAME } from '@/lib/auth/super-admin';
import {
  hasModulePermission,
  parsePermissionKeys,
} from '@/lib/module-permissions';
import {
  adminConfirmationHref,
  adminOperationsInquiryHref,
  catalogMessageForEvent,
  catalogTitleForEvent,
  quotationFromInquiryHref,
  salesAgentInquiryHref,
  type AppNotificationPayload,
  type LifecycleEventType,
  type NotificationActorRole,
} from '@/lib/app-notifications';

export type LifecycleRecipient = {
  role: 'sales_agent' | 'operations' | 'admin';
  username: string;
  href?: string | null;
};

export type InsertLifecycleNotificationInput = {
  eventType: LifecycleEventType | string;
  leadId: string;
  inquiryId?: string | null;
  confirmationId?: string | null;
  senderRole: NotificationActorRole;
  senderUsername: string;
  recipients: LifecycleRecipient[];
  title?: string | null;
  message?: string | null;
  payload?: AppNotificationPayload;
  href?: string | null;
  /** Skip insert when the same event already exists for that recipient + inquiry. */
  dedupe?: boolean;
};

function uniqueRecipients(recipients: LifecycleRecipient[]): LifecycleRecipient[] {
  const seen = new Set<string>();
  const out: LifecycleRecipient[] = [];
  for (const recipient of recipients) {
    const username = String(recipient.username || '').trim();
    if (!username) continue;
    const key = `${recipient.role}:${username.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...recipient, username });
  }
  return out;
}

export async function insertLifecycleNotifications(
  supabase: SupabaseClient,
  input: InsertLifecycleNotificationInput
): Promise<void> {
  const recipients = uniqueRecipients(input.recipients);
  if (recipients.length === 0 || !input.leadId) return;

  let filtered = recipients;
  if (input.dedupe && input.inquiryId) {
    const { data: existing } = await supabase
      .from('inquiry_lifecycle_notifications')
      .select('recipient_role, recipient_username')
      .eq('inquiry_id', input.inquiryId)
      .eq('event_type', input.eventType);

    const already = new Set(
      (existing || []).map(
        (row) =>
          `${String(row.recipient_role)}:${String(row.recipient_username || '').toLowerCase()}`
      )
    );
    filtered = recipients.filter(
      (r) => !already.has(`${r.role}:${r.username.toLowerCase()}`)
    );
    if (filtered.length === 0) return;
  }

  const title = input.title || catalogTitleForEvent(input.eventType);
  const message = input.message || catalogMessageForEvent(input.eventType);
  const payload = input.payload || {};

  const rows = filtered.map((recipient) => ({
    lead_id: input.leadId,
    inquiry_id: input.inquiryId || null,
    confirmation_id: input.confirmationId || null,
    sender_role: input.senderRole,
    sender_username: input.senderUsername,
    recipient_role: recipient.role,
    recipient_username: recipient.username,
    event_type: input.eventType,
    title,
    message,
    href: recipient.href || input.href || null,
    payload,
  }));

  const { error } = await supabase.from('inquiry_lifecycle_notifications').insert(rows);
  if (!error) return;

  const msg = error.message || '';
  const missingColumn = /title|href|payload|could not find the/i.test(msg);
  const badCheck = /sender_role|event_type|check constraint/i.test(msg);

  if (missingColumn || badCheck) {
    const fallbackRows = rows.map((row) => {
      const next: Record<string, unknown> = {
        lead_id: row.lead_id,
        inquiry_id: row.inquiry_id,
        confirmation_id: row.confirmation_id,
        sender_role: row.sender_role === 'system' ? 'sales_agent' : row.sender_role,
        sender_username: row.sender_username,
        recipient_role: row.recipient_role,
        recipient_username: row.recipient_username,
        event_type:
          row.event_type === 'inquiry_received' ? 'inquiry_sent' : row.event_type,
        message: row.message,
      };
      if (!missingColumn) {
        next.title = row.title;
        next.href = row.href;
        next.payload = row.payload;
      }
      return next;
    });
    const retry = await supabase.from('inquiry_lifecycle_notifications').insert(fallbackRows);
    if (retry.error) {
      console.error('[insertLifecycleNotifications]', retry.error.message);
    }
    return;
  }

  console.error('[insertLifecycleNotifications]', error.message);
}

export async function resolveLeadSalesAgentRecipient(
  supabase: SupabaseClient,
  leadId: string
): Promise<{
  recipient: LifecycleRecipient | null;
  leadNumber: string;
  customerName: string;
  source: string;
  salesAgentName: string;
}> {
  const empty = {
    recipient: null,
    leadNumber: '',
    customerName: '',
    source: '',
    salesAgentName: '',
  };
  const { data: lead } = await supabase
    .from('leads')
    .select('lead_id_formatted, name, source, sales_agent_id')
    .eq('id', leadId)
    .maybeSingle();

  if (!lead) return empty;

  const leadNumber = String(lead.lead_id_formatted || '');
  const customerName = String(lead.name || '');
  const source = String(lead.source || '');
  if (!lead.sales_agent_id) {
    return { recipient: null, leadNumber, customerName, source, salesAgentName: '' };
  }

  const { data: agent } = await supabase
    .from('sales_agents')
    .select('username, name')
    .eq('id', lead.sales_agent_id)
    .maybeSingle();

  const username = String(agent?.username || '').trim();
  return {
    recipient: username ? { role: 'sales_agent', username } : null,
    leadNumber,
    customerName,
    source,
    salesAgentName: String(agent?.name || username),
  };
}

export async function resolveInquiryAdminRecipients(
  supabase: SupabaseClient,
  confirmationId?: string | null
): Promise<LifecycleRecipient[]> {
  const href = confirmationId ? adminConfirmationHref(confirmationId) : '/admin/dashboard?tab=inquiry-confirmation';
  const recipients: LifecycleRecipient[] = [
    { role: 'admin', username: SUPER_ADMIN_USERNAME, href },
  ];

  const { data: users } = await supabase
    .from('app_users')
    .select('username, permissions');

  for (const user of users || []) {
    const username = String(user.username || '').trim();
    if (!username) continue;
    const permissions = parsePermissionKeys(user.permissions);
    if (hasModulePermission(permissions, 'inquiry-confirmation')) {
      recipients.push({ role: 'admin', username, href });
    }
  }

  return uniqueRecipients(recipients);
}

export async function resolveOperationsRecipients(
  supabase: SupabaseClient,
  leadId: string,
  inquiryId?: string | null
): Promise<LifecycleRecipient[]> {
  const recipients: LifecycleRecipient[] = [];
  const opsHref = adminOperationsInquiryHref(leadId, inquiryId);

  const { data: opsUsers } = await supabase.from('operations_users').select('username');
  for (const user of opsUsers || []) {
    const username = String(user.username || '').trim();
    if (username) {
      recipients.push({ role: 'operations', username, href: opsHref });
    }
  }

  const { data: appUsers } = await supabase.from('app_users').select('username, permissions');
  for (const user of appUsers || []) {
    const username = String(user.username || '').trim();
    if (!username) continue;
    const permissions = parsePermissionKeys(user.permissions);
    if (hasModulePermission(permissions, 'leads-inquiry')) {
      recipients.push({ role: 'operations', username, href: opsHref });
    }
  }

  return uniqueRecipients(recipients);
}

export function defaultHrefForRecipient(input: {
  eventType: string;
  role: LifecycleRecipient['role'];
  leadId: string;
  inquiryId?: string | null;
  confirmationId?: string | null;
}): string {
  const { eventType, role, leadId, inquiryId, confirmationId } = input;
  if (eventType === 'sent_for_admin_approval' && confirmationId) {
    return adminConfirmationHref(confirmationId);
  }
  if (eventType === 'approved' && inquiryId) {
    if (role === 'sales_agent') return quotationFromInquiryHref(inquiryId);
    return salesAgentInquiryHref(leadId, inquiryId);
  }
  if (eventType === 'inquiry_received' && inquiryId) {
    return salesAgentInquiryHref(leadId, inquiryId);
  }
  if ((eventType === 'inquiry_sent' || eventType === 'rejected') && role === 'operations') {
    return adminOperationsInquiryHref(leadId, inquiryId);
  }
  return salesAgentInquiryHref(leadId, inquiryId);
}
