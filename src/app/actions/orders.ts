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

    const { data: latestScan } = await supabase
      .from("carton_scans")
      .select("scanned_at")
      .eq("carton_id", carton.id)
      .order("scanned_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const resolvedScannedAt = carton.scanned_at ?? latestScan?.scanned_at ?? null;
    const alreadyScanned = Boolean(resolvedScannedAt);

    return {
      preview: {
        scan_identifier: trimmed,
        order_id: order.id,
        shipping_mark: order.shipping_mark,
        destination_country: order.destination_country,
        item_description: order.item_description,
        total_cartons: order.total_cartons,
        carton_serial_number: carton.carton_serial_number,
        tracking_id: carton.tracking_id ?? `TRK-${carton.carton_serial_number}`,
        sticker_identifier: carton.sticker_identifier ?? carton.carton_serial_number,
        scan_status: carton.scan_status ?? (alreadyScanned ? "scanned" : "pending"),
        scanned_at: resolvedScannedAt,
        already_scanned: alreadyScanned,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unable to load scan preview" };
  }
}

export async function recordCartonScan(scanIdentifier: string) {
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

    const { data: existingScan } = await supabase
      .from("carton_scans")
      .select("id")
      .eq("carton_id", carton.id)
      .eq("username", order.username)
      .order("scanned_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingScan?.id) {
      return {
        success: true,
        duplicate: true,
        carton: {
          id: typedCarton.id,
          order_id: typedCarton.order_id,
          serial: typedCarton.carton_serial_number,
          tracking_id: typedCarton.tracking_id ?? `TRK-${typedCarton.carton_serial_number}`,
          sticker_identifier: typedCarton.sticker_identifier ?? typedCarton.carton_serial_number,
        },
      };
    }

    const { error: insertError } = await supabase.from("carton_scans").insert({
      carton_id: carton.id,
      order_id: order.id,
      username: order.username,
      carton_serial_number: carton.carton_serial_number,
    });

    if (insertError) {
      return { error: insertError.message };
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
      carton: {
        id: typedCarton.id,
        order_id: typedCarton.order_id,
        serial: typedCarton.carton_serial_number,
        tracking_id: typedCarton.tracking_id ?? `TRK-${typedCarton.carton_serial_number}`,
        sticker_identifier: typedCarton.sticker_identifier ?? typedCarton.carton_serial_number,
      },
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
};

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

    const { data: scanRows, error: scansError } = await supabase
      .from("carton_scans")
      .select("carton_id, scanned_at")
      .eq("username", session.username)
      .in("order_id", orderIds);

    if (scansError) {
      return { error: scansError.message };
    }

    const scannedAtByCartonId = new Map<string, string>();
    for (const row of scanRows ?? []) {
      const cid = row.carton_id as string;
      const at = row.scanned_at as string;
      const prev = scannedAtByCartonId.get(cid);
      if (!prev || new Date(at) > new Date(prev)) {
        scannedAtByCartonId.set(cid, at);
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
        const scannedAt = scannedAtByCartonId.get(c.id) ?? null;
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
        "id, carton_serial_number, scanned_at, carton_id, order_id"
      )
      .eq("username", session.username)
      .order("scanned_at", { ascending: false })
      .limit(200);

    if (error) {
      return { error: error.message };
    }

    if (!scanRows || scanRows.length === 0) {
      return { scans: [] };
    }

    // 2) Load related cartons and orders in bulk
    const cartonIds = Array.from(new Set(scanRows.map((row) => row.carton_id)));
    const orderIds = Array.from(new Set(scanRows.map((row) => row.order_id)));

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

    const scans = scanRows.map((row) => {
      const serial = row.carton_serial_number as string;
      const cartonFromId = cartonByIdMap.get(row.carton_id as string);
      const cartonFromSerial = cartonBySerialMap.get(serial);

      return {
        id: row.id as string,
        carton_serial_number: serial,
        scanned_at: row.scanned_at as string,
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
