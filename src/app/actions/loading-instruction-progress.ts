"use server";

import { createAdminClient } from "@/utils/supabase/server";
import { getSession } from "@/lib/auth/session";
import { getReadyForLoadingConsoles, getConsoleWithOrders } from "@/app/actions/consoles";
import type { ConsoleLoadingStats } from "@/app/actions/loading-workflow";
import {
  buildOrderLoadingProgressRowsFromScans,
  fetchCartonScansForOrderIds,
} from "@/lib/loading-instruction-progress-server";
import { canAcceptReturnScans } from "@/lib/loading-workflow-server";
import type { LoadingPhase } from "@/lib/loading-workflow-types";
import {
  summarizeOrderRows,
  type LoadingInstructionDashboardSummary,
  type OrderLoadingProgressRow,
} from "@/lib/loading-instruction-progress";

type OrderRow = {
  id: string;
  username: string;
  shipping_mark: string;
  destination_country: string;
  item_description: string | null;
  total_cartons: number;
  cartons: Array<{
    id: string;
    carton_serial_number?: string | null;
    carton_index: number;
  }>;
};

function computeConsoleStatsFromBatch(
  consoleId: string,
  phase: LoadingPhase | null,
  orders: OrderRow[],
  cartonIds: string[],
  scans: Awaited<ReturnType<typeof fetchCartonScansForOrderIds>>,
  loadingRows: Array<{ order_id: string; assignment_status: string }>
): ConsoleLoadingStats {
  let activeOrders = orders.length;
  let releasedOrders = 0;
  if (loadingRows.length) {
    activeOrders = 0;
    releasedOrders = 0;
    const orderIdSet = new Set(orders.map((o) => o.id));
    for (const row of loadingRows) {
      if (!orderIdSet.has(row.order_id)) continue;
      if (row.assignment_status === "released") releasedOrders += 1;
      else if (row.assignment_status === "active" || row.assignment_status === "fully_loaded") {
        activeOrders += 1;
      }
    }
  }

  let assignedCartons = 0;
  for (const o of orders) {
    assignedCartons += o.total_cartons || 0;
  }

  const consoleScans = scans.filter((s) => s.console_id === consoleId);
  const outwardRows = consoleScans.filter((s) => s.scan_type === "outward");
  const reInwardRows = consoleScans.filter(
    (s) => s.scan_type === "re_inward" || s.scan_type === "return"
  );

  let loadedCartons = 0;
  for (const row of outwardRows) {
    if (!row.voided_at && cartonIds.includes(row.carton_id)) loadedCartons += 1;
  }

  const returnedCartons = new Set(
    reInwardRows.filter((r) => cartonIds.includes(r.carton_id)).map((r) => r.carton_id)
  ).size;

  const outwardActiveSet = new Set(
    outwardRows.filter((r) => !r.voided_at && cartonIds.includes(r.carton_id)).map((r) => r.carton_id)
  );
  const reInwardSet = new Set(
    reInwardRows.filter((r) => cartonIds.includes(r.carton_id)).map((r) => r.carton_id)
  );

  let remainingNeedReInward = 0;
  for (const cid of cartonIds) {
    if (outwardActiveSet.has(cid) && !reInwardSet.has(cid)) remainingNeedReInward += 1;
  }

  const pendingOutward = Math.max(0, assignedCartons - loadedCartons);
  const pendingCartons = phase === "full_reported" ? remainingNeedReInward : pendingOutward;

  return {
    console_id: consoleId,
    loading_phase: phase,
    assigned_cartons: assignedCartons,
    loaded_cartons: loadedCartons,
    returned_cartons: returnedCartons,
    pending_cartons: pendingCartons,
    active_orders: activeOrders,
    released_orders: releasedOrders,
    can_report_full: phase === "open" && assignedCartons > 0,
    can_report_space:
      phase === "open" && assignedCartons > 0 && pendingOutward === 0 && loadedCartons > 0,
    can_return_scan: canAcceptReturnScans(phase) && remainingNeedReInward > 0,
  };
}

