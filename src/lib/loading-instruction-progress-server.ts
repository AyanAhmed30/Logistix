import type { createAdminClient } from "@/utils/supabase/server";
import {
  cartonNoLabel,
  deriveOrderLoadingStatus,
  orderNumberLabel,
  type CartonLoadingStatus,
  type CartonProgressDetail,
  type CartonScanTimelineEvent,
  type OrderLoadingProgressCounts,
  type OrderLoadingProgressRow,
} from "@/lib/loading-instruction-progress";

type AdminSupabase = Awaited<ReturnType<typeof createAdminClient>>;

type OrderInput = {
  id: string;
  username?: string;
  shipping_mark: string;
  destination_country?: string;
  item_description?: string | null;
  total_cartons: number;
  cartons?: Array<{
    id: string;
    carton_serial_number?: string | null;
    carton_index: number;
  }>;
};

type RawScan = {
  carton_id: string;
  scanned_at: string;
  scan_type: string | null;
  console_id: string | null;
  voided_at?: string | null;
  order_id?: string;
};

function latestByCarton(
  rows: RawScan[],
  predicate: (r: RawScan) => boolean
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!predicate(row)) continue;
    const prev = map.get(row.carton_id);
    if (!prev || new Date(row.scanned_at) > new Date(prev)) {
      map.set(row.carton_id, row.scanned_at);
    }
  }
  return map;
}

function cartonRemarks(status: CartonLoadingStatus): string {
  switch (status) {
    case "pending_inward":
      return "Awaiting 1st scan (inward)";
    case "inward":
      return "In warehouse — ready for outward (2nd scan)";
    case "outward":
      return "Loaded on container (2nd scan)";
    case "re_inward":
      return "Returned to warehouse (3rd scan)";
    default:
      return "";
  }
}

export async function fetchCartonScansForOrderIds(
  supabase: AdminSupabase,
  orderIds: string[]
): Promise<RawScan[]> {
  if (!orderIds.length) return [];

  const sel = await supabase
    .from("carton_scans")
    .select("carton_id, scanned_at, scan_type, console_id, voided_at, order_id")
    .in("order_id", orderIds);

  if (sel.error && /(scan_type|console_id|voided_at)/i.test(sel.error.message || "")) {
    const legacy = await supabase
      .from("carton_scans")
      .select("carton_id, scanned_at, order_id")
      .in("order_id", orderIds);
    return (legacy.data || []).map((r) => ({
      carton_id: r.carton_id as string,
      scanned_at: r.scanned_at as string,
      scan_type: "inward",
      console_id: null,
      voided_at: null,
      order_id: r.order_id as string | undefined,
    }));
  }
  if (sel.error) return [];
  return (sel.data || []) as RawScan[];
}

export function buildOrderLoadingProgressRowsFromScans(
  consoleId: string,
  consoleNumber: string,
  orders: OrderInput[],
  scanRows: RawScan[]
): OrderLoadingProgressRow[] {
  if (!orders.length) return [];

  const orderIdSet = new Set(orders.map((o) => o.id));
  const scopedScans = scanRows.filter((r) => r.order_id && orderIdSet.has(r.order_id));

  const inwardAt = latestByCarton(
    scopedScans,
    (r) => !r.scan_type || r.scan_type === "inward"
  );
  const outwardAt = latestByCarton(
    scopedScans,
    (r) => r.scan_type === "outward" && r.console_id === consoleId && !r.voided_at
  );
  const reInwardAt = latestByCarton(
    scopedScans,
    (r) =>
      (r.scan_type === "re_inward" || r.scan_type === "return") && r.console_id === consoleId
  );
  const inwardTimeline = latestByCarton(
    scopedScans,
    (r) => !r.scan_type || r.scan_type === "inward"
  );

  return orders.map((order) => buildSingleOrderProgressRow(
    consoleId,
    consoleNumber,
    order,
    inwardAt,
    outwardAt,
    reInwardAt,
    inwardTimeline
  ));
}

function buildSingleOrderProgressRow(
  consoleId: string,
  consoleNumber: string,
  order: OrderInput,
  inwardAt: Map<string, string>,
  outwardAt: Map<string, string>,
  reInwardAt: Map<string, string>,
  inwardTimeline: Map<string, string>
): OrderLoadingProgressRow {
  const total = order.total_cartons || (order.cartons?.length ?? 0);
  const sorted = [...(order.cartons ?? [])].sort((a, b) => a.carton_index - b.carton_index);
  const counts: OrderLoadingProgressCounts = {
    total,
    inward: 0,
    outward: 0,
    re_inward: 0,
    pending_inward: 0,
  };

  let lastActivity: string | null = null;
  const bump = (at: string | undefined) => {
    if (!at) return;
    if (!lastActivity || new Date(at) > new Date(lastActivity)) lastActivity = at;
  };

  const cartons: CartonProgressDetail[] = sorted.map((c) => {
    const inward = inwardAt.get(c.id);
    const outward = outwardAt.get(c.id);
    const reIn = reInwardAt.get(c.id);

    let current: CartonLoadingStatus = "pending_inward";
    if (reIn) {
      current = "re_inward";
      counts.re_inward += 1;
    } else if (outward) {
      current = "outward";
      counts.outward += 1;
    } else if (inward) {
      current = "inward";
      counts.inward += 1;
    } else {
      counts.pending_inward += 1;
    }

    bump(inward);
    bump(outward);
    bump(reIn);

    const timeline: CartonScanTimelineEvent[] = [];
    const inwardTime = inwardTimeline.get(c.id);
    if (inwardTime) {
      timeline.push({ type: "inward", scanned_at: inwardTime, label: "Inward" });
    }
    if (outward) {
      timeline.push({ type: "outward", scanned_at: outward, label: "Outward" });
    }
    if (reIn) {
      timeline.push({ type: "re_inward", scanned_at: reIn, label: "Re-Inward" });
    }
    timeline.sort(
      (a, b) => new Date(a.scanned_at).getTime() - new Date(b.scanned_at).getTime()
    );

    const lastCartonActivity =
      timeline.length > 0 ? timeline[timeline.length - 1].scanned_at : null;

    return {
      carton_id: c.id,
      carton_no: cartonNoLabel(c.carton_serial_number, c.carton_index, total),
      shipping_mark: order.shipping_mark,
      current_status: current,
      last_activity_at: lastCartonActivity,
      remarks: cartonRemarks(current),
      timeline,
    };
  });

  const status = deriveOrderLoadingStatus(counts);

  return {
    order_id: order.id,
    order_number: orderNumberLabel(order.id, order.shipping_mark),
    shipping_mark: order.shipping_mark || "—",
    username: order.username,
    console_id: consoleId,
    console_number: consoleNumber,
    loading_instruction_no: consoleNumber,
    destination_country: order.destination_country,
    item_description: order.item_description ?? null,
    counts,
    status,
    last_activity_at: lastActivity,
    cartons,
  };
}

export async function buildOrderLoadingProgressRows(
  supabase: AdminSupabase,
  consoleId: string,
  consoleNumber: string,
  orders: OrderInput[]
): Promise<OrderLoadingProgressRow[]> {
  if (!orders.length) return [];

  const orderIds = orders.map((o) => o.id);
  const scanRows = await fetchCartonScansForOrderIds(supabase, orderIds);
  return buildOrderLoadingProgressRowsFromScans(consoleId, consoleNumber, orders, scanRows);
}
