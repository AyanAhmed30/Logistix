import type { CrmActivityType, CrmActivityStatus } from '@/app/actions/crm/types';

export const CRM_ACTIVITY_TYPES: { value: CrmActivityType; label: string }[] = [
  { value: 'call', label: 'Call' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'email', label: 'Email' },
  { value: 'follow-up', label: 'Follow-up' },
  { value: 'todo', label: 'To-do' },
];

export function crmActivityTypeLabel(type: CrmActivityType): string {
  return CRM_ACTIVITY_TYPES.find((t) => t.value === type)?.label || type;
}

export function formatCrmActivityDueDate(iso: string | null | undefined): string {
  if (!iso) return 'No due date';
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function crmActivityDueBucket(
  dueDate: string | null,
  status: CrmActivityStatus
): 'today' | 'upcoming' | 'overdue' | 'completed' | 'none' {
  if (status === 'done') return 'completed';
  if (!dueDate) return 'none';
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const d = new Date(dueDate);
  if (d < startOfToday) return 'overdue';
  if (d <= endOfToday) return 'today';
  return 'upcoming';
}

export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