export async function getLoadingInstructionDashboardForUser() {
  try {
    const session = await getSession();
    if (!session || session.role !== "user") {
      return { error: "Unauthorized" };
    }

    const supabase = await createAdminClient();

    const { data: consoles, error: cErr } = await supabase
      .from("consoles")
      .select(
        "id, console_number, container_number, date, bl_number, carrier, so, total_cartons, total_cbm, status, loading_phase, created_at"
      )
      .eq("status", "ready_for_loading")
      .neq("loading_phase", "closed")
      .order("created_at", { ascending: false });

    if (cErr) return { error: cErr.message };

    const activeConsoles = consoles || [];
    if (!activeConsoles.length) {
      return { instructions: [], summary: summarizeOrderRows([]), orders: [] };
    }

    const consoleIds = activeConsoles.map((c) => c.id as string);

    const { data: allLinks, error: linksErr } = await supabase
      .from("console_orders")
      .select("console_id, order_id")
      .in("console_id", consoleIds);

    if (linksErr) return { error: linksErr.message };

    const orderIdsByConsole = new Map<string, string[]>();
    const allOrderIdSet = new Set<string>();
    for (const link of allLinks || []) {
      const cid = link.console_id as string;
      const oid = link.order_id as string;
      if (!oid) continue;
      allOrderIdSet.add(oid);
      const list = orderIdsByConsole.get(cid) ?? [];
      list.push(oid);
      orderIdsByConsole.set(cid, list);
    }

    const allOrderIds = Array.from(allOrderIdSet);
    if (!allOrderIds.length) {
      return { instructions: [], summary: summarizeOrderRows([]), orders: [] };
    }

    let { data: ordRows, error: ordErr } = await supabase
      .from("orders")
      .select(
        "id, username, shipping_mark, destination_country, total_cartons, item_description, created_at, cartons(id, carton_serial_number, carton_index)"
      )
      .eq("username", session.username)
      .in("id", allOrderIds);

    if (ordErr && /carton_serial_number/i.test(ordErr.message || "")) {
      const legacy = await supabase
        .from("orders")
        .select(
          "id, username, shipping_mark, destination_country, total_cartons, item_description, created_at, cartons(id, carton_index)"
        )
        .eq("username", session.username)
        .in("id", allOrderIds);
      ordRows = legacy.data as typeof ordRows;
      ordErr = legacy.error;
    }

    if (ordErr) return { error: ordErr.message };

    const ordersById = new Map<string, OrderRow>();
    for (const o of ordRows || []) {
      ordersById.set(o.id as string, o as OrderRow);
    }

    const [allScans, loadingRes] = await Promise.all([
      fetchCartonScansForOrderIds(supabase, allOrderIds),
      supabase
        .from("console_order_loading")
        .select("console_id, order_id, assignment_status")
        .in("console_id", consoleIds),
    ]);

    const loadingByConsole = new Map<string, Array<{ order_id: string; assignment_status: string }>>();
    for (const row of loadingRes.data || []) {
      const cid = row.console_id as string;
      const list = loadingByConsole.get(cid) ?? [];
      list.push({
        order_id: row.order_id as string,
        assignment_status: row.assignment_status as string,
      });
      loadingByConsole.set(cid, list);
    }

    const instructions: Array<{
      console: (typeof activeConsoles)[number];
      orders: OrderLoadingProgressRow[];
      stats: ConsoleLoadingStats;
    }> = [];

    const allProgressRows: OrderLoadingProgressRow[] = [];

    for (const cons of activeConsoles) {
      const cid = cons.id as string;
      const oids = (orderIdsByConsole.get(cid) ?? []).filter((id) => ordersById.has(id));
      if (!oids.length) continue;

      const consoleOrders = oids.map((id) => ordersById.get(id)!);
      const progressOrders = buildOrderLoadingProgressRowsFromScans(
        cid,
        cons.console_number as string,
        consoleOrders.map((o) => ({
          id: o.id,
          username: o.username,
          shipping_mark: o.shipping_mark,
          destination_country: o.destination_country,
          item_description: o.item_description,
          total_cartons: o.total_cartons,
          cartons: o.cartons,
        })),
        allScans
      );

      const cartonIds = consoleOrders.flatMap((o) => (o.cartons ?? []).map((c) => c.id));
      const phase = (cons.loading_phase ?? "open") as LoadingPhase;
      const stats = computeConsoleStatsFromBatch(
        cid,
        phase,
        consoleOrders,
        cartonIds,
        allScans,
        loadingByConsole.get(cid) ?? []
      );

      instructions.push({
        console: cons,
        orders: progressOrders,
        stats,
      });
      allProgressRows.push(...progressOrders);
    }

    const summary: LoadingInstructionDashboardSummary = summarizeOrderRows(allProgressRows);

    return { instructions, summary, orders: allProgressRows };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Unable to load loading instruction dashboard",
    };
  }
}

