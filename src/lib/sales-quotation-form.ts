/**
 * Helpers for Sales quotation form calculations & address formatting.
 */

export type QuotationLineDisplayType = 'product' | 'line_section' | 'line_note';

export type QuotationLineDraft = {
  key: string;
  id?: string | null;
  product_id?: string | null;
  product_name: string;
  description: string;
  quantity: string;
  /** Delivered qty (Sales Order). Editable until Warehouse automation. */
  qty_delivered: string;
  /** Income / GL account display label (Accounting invoice lines). */
  account?: string;
  /** Chart of Accounts id when selected from live CoA. */
  account_id?: string | null;
  uom: string;
  unit_price: string;
  discount: string;
  taxes: string;
  display_type?: QuotationLineDisplayType;
};

export const SALES_CURRENCY = 'PKR';

export const SALES_DEFAULT_UOM = 'Kg';

export const SALES_UOM_OPTIONS = [
  { value: 'Kg', label: 'kg' },
  { value: 'pieces', label: 'pieces' },
  { value: '2u pairs', label: '2u pairs' },
  { value: 'Units', label: 'Units' },
  { value: 'Piece', label: 'Piece' },
  { value: 'Box', label: 'Box' },
  { value: 'Hour', label: 'Hour' },
  { value: 'pcs / u', label: 'pcs / u' },
  { value: 'm³', label: 'm³' },
  { value: 'pairs (2u)', label: 'pairs (2u)' },
] as const;

export const SALES_TAX_RATE_OPTIONS = [
  '5',
  '10',
  '13',
  '16',
  '17',
  '18',
  '20',
] as const;

/** Parse a tax field that may be empty, numeric, or a custom label such as "18%" / "GST 18". */
export function parseTaxPercent(value: string | number | null | undefined): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0;
  const match = String(value).replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return match ? Math.max(0, Number(match[1])) : 0;
}

export function formatTaxLabel(value: string | number | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/%/.test(raw)) return raw;
  const n = parseTaxPercent(raw);
  if (!n) return '';
  return Number.isInteger(n) ? `${n}%` : `${n}%`;
}

export function newLineDraft(partial?: Partial<QuotationLineDraft>): QuotationLineDraft {
  return {
    key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    id: null,
    product_id: null,
    product_name: '',
    description: '',
    quantity: '1',
    qty_delivered: '0',
    account: 'Sales',
    account_id: null,
    uom: SALES_DEFAULT_UOM,
    unit_price: '0',
    discount: '0',
    taxes: '',
    display_type: 'product',
    ...partial,
  };
}

export function inferLineDisplayType(line: {
  product_name: string;
  description?: string | null;
  quantity: number | string;
  unit_price: number | string;
  display_type?: QuotationLineDisplayType;
}): QuotationLineDisplayType {
  if (line.display_type) return line.display_type;
  const qty = Number(line.quantity) || 0;
  const price = Number(line.unit_price) || 0;
  if (qty === 0 && price === 0) {
    const name = String(line.product_name || '').trim();
    if (name === 'Note') return 'line_note';
    if (name === 'Section' || name) return 'line_section';
    return 'line_note';
  }
  return 'product';
}

export function isProductLine(line: QuotationLineDraft) {
  return inferLineDisplayType(line) === 'product';
}

export function computeLineAmounts(line: QuotationLineDraft) {
  const qty = parseFloat(line.quantity) || 0;
  const price = parseFloat(line.unit_price) || 0;
  const discount = Math.min(100, Math.max(0, parseFloat(line.discount) || 0));
  const taxRate = Math.max(0, parseTaxPercent(line.taxes));
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
      if (!isProductLine(line)) return acc;
      const a = computeLineAmounts(line);
      acc.untaxed += a.untaxed;
      acc.tax += a.tax;
      acc.total += a.total;
      return acc;
    },
    { untaxed: 0, tax: 0, total: 0 }
  );
}

/** Round money to 2dp (Odoo-style display). */
export function roundMoney(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Unit price for the Price column given tax mode.
 * Internal storage is always tax-excluded.
 */
export function unitPriceForDisplay(
  unitPriceExcl: number,
  taxPct: number,
  mode: 'excl' | 'incl'
) {
  const excl = Number(unitPriceExcl) || 0;
  const rate = Math.max(0, Number(taxPct) || 0) / 100;
  if (mode === 'incl') return roundMoney(excl * (1 + rate));
  return roundMoney(excl);
}

/** Convert Price-column input back to tax-excluded storage. */
export function unitPriceFromDisplay(
  displayPrice: number,
  taxPct: number,
  mode: 'excl' | 'incl'
) {
  const displayed = Number(displayPrice) || 0;
  const rate = Math.max(0, Number(taxPct) || 0) / 100;
  if (mode === 'incl' && rate > 0) return roundMoney(displayed / (1 + rate));
  return roundMoney(displayed);
}

/** Line Amount column: excl → untaxed; incl → total (tax included). */
export function lineAmountForTaxMode(
  line: QuotationLineDraft,
  mode: 'excl' | 'incl'
) {
  const a = computeLineAmounts(line);
  return mode === 'incl' ? a.total : a.untaxed;
}

export function formatMoney(value: number, currency = SALES_CURRENCY) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function quotationLineDisplayDescription(
  productName?: string | null,
  description?: string | null
): string {
  const name = String(productName || '').trim();
  const desc = String(description || '').trim();

  const extractFromDump = (text: string) => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const metadataCount = lines.filter((line) =>
      /^(Product|Quantity|Weight\s*\(kg\)|CBM|UOM|HS Code|Specifications|Description|Operations notes)\s*:/i.test(
        line
      )
    ).length;
    if (metadataCount < 2) return null;
    const productLine = lines.find((line) => /^Product\s*:/i.test(line));
    if (productLine) {
      const extracted = productLine.replace(/^Product\s*:\s*/i, '').trim();
      if (extracted) return extracted;
    }
    return '';
  };

  return extractFromDump(desc) || extractFromDump(name) || name || desc;
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
