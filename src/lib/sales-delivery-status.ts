/**
 * Odoo-style Sales Order delivery fulfillment from line quantities.
 * Delivered remains manually editable until Warehouse automation replaces it.
 */

export type SalesDeliveryFulfillmentStatus =
  | 'nothing'
  | 'partial'
  | 'full';

export const SALES_DELIVERY_FULFILLMENT_LABELS: Record<
  SalesDeliveryFulfillmentStatus,
  string
> = {
  nothing: 'Nothing Delivered',
  partial: 'Partially Delivered',
  full: 'Fully Delivered',
};

export type SalesDeliveryLineQty = {
  quantity: number;
  qty_delivered: number;
  /** Skip section/note lines */
  isProduct?: boolean;
};

/** Per-line validation. Returns error message or null. */
export function validateDeliveredQuantity(
  orderedQty: number,
  deliveredQty: number
): string | null {
  const ordered = Number(orderedQty) || 0;
  const delivered = Number(deliveredQty) || 0;
  if (delivered < 0) {
    return 'Delivered quantity cannot be negative.';
  }
  if (delivered > ordered) {
    return 'Delivered quantity cannot exceed ordered quantity.';
  }
  return null;
}

/** Single-line fulfillment (product lines only). */
export function computeLineDeliveryFulfillment(
  orderedQty: number,
  deliveredQty: number
): SalesDeliveryFulfillmentStatus {
  const ordered = Math.max(0, Number(orderedQty) || 0);
  const delivered = Math.max(0, Number(deliveredQty) || 0);
  if (delivered <= 0) return 'nothing';
  if (ordered > 0 && delivered >= ordered) return 'full';
  return 'partial';
}

/**
 * Order-level status (Odoo): aggregates product lines.
 * - all zero → Nothing Delivered
 * - all fully delivered → Fully Delivered
 * - otherwise any progress → Partially Delivered
 */
export function computeOrderDeliveryFulfillment(
  lines: SalesDeliveryLineQty[]
): SalesDeliveryFulfillmentStatus {
  const productLines = lines.filter((l) => l.isProduct !== false);
  if (productLines.length === 0) return 'nothing';

  let totalOrdered = 0;
  let totalDelivered = 0;
  let anyPartial = false;
  let allFull = true;

  for (const line of productLines) {
    const ordered = Math.max(0, Number(line.quantity) || 0);
    const delivered = Math.max(0, Number(line.qty_delivered) || 0);
    totalOrdered += ordered;
    totalDelivered += delivered;

    const status = computeLineDeliveryFulfillment(ordered, delivered);
    if (status === 'partial') anyPartial = true;
    if (status !== 'full') allFull = false;
  }

  if (totalDelivered <= 0) return 'nothing';
  if (totalOrdered > 0 && allFull && !anyPartial) return 'full';
  return 'partial';
}

/** Map qty fulfillment → existing quotations.delivery_status (list filters). */
export function fulfillmentToLegacyDeliveryStatus(
  status: SalesDeliveryFulfillmentStatus
): 'waiting' | 'ready' | 'delivered' {
  if (status === 'full') return 'delivered';
  if (status === 'partial') return 'ready';
  return 'waiting';
}

export function deliveryFulfillmentBadgeClass(
  status: SalesDeliveryFulfillmentStatus
): string {
  switch (status) {
    case 'full':
      return 'bg-emerald-600 text-white border-emerald-600';
    case 'partial':
      return 'bg-orange-500 text-white border-orange-500';
    case 'nothing':
    default:
      return 'bg-slate-500 text-white border-slate-500';
  }
}
