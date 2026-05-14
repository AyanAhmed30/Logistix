"use server";

import { createAdminClient } from "@/utils/supabase/server";
import { getSession } from "@/lib/auth/session";

type CartonInput = {
  carton_serial_number: string;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  dimension_unit: "cm" | "m" | "mm";
  carton_index: number;
};

type OrderInput = {
  shipping_mark: string;
  destination_country: string;
  total_cartons: number;
  item_description: string;
};

export async function getNextCartonSerial() {
  try {
    const supabase = await createAdminClient();
    const { data, error } = await supabase.rpc("next_carton_serial");
    if (error || data === null || data === undefined) {
      return { error: error?.message || "Unable to generate serial number" };
    }

    const serial = String(data).padStart(7, "0");
    return { serial };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred while generating serial number" };
  }
}

export async function createOrderWithCartons(order: OrderInput, cartons: CartonInput[]) {
  try {
    const session = await getSession();
    if (!session || session.role !== "user") {
      return { error: "Unauthorized" };
    }

    if (!order.shipping_mark?.trim()) {
      return { error: "Shipping mark is required" };
    }

    if (!order.destination_country?.trim()) {
      return { error: "Destination country is required" };
    }

    if (!order.total_cartons || order.total_cartons < 1) {
      return { error: "Total cartons must be at least 1" };
    }

    if (cartons.length !== order.total_cartons) {
      return { error: "Total cartons must match the number of cartons" };
    }

    const supabase = await createAdminClient();
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .insert({
        username: session.username,
        shipping_mark: order.shipping_mark,
        destination_country: order.destination_country,
        total_cartons: order.total_cartons,
        item_description: order.item_description,
      })
      .select("id")
      .single();

    if (orderError || !orderData?.id) {
      return { error: orderError?.message || "Unable to create order" };
    }

    const cartonsPayload = cartons.map((carton) => ({
      ...carton,
      order_id: orderData.id,
      tracking_id: `TRK-${carton.carton_serial_number}`,
      scan_token: crypto.randomUUID(),
      sticker_identifier: carton.carton_serial_number,
    }));

    let { data: cartonData, error: cartonError } = await supabase
      .from("cartons")
      .insert(cartonsPayload)
      .select(
        "id, carton_serial_number, weight, length, width, height, carton_index, order_id, tracking_id, scan_token, sticker_identifier"
      );

    if (cartonError && /(tracking_id|scan_token|sticker_identifier)/i.test(cartonError.message || "")) {
      const legacyPayload = cartons.map((carton) => ({
        ...carton,
        order_id: orderData.id,
      }));

      const legacyInsert = await supabase
        .from("cartons")
        .insert(legacyPayload)
        .select("id, carton_serial_number, weight, length, width, height, carton_index, order_id");

      cartonData = legacyInsert.data as typeof cartonData;
      cartonError = legacyInsert.error;
    }

    if (cartonError) {
      await supabase.from("orders").delete().eq("id", orderData.id);
      return { error: cartonError.message };
    }

    return {
      orderId: orderData.id as string,
      cartons: cartonData ?? [],
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred while creating order" };
  }
}

export async function getOrderHistory() {
  try {
    const session = await getSession();
    if (!session || session.role !== "user") {
      return { error: "Unauthorized" };
    }

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("orders")
      .select(
      "id, shipping_mark, destination_country, total_cartons, item_description, created_at, cartons:cartons(id, carton_serial_number, weight, length, width, height, dimension_unit, carton_index, created_at)"
      )
      .eq("username", session.username)
      .order("created_at", { ascending: false })
      .order("carton_index", { ascending: true, referencedTable: "cartons" });

    if (error) {
      return { error: error.message };
    }

    return { orders: data ?? [] };
  } catch {
    return { error: "Unable to load orders" };
  }
}

export async function getAllOrdersForAdmin() {
  try {
    const session = await getSession();
    if (!session) {
      return { error: "Unauthorized" };
    }

    // Allow admins or sales agents with "management" or "tracking" permission
    // (tracking is read-only, management includes write access)
    if (session.role === "admin") {
      // Admin has access
    } else if (session.role === "sales_agent") {
      const { hasPermission } = await import("@/lib/auth/permissions");
      const hasManagement = await hasPermission("management");
      const hasTracking = await hasPermission("tracking");
      if (!hasManagement && !hasTracking) {
        return { error: "Unauthorized" };
      }
    } else {
      return { error: "Unauthorized" };
    }

    const supabase = await createAdminClient();
    
    // Get all order IDs that are already assigned to consoles
    const { data: assignedOrders, error: assignedError } = await supabase
      .from("console_orders")
      .select("order_id");

    if (assignedError) {
      return { error: assignedError.message };
    }

    const assignedOrderIds = new Set(assignedOrders?.map((co) => co.order_id) || []);

    // Get all orders
    const { data: allOrders, error } = await supabase
      .from("orders")
      .select(
        "id, username, shipping_mark, destination_country, total_cartons, item_description, created_at, cartons:cartons(weight, length, width, height, carton_index)"
      )
      .order("created_at", { ascending: false });

    if (error) {
      return { error: error.message };
    }

    // Filter out orders that are already assigned to consoles
    const unassignedOrders = (allOrders || []).filter(
      (order) => !assignedOrderIds.has(order.id)
    );

    return { orders: unassignedOrders };
  } catch {
    return { error: "Unable to load orders" };
  }
}

export async function getAdminNotifications() {
  try {
    const session = await getSession();
    if (!session) {
      return { error: "Unauthorized" };
    }

    // Allow admins or sales agents with "notifications" permission
    if (session.role === "admin") {
      // Admin has access
    } else if (session.role === "sales_agent") {
      const { hasPermission } = await import("@/lib/auth/permissions");
      const hasAccess = await hasPermission("notifications");
      if (!hasAccess) {
        return { error: "Unauthorized" };
      }
    } else {
      return { error: "Unauthorized" };
    }

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("orders")
      .select("id, username, shipping_mark, total_cartons, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return { error: error.message };
    }

    return { notifications: data ?? [] };
  } catch {
    return { error: "Unable to load notifications" };
  }
}

export async function getCartonBySerial(serial: string) {
  try {
    if (!serial?.trim()) {
      return { error: "Serial number is required" };
    }

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("cartons")
      .select(
        "id, carton_serial_number, tracking_id, sticker_identifier, weight, length, width, height, dimension_unit, carton_index, item_description, destination_country, created_at, orders!inner(id, shipping_mark, item_description, destination_country, total_cartons, created_at, username)"
      )
      .eq("carton_serial_number", serial.trim())
      .single();

    if (error) {
      return { error: error.message || "Carton not found" };
    }

    if (!data) {
      return { error: "Carton not found" };
    }

    return { carton: data };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unable to load carton details" };
  }
}

type AdminSupabase = Awaited<ReturnType<typeof createAdminClient>>;

/** One QR URL for all scans: server picks outward when inward exists and this order is on a ready-for-loading console. */
async function resolveReadyLoadingConsoleForOrder(
  supabase: AdminSupabase,
  orderId: string
): Promise<{ id: string; console_number: string } | null> {
  const { data, error } = await supabase
    .from("console_orders")
    .select("console_id, consoles(id, console_number, status, created_at)")
    .eq("order_id", orderId);

  if (error || !data?.length) {
    return null;
  }

  type Cons = { id: string; console_number: string; status: string; created_at: string };
  const candidates: Cons[] = [];
  for (const row of data) {
    const raw = row.consoles as Cons[] | Cons | null;
    const cons = Array.isArray(raw) ? raw[0] : raw;
    if (!cons || cons.status !== "ready_for_loading") continue;
    candidates.push(cons);
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const best = candidates[0];
  return { id: best.id, console_number: best.console_number };
}

export async function getCartonScanPreview(scanIdentifier: string) {
  try {
    if (!scanIdentifier?.trim()) {
      return { error: "Scan token is required" };
    }

    const trimmed = scanIdentifier.trim();
    const supabase = await createAdminClient();

    const selectQuery =
      "id, carton_serial_number, order_id, tracking_id, sticker_identifier, scan_token, scan_status, scanned_at, orders(id, shipping_mark, destination_country, item_description, total_cartons, created_at, username)";

    type PreviewLookupCarton = {
      id: string;
      carton_serial_number: string;
      order_id: string;
      tracking_id?: string | null;
      sticker_identifier?: string | null;
      scan_token?: string | null;
      scan_status?: string | null;
      scanned_at?: string | null;
      orders:
        | { id: string; shipping_mark: string; destination_country: string; item_description: string | null; total_cartons: number; created_at: string; username: string }[]
        | { id: string; shipping_mark: string; destination_country: string; item_description: string | null; total_cartons: number; created_at: string; username: string }
        | null;
    };

    let carton: PreviewLookupCarton | null = null;
    let lookupError: { message?: string } | null = null;

    const tokenLookup = await supabase.from("cartons").select(selectQuery).eq("scan_token", trimmed).maybeSingle();
    if (!tokenLookup.error && tokenLookup.data) {
      carton = tokenLookup.data as PreviewLookupCarton;
    } else {
      lookupError = tokenLookup.error;
      const serialLookup = await supabase
        .from("cartons")
        .select(selectQuery)
        .eq("carton_serial_number", trimmed)
        .maybeSingle();
      carton = serialLookup.data as PreviewLookupCarton;
      lookupError = serialLookup.error;
    }

    // Backward compatibility if scan_status/scanned_at columns are not available yet
    if (lookupError && /(scan_status|scanned_at)/i.test(lookupError.message || "")) {
      const legacySelect =
        "id, carton_serial_number, order_id, tracking_id, sticker_identifier, scan_token, orders(id, shipping_mark, destination_country, item_description, total_cartons, created_at, username)";

      const tokenLookupLegacy = await supabase
        .from("cartons")
        .select(legacySelect)
        .eq("scan_token", trimmed)
        .maybeSingle();
      if (!tokenLookupLegacy.error && tokenLookupLegacy.data) {
        carton = tokenLookupLegacy.data as PreviewLookupCarton;
        lookupError = null;
      } else {
        const serialLookupLegacy = await supabase
          .from("cartons")
          .select(legacySelect)
          .eq("carton_serial_number", trimmed)
          .maybeSingle();
        carton = serialLookupLegacy.data as PreviewLookupCarton;
        lookupError = serialLookupLegacy.error;
      }
    }

    if (lookupError || !carton) {
      return { error: lookupError?.message || "Carton not found" };
    }

    const ordersValue = carton.orders;
    const order =
      Array.isArray(ordersValue) && ordersValue.length > 0
        ? ordersValue[0]
        : !Array.isArray(ordersValue)
          ? ordersValue
          : null;
    if (!order) {
      return { error: "Order not found for this carton" };
    }

    const { data: inwardRow } = await supabase
      .from("carton_scans")
      .select("id, scanned_at")
      .eq("carton_id", carton.id)
      .eq("username", order.username)
      .or("scan_type.eq.inward,scan_type.is.null")
      .order("scanned_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const inwardDone = Boolean(inwardRow?.id);
    const targetConsole = inwardDone ? await resolveReadyLoadingConsoleForOrder(supabase, order.id) : null;

    let scanMode: "inward" | "outward" = "inward";
    let consoleNumber: string | null = null;
    let resolvedConsoleId: string | null = null;
    let alreadyScanned = false;
    let resolvedScannedAt: string | null = null;
    let scanStatusLabel = carton.scan_status ?? "pending";
    let blockingMessage: string | null = null;

    if (!inwardDone) {
      const { data: latestInward } = await supabase
        .from("carton_scans")
        .select("scanned_at")
        .eq("carton_id", carton.id)
        .eq("username", order.username)
        .or("scan_type.eq.inward,scan_type.is.null")
        .order("scanned_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      resolvedScannedAt = carton.scanned_at ?? latestInward?.scanned_at ?? null;
      alreadyScanned = Boolean(resolvedScannedAt);
      scanStatusLabel = carton.scan_status ?? (alreadyScanned ? "scanned" : "pending");
      scanMode = "inward";
    } else if (!targetConsole) {
      scanMode = "outward";
      resolvedScannedAt = inwardRow?.scanned_at ?? null;
      alreadyScanned = false;
      blockingMessage =
        "Receipt (inward) is already recorded. There is no open loading console for this order yet. Use this same QR again after admin marks your console as ready for loading.";
      scanStatusLabel = "inward_complete";
    } else {
      resolvedConsoleId = targetConsole.id;
      consoleNumber = targetConsole.console_number;

      const { data: outwardRow } = await supabase
        .from("carton_scans")
        .select("scanned_at")
        .eq("carton_id", carton.id)
        .eq("console_id", resolvedConsoleId)
        .eq("scan_type", "outward")
        .order("scanned_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      resolvedScannedAt = outwardRow?.scanned_at ?? null;
      alreadyScanned = Boolean(resolvedScannedAt);
      scanMode = "outward";
      scanStatusLabel = alreadyScanned ? "outward_scanned" : "outward_pending";
    }

    return {
      preview: {
        scan_identifier: trimmed,
        scan_mode: scanMode,
        console_id: resolvedConsoleId,
        console_number: consoleNumber,
        blocking_message: blockingMessage,
        order_id: order.id,
        shipping_mark: order.shipping_mark,
        destination_country: order.destination_country,
        item_description: order.item_description,
        total_cartons: order.total_cartons,
        carton_serial_number: carton.carton_serial_number,
        tracking_id: carton.tracking_id ?? `TRK-${carton.carton_serial_number}`,
        sticker_identifier: carton.sticker_identifier ?? carton.carton_serial_number,
        scan_status: scanStatusLabel,
        scanned_at: resolvedScannedAt,
        already_scanned: alreadyScanned,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unable to load scan preview" };
  }
}

export type RecordCartonScanOptions = {
  /** @deprecated Server auto-detects inward vs outward from the same QR. */
  scanType?: "inward" | "outward";
  /** @deprecated Console is resolved from open loading assignments. */
  consoleId?: string;
};

export async function recordCartonScan(scanIdentifier: string, _options?: RecordCartonScanOptions) {
  try {
    if (!scanIdentifier?.trim()) {
      return { error: "Scan token is required" };
    }

    const trimmed = scanIdentifier.trim();
    const supabase = await createAdminClient();

    // Prefer token lookup (secure / non-guessable), then fallback to serial for backward compatibility.
    type CartonLookup = {
      id: string;
      carton_serial_number: string;
      order_id: string;
      tracking_id?: string | null;
      sticker_identifier?: string | null;
      scan_token?: string | null;
      orders: { id: string; username: string }[] | { id: string; username: string } | null;
    };

    let carton: CartonLookup | null = null;
    let cartonError: { message?: string } | null = null;

    const tokenLookup = await supabase
      .from("cartons")
      .select("id, carton_serial_number, order_id, tracking_id, sticker_identifier, scan_token, orders(id, username)")
      .eq("scan_token", trimmed)
      .maybeSingle();

    if (!tokenLookup.error && tokenLookup.data) {
      carton = tokenLookup.data as CartonLookup;
    } else {
      cartonError = tokenLookup.error;
      const serialLookup = await supabase
        .from("cartons")
        .select("id, carton_serial_number, order_id, tracking_id, sticker_identifier, scan_token, orders(id, username)")
        .eq("carton_serial_number", trimmed)
        .single();
      carton = serialLookup.data as CartonLookup;
      cartonError = serialLookup.error;
    }

    if (cartonError || !carton) {
      return { error: cartonError?.message || "Carton not found" };
    }

    type CartonWithOrder = {
      id: string;
      carton_serial_number: string;
      order_id: string;
      tracking_id?: string | null;
      sticker_identifier?: string | null;
      scan_token?: string | null;
      orders: { id: string; username: string }[] | { id: string; username: string } | null;
    };

    const typedCarton = carton as unknown as CartonWithOrder;
    const ordersValue = typedCarton.orders;
    const order =
      Array.isArray(ordersValue) && ordersValue.length > 0
        ? ordersValue[0]
        : !Array.isArray(ordersValue)
          ? ordersValue
          : null;
    if (!order) {
      return { error: "Order not found for this carton" };
    }

    const buildCartonPayload = () => ({
      id: typedCarton.id,
      order_id: typedCarton.order_id,
      serial: typedCarton.carton_serial_number,
      tracking_id: typedCarton.tracking_id ?? `TRK-${typedCarton.carton_serial_number}`,
      sticker_identifier: typedCarton.sticker_identifier ?? typedCarton.carton_serial_number,
    });

    const { data: existingInward } = await supabase
      .from("carton_scans")
      .select("id")
      .eq("carton_id", carton.id)
      .eq("username", order.username)
      .or("scan_type.eq.inward,scan_type.is.null")
      .order("scanned_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!existingInward?.id) {
      const inwardInsert = {
        carton_id: carton.id,
        order_id: order.id,
        username: order.username,
        carton_serial_number: carton.carton_serial_number,
        scan_type: "inward" as const,
        console_id: null as string | null,
      };

      let ins = await supabase.from("carton_scans").insert(inwardInsert);
      if (ins.error && /scan_type/i.test(ins.error.message || "")) {
        ins = await supabase.from("carton_scans").insert({
          carton_id: carton.id,
          order_id: order.id,
          username: order.username,
          carton_serial_number: carton.carton_serial_number,
        });
      }
      if (ins.error) {
        if (ins.error.code === "23505") {
          return {
            success: true,
            duplicate: true,
            scanType: "inward" as const,
            consoleId: null as string | null,
            carton: buildCartonPayload(),
          };
        }
        return { error: ins.error.message };
      }

      const statusUpdate = await supabase
        .from("cartons")
        .update({
          scan_status: "scanned",
          scanned_at: new Date().toISOString(),
          scanned_by: order.username,
        })
        .eq("id", carton.id);
      if (statusUpdate.error && !/(scan_status|scanned_at|scanned_by)/i.test(statusUpdate.error.message || "")) {
        return { error: statusUpdate.error.message };
      }

      return {
        success: true,
        duplicate: false,
        scanType: "inward" as const,
        consoleId: null as string | null,
        carton: buildCartonPayload(),
      };
    }

    const targetConsole = await resolveReadyLoadingConsoleForOrder(supabase, order.id);
    if (!targetConsole) {
      return {
        error:
          "Receipt (inward) is already recorded. There is no open loading console for this order yet. Keep using this same QR after admin marks your console as ready for loading.",
      };
    }

    const { data: existingOutward } = await supabase
      .from("carton_scans")
      .select("id")
      .eq("carton_id", carton.id)
      .eq("console_id", targetConsole.id)
      .eq("scan_type", "outward")
      .maybeSingle();

    if (existingOutward?.id) {
      return {
        success: true,
        duplicate: true,
        scanType: "outward" as const,
        consoleId: targetConsole.id,
        carton: buildCartonPayload(),
      };
    }

    const outwardInsert = {
      carton_id: carton.id,
      order_id: order.id,
      username: order.username,
      carton_serial_number: carton.carton_serial_number,
      scan_type: "outward" as const,
      console_id: targetConsole.id,
    };

    let insertRes = await supabase.from("carton_scans").insert(outwardInsert);
    if (insertRes.error && /(scan_type|console_id)/i.test(insertRes.error.message || "")) {
      return {
        error:
          "Database is missing outward scan columns (scan_type / console_id). Apply the latest migration on Supabase, then retry.",
      };
    }
    if (insertRes.error) {
      if (insertRes.error.code === "23505") {
        return {
          success: true,
          duplicate: true,
          scanType: "outward" as const,
          consoleId: targetConsole.id,
          carton: buildCartonPayload(),
        };
      }
      return { error: insertRes.error.message };
    }

    return {
      success: true,
      duplicate: false,
      scanType: "outward" as const,
      consoleId: targetConsole.id,
      carton: buildCartonPayload(),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unable to record carton scan" };
  }
}

export type OrderScanProgressCarton = {
  id: string;
  carton_serial_number: string;
  carton_index: number;
  sticker_label: string;
  scanned: boolean;
  scanned_at: string | null;
  state: "pending" | "scanned" | "missing";
};

export type OrderScanProgressRow = {
  id: string;
  shipping_mark: string;
  destination_country: string;
  total_cartons: number;
  item_description: string | null;
  created_at: string;
  scanned_count: number;
  pending_count: number;
  cartons: OrderScanProgressCarton[];
  outward?: {
    console_id: string;
    console_number: string;
    container_number: string | null;
    scanned_count: number;
    pending_count: number;
    cartons: OrderScanProgressCarton[];
  } | null;
};

export async function getLoadingInstructionsForUser() {
  try {
    const session = await getSession();
    if (!session || session.role !== "user") {
      return { error: "Unauthorized" };
    }

    const supabase = await createAdminClient();

    const { data: consoles, error: cErr } = await supabase
      .from("consoles")
      .select(
        "id, console_number, container_number, date, bl_number, carrier, so, total_cartons, total_cbm, status, created_at"
      )
      .eq("status", "ready_for_loading")
      .order("created_at", { ascending: false });

    if (cErr) {
      return { error: cErr.message };
    }

    type InstructionOrder = {
      id: string;
      shipping_mark: string;
      destination_country: string;
      total_cartons: number;
      item_description: string | null;
      created_at: string;
      cartons: Array<{
        id: string;
        carton_serial_number: string;
        carton_index: number;
        scan_token: string | null;
        tracking_id?: string | null;
        sticker_identifier?: string | null;
        weight: number | null;
        length: number | null;
        width: number | null;
        height: number | null;
        dimension_unit: string | null;
      }>;
    };

    const instructions: Array<{
      console: (typeof consoles)[0];
      orders: InstructionOrder[];
    }> = [];

    for (const cons of consoles || []) {
      const { data: links } = await supabase.from("console_orders").select("order_id").eq("console_id", cons.id);
      const oids = (links || []).map((l) => l.order_id as string).filter(Boolean);
      if (!oids.length) continue;

      let { data: ordRows, error: ordErr } = await supabase
        .from("orders")
        .select(
          "id, shipping_mark, destination_country, total_cartons, item_description, created_at, cartons(id, carton_serial_number, carton_index, scan_token, tracking_id, sticker_identifier, weight, length, width, height, dimension_unit)"
        )
        .eq("username", session.username)
        .in("id", oids)
        .order("created_at", { ascending: false })
        .order("carton_index", { ascending: true, referencedTable: "cartons" });

      if (ordErr && /scan_token|tracking_id|sticker_identifier/i.test(ordErr.message || "")) {
        const legacy = await supabase
          .from("orders")
          .select(
            "id, shipping_mark, destination_country, total_cartons, item_description, created_at, cartons(id, carton_serial_number, carton_index, scan_token, weight, length, width, height, dimension_unit)"
          )
          .eq("username", session.username)
          .in("id", oids)
          .order("created_at", { ascending: false })
          .order("carton_index", { ascending: true, referencedTable: "cartons" });
        ordRows = legacy.data as typeof ordRows;
        ordErr = legacy.error;
      }
      if (ordErr || !ordRows?.length) continue;

      instructions.push({
        console: cons,
        orders: ordRows as InstructionOrder[],
      });
    }

    return { instructions };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unable to load loading instructions" };
  }
}

export async function getOrderScanProgressForUser() {
  try {
    const session = await getSession();
    if (!session || session.role !== "user") {
      return { error: "Unauthorized" };
    }

    const supabase = await createAdminClient();
    const orderLimit = 40;

    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select(
        "id, shipping_mark, destination_country, total_cartons, item_description, created_at, cartons(id, carton_serial_number, carton_index)"
      )
      .eq("username", session.username)
      .order("created_at", { ascending: false })
      .order("carton_index", { ascending: true, referencedTable: "cartons" })
      .limit(orderLimit);

    if (ordersError) {
      return { error: ordersError.message };
    }

    if (!orders || orders.length === 0) {
      return { orders: [] as OrderScanProgressRow[] };
    }

    const orderIds = orders.map((o) => o.id as string);

    let scanRows: { carton_id: string; scanned_at: string; scan_type?: string | null; console_id?: string | null; order_id?: string }[] =
      [];
    const scanSelect = await supabase
      .from("carton_scans")
      .select("carton_id, scanned_at, scan_type, console_id, order_id")
      .eq("username", session.username)
      .in("order_id", orderIds);

    if (scanSelect.error && /(scan_type|console_id)/i.test(scanSelect.error.message || "")) {
      const legacy = await supabase
        .from("carton_scans")
        .select("carton_id, scanned_at, order_id")
        .eq("username", session.username)
        .in("order_id", orderIds);
      if (legacy.error) {
        return { error: legacy.error.message };
      }
      scanRows = (legacy.data || []).map((r) => ({
        carton_id: r.carton_id as string,
        scanned_at: r.scanned_at as string,
        scan_type: "inward",
        console_id: null,
        order_id: r.order_id as string,
      }));
    } else if (scanSelect.error) {
      return { error: scanSelect.error.message };
    } else {
      scanRows = (scanSelect.data || []) as typeof scanRows;
    }

    const scannedAtByCartonIdInward = new Map<string, string>();
    for (const row of scanRows) {
      if (row.scan_type === "outward") continue;
      const cid = row.carton_id;
      const at = row.scanned_at;
      const prev = scannedAtByCartonIdInward.get(cid);
      if (!prev || new Date(at) > new Date(prev)) {
        scannedAtByCartonIdInward.set(cid, at);
      }
    }

    const { data: coRows, error: coErr } = await supabase
      .from("console_orders")
      .select("order_id, console_id, consoles(id, console_number, container_number, status)")
      .in("order_id", orderIds);

    if (coErr) {
      return { error: coErr.message };
    }

    type ConsoleMeta = { console_id: string; console_number: string; container_number: string | null };
    const outwardConsoleByOrder = new Map<string, ConsoleMeta>();
    for (const row of coRows || []) {
      const oid = row.order_id as string;
      const rawCons = row.consoles;
      const cons = Array.isArray(rawCons) ? rawCons[0] : rawCons;
      const c = cons as { id: string; console_number: string; container_number: string; status: string } | null;
      if (!c || c.status !== "ready_for_loading") continue;
      if (!outwardConsoleByOrder.has(oid)) {
        outwardConsoleByOrder.set(oid, {
          console_id: c.id,
          console_number: c.console_number,
          container_number: c.container_number ?? null,
        });
      }
    }

    const outwardKeys = Array.from(new Set(Array.from(outwardConsoleByOrder.values()).map((v) => v.console_id)));
    const outwardScannedAt = new Map<string, string>();
    if (outwardKeys.length > 0) {
      const outSel = await supabase
        .from("carton_scans")
        .select("carton_id, scanned_at, console_id, order_id, scan_type")
        .eq("username", session.username)
        .eq("scan_type", "outward")
        .in("order_id", orderIds)
        .in("console_id", outwardKeys);

      if (!outSel.error && outSel.data) {
        for (const r of outSel.data) {
          const key = `${r.order_id}:${r.console_id}:${r.carton_id}`;
          const at = r.scanned_at as string;
          const prev = outwardScannedAt.get(key);
          if (!prev || new Date(at) > new Date(prev)) {
            outwardScannedAt.set(key, at);
          }
        }
      }
    }

    const lateHours = 24;
    const now = Date.now();

    const rows: OrderScanProgressRow[] = orders.map((order) => {
      const total = order.total_cartons as number;
      const rawCartons = (order.cartons ?? []) as {
        id: string;
        carton_serial_number: string;
        carton_index: number;
      }[];
      const sorted = [...rawCartons].sort((a, b) => a.carton_index - b.carton_index);

      let scannedCount = 0;
      const cartons: OrderScanProgressCarton[] = sorted.map((c) => {
        const scannedAt = scannedAtByCartonIdInward.get(c.id) ?? null;
        const scanned = Boolean(scannedAt);
        if (scanned) scannedCount += 1;

        const hoursSinceOrder =
          (now - new Date(order.created_at as string).getTime()) / (1000 * 60 * 60);
        const isLate = !scanned && hoursSinceOrder >= lateHours;
        const state: OrderScanProgressCarton["state"] = scanned ? "scanned" : isLate ? "missing" : "pending";

        return {
          id: c.id,
          carton_serial_number: c.carton_serial_number,
          carton_index: c.carton_index,
          sticker_label: `${total}-${c.carton_index}`,
          scanned,
          scanned_at: scannedAt,
          state,
        };
      });

      const oMeta = outwardConsoleByOrder.get(order.id as string);
      let outward: OrderScanProgressRow["outward"] = null;
      if (oMeta) {
        let outScanned = 0;
        const outCartons: OrderScanProgressCarton[] = sorted.map((c) => {
          const key = `${order.id}:${oMeta.console_id}:${c.id}`;
          const scannedAt = outwardScannedAt.get(key) ?? null;
          const scanned = Boolean(scannedAt);
          if (scanned) outScanned += 1;
          const hoursSinceOrder =
            (now - new Date(order.created_at as string).getTime()) / (1000 * 60 * 60);
          const isLate = !scanned && hoursSinceOrder >= lateHours;
          const state: OrderScanProgressCarton["state"] = scanned ? "scanned" : isLate ? "missing" : "pending";
          return {
            id: c.id,
            carton_serial_number: c.carton_serial_number,
            carton_index: c.carton_index,
            sticker_label: `${total}-${c.carton_index}`,
            scanned,
            scanned_at: scannedAt,
            state,
          };
        });
        outward = {
          console_id: oMeta.console_id,
          console_number: oMeta.console_number,
          container_number: oMeta.container_number,
          scanned_count: outScanned,
          pending_count: Math.max(0, total - outScanned),
          cartons: outCartons,
        };
      }

      return {
        id: order.id as string,
        shipping_mark: order.shipping_mark as string,
        destination_country: order.destination_country as string,
        total_cartons: total,
        item_description: (order.item_description as string | null) ?? null,
        created_at: order.created_at as string,
        scanned_count: scannedCount,
        pending_count: Math.max(0, total - scannedCount),
        cartons,
        outward,
      };
    });

    return { orders: rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unable to load scan progress" };
  }
}

export async function getScannedCartonsForUser() {
  try {
    const session = await getSession();
    if (!session || session.role !== "user") {
      return { error: "Unauthorized" };
    }

    const supabase = await createAdminClient();

    // 1) Get raw scan rows for this user
    const { data: scanRows, error } = await supabase
      .from("carton_scans")
      .select(
        "id, carton_serial_number, scanned_at, carton_id, order_id, scan_type, console_id"
      )
      .eq("username", session.username)
      .order("scanned_at", { ascending: false })
      .limit(200);

    type NormalizedUserScan = {
      id: string;
      carton_serial_number: string;
      scanned_at: string;
      carton_id: string;
      order_id: string;
      scan_type: string | null;
      console_id: string | null;
    };

    let normalizedScanRows: NormalizedUserScan[] = (scanRows ?? []) as NormalizedUserScan[];
    if (error && /(scan_type|console_id)/i.test(error.message || "")) {
      const legacy = await supabase
        .from("carton_scans")
        .select("id, carton_serial_number, scanned_at, carton_id, order_id")
        .eq("username", session.username)
        .order("scanned_at", { ascending: false })
        .limit(200);
      if (legacy.error) {
        return { error: legacy.error.message };
      }
      normalizedScanRows = (legacy.data || []).map((r) => ({
        ...(r as NormalizedUserScan),
        scan_type: "inward",
        console_id: null,
      }));
    } else if (error) {
      return { error: error.message };
    }

    const rows = normalizedScanRows;
    if (rows.length === 0) {
      return { scans: [] };
    }

    const cartonIds = Array.from(new Set(rows.map((row) => row.carton_id)));
    const orderIds = Array.from(new Set(rows.map((row) => row.order_id)));

    const [{ data: cartonsData, error: cartonsError }, { data: ordersData }] = await Promise.all([
      supabase
        .from("cartons")
        .select(
          "id, carton_serial_number, tracking_id, sticker_identifier, scan_token, weight, length, width, height, dimension_unit, carton_index, created_at, item_description, destination_country"
        )
        .in("id", cartonIds),
      supabase
        .from("orders")
        .select(
          "id, shipping_mark, destination_country, total_cartons, item_description, created_at"
        )
        .in("id", orderIds),
    ]);

    let normalizedCartonsData = cartonsData;
    if (cartonsError && /(tracking_id|sticker_identifier|scan_token)/i.test(cartonsError.message || "")) {
      const legacyCartonsResult = await supabase
        .from("cartons")
        .select(
          "id, carton_serial_number, weight, length, width, height, dimension_unit, carton_index, created_at, item_description, destination_country"
        )
        .in("id", cartonIds);
      normalizedCartonsData = legacyCartonsResult.data as typeof cartonsData;
    }

    const cartonByIdMap = new Map(
      (normalizedCartonsData ?? []).map((c) => [c.id as string, c])
    );
    const cartonBySerialMap = new Map(
      (normalizedCartonsData ?? []).map((c) => [c.carton_serial_number as string, c])
    );
    const orderMap = new Map(
      (ordersData ?? []).map((o) => [o.id as string, o])
    );

    const scans = rows.map((row) => {
      const serial = row.carton_serial_number as string;
      const cartonFromId = cartonByIdMap.get(row.carton_id as string);
      const cartonFromSerial = cartonBySerialMap.get(serial);

      return {
        id: row.id as string,
        carton_serial_number: serial,
        scanned_at: row.scanned_at as string,
        scan_type: (row.scan_type as string | null) ?? "inward",
        console_id: (row.console_id as string | null) ?? null,
        cartons: cartonFromId ?? cartonFromSerial ?? null,
        orders: orderMap.get(row.order_id as string) ?? null,
      };
    });

    return { scans };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unable to load scanned cartons" };
  }
}

export async function deleteCartonScan(scanId: string) {
  try {
    const session = await getSession();
    if (!session || session.role !== "user") {
      return { error: "Unauthorized" };
    }

    const supabase = await createAdminClient();
    const { error } = await supabase
      .from("carton_scans")
      .delete()
      .eq("id", scanId)
      .eq("username", session.username);

    if (error) {
      return { error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unable to delete scanned sticker" };
  }
}
