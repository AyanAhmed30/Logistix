'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { sessionHasSalesAccess } from '@/lib/auth/require-access';
import { sessionHasAccountingAccess } from '@/lib/accounting-page-access';

export type AccountingInvoiceStatus = 'draft' | 'posted' | 'cancelled' | 'paid';

export type AccountingInvoiceListItem = {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_lead_id: string | null;
  sales_order_number: string | null;
  invoice_date: string;
  due_date: string | null;
  status: AccountingInvoiceStatus;
  payment_state: 'not_paid' | 'in_payment' | 'partial' | 'paid' | 'overdue';
  amount_residual: number;
  untaxed_amount: number;
  total_amount: number;
  last_reminder_at: string | null;
  organization_id: string | null;
  organization_name: string | null;
};

export type AccountingInvoiceLine = {
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
  account: string | null;
};

export type AccountingInvoiceDetail = {
  id: string;
  invoice_number: string;
  status: AccountingInvoiceStatus;
  payment_state: 'not_paid' | 'in_payment' | 'partial' | 'paid' | 'overdue';
  amount_paid: number;
  amount_residual: number;
  contact_id: string | null;
  customer_name: string;
  customer_lead_id: string | null;
  sales_order_id: string | null;
  sales_order_number: string | null;
  quotation_number: string | null;
  salesperson_id: string | null;
  salesperson_name: string | null;
  payment_terms: string | null;
  invoice_date: string;
  due_date: string | null;
  billing_address: string | null;
  shipping_address: string | null;
  contact_person_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  customer_notes: string | null;
  untaxed_amount: number;
  tax_amount: number;
  total_amount: number;
  organization_id: string | null;
  organization_name: string | null;
  company_address: string | null;
  company_email: string | null;
  company_phone: string | null;
  company_website: string | null;
  logo_url: string | null;
  lines: AccountingInvoiceLine[];
};

function formatAddress(row: {
  street?: string | null;
  street2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
} | null): string | null {
  if (!row) return null;
  const parts = [
    row.street,
    row.street2,
    [row.city, row.state].filter(Boolean).join(', '),
    row.zip,
    row.country,
  ]
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  return parts.length ? parts.join('\n') : null;
}

async function resolveAccountingOrgScope(opts?: { allowSalesCreate?: boolean }) {
  const { requireAdminOrganizationScope, sessionUsesOrganizationScope } = await import(
    '@/lib/admin-organization-context'
  );
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' as const };

  const canAccess =
    sessionHasAccountingAccess(session) ||
    (opts?.allowSalesCreate && sessionHasSalesAccess(session));
  if (!canAccess) return { error: 'Unauthorized' as const };

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
    return { error: 'Select an organization from the header switcher.' };
  }

  return {
    session: scope.session,
    organizationId: scope.organizationId,
    isGlobalAdminView: false,
  };
}

