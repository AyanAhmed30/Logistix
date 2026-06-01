"use server";

import { createAdminClient } from "@/utils/supabase/server";
import { getSession } from "@/lib/auth/session";
import type { LoadingPhase } from "@/lib/loading-workflow-types";
import {
  canAcceptReturnScans,
  canAcceptReInwardScans,
  isOrderActiveOnConsole,
  logConsoleLoadingEvent,
  performCartonReInward,
  resolveLoadingConsoleById,
} from "@/lib/loading-workflow-server";
import { lookupCartonByScanIdentifier } from "@/lib/lookup-carton-by-scan-identifier";

type AdminSupabase = Awaited<ReturnType<typeof createAdminClient>>;

async function requireUserSession() {
  const session = await getSession();
  if (!session || session.role !== "user") {
    return { error: "Unauthorized" as const, session: null };
  }
  return { session, error: null };
}

async function requireAdminOrLoadingPermission() {
  const session = await getSession();
  if (!session) return { error: "Unauthorized" as const, session: null };

  if (session.role === "admin") return { session, error: null };

  if (session.role === "sales_agent") {
    const { hasPermission } = await import("@/lib/auth/permissions");
    const hasConsole = await hasPermission("console");
    const hasLoadingInstruction = await hasPermission("loading-instruction");
    if (hasConsole || hasLoadingInstruction) return { session, error: null };
  }

  return { error: "Unauthorized" as const, session: null };
}

export type ConsoleLoadingStats = {
  console_id: string;
  loading_phase: LoadingPhase | null;
  assigned_cartons: number;
  loaded_cartons: number;
  returned_cartons: number;
  pending_cartons: number;
  active_orders: number;
  released_orders: number;
  can_report_full: boolean;
  can_report_space: boolean;
  can_return_scan: boolean;
};

export async function getConsoleLoadingStats(
  supabase: AdminSupabase,
  consoleId: string,
  username?: string
): Promise<ConsoleLoadingStats | null> {
  const cons = await resolveLoadingConsoleById(supabase, consoleId);
  if (!cons) return null;

  const { data: links } = await supabase
    .from("console_orders")
    .select("order_id")
    .eq("console_id", consoleId);

  const orderIds = (links || []).map((l) => l.order_id as string).filter(Boolean);
  if (!orderIds.length) {
    const phase = cons.loading_phase;
    return {
      console_id: consoleId,
      loading_phase: phase,
      assigned_cartons: 0,
      loaded_cartons: 0,
      returned_cartons: 0,
      pending_cartons: 0,
      active_orders: 0,
      released_orders: 0,
      can_report_full: phase === "open",
      can_report_space: false,
      can_return_scan: canAcceptReturnScans(phase),
    };
  }

  let orderQuery = supabase
    .from("orders")
    .select("id, total_cartons, username")
    .in("id", orderIds);

  if (username) {
    orderQuery = orderQuery.eq("username", username);
  }

  const { data: orders } = await orderQuery;
  const filteredOrderIds = (orders || []).map((o) => o.id as string);

  let activeOrders = filteredOrderIds.length;
  let releasedOrders = 0;

  const { data: loadingRows } = await supabase
    .from("console_order_loading")
    .select("order_id, assignment_status")
    .eq("console_id", consoleId)
    .in("order_id", filteredOrderIds.length ? filteredOrderIds : ["00000000-0000-0000-0000-000000000000"]);

  if (loadingRows?.length) {
    activeOrders = 0;
    releasedOrders = 0;
    for (const row of loadingRows) {
      if (row.assignment_status === "released") releasedOrders += 1;
      else if (row.assignment_status === "active" || row.assignment_status === "fully_loaded") {
        activeOrders += 1;
      }
    }
  }

  let assignedCartons = 0;
  for (const o of orders || []) {
    assignedCartons += (o.total_cartons as number) || 0;
  }

  const { data: cartons } = await supabase
    .from("cartons")
    .select("id")
    .in("order_id", filteredOrderIds.length ? filteredOrderIds : ["00000000-0000-0000-0000-000000000000"]);

  const cartonIds = (cartons || []).map((c) => c.id as string);

  let loadedCartons = 0;
  let returnedCartons = 0;
  let outwardRows: { carton_id: string; voided_at: string | null }[] = [];
  let reInwardRows: { carton_id: string }[] = [];

  if (cartonIds.length) {
    const outwardRes = await supabase
      .from("carton_scans")
      .select("carton_id, voided_at")
      .eq("console_id", consoleId)
      .eq("scan_type", "outward")
      .in("carton_id", cartonIds);

    const reInwardRes = await supabase
      .from("carton_scans")
      .select("carton_id")
      .eq("console_id", consoleId)
      .in("scan_type", ["re_inward", "return"])
      .in("carton_id", cartonIds);

    outwardRows = (outwardRes.data || []) as typeof outwardRows;
    reInwardRows = (reInwardRes.data || []) as typeof reInwardRows;
    returnedCartons = reInwardRows.length;

    for (const row of outwardRows) {
      if (!row.voided_at) loadedCartons += 1;
    }
  }

  const phase = cons.loading_phase;
  let remainingNeedReInward = 0;
  if (cartonIds.length) {
    const outwardActiveSet = new Set(
      outwardRows.filter((r) => !r.voided_at).map((r) => r.carton_id)
    );
    const reInwardSet = new Set(reInwardRows.map((r) => r.carton_id));
    for (const cid of cartonIds) {
      if (outwardActiveSet.has(cid) && !reInwardSet.has(cid)) remainingNeedReInward += 1;
    }
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
    can_report_space: phase === "open" && assignedCartons > 0 && pendingOutward === 0 && loadedCartons > 0,
    can_return_scan: canAcceptReturnScans(phase) && remainingNeedReInward > 0,
  };
}

