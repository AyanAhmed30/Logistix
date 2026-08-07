/**
 * Tax period helpers and GST/VAT summary math (Odoo-style).
 */

export type TaxReturnStatus =
  | 'draft'
  | 'generated'
  | 'confirmed'
  | 'filed'
  | 'cancelled';

export type TaxReturnLineType =
  | 'sales'
  | 'purchase'
  | 'credit_note'
  | 'vendor_refund'
  | 'adjustment';

export type TaxPeriodBounds = {
  dateFrom: string;
  dateTo: string;
  name: string;
};

function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Calendar month containing `isoDate` (YYYY-MM-DD). */
export function monthPeriodBounds(isoDate?: string): TaxPeriodBounds {
  const raw = (isoDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const d = new Date(raw + 'T00:00:00');
  if (Number.isNaN(d.getTime())) {
    const today = new Date().toISOString().slice(0, 10);
    return monthPeriodBounds(today);
  }
  const y = d.getFullYear();
  const m = d.getMonth();
  const from = new Date(y, m, 1);
  const to = new Date(y, m + 1, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateFrom = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`;
  const dateTo = `${to.getFullYear()}-${pad(to.getMonth() + 1)}-${pad(to.getDate())}`;
  const name = from.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return { dateFrom, dateTo, name };
}

export function computeNetTax(opts: {
  salesTax: number;
  purchaseTax: number;
  creditNoteTax?: number;
  vendorRefundTax?: number;
  adjustments?: number;
}) {
  const sales = round2(opts.salesTax);
  const purchase = round2(opts.purchaseTax);
  const cn = round2(opts.creditNoteTax || 0);
  const vr = round2(opts.vendorRefundTax || 0);
  const adj = round2(opts.adjustments || 0);
  // Output (sales - CN) − Input (purchase - vendor refunds) + adjustments
  const netOutput = round2(sales - cn);
  const netInput = round2(purchase - vr);
  return round2(netOutput - netInput + adj);
}

export function effectiveTaxRate(taxable: number, tax: number) {
  const base = Number(taxable) || 0;
  if (base <= 0.004) return 0;
  return round2(((Number(tax) || 0) / base) * 100);
}

export { round2 as roundTax2 };
