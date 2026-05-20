import type { OrderScanProgressCarton, OrderScanProgressRow } from "@/app/actions/orders";

function mergeCartonLists(
  serverCartons: OrderScanProgressCarton[],
  prevCartons: OrderScanProgressCarton[]
): OrderScanProgressCarton[] {
  const prevById = new Map(prevCartons.map((c) => [c.id, c]));
  return serverCartons.map((sc) => {
    const pc = prevById.get(sc.id);
    if (pc?.scanned && !sc.scanned) {
      return {
        ...sc,
        scanned: true,
        scanned_at: pc.scanned_at ?? sc.scanned_at,
        state: "scanned" as const,
      };
    }
    return sc;
  });
}

function recountInward(order: OrderScanProgressRow): OrderScanProgressRow {
  const cartons = order.cartons;
  const scanned_count = cartons.filter((c) => c.scanned).length;
  return {
    ...order,
    cartons,
    scanned_count,
    pending_count: Math.max(0, order.total_cartons - scanned_count),
  };
}

function recountOutward(order: OrderScanProgressRow): OrderScanProgressRow {
  if (!order.outward) return order;
  const cartons = order.outward.cartons;
  const scanned_count = cartons.filter((c) => c.scanned).length;
  return {
    ...order,
    outward: {
      ...order.outward,
      cartons,
      scanned_count,
      pending_count: Math.max(0, order.total_cartons - scanned_count),
    },
  };
}

/** Keep optimistic client scans when a background refetch returns slightly stale data. */
export function mergeScanProgressOrders(
  serverOrders: OrderScanProgressRow[],
  prevOrders: OrderScanProgressRow[]
): OrderScanProgressRow[] {
  if (prevOrders.length === 0) return serverOrders;

  const prevById = new Map(prevOrders.map((o) => [o.id, o]));

  return serverOrders.map((serverOrder) => {
    const prevOrder = prevById.get(serverOrder.id);
    if (!prevOrder) return serverOrder;

    let merged: OrderScanProgressRow = {
      ...serverOrder,
      cartons: mergeCartonLists(serverOrder.cartons, prevOrder.cartons),
    };
    merged = recountInward(merged);

    const serverOut = serverOrder.outward;
    const prevOut = prevOrder.outward;
    if (serverOut || prevOut) {
      const base = serverOut ?? prevOut!;
      const prevCartons = prevOut?.cartons ?? [];
      merged = recountOutward({
        ...merged,
        outward: {
          ...base,
          cartons: mergeCartonLists(base.cartons, prevCartons),
        },
      });
    }

    return merged;
  });
}
