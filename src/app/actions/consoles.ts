"use server";

import { createAdminClient } from "@/utils/supabase/server";
import { getSession } from "@/lib/auth/session";

type ConsoleInput = {
  console_number: string;
  container_number: string;
  date: string;
  bl_number: string;
  carrier: string;
  so: string;
  total_cartons: number;
  total_cbm: number;
};

export async function createConsole(console: ConsoleInput) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return { error: "Unauthorized" };
    }

    if (!console.console_number?.trim()) {
      return { error: "Console number is required" };
    }

    if (!console.container_number?.trim()) {
      return { error: "Container number is required" };
    }

    if (!console.date) {
      return { error: "Date is required" };
    }

    if (!console.bl_number?.trim()) {
      return { error: "BL number is required" };
    }

    if (!console.carrier?.trim()) {
      return { error: "Carrier is required" };
    }

    if (!console.so?.trim()) {
      return { error: "SO is required" };
    }

    // CBM is always 0 on creation and will be calculated from assigned orders
    // No validation needed as CBM is auto-calculated

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from("consoles")
      .insert({
        console_number: console.console_number.trim(),
        container_number: console.container_number.trim(),
        date: console.date,
        bl_number: console.bl_number.trim(),
        carrier: console.carrier.trim(),
        so: console.so.trim(),
        total_cartons: console.total_cartons || 0,
        total_cbm: console.total_cbm || 0,
        status: "active",
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return { error: "Console number already exists" };
      }
      return { error: error.message || "Failed to create console" };
    }

    return { console: data };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred while creating console" };
  }
}

export async function getAllConsoles() {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return { error: "Unauthorized" };
    }

    const supabase = await createAdminClient();

    // Get all consoles without status filter (works whether column exists or not)
    const { data, error } = await supabase
      .from("consoles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return { error: error.message || "Failed to fetch consoles" };
    }

    // Filter by status in JavaScript (handles case where status column doesn't exist)
    const filtered = (data || []).filter((console: { status?: string }) => 
      !console.status || console.status === "active"
    );

    return { consoles: filtered };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred while fetching consoles" };
  }
}

export async function getReadyForLoadingConsoles() {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return { error: "Unauthorized" };
    }

    const supabase = await createAdminClient();

    // Get all consoles without status filter (works whether column exists or not)
    const { data, error } = await supabase
      .from("consoles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return { error: error.message || "Failed to fetch consoles" };
    }

    // Filter by status in JavaScript (handles case where status column doesn't exist)
    const filtered = (data || []).filter((console: { status?: string }) => 
      console.status === "ready_for_loading"
    );

    return { consoles: filtered };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred while fetching ready for loading consoles" };
  }
}

export async function markConsoleReadyForLoading(consoleId: string) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return { error: "Unauthorized" };
    }

    if (!consoleId) {
      return { error: "Console ID is required" };
    }

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from("consoles")
      .update({ status: "ready_for_loading", updated_at: new Date().toISOString() })
      .eq("id", consoleId)
      .select()
      .single();

    if (error) {
      return { error: error.message || "Failed to mark console as ready for loading" };
    }

    return { console: data };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred while marking console as ready for loading" };
  }
}

export async function getConsoleWithOrders(consoleId: string) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return { error: "Unauthorized" };
    }

    const supabase = await createAdminClient();

    // Get console
    const { data: console, error: consoleError } = await supabase
      .from("consoles")
      .select("*")
      .eq("id", consoleId)
      .single();

    if (consoleError || !console) {
      return { error: consoleError?.message || "Console not found" };
    }

    // Get orders for this console
    const { data: consoleOrders, error: ordersError } = await supabase
      .from("console_orders")
      .select("order_id")
      .eq("console_id", consoleId);

    if (ordersError) {
      return { error: ordersError.message || "Failed to fetch console orders" };
    }

    const orderIds = consoleOrders?.map((co) => co.order_id) || [];

    if (orderIds.length === 0) {
      return { console, orders: [] };
    }

    // Get full order details with cartons
    const { data: orders, error: fullOrdersError } = await supabase
      .from("orders")
      .select(
        `
      *,
      cartons (*)
    `
      )
      .in("id", orderIds);

    if (fullOrdersError) {
      return { error: fullOrdersError.message || "Failed to fetch orders" };
    }

    return { console, orders: orders || [] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred while fetching console with orders" };
  }
}

