'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { sessionHasSalesAccess } from '@/lib/auth/require-access';

export type SalesReportFilters = {
  dateFrom?: string | null;
  dateTo?: string | null;
  salespersonId?: string | null;
  contactId?: string | null;
  status?: string | null;
  groupBy?: 'salesperson' | 'customer' | 'product' | 'month' | 'status' | 'none';
};

export type SalesReportNamedValue = {
  name: string;
  count: number;
  revenue: number;
};

export type SalesReportsDashboard = {
  total_quotations: number;
  total_orders: number;
  total_revenue: number;
  confirmed_orders: number;
  cancelled_orders: number;
  average_order_value: number;
  quotations_by_status: SalesReportNamedValue[];
  revenue_by_month: SalesReportNamedValue[];
  salesperson_performance: SalesReportNamedValue[];
  product_performance: SalesReportNamedValue[];
  customer_analysis: SalesReportNamedValue[];
  organization_reports: SalesReportNamedValue[];
  orders_vs_quotations: SalesReportNamedValue[];
};

function emptyDashboard(): SalesReportsDashboard {
  return {
    total_quotations: 0,
    total_orders: 0,
    total_revenue: 0,
    confirmed_orders: 0,
    cancelled_orders: 0,
    average_order_value: 0,
    quotations_by_status: [],
    revenue_by_month: [],
    salesperson_performance: [],
    product_performance: [],
    customer_analysis: [],
    organization_reports: [],
    orders_vs_quotations: [
      { name: 'Quotations', count: 0, revenue: 0 },
      { name: 'Sales Orders', count: 0, revenue: 0 },
    ],
  };
}

async function resolveSalesOrgScope() {
  const { requireAdminOrganizationScope, sessionUsesOrganizationScope } = await import(
    '@/lib/admin-organization-context'
  );
  const session = await getSession();
  if (!session || !sessionHasSalesAccess(session)) {
    return { error: 'Unauthorized' as const };
  }

  if (!sessionUsesOrganizationScope(session.role)) {
    return { session, organizationId: null as string | null, isGlobalAdminView: false };
  }

  const scope = await requireAdminOrganizationScope();
  if ('error' in scope) {
    if (scope.status === 403) {
      return { session, organizationId: null as string | null, isGlobalAdminView: false, empty: true as const };
    }
    return { error: scope.error };
  }

  const { isSuperAdminInAdminContext } = await import('@/lib/auth/super-admin');
  if (!scope.organizationId && isSuperAdminInAdminContext(scope.session)) {
    return { session: scope.session, organizationId: null, isGlobalAdminView: true };
  }

  if (!scope.organizationId) {
    return { error: 'Select an organization from the header switcher to use Sales.' };
  }

  return {
    session: scope.session,
    organizationId: scope.organizationId,
    isGlobalAdminView: false,
  };
}

