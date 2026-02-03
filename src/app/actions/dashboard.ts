'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';

export async function getDashboardStats() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    // Get total active users
    const { count: totalUsers, error: usersError } = await supabase
      .from('app_users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'user');

    if (usersError) {
      return { error: usersError.message };
    }

    // Get all orders with cartons
    const { data: allOrders, error: ordersError } = await supabase
      .from('orders')
      .select(
        'id, total_cartons, cartons:cartons(weight, length, width, height, carton_index)'
      );

    if (ordersError) {
      return { error: ordersError.message };
    }

    // Get assigned order IDs
    const { data: assignedOrdersData, error: assignedError } = await supabase
      .from('console_orders')
      .select('order_id');

    if (assignedError) {
      return { error: assignedError.message };
    }

    const assignedOrderIds = new Set(assignedOrdersData?.map((co) => co.order_id) || []);

    // Calculate statistics
    const totalOrders = allOrders?.length || 0;
    const assignedOrdersCount = assignedOrderIds.size;
    const unassignedOrdersCount = totalOrders - assignedOrdersCount;

    // Calculate total cartons and CBM
    let totalCartons = 0;
    let totalCbm = 0;
    let cartonsInConsoles = 0;
    let cbmInConsoles = 0;

    allOrders?.forEach((order) => {
      const orderCartons = order.total_cartons || 0;
      totalCartons += orderCartons;

      // Calculate CBM for this order
      const orderCbm = (order.cartons || []).reduce((sum: number, carton: { length?: number | null; width?: number | null; height?: number | null }) => {
        const length = carton.length ?? 0;
        const width = carton.width ?? 0;
        const height = carton.height ?? 0;
        if (!length || !width || !height) return sum;
        return sum + (length * width * height) / 1_000_000;
      }, 0);

      totalCbm += orderCbm;

      // If order is assigned to a console, add to console totals
      if (assignedOrderIds.has(order.id)) {
        cartonsInConsoles += orderCartons;
        cbmInConsoles += orderCbm;
      }
    });

    const remainingCartons = totalCartons - cartonsInConsoles;

    // Get console statistics
    const { data: consoles, error: consolesError } = await supabase
      .from('consoles')
      .select('id, total_cartons, total_cbm, max_cbm, status');

    if (consolesError) {
      return { error: consolesError.message };
    }

    const totalConsoles = consoles?.length || 0;
    
    // Count consoles by status
    const activeConsoles = consoles?.filter((c: { status?: string }) => !c.status || c.status === 'active').length || 0;
    const readyForLoadingConsoles = consoles?.filter((c: { status?: string }) => c.status === 'ready_for_loading').length || 0;

    return {
      stats: {
        totalUsers: totalUsers || 0,
        totalOrders,
        assignedOrdersCount,
        unassignedOrdersCount,
        totalCbm,
        totalConsoles,
        activeConsoles,
        readyForLoadingConsoles,
        totalCartons,
        cartonsInConsoles,
        remainingCartons,
        cbmInConsoles,
      },
    };
  } catch {
    return { error: 'Unable to load dashboard statistics' };
  }
}
