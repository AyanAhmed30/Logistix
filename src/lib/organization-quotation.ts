export type OrganizationQuotationLineItem = {
  description: string;
  quantity: string;
  quantity_uom: string;
  unit_price: number;
  tax_rate: number;
  tax_amount: number;
  line_total: number;
};

export type OrganizationQuotationTotals = {
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
};

export function parseOrganizationQuotationLineItems(value: unknown): OrganizationQuotationLineItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      return {
        description: String(row.description || '').trim(),
        quantity: String(row.quantity || '').trim(),
        quantity_uom: String(row.quantity_uom || 'kg').trim(),
        unit_price: Number(row.unit_price) || 0,
        tax_rate: Number(row.tax_rate) || 0,
        tax_amount: Number(row.tax_amount) || 0,
        line_total: Number(row.line_total) || 0,
      } satisfies OrganizationQuotationLineItem;
    })
    .filter((item): item is OrganizationQuotationLineItem => Boolean(item && item.description));
}

export function computeOrganizationQuotationLine(
  description: string,
  quantity: string,
  quantityUom: string,
  unitPrice: number,
  taxRate: number
): OrganizationQuotationLineItem {
  const qty = parseFloat(quantity.replace(/,/g, '')) || 0;
  const price = Number.isFinite(unitPrice) ? unitPrice : 0;
  const rate = Number.isFinite(taxRate) ? taxRate : 0;
  const lineSubtotal = qty * price;
  const taxAmount = lineSubtotal * (rate / 100);
  const lineTotal = lineSubtotal + taxAmount;

  return {
    description: description.trim(),
    quantity: quantity.trim(),
    quantity_uom: quantityUom.trim() || 'kg',
    unit_price: price,
    tax_rate: rate,
    tax_amount: taxAmount,
    line_total: lineTotal,
  };
}

export function computeOrganizationQuotationTotals(
  lineItems: OrganizationQuotationLineItem[],
  discountTotal = 0
): OrganizationQuotationTotals {
  const subtotal = lineItems.reduce((sum, item) => sum + item.unit_price * (parseFloat(item.quantity.replace(/,/g, '')) || 0), 0);
  const tax_total = lineItems.reduce((sum, item) => sum + item.tax_amount, 0);
  const discount = Number.isFinite(discountTotal) ? discountTotal : 0;
  const grand_total = Math.max(0, subtotal - discount + tax_total);

  return {
    subtotal,
    discount_total: discount,
    tax_total,
    grand_total,
  };
}

export function formatOrganizationCurrency(amount: number) {
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Rs.`;
}

export function formatQuotationQuantityDisplay(item: OrganizationQuotationLineItem) {
  const qty = item.quantity.trim();
  const uom = item.quantity_uom.trim();
  if (!qty) return '';
  return uom ? `${qty} ${uom}` : qty;
}