function inDateRange(
  iso: string | null | undefined,
  from?: string | null,
  to?: string | null
) {
  if (!iso) return true;
  const d = iso.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function bump(
  map: Map<string, { count: number; revenue: number }>,
  key: string,
  revenue: number
) {
  const cur = map.get(key) || { count: 0, revenue: 0 };
  cur.count += 1;
  cur.revenue += revenue;
  map.set(key, cur);
}

function toNamed(map: Map<string, { count: number; revenue: number }>, limit = 12) {
  return [...map.entries()]
    .map(([name, v]) => ({ name, count: v.count, revenue: Math.round(v.revenue * 100) / 100 }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export async function getSalesReportsDashboard(filters: SalesReportFilters = {}) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { dashboard: emptyDashboard() };
    }

    const supabase = await createAdminClient();
    let query = supabase.from('quotations').select('*');

    if (scope.organizationId && !scope.isGlobalAdminView) {
      query = query.eq('organization_id', scope.organizationId);
    }

    try {
      const { buildSalesOwnershipOrFilter } = await import('@/lib/sales-roles');
      const ownershipOr = await buildSalesOwnershipOrFilter(scope.session);
      if (ownershipOr) query = query.or(ownershipOr);
    } catch {
      // keep org-scoped reports
    }

    if (filters.salespersonId) query = query.eq('salesperson_id', filters.salespersonId);
    if (filters.contactId) query = query.eq('contact_id', filters.contactId);
    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query.limit(5000);
    if (error) return { error: error.message };

    let rows = data || [];
    rows = rows.filter((r) =>
      inDateRange(
        String(r.quotation_date || r.created_at || ''),
        filters.dateFrom,
        filters.dateTo
      )
    );

    const salespersonIds = [
      ...new Set(rows.map((r) => (r.salesperson_id ? String(r.salesperson_id) : '')).filter(Boolean)),
    ];
    const salesMap = new Map<string, string>();
    if (salespersonIds.length) {
      const { data: agents } = await supabase
        .from('sales_agents')
        .select('id, name')
        .in('id', salespersonIds);
      for (const a of agents || []) salesMap.set(String(a.id), String(a.name || ''));
    }

    const quotationIds = rows.map((r) => String(r.id));
    const productMap = new Map<string, { count: number; revenue: number }>();
    if (quotationIds.length) {
      const { data: lines } = await supabase
        .from('quotation_lines')
        .select('quotation_id, product_name, line_total')
        .in('quotation_id', quotationIds.slice(0, 1000));
      for (const line of lines || []) {
        const name = String(line.product_name || 'Product');
        bump(productMap, name, Number(line.line_total) || 0);
      }
    }

    const statusMap = new Map<string, { count: number; revenue: number }>();
    const monthMap = new Map<string, { count: number; revenue: number }>();
    const spMap = new Map<string, { count: number; revenue: number }>();
    const customerMap = new Map<string, { count: number; revenue: number }>();
    const orgMapAgg = new Map<string, { count: number; revenue: number }>();

    const orgIds = [
      ...new Set(
        rows.map((r) => (r.organization_id ? String(r.organization_id) : '')).filter(Boolean)
      ),
    ];
    const orgNameMap = new Map<string, string>();
    if (orgIds.length) {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, organization_name')
        .in('id', orgIds);
      for (const o of orgs || []) {
        orgNameMap.set(String(o.id), String(o.organization_name || 'Organization'));
      }
    }

    let totalQuotations = 0;
    let totalOrders = 0;
    let totalRevenue = 0;
    let confirmedOrders = 0;
    let cancelledOrders = 0;
    let quotationRevenue = 0;
    let orderRevenue = 0;

    for (const r of rows) {
      const status = String(r.status || 'quotation');
      const amount = Number(r.total_amount) || 0;
      const dateStr = String(r.quotation_date || r.created_at || '').slice(0, 7) || 'Unknown';
      const customer = String(r.customer_name || 'Unknown');
      const spId = r.salesperson_id ? String(r.salesperson_id) : '';
      const spName = spId ? salesMap.get(spId) || 'Unassigned' : String(r.created_by || 'Unassigned');
      const orgId = r.organization_id ? String(r.organization_id) : '';
      const orgName = orgId ? orgNameMap.get(orgId) || 'Organization' : 'Unassigned';

      bump(statusMap, status, amount);
      bump(monthMap, dateStr, amount);
      bump(spMap, spName, amount);
      bump(customerMap, customer, amount);
      bump(orgMapAgg, orgName, amount);

      if (status === 'sales_order') {
        totalOrders += 1;
        confirmedOrders += 1;
        totalRevenue += amount;
        orderRevenue += amount;
      } else if (status === 'cancelled') {
        cancelledOrders += 1;
        totalQuotations += 1;
        quotationRevenue += amount;
      } else {
        totalQuotations += 1;
        quotationRevenue += amount;
      }
    }

    const statusLabel: Record<string, string> = {
      quotation: 'Draft',
      quotation_sent: 'Sent',
      customer_review: 'Customer Review',
      expired: 'Expired',
      sales_order: 'Sales Order',
      cancelled: 'Cancelled',
    };

    const dashboard: SalesReportsDashboard = {
      total_quotations: totalQuotations,
      total_orders: totalOrders,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      confirmed_orders: confirmedOrders,
      cancelled_orders: cancelledOrders,
      average_order_value:
        confirmedOrders > 0
          ? Math.round((totalRevenue / confirmedOrders) * 100) / 100
          : 0,
      quotations_by_status: toNamed(statusMap).map((r) => ({
        ...r,
        name: statusLabel[r.name] || r.name,
      })),
      revenue_by_month: [...monthMap.entries()]
        .map(([name, v]) => ({
          name,
          count: v.count,
          revenue: Math.round(v.revenue * 100) / 100,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(-12),
      salesperson_performance: toNamed(spMap),
      product_performance: toNamed(productMap),
      customer_analysis: toNamed(customerMap),
      organization_reports: toNamed(orgMapAgg),
      orders_vs_quotations: [
        { name: 'Quotations', count: totalQuotations, revenue: Math.round(quotationRevenue * 100) / 100 },
        { name: 'Sales Orders', count: totalOrders, revenue: Math.round(orderRevenue * 100) / 100 },
      ],
    };

    return { dashboard };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load sales reports',
    };
  }
}