async function allocateAccountingInvoiceNumber(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  organizationId: string | null
): Promise<string> {
  if (organizationId) {
    try {
      const { data: seq } = await supabase
        .from('accounting_invoice_sequences')
        .select('prefix, next_number')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (seq) {
        const next = Math.max(1, Number(seq.next_number) || 1);
        const prefix = String(seq.prefix || 'INV');
        await supabase
          .from('accounting_invoice_sequences')
          .update({
            next_number: next + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId);
        return `${prefix}${String(next).padStart(5, '0')}`;
      }

      await supabase.from('accounting_invoice_sequences').insert([
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

/**
 * Create a Draft Customer Invoice in Accounting from a confirmed Sales Order.
 * Reuses Contact Customer ID — never generates a new one.
 */
export async function createAccountingInvoiceFromOrder(quotationId: string) {
  try {
    const scope = await resolveAccountingOrgScope({ allowSalesCreate: true });
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
      .from('accounting_customer_invoices')
      .select('id')
      .eq('sales_order_id', quotationId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      return { invoiceId: String(existing.id), alreadyExists: true as const };
    }

    const contactId = order.contact_id ? String(order.contact_id) : null;
    let contact: Record<string, unknown> | null = null;
    if (contactId) {
      const { data } = await supabase
        .from('contacts')
        .select(
          'id, name, company_name, email, phone, mobile, street, street2, city, state, zip, country, lead_id_formatted, payment_terms'
        )
        .eq('id', contactId)
        .maybeSingle();
      contact = data;
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
        sales_order_line_id: line.id ? String(line.id) : null,
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
        sales_order_line_id: null,
      });
    }

    let salespersonName: string | null = null;
    if (order.salesperson_id) {
      const { data: sp } = await supabase
        .from('sales_agents')
        .select('name')
        .eq('id', order.salesperson_id)
        .maybeSingle();
      salespersonName = sp?.name ? String(sp.name) : null;
    }

    const orgId = order.organization_id
      ? String(order.organization_id)
      : scope.organizationId;
    const invoiceNumber = await allocateAccountingInvoiceNumber(supabase, orgId);
    const today = new Date().toISOString().slice(0, 10);
    const address = formatAddress(contact as never);
    const customerLeadId = contact?.lead_id_formatted
      ? String(contact.lead_id_formatted)
      : null;
    const paymentTerms =
      order.payment_terms ||
      (contact?.payment_terms as string | undefined) ||
      'Immediate';
    const { computeDueDateFromTerms } = await import('@/lib/accounting-due-dates');
    const autoDue =
      computeDueDateFromTerms(today, paymentTerms) ||
      order.expiration_date ||
      today;

    const insertPayload: Record<string, unknown> = {
          organization_id: orgId,
          invoice_number: invoiceNumber,
          status: 'draft',
          contact_id: contactId,
          customer_name: String(
            order.customer_name || contact?.name || contact?.company_name || ''
          ),
          customer_lead_id: customerLeadId,
          sales_order_id: quotationId,
          sales_order_number: String(order.quotation_number || ''),
          quotation_number: String(order.quotation_number || ''),
          salesperson_id: order.salesperson_id || null,
          salesperson_name: salespersonName,
          payment_terms: paymentTerms,
          invoice_date: today,
          due_date: autoDue,
          billing_address: address,
          shipping_address: address,
          contact_person_name: contact?.name ? String(contact.name) : null,
          email: contact?.email ? String(contact.email) : null,
          phone: contact?.phone
            ? String(contact.phone)
            : contact?.mobile
              ? String(contact.mobile)
              : null,
          notes: null,
          customer_notes: order.customer_notes || null,
          untaxed_amount: Math.round(untaxed * 100) / 100,
          tax_amount: Math.round(tax * 100) / 100,
          total_amount: Math.round((untaxed + tax) * 100) / 100,
          created_by: scope.session!.username,
          updated_by: scope.session!.username,
        };

    let { data: invoice, error: invError } = await supabase
      .from('accounting_customer_invoices')
      .insert([insertPayload])
      .select('id')
      .single();

    if (invError && /customer_notes|column/i.test(invError.message)) {
      delete insertPayload.customer_notes;
      insertPayload.notes = order.customer_notes || null;
      const retry = await supabase
        .from('accounting_customer_invoices')
        .insert([insertPayload])
        .select('id')
        .single();
      invoice = retry.data;
      invError = retry.error;
    }

    if (invError || !invoice) {
      if (invError && /accounting_customer_invoices|relation|schema cache/i.test(invError.message)) {
        return {
          error:
            'Run create_accounting_module_phase1.sql migration to enable Accounting invoices.',
        };
      }
      return { error: invError?.message || 'Failed to create invoice' };
    }

    if (lineRows.length) {
      await supabase.from('accounting_customer_invoice_lines').insert(
        lineRows.map((l) => ({ ...l, invoice_id: invoice.id }))
      );
    }

    try {
      await supabase.from('accounting_invoice_logs').insert([
        {
          invoice_id: invoice.id,
          action: 'created',
          previous_status: null,
          new_status: 'draft',
          performed_by: scope.session!.username,
          details: {
            invoice_number: invoiceNumber,
            sales_order_id: quotationId,
            source: 'sales_order',
          },
        },
      ]);
    } catch {
      // logs table optional until phase2 migration
    }

    await supabase
      .from('quotations')
      .update({
        invoice_status: 'invoiced',
        updated_at: new Date().toISOString(),
        updated_by: scope.session!.username,
      })
      .eq('id', quotationId);

    // Keep Sales preview invoice in sync (non-blocking for Accounting)
    try {
      const { createSalesInvoiceFromOrder } = await import(
        '@/app/actions/sales/to-invoice'
      );
      const salesRes = await createSalesInvoiceFromOrder(quotationId);
      if ('invoiceId' in salesRes && salesRes.invoiceId) {
        await supabase
          .from('sales_invoices')
          .update({ finance_invoice_id: invoice.id })
          .eq('id', salesRes.invoiceId);
        await supabase
          .from('accounting_customer_invoices')
          .update({ sales_invoice_id: salesRes.invoiceId })
          .eq('id', invoice.id);
      }
    } catch {
      // Sales preview table optional
    }

    await supabase.from('quotation_logs').insert([
      {
        quotation_id: quotationId,
        action: 'updated',
        previous_status: order.status,
        new_status: order.status,
        performed_by: scope.session!.username,
        details: {
          invoice_status: 'invoiced',
          accounting_invoice_id: invoice.id,
          invoice_number: invoiceNumber,
        },
      },
    ]);

    return { invoiceId: String(invoice.id), alreadyExists: false as const };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to create accounting invoice',
    };
  }
}

/**
 * Create an empty Draft Customer Invoice from Accounting (no Sales Order).
 * Odoo-style "New" — opens the same invoice form for manual entry.
 */
export async function createManualAccountingInvoice() {
  try {
    const scope = await resolveAccountingOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (scope.isGlobalAdminView || !scope.organizationId) {
      return { error: 'Select an organization to create invoices' };
    }

    const supabase = await createAdminClient();
    const orgId = scope.organizationId;
    const invoiceNumber = await allocateAccountingInvoiceNumber(supabase, orgId);
    const today = new Date().toISOString().slice(0, 10);
    const { computeDueDateFromTerms } = await import('@/lib/accounting-due-dates');
    const dueDate = computeDueDateFromTerms(today, 'Immediate') || today;

    const insertPayload: Record<string, unknown> = {
      organization_id: orgId,
      invoice_number: invoiceNumber,
      status: 'draft',
      payment_state: 'not_paid',
      amount_paid: 0,
      amount_residual: 0,
      contact_id: null,
      customer_name: '',
      customer_lead_id: null,
      sales_order_id: null,
      sales_order_number: null,
      quotation_number: null,
      salesperson_id: null,
      salesperson_name: null,
      payment_terms: 'Immediate',
      invoice_date: today,
      due_date: dueDate,
      billing_address: null,
      shipping_address: null,
      contact_person_name: null,
      email: null,
      phone: null,
      notes: null,
      customer_notes: null,
      untaxed_amount: 0,
      tax_amount: 0,
      total_amount: 0,
      created_by: scope.session!.username,
      updated_by: scope.session!.username,
    };

    let { data: invoice, error: invError } = await supabase
      .from('accounting_customer_invoices')
      .insert([insertPayload])
      .select('id')
      .single();

    if (invError && /customer_notes|payment_state|amount_paid|amount_residual|column/i.test(invError.message)) {
      delete insertPayload.customer_notes;
      delete insertPayload.payment_state;
      delete insertPayload.amount_paid;
      delete insertPayload.amount_residual;
      const retry = await supabase
        .from('accounting_customer_invoices')
        .insert([insertPayload])
        .select('id')
        .single();
      invoice = retry.data;
      invError = retry.error;
    }

    if (invError || !invoice) {
      if (invError && /accounting_customer_invoices|relation|schema cache/i.test(invError.message)) {
        return {
          error:
            'Run create_accounting_module_phase1.sql migration to enable Accounting invoices.',
        };
      }
      if (invError && /duplicate|unique|invoice_number/i.test(invError.message)) {
        return { error: 'Invoice number conflict — please try again.' };
      }
      return { error: invError?.message || 'Failed to create invoice' };
    }

    // One blank product line so the form is ready to edit (Odoo-like)
    const blankLine = {
      invoice_id: invoice.id,
      sequence: 10,
      product_name: '',
      description: null,
      quantity: 1,
      uom: 'Units',
      unit_price: 0,
      discount: 0,
      taxes: 0,
      line_total: 0,
      account: 'Sales',
      sales_order_line_id: null,
    };
    const { error: lineInsErr } = await supabase
      .from('accounting_customer_invoice_lines')
      .insert([blankLine]);
    if (lineInsErr && /account|column/i.test(lineInsErr.message)) {
      const { account: _a, ...legacy } = blankLine;
      await supabase.from('accounting_customer_invoice_lines').insert([legacy]);
    }

    try {
      await supabase.from('accounting_invoice_logs').insert([
        {
          invoice_id: invoice.id,
          action: 'created',
          previous_status: null,
          new_status: 'draft',
          performed_by: scope.session!.username,
          details: {
            invoice_number: invoiceNumber,
            source: 'manual',
            organization_id: orgId,
          },
        },
      ]);
    } catch {
      // logs optional
    }

    return { invoiceId: String(invoice.id) };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to create accounting invoice',
    };
  }
}

export async function getAccountingInvoiceIdForOrder(quotationId: string) {
  try {
    const scope = await resolveAccountingOrgScope({ allowSalesCreate: true });
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data } = await supabase
      .from('accounting_customer_invoices')
      .select('id')
      .eq('sales_order_id', quotationId)
      .maybeSingle();

    return { invoiceId: data?.id ? String(data.id) : null };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to resolve invoice',
    };
  }
}

