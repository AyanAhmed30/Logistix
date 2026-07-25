/**
 * Helpers for Sales quotation form calculations & address formatting.
 */

export type QuotationLineDraft = {
  key: string;
  id?: string | null;
  product_id?: string | null;
  product_name: string;
  description: string;
  quantity: string;
  uom: string;
  unit_price: string;
  discount: string;
  taxes: string;
};

export const SALES_UOM_OPTIONS = [
  { value: 'Units', label: 'Units' },
  { value: 'Piece', label: 'Piece' },
  { value: 'Kg', label: 'Kg' },
  { value: 'Box', label: 'Box' },
  { value: 'Hour', label: 'Hour' },
  { value: 'pcs / u', label: 'pcs / u' },
  { value: 'm³', label: 'm³' },
  { value: 'pairs (2u)', label: 'pairs (2u)' },
] as const;

export function newLineDraft(partial?: Partial<QuotationLineDraft>): QuotationLineDraft {
  return {
    key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    id: null,
    product_id: null,
    product_name: '',
    description: '',
    quantity: '1',
    uom: 'Units',
    unit_price: '0',
    discount: '0',
    taxes: '0',
    ...partial,
  };
}

export function computeLineAmounts(line: QuotationLineDraft) {
  const qty = parseFloat(line.quantity) || 0;
  const price = parseFloat(line.unit_price) || 0;
  const discount = Math.min(100, Math.max(0, parseFloat(line.discount) || 0));
  const taxRate = Math.max(0, parseFloat(line.taxes) || 0);
  const base = qty * price * (1 - discount / 100);
  const tax = base * (taxRate / 100);
  return {
    untaxed: Math.round(base * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round((base + tax) * 100) / 100,
  };
}

export function computeDocumentTotals(lines: QuotationLineDraft[]) {
  return lines.reduce(
    (acc, line) => {
      const a = computeLineAmounts(line);
      acc.untaxed += a.untaxed;
      acc.tax += a.tax;
      acc.total += a.total;
      return acc;
    },
    { untaxed: 0, tax: 0, total: 0 }
  );
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function formatContactAddress(parts: {
  street?: string | null;
  street2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
}) {
  return [parts.street, parts.street2, parts.city, parts.state, parts.zip, parts.country]
    .map((p) => (p == null ? '' : String(p).trim()))
    .filter(Boolean)
    .join(', ');
}
