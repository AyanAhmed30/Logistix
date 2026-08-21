/**
 * Accounting Review — Working Files / Audit cycles (Odoo-style).
 */

export const AUDIT_RETURN_TYPE = 'audit' as const;

export type AuditReturnType = typeof AUDIT_RETURN_TYPE;

export const AUDIT_CYCLES = [
  'Equity',
  'Fixed assets',
  'Government',
  'Inventory',
  'Operating expenses',
  'Others',
  'Payroll',
  'Purchases',
  'Regulatory compliance',
  'Sales',
  'Treasury and financing',
] as const;

export type AuditCycle = (typeof AUDIT_CYCLES)[number];

export type WorkingFileStatus =
  | 'draft'
  | 'ongoing'
  | 'paused'
  | 'done'
  | 'cancelled';

/** Calendar-year bounds for the default audit period. */
export function defaultAuditYearBounds(year?: number) {
  const y = year ?? new Date().getFullYear();
  return {
    dateFrom: `${y}-01-01`,
    dateTo: `${y}-12-31`,
  };
}

export function formatAuditPeriodLabel(dateFrom: string, dateTo: string) {
  const fmt = (iso: string) => {
    const d = new Date(iso.slice(0, 10) + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };
  return `${fmt(dateFrom)} → ${fmt(dateTo)}`;
}

export function workingFileStatusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
