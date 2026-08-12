/** Odoo-style tax report line label: "GST 18% (18.0%)". */
export function formatTaxReportLabel(
  invoiceLabel: string | null | undefined,
  rateValue: number | null | undefined
) {
  const base = String(invoiceLabel || 'Tax').trim() || 'Tax';
  const rate = Number(rateValue);
  if (!Number.isFinite(rate)) return base;
  return `${base} (${rate.toFixed(1)}%)`;
}
