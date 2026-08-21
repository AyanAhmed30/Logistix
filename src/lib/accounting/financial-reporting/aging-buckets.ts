/**
 * Pure AR/AP aging bucket math — no database.
 * Used by Aged Receivable/Payable reports and unit tests.
 */

import { daysOverdueFromDueDate } from '@/lib/accounting-payment-terms';

export type AgingBucketId =
  | 'not_due'
  | 'd1_30'
  | 'd31_60'
  | 'd61_90'
  | 'd91_120'
  | 'older';

export type AgingBucketDef = {
  id: AgingBucketId;
  label: string;
  minDays: number | null;
  maxDays: number | null;
};

export const DEFAULT_AGING_BUCKETS: AgingBucketDef[] = [
  { id: 'not_due', label: 'At Date', minDays: null, maxDays: null },
  { id: 'd1_30', label: '1-30', minDays: 1, maxDays: 30 },
  { id: 'd31_60', label: '31-60', minDays: 31, maxDays: 60 },
  { id: 'd61_90', label: '61-90', minDays: 61, maxDays: 90 },
  { id: 'd91_120', label: '91-120', minDays: 91, maxDays: 120 },
  { id: 'older', label: 'Older', minDays: 121, maxDays: null },
];

export function daysBetween(fromIso: string, toIso: string): number {
  return daysOverdueFromDueDate(fromIso, toIso);
}

export function resolveAgingBucket(
  dueDate: string,
  asOf: string,
  buckets: AgingBucketDef[] = DEFAULT_AGING_BUCKETS
): { bucket: AgingBucketId; daysOverdue: number } {
  const daysOverdue = daysOverdueFromDueDate(dueDate, asOf);
  if (daysOverdue <= 0) {
    return { bucket: 'not_due', daysOverdue: 0 };
  }
  for (const b of buckets) {
    if (b.id === 'not_due') continue;
    const minOk = b.minDays == null || daysOverdue >= b.minDays;
    const maxOk = b.maxDays == null || daysOverdue <= b.maxDays;
    if (minOk && maxOk) return { bucket: b.id, daysOverdue };
  }
  return { bucket: 'older', daysOverdue };
}
