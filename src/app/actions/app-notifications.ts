'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession, type SessionPayload } from '@/lib/auth/session';
import {
  isOperationsPortalActor,
  isSalesPortalActor,
  sessionHasCrmAccess,
  sessionHasSalesAccess,
} from '@/lib/auth/require-access';
import { isSuperAdminSession } from '@/lib/auth/super-admin';
import { canAccessAdminDashboard } from '@/lib/auth/portal-access';
import { hasDepartmentAccess, hasModulePermission } from '@/lib/module-permissions';
import {
  catalogMessageForEvent,
  catalogTitleForEvent,
  lifecycleEventsForRecipientRoles,
  operationsCatalogMessage,
  operationsCatalogTitle,
  resolveNotificationHref,
  type AppInboxItem,
  type AppNotificationPayload,
  type AppNotificationSource,
  type NotificationViewerContext,
} from '@/lib/app-notifications';

type LifecycleRow = {
  id: string;
  lead_id: string;
  inquiry_id: string | null;
  confirmation_id: string | null;
  sender_role: string;
  sender_username: string;
  recipient_role: string;
  recipient_username: string;
  event_type: string;
  title?: string | null;
  message?: string | null;
  href?: string | null;
  payload?: AppNotificationPayload | null;
  is_read: boolean;
  created_at: string;
  leads?: {
    lead_id_formatted: string | null;
    name?: string | null;
  } | null;
};

type ChatRow = {
  id: string;
  chat_message_id?: string;
  lead_id: string;
  inquiry_id: string | null;
  sender_role: string;
  sender_username: string;
  recipient_role: string;
  recipient_username: string;
  is_read: boolean;
  created_at: string;
  leads?: {
    lead_id_formatted: string | null;
    name?: string | null;
  } | null;
};

function viewerContextFromSession(session: SessionPayload): NotificationViewerContext {
  const isSuperAdmin = isSuperAdminSession(session);
  return {
    username: session.username,
    sessionRole: session.role,
    isSuperAdmin,
    canAccessAdminDashboard: canAccessAdminDashboard(session),
    hasCrm: sessionHasCrmAccess(session) && session.role !== 'sales_agent',
    hasSalesQuotations: sessionHasSalesAccess(session) && session.role !== 'sales_agent',
    isSalesActor: isSalesPortalActor(session),
    isOperationsActor: isOperationsPortalActor(session),
  };
}

function recipientRolesForSession(session: SessionPayload): Array<'sales_agent' | 'operations' | 'admin'> {
  const roles = new Set<'sales_agent' | 'operations' | 'admin'>();
  const isSales = isSalesPortalActor(session) || session.role === 'sales_agent';
  const isCrmUser =
    session.role === 'user' && hasDepartmentAccess(session.permissions, 'crm');
  const isOps = isOperationsPortalActor(session) || session.role === 'operations';
  const isSuperAdmin = isSuperAdminSession(session);
  const hasLeadsInquiry = hasModulePermission(session.permissions, 'leads-inquiry');
  const hasRateApproval = hasModulePermission(session.permissions, 'inquiry-confirmation');

  if (isSales || isCrmUser) roles.add('sales_agent');
  if (isOps) roles.add('operations');

  // Rate-approval notifications are Admin work, not Sales and not general Operations.
  if (isSuperAdmin) {
    roles.add('admin');
  } else if (hasRateApproval && !isSales && !isCrmUser && !hasLeadsInquiry) {
    roles.add('admin');
  }

  return [...roles];
}

function filterLifecycleRows(
  rows: LifecycleRow[],
  allowedEvents: string[]
): LifecycleRow[] {
  if (allowedEvents.length === 0) return rows;
  const allowed = new Set(allowedEvents);
  return rows.filter((row) => allowed.has(row.event_type));
}

function asPayload(raw: unknown): AppNotificationPayload {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as AppNotificationPayload;
  }
  return {};
}

function asLead(raw: unknown): { lead_id_formatted: string | null; name?: string | null } | null {
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first && typeof first === 'object') {
      return first as { lead_id_formatted: string | null; name?: string | null };
    }
    return null;
  }
  if (raw && typeof raw === 'object') {
    return raw as { lead_id_formatted: string | null; name?: string | null };
  }
  return null;
}

