/** Events a Sales user should see. */
export const SALES_NOTIFICATION_EVENTS = [
  'inquiry_received',
  'approved',
  'lead_transferred',
  'quotation_sent_to_customer',
  'quotation_counter_offer',
] as const;

/** Events an Operations user should see. */
export const OPERATIONS_NOTIFICATION_EVENTS = [
  'inquiry_sent',
  'approved',
  'rejected',
] as const;

/** Events an Admin / rate-approval user should see. */
export const ADMIN_NOTIFICATION_EVENTS = [
  'sent_for_admin_approval',
] as const;

export const LIFECYCLE_EVENT_TYPES = [
  'inquiry_received',
  'inquiry_sent',
  'sent_for_admin_approval',
  'approved',
  'rejected',
  'lead_transferred',
  'quotation_sent_to_customer',
  'quotation_counter_offer',
] as const;

export type LifecycleEventType = (typeof LIFECYCLE_EVENT_TYPES)[number];

export type NotificationActorRole = 'sales_agent' | 'operations' | 'admin' | 'system';

export type AppNotificationSource = 'lifecycle' | 'chat';

export type AppNotificationPayload = {
  leadId?: string;
  inquiryId?: string | null;
  confirmationId?: string | null;
  inquiryNumber?: string;
  customerName?: string;
  salesAgent?: string;
  source?: string;
  summary?: string;
  origin?: string;
  rate?: string | number | null;
  totalAmount?: string | number | null;
  [key: string]: unknown;
};

export type AppInboxItem = {
  id: string;
  source: AppNotificationSource;
  eventType: LifecycleEventType | 'chat' | string;
  title: string;
  message: string;
  href: string;
  isRead: boolean;
  createdAt: string;
  leadId: string;
  inquiryId: string | null;
  confirmationId: string | null;
  senderRole: NotificationActorRole | string;
  senderUsername: string;
  payload: AppNotificationPayload;
  leadNumber: string | null;
  customerName: string | null;
};

export type NotificationViewerContext = {
  username: string;
  sessionRole: string | null;
  isSuperAdmin: boolean;
  canAccessAdminDashboard: boolean;
  hasCrm: boolean;
  hasSalesQuotations: boolean;
  isSalesActor: boolean;
  isOperationsActor: boolean;
};

type EventCatalogEntry = {
  title: string;
  fallbackMessage: string;
};

export const NOTIFICATION_EVENT_CATALOG: Record<string, EventCatalogEntry> = {
  inquiry_received: {
    title: 'New Inquiry Received',
    fallbackMessage: 'A new inquiry has been received from the mobile application.',
  },
  inquiry_sent: {
    title: 'New Inquiry Received from Sales',
    fallbackMessage: 'A sales person sent a new inquiry for operations review.',
  },
  sent_for_admin_approval: {
    title: 'New Inquiry Awaiting Rate Approval',
    fallbackMessage: 'Operations submitted this inquiry for rate approval.',
  },
  approved: {
    title: 'Rate Approved — Ready for Quotation',
    fallbackMessage: 'Admin approved the rate for this inquiry.',
  },
  rejected: {
    title: 'Inquiry Rate Rejected',
    fallbackMessage: 'Admin rejected the proposed rate for this inquiry.',
  },
  lead_transferred: {
    title: 'Lead Transferred to You',
    fallbackMessage: 'A lead was transferred to you.',
  },
  quotation_sent_to_customer: {
    title: 'Quotation Sent to Customer',
    fallbackMessage: 'A quotation was sent to the customer.',
  },
  quotation_counter_offer: {
    title: 'Customer Counter-Offer Received',
    fallbackMessage: 'The customer sent a counter-offer on a quotation.',
  },
  chat: {
    title: 'New Message',
    fallbackMessage: 'You have a new lead chat message.',
  },
};

export function isLifecycleEventType(value: string | null | undefined): value is LifecycleEventType {
  return Boolean(value && (LIFECYCLE_EVENT_TYPES as readonly string[]).includes(value));
}

export function lifecycleEventsForRecipientRoles(
  roles: Array<'sales_agent' | 'operations' | 'admin'>
): string[] {
  const events = new Set<string>();
  if (roles.includes('sales_agent')) {
    for (const eventType of SALES_NOTIFICATION_EVENTS) events.add(eventType);
  }
  if (roles.includes('operations')) {
    for (const eventType of OPERATIONS_NOTIFICATION_EVENTS) events.add(eventType);
  }
  if (roles.includes('admin')) {
    for (const eventType of ADMIN_NOTIFICATION_EVENTS) events.add(eventType);
  }
  return [...events];
}

export function catalogTitleForEvent(eventType: string | null | undefined): string {
  if (!eventType) return 'Notification';
  return NOTIFICATION_EVENT_CATALOG[eventType]?.title || 'Notification';
}

/** Operations-facing labels for events that Sales also receives with different copy. */
export function operationsCatalogTitle(eventType: string | null | undefined): string {
  switch (eventType) {
    case 'inquiry_sent':
      return 'New Inquiry Received from Sales';
    case 'approved':
      return 'Inquiry Confirmed by Admin';
    case 'rejected':
      return 'Inquiry Rejected by Admin';
    default:
      return catalogTitleForEvent(eventType);
  }
}

