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
    }));

    const { data: cartonData, error: cartonError } = await supabase
      .from("cartons")
      .insert(cartonsPayload)
      .select(
        "id, carton_serial_number, weight, length, width, height, carton_index, order_id"
      );

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
        "id, carton_serial_number, weight, length, width, height, dimension_unit, carton_index, item_description, destination_country, created_at, orders!inner(id, shipping_mark, item_description, destination_country, total_cartons, created_at, username)"
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

export async function recordCartonScan(serial: string) {
  try {
    if (!serial?.trim()) {
      return { error: "Serial number is required" };
    }

    const trimmed = serial.trim();
    const supabase = await createAdminClient();

    const { data: carton, error: cartonError } = await supabase
      .from("cartons")
      .select("id, carton_serial_number, order_id, orders(id, username)")
      .eq("carton_serial_number", trimmed)
      .single();

    if (cartonError || !carton) {
      return { error: cartonError?.message || "Carton not found" };
    }

    const order = (carton as any).orders as { id: string; username: string } | null;
    if (!order) {
      return { error: "Order not found for this carton" };
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

    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unable to record carton scan" };
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

    const [{ data: cartonsData }, { data: ordersData }] = await Promise.all([
      supabase
        .from("cartons")
        .select(
          "id, weight, length, width, height, dimension_unit, carton_index, created_at, item_description, destination_country"
        )
        .in("id", cartonIds),
      supabase
        .from("orders")
        .select(
          "id, shipping_mark, destination_country, total_cartons, item_description, created_at"
        )
        .in("id", orderIds),
    ]);

    const cartonMap = new Map(
      (cartonsData ?? []).map((c) => [c.id as string, c])
    );
    const orderMap = new Map(
      (ordersData ?? []).map((o) => [o.id as string, o])
    );

    const scans = scanRows.map((row) => ({
      id: row.id as string,
      carton_serial_number: row.carton_serial_number as string,
      scanned_at: row.scanned_at as string,
      cartons: cartonMap.get(row.carton_id) ?? null,
      orders: orderMap.get(row.order_id) ?? null,
    }));

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
