/**
 * Centralized Product ↔ Accounting helpers.
 * Downstream modules (SO, invoices, bills, JE) should consume these —
 * do not reimplement tax/account resolution per form.
 */

export type ProductTaxLike = {
  id?: string;
  rate_type?: string | null;
  amount_type?: string | null;
  rate_value?: number | null;
};

export type ProductAccountingSnapshot = {
  id: string;
  sales_tax_id?: string | null;
  purchase_tax_id?: string | null;
  customer_tax_ids?: string[];
  vendor_tax_ids?: string[];
  income_account_id?: string | null;
  expense_account_id?: string | null;
  sales_tax_rate?: number | null;
  purchase_tax_rate?: number | null;
  customer_taxes?: ProductTaxLike[];
  vendor_taxes?: ProductTaxLike[];
  list_price?: number;
  standard_price?: number;
};

function isPercentTax(t: ProductTaxLike) {
  const rt = String(t.rate_type || '').toLowerCase();
  const at = String(t.amount_type || '').toLowerCase();
  if (rt === 'fixed' || at === 'fixed') return false;
  return true;
}

/** Sum percentage tax rates for line `taxes` fields (current ERP model). */
export function sumPercentTaxRates(taxes: ProductTaxLike[] | null | undefined): number {
  if (!taxes?.length) return 0;
  return Math.round(
    taxes
      .filter(isPercentTax)
      .reduce((sum, t) => sum + (Number(t.rate_value) || 0), 0) * 100
  ) / 100;
}

export function productCustomerTaxPercent(product: ProductAccountingSnapshot): number {
  if (product.customer_taxes?.length) {
    return sumPercentTaxRates(product.customer_taxes);
  }
  return Number(product.sales_tax_rate) || 0;
}

export function productVendorTaxPercent(product: ProductAccountingSnapshot): number {
  if (product.vendor_taxes?.length) {
    return sumPercentTaxRates(product.vendor_taxes);
  }
  return Number(product.purchase_tax_rate) || 0;
}

export function primaryTaxId(ids: string[] | null | undefined): string | null {
  const first = (ids || []).map(String).filter(Boolean)[0];
  return first || null;
}

export function normalizeTaxIdList(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map((x) => String(x || '').trim()).filter(Boolean))];
}

/** Untaxed base for a document line (qty × price × (1 − discount%)). */
export function lineUntaxedAmount(line: {
  quantity?: number | null;
  unit_price?: number | null;
  discount?: number | null;
  untaxed_amount?: number | null;
}): number {
  if (line.untaxed_amount != null && Number.isFinite(Number(line.untaxed_amount))) {
    return Math.round(Number(line.untaxed_amount) * 100) / 100;
  }
  const qty = Number(line.quantity) || 0;
  const price = Number(line.unit_price) || 0;
  const disc = Number(line.discount) || 0;
  const base = qty * price * (1 - disc / 100);
  return Math.round(base * 100) / 100;
}

/**
 * Group line untaxed amounts by product income or expense account.
 * Lines without a product account fall into `fallbackAccountId`.
 */
export function splitAmountsByAccount(
  rows: Array<{ accountId: string | null | undefined; amount: number }>,
  fallbackAccountId: string
): Array<{ accountId: string; amount: number }> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const amount = Math.round((Number(row.amount) || 0) * 100) / 100;
    if (amount === 0) continue;
    const key = row.accountId || fallbackAccountId;
    map.set(key, Math.round(((map.get(key) || 0) + amount) * 100) / 100);
  }
  if (map.size === 0) {
    return [{ accountId: fallbackAccountId, amount: 0 }];
  }
  return [...map.entries()].map(([accountId, amount]) => ({ accountId, amount }));
}
