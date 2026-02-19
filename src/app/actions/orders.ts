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
