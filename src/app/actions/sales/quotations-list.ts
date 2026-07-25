'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { sessionHasSalesAccess } from '@/lib/auth/require-access';
import {
  mapQuotationDbStatusToUi,
  mapQuotationUiStatusToDb,
  type SalesQuotationUiStatus,
} from '@/lib/sales-navigation';

export type SalesQuotationListItem = {
  id: string;
  quotation_number: string;
  customer_name: string;
  contact_id: string | null;
  salesperson_name: string | null;
  salesperson_id: string | null;
  quotation_date: string;
  expiration_date: string | null;
  total: number;
  status: SalesQuotationUiStatus;
  status_db: string;
  organization_id: string | null;
  organization_name: string | null;
  product_service: string;
  is_locked: boolean;
  delivery_status: 'waiting' | 'ready' | 'delivered';
};

export type SalesQuotationListFilters = {
  search?: string;
  status?: SalesQuotationUiStatus | 'all';
  /** When true, only sales_order (+ optional locked/delivery filters) */
  ordersOnly?: boolean;
  lockedOnly?: boolean;
  deliveryStatus?: 'waiting' | 'ready' | 'delivered' | 'all';
  sortBy?: 'created_at' | 'quotation_number' | 'customer_name' | 'total_amount' | 'expiration_date';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
};

export type SalesQuotationListResult = {
  quotations: SalesQuotationListItem[];
  total: number;
  page: number;
  pageSize: number;
  isGlobalAdminView?: boolean;
};

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
      return { session, organizationId: null as string | null, isGlobalAdminView: false, empty: true };
    }
    return { error: scope.error };
  }

  const { isSuperAdminInAdminContext } = await import('@/lib/auth/super-admin');
  if (!scope.organizationId && isSuperAdminInAdminContext(scope.session)) {
    return { session: scope.session, organizationId: null, isGlobalAdminView: true };
  }

  if (!scope.organizationId) {
    return {
      error: 'Select an organization from the header switcher to use Sales.',
    };
  }

  return {
    session: scope.session,
    organizationId: scope.organizationId,
    isGlobalAdminView: false,
  };
}

/**
 * List quotations for the Sales module (org-scoped when organization_id is available).
 * Migrates existing quotation rows — does not delete legacy data.
 */