export async function getAccountingCustomerInvoices(filters: {
  search?: string;
  status?: AccountingInvoiceStatus | 'all';
  sortBy?:
    | 'invoice_number'
    | 'customer_name'
    | 'invoice_date'
    | 'due_date'
    | 'total_amount'
    | 'status';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
} = {}) {
  try {
    const scope = await resolveAccountingOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return {
        invoices: [] as AccountingInvoiceListItem[],
        total: 0,
        page: 1,
        pageSize: 40,
      };
    }

    const supabase = await createAdminClient();
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(100, Math.max(10, filters.pageSize || 40));
    const sortBy = filters.sortBy || 'invoice_number';
    const ascending = filters.sortDir !== 'desc';

    let query = supabase
      .from('accounting_customer_invoices')
      .select('*', { count: 'exact' });

    if (scope.organizationId && !scope.isGlobalAdminView) {
      query = query.eq('organization_id', scope.organizationId);
    }

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    const needle = String(filters.search || '').trim();
    if (needle) {
      const like = `%${needle}%`;
      query = query.or(
        `invoice_number.ilike.${like},customer_name.ilike.${like},customer_lead_id.ilike.${like},sales_order_number.ilike.${like}`
      );
    }

    query = query
      .order(sortBy, { ascending, nullsFirst: false })
      .order('created_at', { ascending, nullsFirst: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    const { data, error, count } = await query;

    if (error && /accounting_customer_invoices|relation|schema cache/i.test(error.message)) {
      return {
        error:
          'Run create_accounting_module_phase1.sql migration to enable Accounting invoices.',
        invoices: [] as AccountingInvoiceListItem[],
        total: 0,
        page,
        pageSize,
      };
    }
    if (error) return { error: error.message };

    const rows = data || [];
    const orgIds = [
      ...new Set(
        rows
          .map((r) => (r.organization_id ? String(r.organization_id) : ''))
          .filter(Boolean)
      ),
    ];
    const orgMap = new Map<string, string>();
    if (orgIds.length) {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, organization_name')
        .in('id', orgIds);
      for (const o of orgs || []) {
        orgMap.set(String(o.id), String(o.organization_name || ''));
      }
    }

    const { computePaymentState } = await import('@/lib/accounting-payments');

    const invoiceIds = rows.map((r) => String(r.id));
    const reminderMap = new Map<string, string>();
    if (invoiceIds.length) {
      try {
        const { data: reminders } = await supabase
          .from('accounting_reminders')
          .select('invoice_id, sent_at, due_at, status, created_at')
          .in('invoice_id', invoiceIds)
          .order('created_at', { ascending: false });
        for (const rem of reminders || []) {
          const invId = String(rem.invoice_id || '');
          if (!invId || reminderMap.has(invId)) continue;
          const at = rem.sent_at || rem.due_at || rem.created_at;
          if (at) reminderMap.set(invId, String(at));
        }
      } catch {
        // reminders table optional
      }
    }

    const invoices: AccountingInvoiceListItem[] = rows.map((r) => {
      const orgId = r.organization_id ? String(r.organization_id) : null;
      const total = Number(r.total_amount) || 0;
      const paid = Number(r.amount_paid) || 0;
      const storedState = String(r.payment_state || 'not_paid');
      const computed =
        storedState === 'in_payment'
          ? {
              paymentState: 'in_payment' as const,
              outstanding: Number.isFinite(Number(r.amount_residual))
                ? Number(r.amount_residual)
                : Math.max(0, total - paid),
              amountPaid: paid,
            }
          : computePaymentState({
              total,
              amountPaid: paid,
              dueDate: r.due_date ? String(r.due_date) : null,
              workflowStatus: String(r.status || ''),
            });
      return {
        id: String(r.id),
        invoice_number: String(r.invoice_number || ''),
        customer_name: String(r.customer_name || '—'),
        customer_lead_id: r.customer_lead_id ? String(r.customer_lead_id) : null,
        sales_order_number: r.sales_order_number
          ? String(r.sales_order_number)
          : null,
        invoice_date: String(r.invoice_date || ''),
        due_date: r.due_date ? String(r.due_date) : null,
        status: (String(r.status || 'draft') as AccountingInvoiceStatus) || 'draft',
        payment_state: computed.paymentState,
        amount_residual: computed.outstanding,
        untaxed_amount: Number(r.untaxed_amount) || 0,
        total_amount: total,
        last_reminder_at: reminderMap.get(String(r.id)) || null,
        organization_id: orgId,
        organization_name: orgId ? orgMap.get(orgId) || null : null,
      };
    });

    return { invoices, total: count ?? invoices.length, page, pageSize };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load invoices',
    };
  }
}