async function updateConsolePhase(supabase: AdminSupabase, consoleId: string, phase: LoadingPhase) {
  const { error } = await supabase
    .from("consoles")
    .update({ loading_phase: phase, updated_at: new Date().toISOString() })
    .eq("id", consoleId);

  if (error && /loading_phase/i.test(error.message || "")) {
    return {
      error:
        "Database is missing loading_phase on consoles. Apply migration add_console_loading_workflow.sql on Supabase.",
    };
  }
  if (error) return { error: error.message };
  return { success: true as const };
}

export async function reportConsoleFull(consoleId: string) {
  const auth = await requireUserSession();
  if (auth.error) return { error: auth.error };

  const supabase = await createAdminClient();
  const cons = await resolveLoadingConsoleById(supabase, consoleId);
  if (!cons) return { error: "Console not found or not ready for loading" };

  if (cons.loading_phase !== "open" && cons.loading_phase !== null) {
    return { error: "Container full can only be reported while loading is open." };
  }

  const phaseRes = await updateConsolePhase(supabase, consoleId, "full_reported");
  if ("error" in phaseRes) return phaseRes;

  await logConsoleLoadingEvent(supabase, {
    consoleId,
    eventType: "full_reported",
    actorUsername: auth.session!.username,
    actorRole: auth.session!.role,
  });

  const stats = await getConsoleLoadingStats(supabase, consoleId, auth.session!.username);
  return { success: true, stats };
}

export async function reportConsoleSpaceAvailable(consoleId: string) {
  const auth = await requireUserSession();
  if (auth.error) return { error: auth.error };

  const supabase = await createAdminClient();
  const cons = await resolveLoadingConsoleById(supabase, consoleId);
  if (!cons) return { error: "Console not found or not ready for loading" };

  const stats = await getConsoleLoadingStats(supabase, consoleId, auth.session!.username);
  if (!stats) return { error: "Unable to read loading stats" };

  if (stats.pending_cartons > 0) {
    return {
      error: `Still ${stats.pending_cartons} carton(s) not loaded on this console. Load or return them before reporting space.`,
    };
  }

  if (stats.loaded_cartons === 0) {
    return { error: "No cartons loaded yet on this console." };
  }

  const phaseRes = await updateConsolePhase(supabase, consoleId, "space_available");
  if ("error" in phaseRes) return phaseRes;

  await logConsoleLoadingEvent(supabase, {
    consoleId,
    eventType: "space_available",
    actorUsername: auth.session!.username,
    actorRole: auth.session!.role,
    payload: { loaded_cartons: stats.loaded_cartons },
  });

  const updated = await getConsoleLoadingStats(supabase, consoleId, auth.session!.username);
  return { success: true, stats: updated };
}

