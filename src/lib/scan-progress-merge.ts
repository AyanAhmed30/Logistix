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

function recountConsoleSection(
  order: OrderScanProgressRow,
  key: "outward" | "re_inward"
): OrderScanProgressRow {
  const section = order[key];
  if (!section) return order;
  const cartons = section.cartons;
  const scanned_count = cartons.filter((c) => c.scanned).length;
  return {
    ...order,
    [key]: {
      ...section,
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
      merged = recountConsoleSection(
        {
          ...merged,
          outward: {
            ...base,
            cartons: mergeCartonLists(base.cartons, prevCartons),
          },
        },
        "outward"
      );
    }

    const serverRe = serverOrder.re_inward;
    const prevRe = prevOrder.re_inward;
    if (serverRe || prevRe) {
      const base = serverRe ?? prevRe!;
      const prevCartons = prevRe?.cartons ?? [];
      merged = recountConsoleSection(
        {
          ...merged,
          re_inward: {
            ...base,
            cartons: mergeCartonLists(base.cartons, prevCartons),
          },
        },
        "re_inward"
      );
    }

    return merged;
  });
}
