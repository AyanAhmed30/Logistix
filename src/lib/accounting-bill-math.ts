/** Pure bill line/totals helpers (client + server safe). */

export function computeBillLineTotal(line: {
  quantity: number;
  unit_price: number;
  discount?: number;
  taxes?: number;
}) {
  const qty = Number(line.quantity) || 0;
  const price = Number(line.unit_price) || 0;
  const discount = Math.max(0, Number(line.discount) || 0);
  const taxes = Math.max(0, Number(line.taxes) || 0);
  const base = qty * price * (1 - discount / 100);
  return Math.round(base * (1 + taxes / 100) * 100) / 100;
}

export function computeBillTotals(
  lines: { quantity: number; unit_price: number; discount?: number; taxes?: number }[]
) {
  let untaxed = 0;
  let tax = 0;
  for (const line of lines) {
    const qty = Number(line.quantity) || 0;
    const price = Number(line.unit_price) || 0;
    const discount = Math.max(0, Number(line.discount) || 0);
    const taxPct = Math.max(0, Number(line.taxes) || 0);
    const base = qty * price * (1 - discount / 100);
    untaxed += base;
    tax += base * (taxPct / 100);
  }
  untaxed = Math.round(untaxed * 100) / 100;
  tax = Math.round(tax * 100) / 100;
  return {
    untaxed_amount: untaxed,
    tax_amount: tax,
    total_amount: Math.round((untaxed + tax) * 100) / 100,
  };
}
