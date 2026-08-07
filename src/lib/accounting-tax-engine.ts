/**
 * Central Tax Engine for Accounting (Odoo-inspired).
 * Single source of tax computation for invoices, bills, credit notes, and JE posting.
 * Compatible with legacy line `taxes` percent fields.
 */

export type TaxAmountType = 'percent' | 'fixed';
export type TaxScope = 'sale' | 'purchase' | 'none';
export type TaxMasterType = 'sales_tax' | 'purchase_tax' | 'withholding_tax';

export type TaxEngineDefinition = {
  id: string;
  name: string;
  code: string;
  type: TaxMasterType;
  rate_type: 'percentage' | 'fixed';
  rate_value: number;
  amount_type: TaxAmountType;
  is_inclusive: boolean;
  account_id: string | null;
  refund_account_id?: string | null;
  invoice_label?: string | null;
  tax_group_id?: string | null;
  scope?: TaxScope | null;
  is_active: boolean;
};

export type TaxComputeLineInput = {
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  /** Legacy percent (0–100). Used when no tax definition / tax_id. */
  taxPercent?: number;
  /** Prefer tax definition when provided. */
  tax?: TaxEngineDefinition | null;
  priceIncludeTax?: boolean;
};

export type TaxComputeLineResult = {
  base: number;
  tax: number;
  total: number;
  effectiveRate: number;
  taxId: string | null;
  taxLabel: string | null;
  accountId: string | null;
};

export type TaxComputeDocumentResult = {
  lines: TaxComputeLineResult[];
  untaxed_amount: number;
  tax_amount: number;
  total_amount: number;
  /** Aggregated tax by account for JE posting */
  taxByAccount: Array<{ account_id: string; amount: number; label: string }>;
};

function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Compute untaxed base from qty/price/discount. */
export function computeTaxableBase(args: {
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
}) {
  const qty = Number(args.quantity) || 0;
  const price = Number(args.unitPrice) || 0;
  const discount = Math.max(0, Number(args.discountPercent) || 0);
  return round2(qty * price * (1 - discount / 100));
}

/**
 * Compute tax for one line.
 * - If tax definition present: use percent/fixed + inclusive/exclusive
 * - Else: legacy percent on exclusive base
 */
export function computeLineTax(input: TaxComputeLineInput): TaxComputeLineResult {
  const priceInclude =
    input.priceIncludeTax ?? Boolean(input.tax?.is_inclusive);
  const grossOrNet = computeTaxableBase({
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    discountPercent: input.discountPercent,
  });

  const taxDef = input.tax || null;
  const taxId = taxDef?.id || null;
  const taxLabel =
    taxDef?.invoice_label || taxDef?.name || null;
  const accountId = taxDef?.account_id || null;

  // Inclusive: unit price already includes tax
  if (priceInclude && taxDef) {
    const rate = Number(taxDef.rate_value) || 0;
    if (taxDef.rate_type === 'fixed' || taxDef.amount_type === 'fixed') {
      const tax = round2(rate);
      const base = round2(Math.max(grossOrNet - tax, 0));
      return {
        base,
        tax,
        total: round2(base + tax),
        effectiveRate: base > 0 ? round2((tax / base) * 100) : 0,
        taxId,
        taxLabel,
        accountId,
      };
    }
    const base = round2(grossOrNet / (1 + rate / 100));
    const tax = round2(grossOrNet - base);
    return {
      base,
      tax,
      total: grossOrNet,
      effectiveRate: rate,
      taxId,
      taxLabel,
      accountId,
    };
  }

  // Exclusive
  if (taxDef) {
    const rate = Number(taxDef.rate_value) || 0;
    if (taxDef.rate_type === 'fixed' || taxDef.amount_type === 'fixed') {
      const tax = round2(rate);
      return {
        base: grossOrNet,
        tax,
        total: round2(grossOrNet + tax),
        effectiveRate: grossOrNet > 0 ? round2((tax / grossOrNet) * 100) : 0,
        taxId,
        taxLabel,
        accountId,
      };
    }
    const tax = round2(grossOrNet * (rate / 100));
    return {
      base: grossOrNet,
      tax,
      total: round2(grossOrNet + tax),
      effectiveRate: rate,
      taxId,
      taxLabel,
      accountId,
    };
  }

  // Legacy percent
  const pct = Math.max(0, Number(input.taxPercent) || 0);
  if (priceInclude && pct > 0) {
    const base = round2(grossOrNet / (1 + pct / 100));
    const tax = round2(grossOrNet - base);
    return {
      base,
      tax,
      total: grossOrNet,
      effectiveRate: pct,
      taxId: null,
      taxLabel: null,
      accountId: null,
    };
  }

  const tax = round2(grossOrNet * (pct / 100));
  return {
    base: grossOrNet,
    tax,
    total: round2(grossOrNet + tax),
    effectiveRate: pct,
    taxId: null,
    taxLabel: null,
    accountId: null,
  };
}

export function computeDocumentTaxes(
  lines: TaxComputeLineInput[]
): TaxComputeDocumentResult {
  const results = lines.map(computeLineTax);
  let untaxed = 0;
  let tax = 0;
  const byAccount = new Map<string, { amount: number; label: string }>();

  for (const r of results) {
    untaxed += r.base;
    tax += r.tax;
    if (r.accountId && r.tax > 0) {
      const cur = byAccount.get(r.accountId) || {
        amount: 0,
        label: r.taxLabel || 'Tax',
      };
      cur.amount = round2(cur.amount + r.tax);
      byAccount.set(r.accountId, cur);
    }
  }

  untaxed = round2(untaxed);
  tax = round2(tax);

  return {
    lines: results,
    untaxed_amount: untaxed,
    tax_amount: tax,
    total_amount: round2(untaxed + tax),
    taxByAccount: [...byAccount.entries()].map(([account_id, v]) => ({
      account_id,
      amount: v.amount,
      label: v.label,
    })),
  };
}

/** Effective rate from untaxed + tax (for tax return lines). */
export function effectiveTaxRate(untaxed: number, tax: number) {
  const u = Number(untaxed) || 0;
  const t = Number(tax) || 0;
  if (u <= 0) return 0;
  return round2((t / u) * 100);
}

export function taxMasterTypeLabel(t: string | null | undefined) {
  switch (t) {
    case 'sales_tax':
      return 'Sales';
    case 'purchase_tax':
      return 'Purchase';
    case 'withholding_tax':
      return 'Withholding';
    default:
      return String(t || '—');
  }
}

export function taxScopeLabel(s: string | null | undefined) {
  switch (s) {
    case 'sale':
      return 'Sales';
    case 'purchase':
      return 'Purchases';
    case 'none':
      return 'None';
    default:
      return String(s || '—');
  }
}

export function normalizeTaxCode(code: string) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}