export async function getSalesQuotationsList(
  filters: SalesQuotationListFilters = {}
): Promise<SalesQuotationListResult | { error: string }> {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { quotations: [], total: 0, page: 1, pageSize: filters.pageSize || 40 };
    }

    const supabase = await createAdminClient();

    // Auto-expire past-due quotations (idempotent; no extra client round-trip)
    try {
      const { processSalesQuotationExpirations } = await import(
        '@/app/actions/sales/automation'
      );
      await processSalesQuotationExpirations({
        organizationId: scope.organizationId,
        limit: 100,
      });
    } catch {
      // non-blocking
    }

    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(100, Math.max(10, filters.pageSize || 40));
    const sortBy = filters.sortBy || 'created_at';
    const ascending = filters.sortDir === 'asc';

    let query = supabase.from('quotations').select('*', { count: 'exact' });

    if (scope.organizationId && !scope.isGlobalAdminView) {
      query = query.eq('organization_id', scope.organizationId);
    }

    // Record rules: Sales Users only see own / assigned records
    let ownershipOr: string | null = null;
    try {
      const { resolveSalesAccessRole, salesRoleSeesAllOrgRecords } = await import(
        '@/lib/sales-roles'
      );
      const { resolveCurrentSalespersonId } = await import(
        '@/app/actions/sales/automation'
      );
      const role = resolveSalesAccessRole(scope.session as any);
      if (!salesRoleSeesAllOrgRecords(role)) {
        const agentId = await resolveCurrentSalespersonId();
        ownershipOr = agentId
          ? `salesperson_id.eq.${agentId},created_by.eq.${scope.session!.username}`
          : `created_by.eq.${scope.session!.username}`;
      }
    } catch {
      // keep org-scoped list if role helpers fail
    }

    if (filters.ordersOnly) {
      if (filters.status === 'cancelled') {
        query = query.eq('status', 'cancelled');
      } else {
        query = query.eq('status', 'sales_order');
      }
      if (filters.lockedOnly) query = query.eq('is_locked', true);
      if (filters.deliveryStatus && filters.deliveryStatus !== 'all') {
        query = query.eq('delivery_status', filters.deliveryStatus);
      }
    } else if (filters.status && filters.status !== 'all') {
      query = query.eq('status', mapQuotationUiStatusToDb(filters.status));
    }

    const needle = String(filters.search || '').trim();
    if (needle && ownershipOr) {
      const like = `%${needle}%`;
      const fields = [
        'quotation_number',
        'customer_name',
        'product_service',
        'created_by',
      ];
      const agentIdMatch = ownershipOr.includes('salesperson_id.eq.')
        ? ownershipOr.split(',')[0]
        : null;
      const createdMatch = ownershipOr.includes('created_by.eq.')
        ? ownershipOr.split(',').find((p) => p.startsWith('created_by.eq.'))!
        : `created_by.eq.${scope.session!.username}`;
      const parts: string[] = [];
      for (const f of fields) {
        if (agentIdMatch) {
          parts.push(`and(${f}.ilike.${like},${agentIdMatch})`);
        }
        parts.push(`and(${f}.ilike.${like},${createdMatch})`);
      }
      query = query.or(parts.join(','));
    } else if (needle) {
      const like = `%${needle}%`;
      query = query.or(
        `quotation_number.ilike.${like},customer_name.ilike.${like},product_service.ilike.${like},created_by.ilike.${like}`
      );
    } else if (ownershipOr) {
      query = query.or(ownershipOr);
    }

    query = query.order(sortBy, { ascending, nullsFirst: false });

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    let { data, error, count } = await query;

    // Fallback if organization_id column missing (migration not applied yet)
    if (error && /organization_id|column/i.test(error.message)) {
      let retry = supabase.from('quotations').select('*', { count: 'exact' });
      if (filters.status && filters.status !== 'all') {
        retry = retry.eq('status', mapQuotationUiStatusToDb(filters.status));
      }
      if (needle) {
        const like = `%${needle}%`;
        retry = retry.or(
          `quotation_number.ilike.${like},customer_name.ilike.${like},product_service.ilike.${like},created_by.ilike.${like}`
        );
      }
      retry = retry.order(sortBy, { ascending }).range(from, to);
      const second = await retry;
      data = second.data;
      error = second.error;
      count = second.count;
    }

    if (error) return { error: error.message };

    const rows = data || [];
    const salespersonIds = [
      ...new Set(
        rows
          .map((r) => (r.salesperson_id ? String(r.salesperson_id) : ''))
          .filter(Boolean)
      ),
    ];
    const orgIds = [
      ...new Set(
        rows
          .map((r) => (r.organization_id ? String(r.organization_id) : ''))
          .filter(Boolean)
      ),
    ];

    const [salesRes, orgsRes] = await Promise.all([
      salespersonIds.length
        ? supabase.from('sales_agents').select('id, name').in('id', salespersonIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      orgIds.length
        ? supabase.from('organizations').select('id, organization_name').in('id', orgIds)
        : Promise.resolve({ data: [] as { id: string; organization_name: string }[] }),
    ]);

    const salesMap = new Map(
      (salesRes.data || []).map((s) => [String(s.id), String(s.name || '')])
    );
    const orgMap = new Map(
      (orgsRes.data || []).map((o) => [String(o.id), String(o.organization_name || '')])
    );

    const quotations: SalesQuotationListItem[] = rows.map((r) => {
      const spId = r.salesperson_id ? String(r.salesperson_id) : null;
      const orgId = r.organization_id ? String(r.organization_id) : null;
      return {
        id: String(r.id),
        quotation_number: String(r.quotation_number || r.id.slice(0, 8)),
        customer_name: String(r.customer_name || '—'),
        contact_id: r.contact_id ? String(r.contact_id) : null,
        salesperson_id: spId,
        salesperson_name: spId
          ? salesMap.get(spId) || null
          : r.created_by
            ? String(r.created_by)
            : null,
        quotation_date: String(r.created_at || ''),
        expiration_date: r.expiration_date ? String(r.expiration_date) : null,
        total: Number(r.total_amount) || 0,
        status: mapQuotationDbStatusToUi(String(r.status)),
        status_db: String(r.status || 'quotation'),
        organization_id: orgId,
        organization_name: orgId ? orgMap.get(orgId) || null : null,
        product_service: String(r.product_service || ''),
        is_locked: Boolean(r.is_locked),
        delivery_status: (['waiting', 'ready', 'delivered'].includes(
          String(r.delivery_status || '')
        )
          ? String(r.delivery_status)
          : 'waiting') as 'waiting' | 'ready' | 'delivered',
      };
    });

    return {
      quotations,
      total: count ?? quotations.length,
      page,
      pageSize,
      isGlobalAdminView: Boolean(scope.isGlobalAdminView),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load quotations',
    };
  }
}
