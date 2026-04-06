'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';

export async function getDashboardStats() {
  try {
    const session = await getSession();
    if (!session) {
      return { error: 'Unauthorized' };
    }

    // Allow admins or sales agents with "dashboard" permission
    if (session.role === 'admin') {
      // Admin has access
    } else if (session.role === 'sales_agent') {
      const { hasPermission } = await import('@/lib/auth/permissions');
      const hasAccess = await hasPermission('dashboard');
      if (!hasAccess) {
        return { error: 'Unauthorized' };
      }
    } else {
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

export type SalesAgentDashboardStats = {
  totalLeads: number;
  totalCustomers: number;
  ownLeads: number;
  receivedLeads: number;
  wonLeads: number;
  followUpLeads: number;
  conversionRate: number;
  statusBreakdown: Array<{ status: string; count: number }>;
  monthlyLeads: Array<{ month: string; count: number }>;
};

export async function getSalesAgentDashboardStats() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'sales_agent') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();
    const { data: salesAgent, error: agentError } = await supabase
      .from('sales_agents')
      .select('id')
      .eq('username', session.username)
      .maybeSingle();

    if (agentError || !salesAgent) {
      return { error: 'Sales agent not found' };
    }

    const { data: leadsData, error: leadsError } = await supabase
      .from('leads')
      .select('id, status, created_at, created_by_sales_agent_id, transferred_from_sales_agent_id')
      .eq('sales_agent_id', salesAgent.id);

    if (leadsError) {
      return { error: leadsError.message };
    }

    const { count: customersCount, error: customersError } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('sales_agent_id', salesAgent.id)
      .not('lead_id', 'is', null);

    if (customersError) {
      return { error: customersError.message };
    }

    const leads = leadsData || [];
    const totalLeads = leads.length;
    const totalCustomers = customersCount || 0;

    const ownLeads = leads.filter((lead) =>
      lead.created_by_sales_agent_id
        ? lead.created_by_sales_agent_id === salesAgent.id
        : !lead.transferred_from_sales_agent_id
    ).length;
    const receivedLeads = totalLeads - ownLeads;

    const wonLeads = leads.filter((lead) => lead.status === 'Win').length;
    const followUpLeads = leads.filter((lead) => lead.status === 'Follow up').length;
    const conversionRate = totalLeads > 0 ? Number(((totalCustomers / totalLeads) * 100).toFixed(1)) : 0;

    const statuses = ['Leads', 'Inquiry Received', 'Quotation Sent', 'Negotiation', 'Win', 'Follow up', 'Lose'];
    const statusBreakdown = statuses.map((status) => ({
      status,
      count: leads.filter((lead) => lead.status === status).length,
    }));

    const now = new Date();
    const monthLabels: string[] = [];
    const monthKeys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthKeys.push(key);
      monthLabels.push(
        d.toLocaleString('en-US', {
          month: 'short',
        })
      );
    }

    const monthlyMap = new Map<string, number>(monthKeys.map((key) => [key, 0]));
    leads.forEach((lead) => {
      const d = new Date(lead.created_at);
      if (Number.isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyMap.has(key)) {
        monthlyMap.set(key, (monthlyMap.get(key) || 0) + 1);
      }
    });

    const monthlyLeads = monthKeys.map((key, idx) => ({
      month: monthLabels[idx],
      count: monthlyMap.get(key) || 0,
    }));

    const stats: SalesAgentDashboardStats = {
      totalLeads,
      totalCustomers,
      ownLeads,
      receivedLeads,
      wonLeads,
      followUpLeads,
      conversionRate,
      statusBreakdown,
      monthlyLeads,
    };

    return { stats };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unable to load sales dashboard statistics' };
  }
}