function mapLifecycleRow(row: LifecycleRow, ctx: NotificationViewerContext): AppInboxItem {
  const payload = asPayload(row.payload);
  const inquiryId = row.inquiry_id || (typeof payload.inquiryId === 'string' ? payload.inquiryId : null);
  const confirmationId =
    row.confirmation_id ||
    (typeof payload.confirmationId === 'string' ? payload.confirmationId : null);
  const eventType = row.event_type || 'inquiry_sent';
  const opsView = ctx.isOperationsActor && !ctx.isSalesActor;
  const title = opsView
    ? operationsCatalogTitle(eventType)
    : (row.title || '').trim() || catalogTitleForEvent(eventType);
  const message = opsView
    ? operationsCatalogMessage(eventType, row.message)
    : (row.message || '').trim() || catalogMessageForEvent(eventType);

  return {
    id: row.id,
    source: 'lifecycle',
    eventType,
    title,
    message,
    href: resolveNotificationHref({
      eventType,
      source: 'lifecycle',
      leadId: row.lead_id,
      inquiryId,
      confirmationId,
      storedHref: row.href,
      ctx,
    }),
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
    leadId: row.lead_id,
    inquiryId,
    confirmationId,
    senderRole: row.sender_role,
    senderUsername: row.sender_username,
    payload,
    leadNumber:
      row.leads?.lead_id_formatted ||
      (typeof payload.inquiryNumber === 'string' ? payload.inquiryNumber : null),
    customerName:
      row.leads?.name ||
      (typeof payload.customerName === 'string' ? payload.customerName : null),
  };
}

function mapChatRow(row: ChatRow, ctx: NotificationViewerContext): AppInboxItem {
  const leadNumber = row.leads?.lead_id_formatted || null;
  return {
    id: row.id,
    source: 'chat',
    eventType: 'chat',
    title: catalogTitleForEvent('chat'),
    message: `${row.sender_username} sent you a message regarding Lead #${leadNumber || 'N/A'}.`,
    href: resolveNotificationHref({
      eventType: 'chat',
      source: 'chat',
      leadId: row.lead_id,
      inquiryId: row.inquiry_id,
      confirmationId: null,
      ctx,
    }),
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
    leadId: row.lead_id,
    inquiryId: row.inquiry_id,
    confirmationId: null,
    senderRole: row.sender_role,
    senderUsername: row.sender_username,
    payload: {
      leadId: row.lead_id,
      inquiryId: row.inquiry_id,
      inquiryNumber: leadNumber || '',
      customerName: row.leads?.name || '',
    },
    leadNumber,
    customerName: row.leads?.name || null,
  };
}

export async function getMyAppNotifications(limit = 40): Promise<
  | { notifications: AppInboxItem[]; unreadCount: number }
  | { error: string }