/** Third scan (same QR) — re-inward into warehouse after container full. */
export async function recordCartonReInwardScan(scanIdentifier: string, consoleId: string) {
  const auth = await requireUserSession();
  if (auth.error) return { error: auth.error };

  const trimmed = scanIdentifier.trim();
  if (!trimmed || !consoleId) {
    return { error: "Scan identifier and console are required" };
  }

  const supabase = await createAdminClient();
  const cons = await resolveLoadingConsoleById(supabase, consoleId);
  if (!cons) return { error: "Console not found or not ready for loading" };

  if (!canAcceptReInwardScans(cons.loading_phase)) {
    return { error: "Re-inward scans are not allowed while this console loading is closed." };
  }

  const recordSelect =
    "id, carton_serial_number, order_id, tracking_id, sticker_identifier, scan_token, orders(id, username)";
  const lookup = await lookupCartonByScanIdentifier(supabase, trimmed, recordSelect);
  const carton = lookup.data as {
    id: string;
    carton_serial_number: string;
    order_id: string;
    orders: { id: string; username: string }[] | { id: string; username: string } | null;
  } | null;

  if (lookup.error || !carton) {
    return { error: lookup.error?.message || "Carton not found" };
  }

  const ordersValue = carton.orders;
  const order =
    Array.isArray(ordersValue) && ordersValue.length > 0
      ? ordersValue[0]
      : !Array.isArray(ordersValue)
        ? ordersValue
        : null;

  if (!order || order.username !== auth.session!.username) {
    return { error: "This carton does not belong to your warehouse account" };
  }

  const { data: coLink } = await supabase
    .from("console_orders")
    .select("order_id")
    .eq("console_id", consoleId)
    .eq("order_id", order.id)
    .maybeSingle();

  if (!coLink) {
    return { error: "This carton is not on this loading instruction" };
  }

  const { data: inward } = await supabase
    .from("carton_scans")
    .select("id")
    .eq("carton_id", carton.id)
    .eq("username", order.username)
    .or("scan_type.eq.inward,scan_type.is.null")
    .limit(1)
    .maybeSingle();

  if (!inward?.id) {
    return { error: "Inward receipt not recorded for this carton" };
  }

  return performCartonReInward(supabase, {
    cartonId: carton.id,
    orderId: order.id,
    username: order.username,
    cartonSerial: carton.carton_serial_number,
    consoleId,
    actorUsername: auth.session!.username,
  });
}

/** @deprecated Use recordCartonReInwardScan */
export async function recordCartonReturnScan(scanIdentifier: string, consoleId: string) {
  return recordCartonReInwardScan(scanIdentifier, consoleId);
}

export async function releaseOrdersFromConsole(
  consoleId: string,
  orderIds: string[],
  reason?: string
) {
  const auth = await requireAdminOrLoadingPermission();
  if (auth.error) return { error: auth.error };

  if (!consoleId || !orderIds.length) {
    return { error: "Console and at least one order required" };
  }

  const supabase = await createAdminClient();
  const cons = await resolveLoadingConsoleById(supabase, consoleId);
  if (!cons) return { error: "Console not found or not in loading state" };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("console_order_loading")
    .update({
      assignment_status: "released",
      released_at: now,
      released_by: auth.session!.username,
      release_reason: reason?.trim() || "released_by_admin",
      updated_at: now,
    })
    .eq("console_id", consoleId)
    .in("order_id", orderIds);

  if (error && /console_order_loading/i.test(error.message || "")) {
    return {
      error:
        "Database is missing console_order_loading. Apply migration add_console_loading_workflow.sql on Supabase.",
    };
  }
  if (error) return { error: error.message };

  await logConsoleLoadingEvent(supabase, {
    consoleId,
    eventType: "orders_released",
    actorUsername: auth.session!.username,
    actorRole: auth.session!.role,
    payload: { order_ids: orderIds, reason: reason ?? null },
  });

  return { success: true };
}