export function operationsCatalogMessage(
  eventType: string | null | undefined,
  fallback?: string | null
): string {
  switch (eventType) {
    case 'inquiry_sent':
      return 'A sales person sent this inquiry for operations review.';
    case 'approved':
      return 'Admin confirmed this inquiry.';
    case 'rejected':
      return fallback?.trim() || 'Admin rejected this inquiry.';
    default:
      return fallback?.trim() || catalogMessageForEvent(eventType);
  }
}

export function catalogMessageForEvent(eventType: string | null | undefined): string {
  if (!eventType) return 'You have a new notification.';
  return NOTIFICATION_EVENT_CATALOG[eventType]?.fallbackMessage || 'You have a new notification.';
}

export function formatNotificationTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return 'Just now';
  if (diffMs < hour) {
    const minutes = Math.max(1, Math.floor(diffMs / minute));
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  }
  if (diffMs < day) {
    const hours = Math.max(1, Math.floor(diffMs / hour));
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  if (diffMs < 7 * day) {
    const days = Math.max(1, Math.floor(diffMs / day));
    return days === 1 ? 'Yesterday' : `${days} days ago`;
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function withInquiryQuery(path: string, inquiryId?: string | null): string {
  if (!inquiryId) return path;
  const join = path.includes('?') ? '&' : '?';
  return `${path}${join}inquiryId=${encodeURIComponent(inquiryId)}`;
}

export function salesAgentInquiryHref(leadId: string, inquiryId?: string | null): string {
  return withInquiryQuery(`/sales-agent/leads/${leadId}?tab=view`, inquiryId);
}

export function crmInquiryHref(inquiryId: string): string {
  return `/crm/inquiries/${inquiryId}`;
}

export function quotationFromInquiryHref(inquiryId: string): string {
  return `/sales/quotations/new?inquiryId=${encodeURIComponent(inquiryId)}`;
}

export function adminConfirmationHref(confirmationId: string): string {
  return `/admin/dashboard?tab=inquiry-confirmation&confirmationId=${encodeURIComponent(confirmationId)}`;
}

export function operationsConfirmationHref(confirmationId: string): string {
  return `/operations/dashboard?tab=inquiry-confirmation&confirmationId=${encodeURIComponent(confirmationId)}`;
}

export function operationsInquiryHref(leadId: string, inquiryId?: string | null): string {
  const params = new URLSearchParams({
    tab: 'leads-inquiry',
    leadId,
  });
  if (inquiryId) params.set('inquiryId', inquiryId);
  return `/operations/dashboard?${params.toString()}`;
}

export function adminOperationsInquiryHref(leadId: string, inquiryId?: string | null): string {
  const params = new URLSearchParams({
    tab: 'operations',
    opsTab: 'leads-inquiry',
    leadId,
  });
  if (inquiryId) params.set('inquiryId', inquiryId);
  return `/admin/dashboard?${params.toString()}`;
}

export function resolveNotificationHref(input: {
  eventType: string;
  source: AppNotificationSource;
  leadId: string | null;
  inquiryId: string | null;
  confirmationId: string | null;
  storedHref?: string | null;
  ctx: NotificationViewerContext;
}): string {
  const { eventType, source, leadId, inquiryId, confirmationId, storedHref, ctx } = input;

  if (source === 'chat' && leadId) {
    return `/sales-agent/leads/${leadId}?tab=chat`;
  }

  if (eventType === 'inquiry_received' || eventType === 'lead_transferred') {
    if (ctx.hasCrm && inquiryId) return crmInquiryHref(inquiryId);
    if (leadId) return salesAgentInquiryHref(leadId, inquiryId);
  }

  if (eventType === 'approved') {
    if (ctx.isOperationsActor && !ctx.isSalesActor && leadId) {
      return adminOperationsInquiryHref(leadId, inquiryId);
    }
    if (ctx.hasSalesQuotations && inquiryId) return quotationFromInquiryHref(inquiryId);
    if (ctx.hasCrm && inquiryId) return crmInquiryHref(inquiryId);
    if (leadId) return salesAgentInquiryHref(leadId, inquiryId);
  }

  if (eventType === 'sent_for_admin_approval' && confirmationId) {
    return adminConfirmationHref(confirmationId);
  }

  if (eventType === 'inquiry_sent' || eventType === 'rejected') {
    if (leadId) {
      if (ctx.isSuperAdmin || ctx.canAccessAdminDashboard || ctx.isOperationsActor) {
        return adminOperationsInquiryHref(leadId, inquiryId);
      }
    }
    if (ctx.hasCrm && inquiryId) return crmInquiryHref(inquiryId);
    if (leadId) return salesAgentInquiryHref(leadId, inquiryId);
  }

  if (inquiryId && ctx.hasCrm) return crmInquiryHref(inquiryId);
  if (leadId) return salesAgentInquiryHref(leadId, inquiryId);
  if (storedHref && storedHref.startsWith('/')) return storedHref;
  return '/';
}

export function notificationMetaLine(item: Pick<AppInboxItem, 'leadNumber' | 'customerName' | 'payload'>): string {
  const lead = item.leadNumber || item.payload.inquiryNumber || '';
  const customer = item.customerName || item.payload.customerName || '';
  const leadLabel = lead ? (String(lead).startsWith('#') ? `Lead ${lead}` : `Lead #${lead}`) : '';
  return [leadLabel, customer].filter(Boolean).join(' · ');
}
