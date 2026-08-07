/** Pure bill line/totals helpers (client + server safe).
 * Delegates to the central Tax Engine for consistent math.
 */
import { computeDocumentTaxes, computeLineTax } from '@/lib/accounting-tax-engine';

export function computeBillLineTotal(line: {
  quantity: number;
  unit_price: number;
  discount?: number;
  taxes?: number;
}) {
  const r = computeLineTax({
    quantity: line.quantity,
    unitPrice: line.unit_price,
    discountPercent: line.discount,
    taxPercent: line.taxes,
  });
  return r.total;
}

export function computeBillTotals(
  lines: { quantity: number; unit_price: number; discount?: number; taxes?: number }[]
) {
  const doc = computeDocumentTaxes(
    lines.map((line) => ({
      quantity: line.quantity,
      unitPrice: line.unit_price,
      discountPercent: line.discount,
      taxPercent: line.taxes,
    }))
  );
  return {
    untaxed_amount: doc.untaxed_amount,
    tax_amount: doc.tax_amount,
    total_amount: doc.total_amount,
  };
}
