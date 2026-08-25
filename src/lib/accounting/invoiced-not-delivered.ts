/**
 * Invoiced Not Delivered — qty still outstanding after a posted invoice.
 * Only positive gaps; never invents delivery or invoice quantities.
 */

export function invoicedNotDeliveredQty(
  qtyInvoiced: number,
  qtyDelivered: number
): number {
  const invoiced = Number(qtyInvoiced) || 0;
  const delivered = Number(qtyDelivered) || 0;
  const gap = Math.round((invoiced - delivered) * 100) / 100;
  return gap > 0.004 ? gap : 0;
}
