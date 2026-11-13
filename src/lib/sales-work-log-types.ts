/** Sales agent manual work logs (migration 058). Safe to import in the browser. */

export const WORK_LOG_TYPES = [
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'phone_call', label: 'Phone call' },
  { value: 'customer_meeting', label: 'Customer meeting' },
  { value: 'quotation_follow_up', label: 'Quotation follow-up' },
  { value: 'other', label: 'Other' },
] as const;

export type WorkLogType = (typeof WORK_LOG_TYPES)[number]['value'];

export function isWorkLogType(value: unknown): value is WorkLogType {
  return WORK_LOG_TYPES.some((t) => t.value === value);
}

export function workLogTypeLabel(type: string, customType?: string | null): string {
  if (type === 'other' && customType?.trim()) return customType.trim();
  return WORK_LOG_TYPES.find((t) => t.value === type)?.label ?? 'Other';
}

export type WorkLogAttachment = {
  name: string;
  type: string;
  size: number;
  /** Signed link, valid for about an hour; null when it could not be created. */
  url: string | null;
};

export type WorkLogEntry = {
  id: string;
  agentId: string;
  agentName: string;
  type: WorkLogType;
  typeLabel: string;
  contactId: string | null;
  contactName: string | null;
  description: string;
  loggedAt: string;
  attachments: WorkLogAttachment[];
};

/** Upload limits for one log. */
export const WORK_LOG_MAX_FILES = 5;
export const WORK_LOG_MAX_TOTAL_BYTES = 10 * 1024 * 1024;
export const WORK_LOG_ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv';
