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
  gross_total: number;
  discount_percent: number;
  discount_amount: number;
  sales_tax_percent: number;
  sales_tax_amount: number;
  grand_total: number;
  subtotal: number;
  discount_total: number;
  tax_total: number;
};

export const ORGANIZATION_QUOTATION_ITEM_SEPARATOR = ' | ';

export function combineQuotationItemDescription(item: string, description: string) {
  const itemName = item.trim();
  const itemDescription = description.trim();
  if (!itemName) return itemDescription;
  if (!itemDescription) return itemName;
  return `${itemName}${ORGANIZATION_QUOTATION_ITEM_SEPARATOR}${itemDescription}`;
}

export function splitQuotationItemDescription(stored: string) {
  const separatorIndex = stored.indexOf(ORGANIZATION_QUOTATION_ITEM_SEPARATOR);
  if (separatorIndex === -1) {
    return { item: '', description: stored };
  }
  return {
    item: stored.slice(0, separatorIndex),
    description: stored.slice(separatorIndex + ORGANIZATION_QUOTATION_ITEM_SEPARATOR.length),
  };
}

export function parseOrganizationQuotationLineItems(value: unknown): OrganizationQuotationLineItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const description = String(row.description || '').trim();
      if (!description) return null;
      return computeOrganizationQuotationLine(
        description,
        String(row.quantity || ''),
        String(row.quantity_uom || 'kg'),
        Number(row.unit_price) || 0
      );
    })
    .filter((item): item is OrganizationQuotationLineItem => Boolean(item));
}

export function computeOrganizationQuotationLine(
  description: string,
  quantity: string,
  quantityUom: string,
  unitPrice: number
): OrganizationQuotationLineItem {
  const qty = parseFloat(quantity.replace(/,/g, '')) || 0;
  const price = Number.isFinite(unitPrice) ? unitPrice : 0;
  const lineTotal = qty * price;

  return {
    description: description.trim(),
    quantity: quantity.trim(),
    quantity_uom: quantityUom.trim() || 'kg',
    unit_price: price,
    tax_rate: 0,
    tax_amount: 0,
    line_total: lineTotal,
  };
}

export function computeOrganizationQuotationTotals(
  lineItems: OrganizationQuotationLineItem[],
  discountPercent = 0,
  salesTaxPercent = 0
): OrganizationQuotationTotals {
  const gross_total = lineItems.reduce((sum, item) => sum + item.line_total, 0);
  const discount_percent = Number.isFinite(discountPercent) ? Math.max(0, discountPercent) : 0;
  const sales_tax_percent = Number.isFinite(salesTaxPercent) ? Math.max(0, salesTaxPercent) : 0;
  const discount_amount = gross_total * (discount_percent / 100);
  const sales_tax_amount = gross_total * (sales_tax_percent / 100);
  const grand_total = Math.max(0, gross_total - discount_amount + sales_tax_amount);

  return {
    gross_total,
    discount_percent,
    discount_amount,
    sales_tax_percent,
    sales_tax_amount,
    grand_total,
    subtotal: gross_total,
    discount_total: discount_amount,
    tax_total: sales_tax_amount,
  };
}

export function deriveQuotationPercentages(quotation: {
  subtotal: number;
  discount_total: number;
  tax_total: number;
}) {
  const grossTotal = quotation.subtotal || 0;
  if (grossTotal <= 0) {
    return { discountPercent: 0, salesTaxPercent: 0 };
  }

  return {
    discountPercent: (quotation.discount_total / grossTotal) * 100,
    salesTaxPercent: (quotation.tax_total / grossTotal) * 100,
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
