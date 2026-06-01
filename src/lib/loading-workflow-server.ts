import type { LoadingPhase } from "@/lib/loading-workflow-types";

export type AdminSupabase = {
  from: (table: string) => ReturnType<import("@supabase/supabase-js").SupabaseClient["from"]>;
};

export function normalizeLoadingPhase(phase: string | null | undefined): LoadingPhase | null {
  if (!phase) return null;
  if (phase === "open" || phase === "full_reported" || phase === "space_available" || phase === "closed") {
    return phase;
  }
  return null;
}

/** Outward scans allowed only when phase is open (null treated as open for legacy rows). */
export function canAcceptOutwardScans(phase: LoadingPhase | null): boolean {
  return phase === null || phase === "open";
}

export function canAcceptReturnScans(phase: LoadingPhase | null): boolean {
  return phase === "full_reported";
}

/** Re-inward (3rd scan): allowed after outward while loading is not closed. */
export function canAcceptReInwardScans(phase: LoadingPhase | null): boolean {
  return phase !== "closed";
}

export async function getLatestReInwardScan(
  supabase: AdminSupabase,
  cartonId: string,
  consoleId: string
) {
  const { data, error } = await supabase
    .from("carton_scans")
    .select("id, scanned_at")
    .eq("carton_id", cartonId)
    .eq("console_id", consoleId)
    .in("scan_type", ["re_inward", "return"])
    .order("scanned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { data: null, error };
  return { data, error: null };
}

export async function logConsoleLoadingEvent(
  supabase: AdminSupabase,
  params: {
    consoleId: string;
    eventType: string;
    actorUsername: string;
    actorRole: string;
    payload?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from("console_loading_events").insert({
    console_id: params.consoleId,
    event_type: params.eventType,
    actor_username: params.actorUsername,
    actor_role: params.actorRole,
    payload: params.payload ?? null,
  });
  if (error && !/console_loading_events/i.test(error.message || "")) {
    console.warn("[loading-workflow] event log failed:", error.message);
  }
}

export async function ensureConsoleOrderLoadingRows(
  supabase: AdminSupabase,
  consoleId: string,
  orderIds: string[]
) {
  if (!orderIds.length) return;
  const rows = orderIds.map((orderId) => ({
    console_id: consoleId,
    order_id: orderId,
    assignment_status: "active",
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("console_order_loading").upsert(rows, {
    onConflict: "console_id,order_id",
    ignoreDuplicates: false,
  });
  if (error && !/console_order_loading/i.test(error.message || "")) {
    throw new Error(error.message);
  }
}

export async function isOrderActiveOnConsole(
  supabase: AdminSupabase,
  consoleId: string,
  orderId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("console_order_loading")
    .select("assignment_status")
    .eq("console_id", consoleId)
    .eq("order_id", orderId)
    .maybeSingle();

  if (error && /console_order_loading/i.test(error.message || "")) {
    return true;
  }
  if (!data) return true;
  return data.assignment_status === "active";
}

type CartonOutwardConsoleRow = {
  console_id: string;
  consoles:
    | {
        id: string;
        console_number: string;
        status: string;
        loading_phase: string | null;
      }
    | {
        id: string;
        console_number: string;
        status: string;
        loading_phase: string | null;
      }[]
    | null;
};

/** Console where this carton has an active (non-voided) outward scan. */
export async function findCartonActiveOutwardConsole(
  supabase: AdminSupabase,
  cartonId: string,
  orderId: string
): Promise<ResolvedLoadingConsole | null> {
  const { data: rows, error } = await supabase
    .from("carton_scans")
    .select("console_id, consoles(id, console_number, container_number, status, loading_phase)")
    .eq("carton_id", cartonId)
    .eq("order_id", orderId)
    .eq("scan_type", "outward")
    .is("voided_at", null)
    .not("console_id", "is", null)
    .order("scanned_at", { ascending: false });

  if (error || !rows?.length) return null;

  for (const row of rows as CartonOutwardConsoleRow[]) {
    const raw = row.consoles;
    const cons = Array.isArray(raw) ? raw[0] : raw;
    if (!cons?.id || cons.status !== "ready_for_loading") continue;
    return {
      id: cons.id,
      console_number: cons.console_number,
      container_number: null,
      loading_phase: normalizeLoadingPhase(cons.loading_phase),
    };
  }
  return null;
}

/** Console where this carton has outward done and a 3rd scan should record re-inward. */
export async function findReInwardEligibleConsole(
  supabase: AdminSupabase,
  cartonId: string,
  orderId: string
): Promise<ResolvedLoadingConsole | null> {
  const outwardConsole = await findCartonActiveOutwardConsole(supabase, cartonId, orderId);
  if (!outwardConsole || !canAcceptReInwardScans(outwardConsole.loading_phase)) {
    return null;
  }
  return outwardConsole;
}

export async function getActiveOutwardScan(
  supabase: AdminSupabase,
  cartonId: string,
  consoleId: string
) {
  const { data, error } = await supabase
    .from("carton_scans")
    .select("id, scanned_at, voided_at")
    .eq("carton_id", cartonId)
    .eq("console_id", consoleId)
    .eq("scan_type", "outward")
    .is("voided_at", null)
    .order("scanned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { data: null, error };
  return { data, error: null };
}

export type ResolvedLoadingConsole = {
  id: string;
  console_number: string;
  container_number: string | null;
  loading_phase: LoadingPhase | null;
};

export async function resolveLoadingConsoleForOrder(
  supabase: AdminSupabase,
  orderId: string,
  options?: { forReturn?: boolean; forReInward?: boolean }
): Promise<ResolvedLoadingConsole | null> {
  const { data, error } = await supabase
    .from("console_orders")
    .select(
      "console_id, consoles(id, console_number, container_number, status, loading_phase, created_at)"
    )
    .eq("order_id", orderId);

  if (error || !data?.length) return null;

  type Cons = {
    id: string;
    console_number: string;
    container_number: string | null;
    status: string;
    loading_phase: string | null;
    created_at: string;
  };

  const candidates: Cons[] = [];
  for (const row of data) {
    const raw = row.consoles as Cons[] | Cons | null;
    const cons = Array.isArray(raw) ? raw[0] : raw;
    if (!cons || cons.status !== "ready_for_loading") continue;

    const phase = normalizeLoadingPhase(cons.loading_phase);
    if (options?.forReInward || options?.forReturn) {
      if (!canAcceptReInwardScans(phase)) continue;
    } else {
      if (!canAcceptOutwardScans(phase)) continue;
    }

    candidates.push(cons);
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const best = candidates[0];
  const active = await isOrderActiveOnConsole(supabase, best.id, orderId);
  if (!active && !options?.forReturn && !options?.forReInward) return null;

  return {
    id: best.id,
    console_number: best.console_number,
    container_number: best.container_number ?? null,
    loading_phase: normalizeLoadingPhase(best.loading_phase),
  };
}

export type ReInwardScanResult =
  | {
      success: true;
      duplicate: boolean;
      scanType: "re_inward";
      consoleId: string;
      carton: { id: string; order_id: string };
    }
  | { error: string };

/** Third scan (same QR): after inward + outward — carton returned to warehouse; voids outward, keeps inward. */
export async function performCartonReInward(
  supabase: AdminSupabase,
  params: {
    cartonId: string;
    orderId: string;
    username: string;
    cartonSerial: string;
    consoleId: string;
    actorUsername: string;
  }
): Promise<ReInwardScanResult> {
  const { cartonId, orderId, username, cartonSerial, consoleId, actorUsername } = params;

  const { data: priorReInward } = await getLatestReInwardScan(supabase, cartonId, consoleId);
  if (priorReInward?.id) {
    return {
      success: true,
      duplicate: true,
      scanType: "re_inward",
      consoleId,
      carton: { id: cartonId, order_id: orderId },
    };
  }

  const { data: activeOutward } = await getActiveOutwardScan(supabase, cartonId, consoleId);
  if (!activeOutward?.id) {
    return {
      error: "Outward scan is required before re-inward. Scan this carton for loading (2nd scan) first.",
    };
  }

  const now = new Date().toISOString();
  const { error: voidErr } = await supabase
    .from("carton_scans")
    .update({
      voided_at: now,
      voided_by: actorUsername,
      void_reason: "re_inward_return_to_warehouse",
    })
    .eq("id", activeOutward.id);

  if (voidErr && !/voided_at/i.test(voidErr.message || "")) {
    return { error: voidErr.message };
  }

  const insert = await supabase.from("carton_scans").insert({
    carton_id: cartonId,
    order_id: orderId,
    username,
    carton_serial_number: cartonSerial,
    scan_type: "re_inward",
    console_id: consoleId,
  });

  if (insert.error) {
    if (/scan_type/i.test(insert.error.message || "")) {
      return {
        error:
          "Database does not support re_inward scans yet. Run migration add_re_inward_scan_type.sql on Supabase.",
      };
    }
    if (insert.error.code === "23505") {
      return {
        success: true,
        duplicate: true,
        scanType: "re_inward",
        consoleId,
        carton: { id: cartonId, order_id: orderId },
      };
    }
    return { error: insert.error.message };
  }

  await logConsoleLoadingEvent(supabase, {
    consoleId,
    eventType: "carton_re_inward",
    actorUsername,
    actorRole: "user",
    payload: { carton_id: cartonId, order_id: orderId },
  });

  return {
    success: true,
    duplicate: false,
    scanType: "re_inward",
    consoleId,
    carton: { id: cartonId, order_id: orderId },
  };
}

export async function resolveLoadingConsoleById(
  supabase: AdminSupabase,
  consoleId: string
): Promise<ResolvedLoadingConsole | null> {
  const { data, error } = await supabase
    .from("consoles")
    .select("id, console_number, container_number, status, loading_phase")
    .eq("id", consoleId)
    .maybeSingle();

  if (error || !data || data.status !== "ready_for_loading") return null;

  return {
    id: data.id as string,
    console_number: data.console_number as string,
    container_number: (data.container_number as string | null) ?? null,
    loading_phase: normalizeLoadingPhase(data.loading_phase as string | null),
  };
}
