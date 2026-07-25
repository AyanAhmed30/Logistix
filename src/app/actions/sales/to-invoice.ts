'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { sessionHasSalesAccess } from '@/lib/auth/require-access';

export type SalesOrderInvoiceStatus = 'no' | 'to_invoice' | 'invoiced';

export type SalesToInvoiceListItem = {
  id: string;
  quotation_number: string;
  customer_name: string;
  contact_id: string | null;
  salesperson_name: string | null;
  order_date: string;
  total: number;
  invoice_status: SalesOrderInvoiceStatus;
  organization_id: string | null;
  organization_name: string | null;
  sales_invoice_id: string | null;
};

export type SalesInvoiceLine = {
  id: string;
  sequence: number;
  product_name: string;
  description: string | null;
  quantity: number;
  uom: string;
  unit_price: number;
  discount: number;
  taxes: number;
  line_total: number;
};

export type SalesInvoiceDetail = {
  id: string;
  invoice_number: string;
  quotation_id: string;
  quotation_number: string;
  customer_name: string;
  contact_id: string | null;
  invoice_date: string;
  due_date: string | null;
  payment_terms: string;
  notes: string | null;
  untaxed_amount: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  organization_id: string | null;
  organization_name: string | null;
  company_address: string | null;
  company_email: string | null;
  company_phone: string | null;
  logo_url: string | null;
  salesperson_name: string | null;
  lines: SalesInvoiceLine[];
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
      return {
        session,
        organizationId: null as string | null,
        isGlobalAdminView: false,
        empty: true as const,
      };
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

function mapInvoiceStatus(raw: unknown): SalesOrderInvoiceStatus {
  const v = String(raw || 'no');
  if (v === 'to_invoice' || v === 'invoiced') return v;
  return 'no';
}

async function allocateInvoiceNumber(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  organizationId: string | null
): Promise<string> {
  if (organizationId) {
    try {
      const { data: seq } = await supabase
        .from('sales_invoice_sequences')
        .select('prefix, next_number')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (seq) {
        const next = Math.max(1, Number(seq.next_number) || 1);
        const prefix = String(seq.prefix || 'INV');
        await supabase
          .from('sales_invoice_sequences')
          .update({
            next_number: next + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId);
        return `${prefix}${String(next).padStart(5, '0')}`;
      }

      await supabase.from('sales_invoice_sequences').insert([
        { organization_id: organizationId, prefix: 'INV', next_number: 2 },
      ]);
      return 'INV00001';
    } catch {
      // fall through
    }
  }

  const year = new Date().getFullYear();
  return `INV/${year}/${String(Date.now()).slice(-4)}`;
}

export async function getSalesOrdersToInvoice(filters: {
  search?: string;
  invoiceStatus?: SalesOrderInvoiceStatus | 'all';
  sortBy?: 'quotation_number' | 'customer_name' | 'total_amount' | 'created_at';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
} = {}) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { orders: [] as SalesToInvoiceListItem[], total: 0, page: 1, pageSize: 40 };
    }

    const supabase = await createAdminClient();
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(100, Math.max(10, filters.pageSize || 40));
    const sortBy = filters.sortBy || 'created_at';
    const ascending = filters.sortDir === 'asc';

    let query = supabase
      .from('quotations')
      .select('*', { count: 'exact' })
      .eq('status', 'sales_order');

    if (scope.organizationId && !scope.isGlobalAdminView) {
      query = query.eq('organization_id', scope.organizationId);
    }

    try {
      const { buildSalesOwnershipOrFilter } = await import('@/lib/sales-roles');
      const ownershipOr = await buildSalesOwnershipOrFilter(scope.session);
      if (ownershipOr) query = query.or(ownershipOr);
    } catch {
      // keep org-scoped list
    }

    const invStatus = filters.invoiceStatus || 'to_invoice';
    if (invStatus !== 'all') {
      query = query.eq('invoice_status', invStatus);
    } else {
      query = query.in('invoice_status', ['to_invoice', 'invoiced', 'no']);
    }

    const needle = String(filters.search || '').trim();
    if (needle) {
      const like = `%${needle}%`;
      query = query.or(
        `quotation_number.ilike.${like},customer_name.ilike.${like},created_by.ilike.${like}`
      );
    }

    query = query
      .order(sortBy, { ascending, nullsFirst: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    const { data, error, count } = await query;

    if (error && /invoice_status|column/i.test(error.message)) {
      return {
        error:
          'Run sales_to_invoice_phase.sql migration to enable Orders to Invoice.',
      };
    }
    if (error) return { error: error.message };

    const rows = data || [];
    const ids = rows.map((r) => String(r.id));
    const invMap = new Map<string, string>();
    if (ids.length) {
      const { data: invs } = await supabase
        .from('sales_invoices')
        .select('id, quotation_id')
        .in('quotation_id', ids);
      for (const inv of invs || []) {
        invMap.set(String(inv.quotation_id), String(inv.id));
      }
    }

    const salespersonIds = [
      ...new Set(
        rows.map((r) => (r.salesperson_id ? String(r.salesperson_id) : '')).filter(Boolean)
      ),
    ];
    const orgIds = [
      ...new Set(
        rows.map((r) => (r.organization_id ? String(r.organization_id) : '')).filter(Boolean)
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

    const orders: SalesToInvoiceListItem[] = rows.map((r) => {
      const spId = r.salesperson_id ? String(r.salesperson_id) : null;
      const orgId = r.organization_id ? String(r.organization_id) : null;
      return {
        id: String(r.id),
        quotation_number: String(r.quotation_number || ''),
        customer_name: String(r.customer_name || '—'),
        contact_id: r.contact_id ? String(r.contact_id) : null,
        salesperson_name: spId
          ? salesMap.get(spId) || null
          : r.created_by
            ? String(r.created_by)
            : null,
        order_date: String(r.quotation_date || r.created_at || ''),
        total: Number(r.total_amount) || 0,
        invoice_status: mapInvoiceStatus(r.invoice_status),
        organization_id: orgId,
        organization_name: orgId ? orgMap.get(orgId) || null : null,
        sales_invoice_id: invMap.get(String(r.id)) || null,
      };
    });

    return {
      orders,
      total: count ?? orders.length,
      page,
      pageSize,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load orders to invoice',
    };
  }
}

/** Confirmed orders eligible for additional sales (architecture for future recommendations). */
export async function getSalesOrdersToUpsell(filters: {
  search?: string;
  sortBy?: 'quotation_number' | 'customer_name' | 'total_amount' | 'created_at';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
} = {}) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { orders: [], total: 0, page: 1, pageSize: 40 };
    }

    const supabase = await createAdminClient();
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(100, Math.max(10, filters.pageSize || 40));
    const sortBy = filters.sortBy || 'created_at';
    const ascending = filters.sortDir === 'asc';

    let query = supabase
      .from('quotations')
      .select('*', { count: 'exact' })
      .eq('status', 'sales_order')
      .in('invoice_status', ['invoiced', 'to_invoice']);

    if (scope.organizationId && !scope.isGlobalAdminView) {
      query = query.eq('organization_id', scope.organizationId);
    }

    try {
      const { buildSalesOwnershipOrFilter } = await import('@/lib/sales-roles');
      const ownershipOr = await buildSalesOwnershipOrFilter(scope.session);
      if (ownershipOr) query = query.or(ownershipOr);
    } catch {
      // keep org-scoped list
    }

    const needle = String(filters.search || '').trim();
    if (needle) {
      const like = `%${needle}%`;
      query = query.or(
        `quotation_number.ilike.${like},customer_name.ilike.${like}`
      );
    }

    query = query
      .order(sortBy, { ascending, nullsFirst: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    const { data, error, count } = await query;
    if (error && /invoice_status|column/i.test(error.message)) {
      return {
        error:
          'Run sales_to_invoice_phase.sql migration to enable Orders to Upsell.',
      };
    }
    if (error) return { error: error.message };

    const rows = data || [];
    const salespersonIds = [
      ...new Set(
        rows.map((r) => (r.salesperson_id ? String(r.salesperson_id) : '')).filter(Boolean)
      ),
    ];
    const salesMap = new Map<string, string>();
    if (salespersonIds.length) {
      const { data: agents } = await supabase
        .from('sales_agents')
        .select('id, name')
        .in('id', salespersonIds);
      for (const a of agents || []) salesMap.set(String(a.id), String(a.name || ''));
    }

    const orders = rows.map((r) => {
      const spId = r.salesperson_id ? String(r.salesperson_id) : '';
      const revenue = Number(r.total_amount) || 0;
      const invStatus = mapInvoiceStatus(r.invoice_status);
      return {
        id: String(r.id),
        quotation_number: String(r.quotation_number || ''),
        customer_name: String(r.customer_name || '—'),
        salesperson_name: spId
          ? salesMap.get(spId) || null
          : String(r.created_by || '') || null,
        current_revenue: revenue,
        invoice_status: invStatus,
        upsell_opportunity:
          invStatus === 'invoiced'
            ? 'Eligible for follow-up products'
            : 'Invoice pending — upsell after invoicing',
        order_date: String(r.quotation_date || r.created_at || ''),
      };
    });

    return { orders, total: count ?? orders.length, page, pageSize };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load orders to upsell',
    };
  }
}

/**
 * Create a Sales invoice from a confirmed SO (no Finance posting).
 * Reuses order lines — does not duplicate product master data.
 */
export async function createSalesInvoiceFromOrder(quotationId: string) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.organizationId && !scope.isGlobalAdminView) {
      return { error: 'Select an organization to create invoices' };
    }

    const supabase = await createAdminClient();
    const { data: order, error: loadError } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', quotationId)
      .eq('status', 'sales_order')
      .maybeSingle();

    if (loadError || !order) {
      return { error: loadError?.message || 'Sales order not found' };
    }

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      order.organization_id &&
      String(order.organization_id) !== scope.organizationId
    ) {
      return { error: 'Order not in the selected organization' };
    }

    const { data: existing } = await supabase
      .from('sales_invoices')
      .select('id')
      .eq('quotation_id', quotationId)
      .maybeSingle();

    if (existing?.id) {
      return { invoiceId: String(existing.id), alreadyExists: true as const };
    }

    const { data: lines } = await supabase
      .from('quotation_lines')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('sequence', { ascending: true });

    let untaxed = 0;
    let tax = 0;
    const lineRows = (lines || []).map((line, idx) => {
      const qty = Number(line.quantity) || 0;
      const price = Number(line.unit_price) || 0;
      const discount = Number(line.discount) || 0;
      const taxPct = Number(line.taxes) || 0;
      const base = qty * price * (1 - discount / 100);
      const taxAmt = base * (taxPct / 100);
      const total = base + taxAmt;
      untaxed += base;
      tax += taxAmt;
      return {
        sequence: Number(line.sequence) || (idx + 1) * 10,
        product_name: String(line.product_name || ''),
        description: line.description ? String(line.description) : null,
        quantity: qty,
        uom: String(line.uom || 'Units'),
        unit_price: price,
        discount,
        taxes: taxPct,
        line_total: Math.round(total * 100) / 100,
        quotation_line_id: line.id ? String(line.id) : null,
      };
    });

    if (!lineRows.length) {
      const qty = Number(order.quantity) || 1;
      const price = Number(order.unit_price) || Number(order.total_amount) || 0;
      const taxPct = Number(order.taxes) || 0;
      const base = qty * price;
      const taxAmt = base * (taxPct / 100);
      untaxed = base;
      tax = taxAmt;
      lineRows.push({
        sequence: 10,
        product_name: String(order.product_service || 'Sales Order'),
        description: null,
        quantity: qty,
        uom: String(order.uom || 'Units'),
        unit_price: price,
        discount: 0,
        taxes: taxPct,
        line_total: Math.round((base + taxAmt) * 100) / 100,
        quotation_line_id: null,
      });
    }

    const orgId = order.organization_id
      ? String(order.organization_id)
      : scope.organizationId;
    const invoiceNumber = await allocateInvoiceNumber(supabase, orgId);
    const today = new Date().toISOString().slice(0, 10);

    const { data: invoice, error: invError } = await supabase
      .from('sales_invoices')
      .insert([
        {
          organization_id: orgId,
          quotation_id: quotationId,
          invoice_number: invoiceNumber,
          customer_name: String(order.customer_name || ''),
          contact_id: order.contact_id || null,
          invoice_date: today,
          due_date: order.expiration_date || today,
          payment_terms: order.payment_terms || 'Immediate',
          notes: order.customer_notes || null,
          untaxed_amount: Math.round(untaxed * 100) / 100,
          tax_amount: Math.round(tax * 100) / 100,
          total_amount: Math.round((untaxed + tax) * 100) / 100,
          status: 'draft',
          created_by: scope.session!.username,
          updated_by: scope.session!.username,
        },
      ])
      .select('*')
      .single();

    if (invError || !invoice) {
      if (invError && /sales_invoices|relation|schema cache/i.test(invError.message)) {
        return {
          error:
            'Run sales_to_invoice_phase.sql migration to enable Sales invoices.',
        };
      }
      return { error: invError?.message || 'Failed to create invoice' };
    }

    if (lineRows.length) {
      await supabase.from('sales_invoice_lines').insert(
        lineRows.map((l) => ({ ...l, sales_invoice_id: invoice.id }))
      );
    }

    await supabase
      .from('quotations')
      .update({
        invoice_status: 'invoiced',
        updated_at: new Date().toISOString(),
        updated_by: scope.session!.username,
      })
      .eq('id', quotationId);

    await supabase.from('quotation_logs').insert([
      {
        quotation_id: quotationId,
        action: 'updated',
        previous_status: order.status,
        new_status: order.status,
        performed_by: scope.session!.username,
        details: {
          invoice_status: 'invoiced',
          sales_invoice_id: invoice.id,
          invoice_number: invoiceNumber,
        },
      },
    ]);

    return { invoiceId: String(invoice.id), alreadyExists: false as const };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create sales invoice',
    };
  }
}

