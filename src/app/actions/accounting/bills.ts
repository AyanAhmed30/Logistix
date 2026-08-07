'use server';

import { createAdminClient } from '@/utils/supabase/server';
import {
  computeBillLineTotal,
  formatVendorAddress,
  resolveVendorAccountingScope,
} from '@/lib/accounting-vendor-scope';

export type AccountingBillStatus = 'draft' | 'posted' | 'cancelled' | 'paid';

export type AccountingBillListItem = {
  id: string;
  bill_number: string;
  vendor_name: string;
  vendor_lead_id: string | null;
  bill_date: string;
  due_date: string | null;
  reference: string | null;
  status: AccountingBillStatus;
  payment_state: 'not_paid' | 'partial' | 'paid' | 'overdue';
  amount_residual: number;
  total_amount: number;
  organization_id: string | null;
  organization_name: string | null;
};

export type AccountingBillLine = {
  id: string;
  sequence: number;
  product_id?: string | null;
  product_name: string;
  description: string | null;
  quantity: number;
  uom: string;
  unit_price: number;
  discount: number;
  taxes: number;
  line_total: number;
};

export type AccountingBillDetail = {
  id: string;
  bill_number: string;
  status: AccountingBillStatus;
  payment_state: 'not_paid' | 'partial' | 'paid' | 'overdue';
  amount_paid: number;
  amount_residual: number;
  contact_id: string | null;
  vendor_name: string;
  vendor_lead_id: string | null;
  reference: string | null;
  payment_terms: string | null;
  bill_date: string;
  due_date: string | null;
  billing_address: string | null;
  contact_person_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  vendor_notes: string | null;
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
  lines: AccountingBillLine[];
};