export async function resumeConsoleLoading(consoleId: string) {
  const auth = await requireAdminOrLoadingPermission();
  if (auth.error) return { error: auth.error };

  const supabase = await createAdminClient();
  const cons = await resolveLoadingConsoleById(supabase, consoleId);
  if (!cons) return { error: "Console not found" };

  const phase = cons.loading_phase;
  if (phase !== "space_available" && phase !== "full_reported") {
    return { error: "Console is not waiting for resume (space available or full reported)." };
  }

  const phaseRes = await updateConsolePhase(supabase, consoleId, "open");
  if ("error" in phaseRes) return phaseRes;

  await logConsoleLoadingEvent(supabase, {
    consoleId,
    eventType: "loading_resumed",
    actorUsername: auth.session!.username,
    actorRole: auth.session!.role,
  });

  return { success: true };
}

export async function closeConsoleLoading(consoleId: string) {
  const auth = await requireAdminOrLoadingPermission();
  if (auth.error) return { error: auth.error };

  const supabase = await createAdminClient();
  const cons = await resolveLoadingConsoleById(supabase, consoleId);
  if (!cons) return { error: "Console not found" };

  const phaseRes = await updateConsolePhase(supabase, consoleId, "closed");
  if ("error" in phaseRes) return phaseRes;

  await logConsoleLoadingEvent(supabase, {
    consoleId,
    eventType: "loading_closed",
    actorUsername: auth.session!.username,
    actorRole: auth.session!.role,
  });

  return { success: true };
}

export async function getConsoleLoadingDetailForAdmin(consoleId: string) {
  const auth = await requireAdminOrLoadingPermission();
  if (auth.error) return { error: auth.error };

  const supabase = await createAdminClient();
  const { data: console, error: cErr } = await supabase
    .from("consoles")
    .select("*")
    .eq("id", consoleId)
    .single();

  if (cErr || !console) return { error: "Console not found" };

  const stats = await getConsoleLoadingStats(supabase, consoleId);
  const { data: loadingRows } = await supabase
    .from("console_order_loading")
    .select("order_id, assignment_status, released_at, release_reason")
    .eq("console_id", consoleId);

  const { data: events } = await supabase
    .from("console_loading_events")
    .select("event_type, actor_username, created_at, payload")
    .eq("console_id", consoleId)
    .order("created_at", { ascending: false })
    .limit(20);

  return {
    console,
    stats,
    orderLoading: loadingRows ?? [],
    events: events ?? [],
  };
}

export async function releaseUnloadedOrdersOnConsole(consoleId: string) {
  const auth = await requireAdminOrLoadingPermission();
  if (auth.error) return { error: auth.error };

  const supabase = await createAdminClient();
  const { data: links } = await supabase
    .from("console_orders")
    .select("order_id")
    .eq("console_id", consoleId);

  const orderIds = (links || []).map((l) => l.order_id as string);
  if (!orderIds.length) return { success: true, released: 0 };

  const { data: orders } = await supabase
    .from("orders")
    .select("id, total_cartons")
    .in("id", orderIds);

  const toRelease: string[] = [];

  for (const order of orders || []) {
    const oid = order.id as string;
    const active = await isOrderActiveOnConsole(supabase, consoleId, oid);
    if (!active) continue;

    const { data: cartons } = await supabase.from("cartons").select("id").eq("order_id", oid);
    const cartonIds = (cartons || []).map((c) => c.id as string);
    if (!cartonIds.length) {
      toRelease.push(oid);
      continue;
    }

    const { data: outward } = await supabase
      .from("carton_scans")
      .select("carton_id, voided_at")
      .eq("console_id", consoleId)
      .eq("scan_type", "outward")
      .in("carton_id", cartonIds);

    const loadedActive = new Set(
      (outward || []).filter((r) => !r.voided_at).map((r) => r.carton_id as string)
    );

    if (loadedActive.size === 0) {
      toRelease.push(oid);
    }
  }

  if (!toRelease.length) return { success: true, released: 0 };

  const res = await releaseOrdersFromConsole(
    consoleId,
    toRelease,
    "auto_release_unloaded_after_full"
  );
  if ("error" in res && res.error) return res;

  return { success: true, released: toRelease.length, orderIds: toRelease };
}
