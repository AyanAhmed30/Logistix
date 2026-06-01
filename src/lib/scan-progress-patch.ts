import type { OrderScanProgressCarton, OrderScanProgressRow } from "@/app/actions/orders";

const LATE_HOURS = 24;

export function applyInwardCartonScanned(
  orders: OrderScanProgressRow[],
  orderId: string,
  cartonId: string,
  scannedAt: string
): OrderScanProgressRow[] {
  return orders.map((order) => {
    if (order.id !== orderId) return order;

    const hoursSinceOrder =
      (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60);

    const cartons = order.cartons.map((c) => {
      if (c.id !== cartonId) return c;
      return {
        ...c,
        scanned: true,
        scanned_at: scannedAt,
        state: "scanned" as const,
      };
    });

    const scanned_count = cartons.filter((c) => c.scanned).length;
    const pending_count = Math.max(0, order.total_cartons - scanned_count);

    const cartonsWithState = cartons.map((c) => {
      if (c.scanned) return c;
      const isLate = hoursSinceOrder >= LATE_HOURS;
      return {
        ...c,
        state: (isLate ? "missing" : "pending") as OrderScanProgressCarton["state"],
      };
    });

    return {
      ...order,
      cartons: cartonsWithState,
      scanned_count,
      pending_count,
    };
  });
}

export function applyReInwardCartonScanned(
  orders: OrderScanProgressRow[],
  orderId: string,
  cartonId: string,
  consoleId: string,
  scannedAt: string
): OrderScanProgressRow[] {
  return orders.map((order) => {
    if (order.id !== orderId || !order.re_inward || order.re_inward.console_id !== consoleId) {
      return order;
    }

    const section = order.re_inward;
    const cartons = section.cartons.map((c) => {
      if (c.id !== cartonId) return c;
      return {
        ...c,
        scanned: true,
        scanned_at: scannedAt,
        state: "scanned" as const,
      };
    });

    const scanned_count = cartons.filter((c) => c.scanned).length;
    const pending_count = Math.max(0, order.total_cartons - scanned_count);

    return {
      ...order,
      re_inward: {
        ...section,
        cartons,
        scanned_count,
        pending_count,
      },
    };
  });
}

export function applyOutwardCartonScanned(
  orders: OrderScanProgressRow[],
  orderId: string,
  cartonId: string,
  consoleId: string,
  scannedAt: string
): OrderScanProgressRow[] {
  return orders.map((order) => {
    if (order.id !== orderId || !order.outward || order.outward.console_id !== consoleId) {
      return order;
    }

    const hoursSinceOrder =
      (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60);

    const o = order.outward;
    const cartons = o.cartons.map((c) => {
      if (c.id !== cartonId) return c;
      return {
        ...c,
        scanned: true,
        scanned_at: scannedAt,
        state: "scanned" as const,
      };
    });

    const scanned_count = cartons.filter((c) => c.scanned).length;
    const pending_count = Math.max(0, order.total_cartons - scanned_count);

    const cartonsWithState = cartons.map((c) => {
      if (c.scanned) return c;
      const isLate = hoursSinceOrder >= LATE_HOURS;
      return {
        ...c,
        state: (isLate ? "missing" : "pending") as OrderScanProgressCarton["state"],
      };
    });

    return {
      ...order,
      outward: {
        ...o,
        cartons: cartonsWithState,
        scanned_count,
        pending_count,
      },
    };
  });
}

export type ScanProgressPatchMeta = {
  scan_type?: string | null;
  console_id?: string | null;
};

/** Returns true if the visible progress grid was updated in place. */
export function patchScanProgressOrders(
  orders: OrderScanProgressRow[],
  orderId: string,
  cartonId: string,
  scannedAt: string,
  meta?: ScanProgressPatchMeta
): { next: OrderScanProgressRow[]; patched: boolean } {
  if ((meta?.scan_type === "re_inward" || meta?.scan_type === "return") && meta.console_id) {
    const order = orders.find((o) => o.id === orderId);
    if (!order?.re_inward || order.re_inward.console_id !== meta.console_id) {
      return { next: orders, patched: false };
    }
    const carton = order.re_inward.cartons.find((c) => c.id === cartonId);
    if (!carton) return { next: orders, patched: false };
    return {
      next: applyReInwardCartonScanned(orders, orderId, cartonId, meta.console_id, scannedAt),
      patched: true,
    };
  }

  if (meta?.scan_type === "outward" && meta.console_id) {
    const order = orders.find((o) => o.id === orderId);
    if (!order?.outward || order.outward.console_id !== meta.console_id) {
      return { next: orders, patched: false };
    }
    const carton = order.outward.cartons.find((c) => c.id === cartonId);
    if (!carton) return { next: orders, patched: false };
    return {
      next: applyOutwardCartonScanned(orders, orderId, cartonId, meta.console_id, scannedAt),
      patched: true,
    };
  }

  const order = orders.find((o) => o.id === orderId);
  const carton = order?.cartons.find((c) => c.id === cartonId);
  if (!order || !carton) {
    return { next: orders, patched: false };
  }

  return {
    next: applyInwardCartonScanned(orders, orderId, cartonId, scannedAt),
    patched: true,
  };
}