async function allocateBillNumber(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  organizationId: string | null
): Promise<string> {
  if (organizationId) {
    try {
      const { data: seq } = await supabase
        .from('accounting_vendor_bill_sequences')
        .select('prefix, next_number')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (seq) {
        const next = Math.max(1, Number(seq.next_number) || 1);
        const prefix = String(seq.prefix || 'BILL');
        await supabase
          .from('accounting_vendor_bill_sequences')
          .update({
            next_number: next + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId);
        return `${prefix}${String(next).padStart(5, '0')}`;
      }

      await supabase.from('accounting_vendor_bill_sequences').insert([
        { organization_id: organizationId, prefix: 'BILL', next_number: 2 },
      ]);
      return 'BILL00001';
    } catch {
      // fall through
    }
  }

  const year = new Date().getFullYear();
  return `BILL/${year}/${String(Date.now()).slice(-4)}`;
}

function mapBill(row: Record<string, unknown>, lines: AccountingBillLine[], org?: {
  organization_name?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  logo_url?: string | null;
  address?: string | null;
}): AccountingBillDetail {
  return {
    id: String(row.id),
    bill_number: String(row.bill_number || ''),
    status: (String(row.status || 'draft') as AccountingBillStatus),
    payment_state: (String(row.payment_state || 'not_paid') as AccountingBillDetail['payment_state']),
    amount_paid: Number(row.amount_paid) || 0,
    amount_residual:
      row.amount_residual != null
        ? Number(row.amount_residual)
        : Math.max(0, (Number(row.total_amount) || 0) - (Number(row.amount_paid) || 0)),
    contact_id: row.contact_id ? String(row.contact_id) : null,
    vendor_name: String(row.vendor_name || ''),
    vendor_lead_id: row.vendor_lead_id ? String(row.vendor_lead_id) : null,
    reference: row.reference ? String(row.reference) : null,
    payment_terms: row.payment_terms ? String(row.payment_terms) : null,
    bill_date: String(row.bill_date || ''),
    due_date: row.due_date ? String(row.due_date) : null,
    billing_address: row.billing_address ? String(row.billing_address) : null,
    contact_person_name: row.contact_person_name
      ? String(row.contact_person_name)
      : null,
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    notes: row.notes ? String(row.notes) : null,
    vendor_notes: row.vendor_notes ? String(row.vendor_notes) : null,
    untaxed_amount: Number(row.untaxed_amount) || 0,
    tax_amount: Number(row.tax_amount) || 0,
    total_amount: Number(row.total_amount) || 0,
    organization_id: row.organization_id ? String(row.organization_id) : null,
    organization_name: org?.organization_name || null,
    company_address: org?.address || null,
    company_email: org?.email || null,
    company_phone: org?.phone || null,
    company_website: org?.website || null,
    logo_url: org?.logo_url || null,
    lines,
  };
}

export async function createManualAccountingBill() {
  try {
    const scope = await resolveVendorAccountingScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (scope.isGlobalAdminView || !scope.organizationId) {
      return { error: 'Select an organization to create bills' };
    }

    const supabase = await createAdminClient();
    const orgId = scope.organizationId;
    const billNumber = await allocateBillNumber(supabase, orgId);
    const today = new Date().toISOString().slice(0, 10);
    const { computeDueDateFromTerms } = await import('@/lib/accounting-due-dates');
    const dueDate = computeDueDateFromTerms(today, 'Immediate') || today;

    const billPayload: Record<string, unknown> = {
          organization_id: orgId,
          bill_number: billNumber,
          status: 'draft',
          payment_state: 'not_paid',
          vendor_name: '',
          payment_terms: 'Immediate',
          bill_date: today,
          due_date: dueDate,
          untaxed_amount: 0,
          tax_amount: 0,
          total_amount: 0,
          amount_paid: 0,
          amount_residual: 0,
          created_by: scope.session!.username,
          updated_by: scope.session!.username,
        };

    try {
      const { resolveDocumentCurrencyFields } = await import(
        '@/app/actions/accounting/currencies'
      );
      const fx = await resolveDocumentCurrencyFields({
        organizationId: orgId,
        rateDate: today,
        totalAmount: 0,
      });
      if ('currency_id' in fx) {
        billPayload.currency_id = fx.currency_id;
        billPayload.currency_code = fx.currency_code;
        billPayload.exchange_rate = fx.exchange_rate;
        billPayload.amount_total_company = fx.amount_total_company;
      }
    } catch {
      /* optional until Currency Engine migration */
    }

    let { data: bill, error } = await supabase
      .from('accounting_vendor_bills')
      .insert([billPayload])
      .select('id')
      .single();

    if (
      error &&
      /currency_id|currency_code|exchange_rate|amount_total_company|column/i.test(
        error.message
      )
    ) {
      delete billPayload.currency_id;
      delete billPayload.currency_code;
      delete billPayload.exchange_rate;
      delete billPayload.amount_total_company;
      const retry = await supabase
        .from('accounting_vendor_bills')
        .insert([billPayload])
        .select('id')
        .single();
      bill = retry.data;
      error = retry.error;
    }

    if (error || !bill) {
      if (error && /accounting_vendor_bills|relation|schema cache/i.test(error.message)) {
        return {
          error:
            'Run create_accounting_vendors_module.sql migration to enable Vendor Bills.',
        };
      }
      return { error: error?.message || 'Failed to create bill' };
    }

    await supabase.from('accounting_vendor_bill_lines').insert([
      {
        bill_id: bill.id,
        sequence: 10,
        product_name: '',
        quantity: 1,
        uom: 'Units',
        unit_price: 0,
        discount: 0,
        taxes: 0,
        line_total: 0,
      },
    ]);

    try {
      await supabase.from('accounting_vendor_bill_logs').insert([
        {
          bill_id: bill.id,
          action: 'created',
          previous_status: null,
          new_status: 'draft',
          performed_by: scope.session!.username,
          details: { bill_number: billNumber, organization_id: orgId },
        },
      ]);
    } catch {
      // optional
    }

    return { billId: String(bill.id) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create bill',
    };
  }
}

export async function getAccountingVendorBills(filters: {
  search?: string;
  status?: AccountingBillStatus | 'all';
  sortBy?:
    | 'bill_number'
    | 'vendor_name'
    | 'bill_date'
    | 'due_date'
    | 'total_amount'
    | 'status';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  contactId?: string;
} = {}) {
  try {
    const scope = await resolveVendorAccountingScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { bills: [] as AccountingBillListItem[], total: 0, page: 1, pageSize: 40 };
    }

    const supabase = await createAdminClient();
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(100, Math.max(10, filters.pageSize || 40));
    const sortBy = filters.sortBy || 'bill_date';
    const ascending = filters.sortDir === 'asc';

    let query = supabase.from('accounting_vendor_bills').select('*', { count: 'exact' });

    if (scope.organizationId && !scope.isGlobalAdminView) {
      query = query.eq('organization_id', scope.organizationId);
    }
    if (filters.contactId) query = query.eq('contact_id', filters.contactId);
    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    const needle = String(filters.search || '').trim();
    if (needle) {
      const like = `%${needle}%`;
      query = query.or(
        `bill_number.ilike.${like},vendor_name.ilike.${like},vendor_lead_id.ilike.${like},reference.ilike.${like}`
      );
    }

    query = query
      .order(sortBy, { ascending, nullsFirst: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    const { data, error, count } = await query;
    if (error) {
      if (/accounting_vendor_bills|relation|schema cache/i.test(error.message)) {
        return { bills: [] as AccountingBillListItem[], total: 0, page, pageSize };
      }
      return { error: error.message };
    }

    const rows = data || [];
    const orgIds = [
      ...new Set(rows.map((r) => String(r.organization_id || '')).filter(Boolean)),
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

    const bills: AccountingBillListItem[] = rows.map((r) => ({
      id: String(r.id),
      bill_number: String(r.bill_number || ''),
      vendor_name: String(r.vendor_name || ''),
      vendor_lead_id: r.vendor_lead_id ? String(r.vendor_lead_id) : null,
      bill_date: String(r.bill_date || ''),
      due_date: r.due_date ? String(r.due_date) : null,
      reference: r.reference ? String(r.reference) : null,
      status: String(r.status || 'draft') as AccountingBillStatus,
      payment_state: (String(r.payment_state || 'not_paid') as AccountingBillListItem['payment_state']),
      amount_residual:
        r.amount_residual != null
          ? Number(r.amount_residual)
          : Math.max(0, (Number(r.total_amount) || 0) - (Number(r.amount_paid) || 0)),
      total_amount: Number(r.total_amount) || 0,
      organization_id: r.organization_id ? String(r.organization_id) : null,
      organization_name: orgMap.get(String(r.organization_id)) || null,
    }));

    return { bills, total: count ?? bills.length, page, pageSize };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load bills',
    };
  }
}

export async function getAccountingBillDetail(billId: string) {
  try {
    const scope = await resolveVendorAccountingScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from('accounting_vendor_bills')
      .select('*')
      .eq('id', billId)
      .maybeSingle();

    if (error || !row) {
      if (error && /accounting_vendor_bills|relation/i.test(error.message)) {
        return { error: 'Run create_accounting_vendors_module.sql migration.' };
      }
      return { error: error?.message || 'Bill not found' };
    }

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      row.organization_id &&
      String(row.organization_id) !== scope.organizationId
    ) {
      return { error: 'Bill not in the selected organization' };
    }

    const { data: lineRows } = await supabase
      .from('accounting_vendor_bill_lines')
      .select('*')
      .eq('bill_id', billId)
      .order('sequence', { ascending: true });

    const lines: AccountingBillLine[] = (lineRows || []).map((l) => ({
      id: String(l.id),
      sequence: Number(l.sequence) || 10,
      product_id: (l as { product_id?: string | null }).product_id
        ? String((l as { product_id?: string | null }).product_id)
        : null,
      product_name: String(l.product_name || ''),
      description: l.description ? String(l.description) : null,
      quantity: Number(l.quantity) || 0,
      uom: String(l.uom || 'Units'),
      unit_price: Number(l.unit_price) || 0,
      discount: Number(l.discount) || 0,
      taxes: Number(l.taxes) || 0,
      line_total: Number(l.line_total) || computeBillLineTotal(l),
    }));

    let orgMeta: {
      organization_name?: string | null;
      email?: string | null;
      phone?: string | null;
      website?: string | null;
      logo_url?: string | null;
      address?: string | null;
    } = {};

    if (row.organization_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select(
          'organization_name, email, phone, website, logo_url, address, street, city, country'
        )
        .eq('id', row.organization_id)
        .maybeSingle();
      if (org) {
        orgMeta = {
          organization_name: org.organization_name
            ? String(org.organization_name)
            : null,
          email: org.email ? String(org.email) : null,
          phone: org.phone ? String(org.phone) : null,
          website: org.website ? String(org.website) : null,
          logo_url: org.logo_url ? String(org.logo_url) : null,
          address:
            formatVendorAddress(org) ||
            (org.address ? String(org.address) : null),
        };
      }
    }

    return { bill: mapBill(row as Record<string, unknown>, lines, orgMeta) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load bill',
    };
  }
}

export { allocateBillNumber };