export async function getSalesInvoiceDetail(invoiceId: string) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: inv, error } = await supabase
      .from('sales_invoices')
      .select('*')
      .eq('id', invoiceId)
      .maybeSingle();

    if (error || !inv) return { error: error?.message || 'Invoice not found' };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      inv.organization_id &&
      String(inv.organization_id) !== scope.organizationId
    ) {
      return { error: 'Invoice not found in the selected organization' };
    }

    const { data: lines } = await supabase
      .from('sales_invoice_lines')
      .select('*')
      .eq('sales_invoice_id', invoiceId)
      .order('sequence', { ascending: true });

    const { data: order } = await supabase
      .from('quotations')
      .select('quotation_number, salesperson_id')
      .eq('id', inv.quotation_id)
      .maybeSingle();

    let salesperson_name: string | null = null;
    if (order?.salesperson_id) {
      const { data: sp } = await supabase
        .from('sales_agents')
        .select('name')
        .eq('id', order.salesperson_id)
        .maybeSingle();
      salesperson_name = sp?.name ? String(sp.name) : null;
    }

    let organization_name: string | null = null;
    let company_address: string | null = null;
    let company_email: string | null = null;
    let company_phone: string | null = null;
    let logo_url: string | null = null;

    if (inv.organization_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select(
          'organization_name, email, phone, address, street, city, country, logo_url'
        )
        .eq('id', inv.organization_id)
        .maybeSingle();
      if (org) {
        organization_name = String(org.organization_name || '');
        company_email = org.email ? String(org.email) : null;
        company_phone = org.phone ? String(org.phone) : null;
        logo_url = org.logo_url ? String(org.logo_url) : null;
        company_address = [org.street || org.address, org.city, org.country]
          .filter(Boolean)
          .map(String)
          .join(', ');
      }
    }

    const detail: SalesInvoiceDetail = {
      id: String(inv.id),
      invoice_number: String(inv.invoice_number),
      quotation_id: String(inv.quotation_id),
      quotation_number: String(order?.quotation_number || ''),
      customer_name: String(inv.customer_name || ''),
      contact_id: inv.contact_id ? String(inv.contact_id) : null,
      invoice_date: String(inv.invoice_date || ''),
      due_date: inv.due_date ? String(inv.due_date) : null,
      payment_terms: String(inv.payment_terms || 'Immediate'),
      notes: inv.notes ? String(inv.notes) : null,
      untaxed_amount: Number(inv.untaxed_amount) || 0,
      tax_amount: Number(inv.tax_amount) || 0,
      total_amount: Number(inv.total_amount) || 0,
      status: String(inv.status || 'draft'),
      organization_id: inv.organization_id ? String(inv.organization_id) : null,
      organization_name,
      company_address,
      company_email,
      company_phone,
      logo_url,
      salesperson_name,
      lines: (lines || []).map((l) => ({
        id: String(l.id),
        sequence: Number(l.sequence) || 0,
        product_name: String(l.product_name || ''),
        description: l.description ? String(l.description) : null,
        quantity: Number(l.quantity) || 0,
        uom: String(l.uom || 'Units'),
        unit_price: Number(l.unit_price) || 0,
        discount: Number(l.discount) || 0,
        taxes: Number(l.taxes) || 0,
        line_total: Number(l.line_total) || 0,
      })),
    };

    return { invoice: detail };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load invoice',
    };
  }
}

export async function getSalesInvoiceIdForOrder(quotationId: string) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data } = await supabase
      .from('sales_invoices')
      .select('id')
      .eq('quotation_id', quotationId)
      .maybeSingle();

    return { invoiceId: data?.id ? String(data.id) : null };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to resolve invoice',
    };
  }
}