export async function getLoadingInstructionDashboardForAdmin() {
  try {
    const session = await getSession();
    if (!session) return { error: "Unauthorized" };

    if (session.role === "admin") {
      // ok
    } else if (session.role === "sales_agent") {
      const { hasPermission } = await import("@/lib/auth/permissions");
      const hasConsole = await hasPermission("console");
      const hasLoadingInstruction = await hasPermission("loading-instruction");
      if (!hasConsole && !hasLoadingInstruction) return { error: "Unauthorized" };
    } else {
      return { error: "Unauthorized" };
    }

    const consolesResult = await getReadyForLoadingConsoles();
    if ("error" in consolesResult) return { error: consolesResult.error };

    const supabase = await createAdminClient();
    const consoles = consolesResult.consoles || [];
    const allRows: OrderLoadingProgressRow[] = [];

    const consoleMeta: Array<{
      id: string;
      console_number: string;
      container_number: string;
      loading_phase: string | null;
      date: string;
      bl_number: string;
      carrier: string;
      so: string;
      total_cartons: number;
      total_cbm: number;
      created_at: string;
      updated_at: string;
      order_count: number;
    }> = [];

    const detailsList = await Promise.all(
      consoles.map((cons) => getConsoleWithOrders(cons.id, { onlyLatestSentToLoading: true }))
    );

    const orderIdsForScans = new Set<string>();
    const consoleOrderPairs: Array<{
      cons: (typeof consoles)[0];
      orders: OrderRow[];
    }> = [];

    for (let i = 0; i < consoles.length; i++) {
      const details = detailsList[i];
      if ("error" in details) continue;
      const orders = (details.orders || []) as OrderRow[];
      for (const o of orders) orderIdsForScans.add(o.id);
      consoleOrderPairs.push({ cons: consoles[i], orders });
    }

    const allScans = await fetchCartonScansForOrderIds(supabase, Array.from(orderIdsForScans));

    for (const { cons, orders } of consoleOrderPairs) {
      const progress = buildOrderLoadingProgressRowsFromScans(
        cons.id,
        cons.console_number,
        orders.map((o) => ({
          id: o.id,
          username: o.username,
          shipping_mark: o.shipping_mark,
          destination_country: o.destination_country,
          item_description: o.item_description,
          total_cartons: o.total_cartons,
          cartons: o.cartons,
        })),
        allScans
      );

      allRows.push(...progress);
      consoleMeta.push({
        id: cons.id,
        console_number: cons.console_number,
        container_number: cons.container_number,
        loading_phase: cons.loading_phase ?? null,
        date: cons.date,
        bl_number: cons.bl_number,
        carrier: cons.carrier,
        so: cons.so,
        total_cartons: cons.total_cartons,
        total_cbm: cons.total_cbm,
        created_at: cons.created_at,
        updated_at: cons.updated_at,
        order_count: progress.length,
      });
    }

    const summary = summarizeOrderRows(allRows);
    summary.total_consoles = consoleMeta.length;

    return {
      consoles: consoleMeta,
      orders: allRows,
      summary,
    };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Unable to load admin loading instruction dashboard",
    };
  }
}