export async function getAccountingInvoiceDetail(invoiceId: string) {
  try {
    const scope = await resolveAccountingOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: inv, error } = await supabase
      .from('accounting_customer_invoices')
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
      .from('accounting_customer_invoice_lines')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('sequence', { ascending: true });

    let organization_name: string | null = null;
    let company_address: string | null = null;
    let company_email: string | null = null;
    let company_phone: string | null = null;
    let company_website: string | null = null;
    let logo_url: string | null = null;
    if (inv.organization_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select(
          'organization_name, email, phone, address, street, city, country, website, logo_url'
        )
        .eq('id', inv.organization_id)
        .maybeSingle();
      if (org) {
        organization_name = org.organization_name
          ? String(org.organization_name)
          : null;
        company_email = org.email ? String(org.email) : null;
        company_phone = org.phone ? String(org.phone) : null;
        company_website = org.website ? String(org.website) : null;
        logo_url = org.logo_url ? String(org.logo_url) : null;
        const addrParts = [
          org.address || org.street,
          org.city,
          org.country,
        ]
          .map((p) => String(p || '').trim())
          .filter(Boolean);
        company_address = addrParts.length ? addrParts.join(', ') : null;
      }
    }

    const totalAmount = Number(inv.total_amount) || 0;
    let amountPaid = Number(inv.amount_paid);
    if (!Number.isFinite(amountPaid)) amountPaid = 0;
    // Prefer live sum when payments table exists
    try {
      const { data: payRows } = await supabase
        .from('accounting_invoice_payments')
        .select('amount')
        .eq('invoice_id', invoiceId);
      if (payRows) {
        amountPaid = Math.round(
          payRows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0) * 100
        ) / 100;
      }
    } catch {
      // payments table optional until phase4 migration
    }

    const { computePaymentState } = await import('@/lib/accounting-payments');
    const storedState = String(inv.payment_state || 'not_paid');
    const paymentComputed =
      storedState === 'in_payment'
        ? {
            paymentState: 'in_payment' as const,
            amountPaid: Number.isFinite(Number(inv.amount_paid))
              ? Number(inv.amount_paid)
              : 0,
            outstanding: Number.isFinite(Number(inv.amount_residual))
              ? Number(inv.amount_residual)
              : Math.max(0, totalAmount - (Number(inv.amount_paid) || 0)),
          }
        : computePaymentState({
            total: totalAmount,
            amountPaid,
            dueDate: inv.due_date ? String(inv.due_date) : null,
            workflowStatus: String(inv.status || ''),
          });

    const detail: AccountingInvoiceDetail = {
      id: String(inv.id),
      invoice_number: String(inv.invoice_number || ''),
      status: (String(inv.status || 'draft') as AccountingInvoiceStatus) || 'draft',
      payment_state: paymentComputed.paymentState,
      amount_paid: paymentComputed.amountPaid,
      amount_residual: paymentComputed.outstanding,
      contact_id: inv.contact_id ? String(inv.contact_id) : null,
      customer_name: String(inv.customer_name || ''),
      customer_lead_id: inv.customer_lead_id ? String(inv.customer_lead_id) : null,
      sales_order_id: inv.sales_order_id ? String(inv.sales_order_id) : null,
      sales_order_number: inv.sales_order_number
        ? String(inv.sales_order_number)
        : null,
      quotation_number: inv.quotation_number ? String(inv.quotation_number) : null,
      salesperson_id: inv.salesperson_id ? String(inv.salesperson_id) : null,
      salesperson_name: inv.salesperson_name ? String(inv.salesperson_name) : null,
      payment_terms: inv.payment_terms ? String(inv.payment_terms) : null,
      invoice_date: String(inv.invoice_date || ''),
      due_date: inv.due_date ? String(inv.due_date) : null,
      billing_address: inv.billing_address ? String(inv.billing_address) : null,
      shipping_address: inv.shipping_address ? String(inv.shipping_address) : null,
      contact_person_name: inv.contact_person_name
        ? String(inv.contact_person_name)
        : null,
      email: inv.email ? String(inv.email) : null,
      phone: inv.phone ? String(inv.phone) : null,
      notes: inv.notes ? String(inv.notes) : null,
      customer_notes: inv.customer_notes ? String(inv.customer_notes) : null,
      untaxed_amount: Number(inv.untaxed_amount) || 0,
      tax_amount: Number(inv.tax_amount) || 0,
      total_amount: totalAmount,
      organization_id: inv.organization_id ? String(inv.organization_id) : null,
      organization_name,
      company_address,
      company_email,
      company_phone,
      company_website,
      logo_url,
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
        account: (l as { account?: string | null }).account
          ? String((l as { account?: string | null }).account)
          : 'Sales',
      })),
    };

    return { invoice: detail };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load invoice',
    };
  }
}

export async function getAccountingDashboardStats() {
  try {
    const scope = await resolveAccountingOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { draftCount: 0, invoiceCount: 0, customerCount: 0 };
    }

    const supabase = await createAdminClient();
    let invQuery = supabase
      .from('accounting_customer_invoices')
      .select('id, status', { count: 'exact' });
    let custQuery = supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .gt('customer_rank', 0)
      .is('parent_id', null);

    if (scope.organizationId && !scope.isGlobalAdminView) {
      invQuery = invQuery.eq('organization_id', scope.organizationId);
      custQuery = custQuery.eq('organization_id', scope.organizationId);
    }

    const [invRes, custRes] = await Promise.all([invQuery, custQuery]);

    if (invRes.error && /accounting_customer_invoices|relation/i.test(invRes.error.message)) {
      return { draftCount: 0, invoiceCount: 0, customerCount: custRes.count ?? 0 };
    }

    const rows = invRes.data || [];
    return {
      draftCount: rows.filter((r) => r.status === 'draft').length,
      invoiceCount: invRes.count ?? rows.length,
      customerCount: custRes.count ?? 0,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load dashboard',
    };
  }
}
