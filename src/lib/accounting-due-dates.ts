/**
 * Auto due-date from payment terms (Odoo-style).
 * Users may still override due date manually.
 */

export function parsePaymentTermDays(paymentTerms: string | null | undefined): number {
  const raw = String(paymentTerms || '').trim().toLowerCase();
  if (!raw || raw.includes('immediate')) return 0;

  const net = raw.match(/net\s*(\d+)/i);
  if (net) return Math.max(0, Number(net[1]) || 0);

  const days = raw.match(/(\d+)\s*days?/i);
  if (days) return Math.max(0, Number(days[1]) || 0);

  if (raw.includes('end of next month')) return -1; // sentinel
  return 0;
}

export function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateIso;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function endOfNextMonthIso(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateIso;
  // Move to first of month after next, then day 0 = last day of next month
  const y = d.getFullYear();
  const m = d.getMonth(); // 0-based
  const end = new Date(y, m + 2, 0);
  return end.toISOString().slice(0, 10);
}

/** Compute due date from invoice date + payment terms. */
export function computeDueDateFromTerms(
  invoiceDate: string | null | undefined,
  paymentTerms: string | null | undefined
): string | null {
  const inv = String(invoiceDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inv)) return null;

  const days = parsePaymentTermDays(paymentTerms);
  if (days === -1) return endOfNextMonthIso(inv);
  return addDaysIso(inv, days);
}