> {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };

    const roles = recipientRolesForSession(session);
    if (roles.length === 0) {
      return { notifications: [], unreadCount: 0 };
    }

    const lifecycleEvents = lifecycleEventsForRecipientRoles(roles);
    const ctx = viewerContextFromSession(session);
    const supabase = await createAdminClient();
    const cappedLimit = Math.min(Math.max(limit, 1), 80);

    const lifecycleQuery = supabase
      .from('inquiry_lifecycle_notifications')
      .select(`
          id,
          lead_id,
          inquiry_id,
          confirmation_id,
          sender_role,
          sender_username,
          recipient_role,
          recipient_username,
          event_type,
          title,
          message,
          href,
          payload,
          is_read,
          created_at,
          leads (
            lead_id_formatted,
            name
          )
        `)
      .eq('recipient_username', session.username)
      .in('recipient_role', roles)
      .order('created_at', { ascending: false })
      .limit(cappedLimit);
    if (lifecycleEvents.length > 0) {
      lifecycleQuery.in('event_type', lifecycleEvents);
    }

    const lifecycleUnreadQuery = supabase
      .from('inquiry_lifecycle_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_username', session.username)
      .in('recipient_role', roles)
      .eq('is_read', false);
    if (lifecycleEvents.length > 0) {
      lifecycleUnreadQuery.in('event_type', lifecycleEvents);
    }

    const [chatResult, lifecycleResult, chatUnread, lifecycleUnread] = await Promise.all([
      supabase
        .from('lead_chat_notifications')
        .select(`
          id,
          chat_message_id,
          lead_id,
          inquiry_id,
          sender_role,
          sender_username,
          recipient_role,
          recipient_username,
          is_read,
          created_at,
          leads (
            lead_id_formatted,
            name
          )
        `)
        .eq('recipient_username', session.username)
        .in('recipient_role', roles)
        .order('created_at', { ascending: false })
        .limit(cappedLimit),
      lifecycleQuery,
      supabase
        .from('lead_chat_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_username', session.username)
        .in('recipient_role', roles)
        .eq('is_read', false),
      lifecycleUnreadQuery,
    ]);

    if (chatResult.error) return { error: chatResult.error.message };
    if (lifecycleResult.error) {
      // Older DBs may not have title/href/payload yet — retry a slimmer select.
      const fallbackQuery = supabase
        .from('inquiry_lifecycle_notifications')
        .select(`
          id,
          lead_id,
          inquiry_id,
          confirmation_id,
          sender_role,
          sender_username,
          recipient_role,
          recipient_username,
          event_type,
          message,
          is_read,
          created_at,
          leads (
            lead_id_formatted,
            name
          )
        `)
        .eq('recipient_username', session.username)
        .in('recipient_role', roles)
        .order('created_at', { ascending: false })
        .limit(cappedLimit);
      if (lifecycleEvents.length > 0) {
        fallbackQuery.in('event_type', lifecycleEvents);
      }
      const fallback = await fallbackQuery;

      if (fallback.error) return { error: fallback.error.message };

      const chatItems = ((chatResult.data || []) as unknown as ChatRow[]).map((row) =>
        mapChatRow({ ...row, leads: asLead(row.leads) }, ctx)
      );
      const lifecycleItems = filterLifecycleRows(
        (fallback.data || []) as unknown as LifecycleRow[],
        lifecycleEvents
      ).map((row) => mapLifecycleRow({ ...row, leads: asLead(row.leads) }, ctx));
      const notifications = [...chatItems, ...lifecycleItems]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, cappedLimit);

      return {
        notifications,
        unreadCount: (chatUnread.count || 0) + (lifecycleUnread.count || 0),
      };
    }

    const chatItems = ((chatResult.data || []) as unknown as ChatRow[]).map((row) =>
      mapChatRow({ ...row, leads: asLead(row.leads) }, ctx)
    );
    const lifecycleItems = filterLifecycleRows(
      (lifecycleResult.data || []) as unknown as LifecycleRow[],
      lifecycleEvents
    ).map((row) => mapLifecycleRow({ ...row, leads: asLead(row.leads) }, ctx));
    const notifications = [...chatItems, ...lifecycleItems]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, cappedLimit);

    return {
      notifications,
      unreadCount: (chatUnread.count || 0) + (lifecycleUnread.count || 0),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function markAppNotificationRead(
  notificationId: string,
  source?: AppNotificationSource
): Promise<{ success: true } | { error: string }> {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };
    if (!notificationId) return { error: 'Notification id is required' };

    const roles = recipientRolesForSession(session);
    if (roles.length === 0) return { success: true };

    const supabase = await createAdminClient();

    const updateChat = source !== 'lifecycle';
    const updateLifecycle = source !== 'chat';

    if (updateChat) {
      await supabase
        .from('lead_chat_notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('recipient_username', session.username)
        .in('recipient_role', roles);
    }

    if (updateLifecycle) {
      await supabase
        .from('inquiry_lifecycle_notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('recipient_username', session.username)
        .in('recipient_role', roles);
    }

    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function markAllAppNotificationsRead(): Promise<
  { success: true } | { error: string }
> {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };

    const roles = recipientRolesForSession(session);
    if (roles.length === 0) return { success: true };

    const lifecycleEvents = lifecycleEventsForRecipientRoles(roles);
    const supabase = await createAdminClient();

    const lifecycleMarkAll = supabase
      .from('inquiry_lifecycle_notifications')
      .update({ is_read: true })
      .eq('recipient_username', session.username)
      .in('recipient_role', roles)
      .eq('is_read', false);
    if (lifecycleEvents.length > 0) {
      lifecycleMarkAll.in('event_type', lifecycleEvents);
    }

    await Promise.all([
      supabase
        .from('lead_chat_notifications')
        .update({ is_read: true })
        .eq('recipient_username', session.username)
        .in('recipient_role', roles)
        .eq('is_read', false),
      lifecycleMarkAll,
    ]);

    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}