export async function assignOrdersToConsole(consoleId: string, orderIds: string[]) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return { error: "Unauthorized" };
    }

    if (!consoleId || orderIds.length === 0) {
      return { error: "Console ID and at least one order ID required" };
    }

    const supabase = await createAdminClient();

  // Get console to check CBM limit
  const { data: console, error: consoleError } = await supabase
    .from("consoles")
    .select("*")
    .eq("id", consoleId)
    .single();

  if (consoleError || !console) {
    return { error: "Console not found" };
  }

  // Get current orders in console
  const { data: currentConsoleOrders } = await supabase
    .from("console_orders")
    .select("order_id")
    .eq("console_id", consoleId);

  const currentOrderIds = currentConsoleOrders?.map((co) => co.order_id) || [];

  // Get orders to add (with cartons for CBM calculation)
  const { data: ordersToAdd, error: ordersError } = await supabase
    .from("orders")
    .select(
      `
      *,
      cartons (*)
    `
    )
    .in("id", orderIds);

  if (ordersError) {
    return { error: ordersError.message || "Failed to fetch orders" };
  }

  // Calculate CBM and cartons of orders to add
  let newOrdersCbm = 0;
  let newOrdersCartons = 0;

  for (const order of ordersToAdd || []) {
    const cartons = order.cartons || [];
    newOrdersCartons += order.total_cartons || 0;

    for (const carton of cartons) {
      const length = carton.length ?? 0;
      const width = carton.width ?? 0;
      const height = carton.height ?? 0;
      if (length && width && height) {
        newOrdersCbm += (length * width * height) / 1_000_000; // Convert to CBM
      }
    }
  }

  // Get existing orders CBM and cartons
  let existingOrdersCbm = 0;
  let existingOrdersCartons = 0;
  if (currentOrderIds.length > 0) {
    const { data: existingOrders } = await supabase
      .from("orders")
      .select(
        `
        *,
        cartons (*)
      `
      )
      .in("id", currentOrderIds);

    for (const order of existingOrders || []) {
      const cartons = order.cartons || [];
      existingOrdersCartons += order.total_cartons || 0;
      
      for (const carton of cartons) {
        const length = carton.length ?? 0;
        const width = carton.width ?? 0;
        const height = carton.height ?? 0;
        if (length && width && height) {
          existingOrdersCbm += (length * width * height) / 1_000_000;
        }
      }
    }
  }

  // Calculate total CBM and cartons (existing + new)
  const totalCbm = existingOrdersCbm + newOrdersCbm;
  const totalCartons = existingOrdersCartons + newOrdersCartons;

  // CBM is calculated from orders - no limit check needed
  // Total CBM will be updated automatically based on assigned orders

  // Insert console_orders relationships
  const insertData = orderIds.map((orderId) => ({
    console_id: consoleId,
    order_id: orderId,
  }));

  const { error: insertError } = await supabase.from("console_orders").insert(insertData);

  if (insertError) {
    if (insertError.code === "23505") {
      return { error: "One or more orders are already assigned to this console" };
    }
    return { error: insertError.message || "Failed to assign orders" };
  }

  // Update console totals (recalculate from all assigned orders)
  const { error: updateError } = await supabase
    .from("consoles")
    .update({
      total_cartons: totalCartons,
      total_cbm: totalCbm,
      updated_at: new Date().toISOString(),
    })
    .eq("id", consoleId);

  if (updateError) {
    return { error: updateError.message || "Failed to update console totals" };
  }

  return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred while assigning orders to console" };
  }
}
