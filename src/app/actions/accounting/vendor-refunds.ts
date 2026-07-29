'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getAccountingBillDetail } from '@/app/actions/accounting/bills';
import {
  computeBillTotals,
  resolveVendorAccountingScope,
} from '@/lib/accounting-vendor-scope';

export type VendorRefundStatus = 'draft' | 'posted' | 'cancelled';
export type VendorRefundType =
  | 'full'
  | 'partial'
  | 'price_adjustment'
  | 'product_return'
  | 'vendor_credit';

export type AccountingVendorRefundLine = {
  id: string;
  sequence: number;
  bill_line_id: string | null;
  product_name: string;
  description: string | null;
  quantity: number;
  uom: string;
  unit_price: number;
  discount: number;
  taxes: number;
  line_total: number;
};

export type AccountingVendorRefundDetail = {
  id: string;
  refund_number: string;
  status: VendorRefundStatus;
  bill_id: string | null;
  bill_number: string | null;
  contact_id: string | null;
  vendor_name: string;
  vendor_lead_id: string | null;
  reason: string | null;
  refund_type: VendorRefundType;
  refund_date: string;
  billing_address: string | null;
  contact_person_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  vendor_notes: string | null;
  untaxed_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_refunded: number;
  organization_id: string | null;
  organization_name: string | null;
  lines: AccountingVendorRefundLine[];
};

async function allocateRefundNumber(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  organizationId: string | null
) {
  if (organizationId) {
    try {
      const { data: seq } = await supabase
        .from('accounting_vendor_refund_sequences')
        .select('prefix, next_number')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (seq) {
        const next = Math.max(1, Number(seq.next_number) || 1);
        const prefix = String(seq.prefix || 'RREF');
        await supabase
          .from('accounting_vendor_refund_sequences')
          .update({ next_number: next + 1, updated_at: new Date().toISOString() })
          .eq('organization_id', organizationId);
        return `${prefix}${String(next).padStart(5, '0')}`;
      }
      await supabase.from('accounting_vendor_refund_sequences').insert([
        { organization_id: organizationId, prefix: 'RREF', next_number: 2 },
      ]);
      return 'RREF00001';
    } catch {
      // fall through
    }
  }
  return `RREF/${new Date().getFullYear()}/${String(Date.now()).slice(-4)}`;
}

export async function createVendorRefundFromBill(
  billId: string,
  opts?: {
    refund_type?: VendorRefundType;
    reason?: string;
    lineIds?: string[];
  }
) {
  try {
    const scope = await resolveVendorAccountingScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const detailRes = await getAccountingBillDetail(billId);
    if ('error' in detailRes && detailRes.error) return { error: detailRes.error };
    const bill = detailRes.bill!;

    if (bill.status !== 'posted' && bill.status !== 'paid') {
      return { error: 'Refunds can only be created from Posted bills' };
    }
    if (!bill.organization_id && !scope.organizationId) {
      return { error: 'Select an organization' };
    }

    const orgId = bill.organization_id || scope.organizationId!;
    const supabase = await createAdminClient();
    const refundType = opts?.refund_type || 'full';
    let lines = bill.lines.filter(
      (l) => String(l.product_name || '').trim() || Number(l.line_total) > 0
    );
    if (opts?.lineIds?.length) {
      const set = new Set(opts.lineIds);
      lines = lines.filter((l) => set.has(l.id));
    }
    if (!lines.length) return { error: 'No lines to refund' };

    const totals = computeBillTotals(lines);
    const refundNumber = await allocateRefundNumber(supabase, orgId);
    const today = new Date().toISOString().slice(0, 10);

    const { data: refund, error } = await supabase
      .from('accounting_vendor_refunds')
      .insert([
        {
          organization_id: orgId,
          refund_number: refundNumber,
          status: 'draft',
          bill_id: bill.id,
          bill_number: bill.bill_number,
          contact_id: bill.contact_id,
          vendor_name: bill.vendor_name,
          vendor_lead_id: bill.vendor_lead_id,
          reason: opts?.reason || null,
          refund_type: refundType === 'full' && opts?.lineIds?.length ? 'partial' : refundType,
          refund_date: today,
          billing_address: bill.billing_address,
          contact_person_name: bill.contact_person_name,
          email: bill.email,
          phone: bill.phone,
          notes: null,
          vendor_notes: null,
          untaxed_amount: totals.untaxed_amount,
          tax_amount: totals.tax_amount,
          total_amount: totals.total_amount,
          amount_refunded: 0,
          created_by: scope.session!.username,
          updated_by: scope.session!.username,
        },
      ])
      .select('id')
      .single();

    if (error || !refund) {
      if (error && /accounting_vendor_refunds|relation/i.test(error.message)) {
        return {
          error: 'Run create_accounting_vendors_module.sql migration.',
        };
      }
      return { error: error?.message || 'Failed to create refund' };
    }

    await supabase.from('accounting_vendor_refund_lines').insert(
      lines.map((l, idx) => ({
        refund_id: refund.id,
        bill_line_id: l.id,
        sequence: l.sequence || (idx + 1) * 10,
        product_name: l.product_name,
        description: l.description,
        quantity: l.quantity,
        uom: l.uom,
        unit_price: l.unit_price,
        discount: l.discount,
        taxes: l.taxes,
        line_total: l.line_total,
      }))
    );

    try {
      await supabase.from('accounting_vendor_bill_logs').insert([
        {
          bill_id: billId,
          action: 'refund_created',
          previous_status: bill.status,
          new_status: bill.status,
          performed_by: scope.session!.username,
          details: {
            refund_id: refund.id,
            refund_number: refundNumber,
            total_amount: totals.total_amount,
          },
        },
      ]);
    } catch {
      // optional
    }

    return { refundId: String(refund.id) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create refund',
    };
  }
}

export async function getAccountingVendorRefunds(filters: {
  search?: string;
  status?: VendorRefundStatus | 'all';
  page?: number;
  pageSize?: number;
} = {}) {
  try {
    const scope = await resolveVendorAccountingScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(50, Math.max(10, filters.pageSize || 40));

    let query = supabase
      .from('accounting_vendor_refunds')
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
        `refund_number.ilike.${like},vendor_name.ilike.${like},vendor_lead_id.ilike.${like},bill_number.ilike.${like}`
      );
    }

    query = query
      .order('refund_date', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    const { data, error, count } = await query;
    if (error) {
      if (/accounting_vendor_refunds|relation/i.test(error.message)) {
        return { refunds: [], total: 0, page, pageSize };
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

    return {
      refunds: rows.map((r) => ({
        id: String(r.id),
        refund_number: String(r.refund_number || ''),
        vendor_name: String(r.vendor_name || ''),
        vendor_lead_id: r.vendor_lead_id ? String(r.vendor_lead_id) : null,
        bill_number: r.bill_number ? String(r.bill_number) : null,
        bill_id: r.bill_id ? String(r.bill_id) : null,
        refund_date: String(r.refund_date || ''),
        status: String(r.status || 'draft'),
        refund_type: String(r.refund_type || 'full'),
        total_amount: Number(r.total_amount) || 0,
        amount_refunded: Number(r.amount_refunded) || 0,
        organization_name: orgMap.get(String(r.organization_id)) || null,
      })),
      total: count ?? 0,
      page,
      pageSize,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load refunds',
    };
  }
}

export async function getAccountingVendorRefundDetail(refundId: string) {
  try {
    const scope = await resolveVendorAccountingScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from('accounting_vendor_refunds')
      .select('*')
      .eq('id', refundId)
      .maybeSingle();

    if (error || !row) return { error: error?.message || 'Refund not found' };
    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      row.organization_id &&
      String(row.organization_id) !== scope.organizationId
    ) {
      return { error: 'Refund not in the selected organization' };
    }

    const { data: lineRows } = await supabase
      .from('accounting_vendor_refund_lines')
      .select('*')
      .eq('refund_id', refundId)
      .order('sequence', { ascending: true });

    let organization_name: string | null = null;
    if (row.organization_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('organization_name')
        .eq('id', row.organization_id)
        .maybeSingle();
      organization_name = org?.organization_name
        ? String(org.organization_name)
        : null;
    }

    const refund: AccountingVendorRefundDetail = {
      id: String(row.id),
      refund_number: String(row.refund_number || ''),
      status: String(row.status || 'draft') as VendorRefundStatus,
      bill_id: row.bill_id ? String(row.bill_id) : null,
      bill_number: row.bill_number ? String(row.bill_number) : null,
      contact_id: row.contact_id ? String(row.contact_id) : null,
      vendor_name: String(row.vendor_name || ''),
      vendor_lead_id: row.vendor_lead_id ? String(row.vendor_lead_id) : null,
      reason: row.reason ? String(row.reason) : null,
      refund_type: String(row.refund_type || 'full') as VendorRefundType,
      refund_date: String(row.refund_date || ''),
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
      amount_refunded: Number(row.amount_refunded) || 0,
      organization_id: row.organization_id ? String(row.organization_id) : null,
      organization_name,
      lines: (lineRows || []).map((l) => ({
        id: String(l.id),
        sequence: Number(l.sequence) || 10,
        bill_line_id: l.bill_line_id ? String(l.bill_line_id) : null,
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

    return { refund };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load refund',
    };
  }
}

export async function postAccountingVendorRefund(refundId: string) {
  try {
    const scope = await resolveVendorAccountingScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: row } = await supabase
      .from('accounting_vendor_refunds')
      .select('*')
      .eq('id', refundId)
      .maybeSingle();
    if (!row) return { error: 'Refund not found' };
    if (String(row.status) !== 'draft') {
      return { error: 'Only draft refunds can be posted' };
    }

    const { error } = await supabase
      .from('accounting_vendor_refunds')
      .update({
        status: 'posted',
        posted_at: new Date().toISOString(),
        amount_refunded: Number(row.total_amount) || 0,
        updated_by: scope.session!.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', refundId);

    if (error) return { error: error.message };

    if (row.bill_id) {
      await supabase
        .from('accounting_vendor_bills')
        .update({
          refund_status: 'refunded',
          updated_by: scope.session!.username,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.bill_id);

      try {
        await supabase.from('accounting_vendor_bill_logs').insert([
          {
            bill_id: row.bill_id,
            action: 'refund_posted',
            performed_by: scope.session!.username,
            details: {
              refund_id: refundId,
              refund_number: row.refund_number,
              amount: row.total_amount,
            },
          },
        ]);
      } catch {
        // optional
      }
    }

    return getAccountingVendorRefundDetail(refundId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to post refund',
    };
  }
}

export async function cancelAccountingVendorRefund(refundId: string) {
  try {
    const scope = await resolveVendorAccountingScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: row } = await supabase
      .from('accounting_vendor_refunds')
      .select('status')
      .eq('id', refundId)
      .maybeSingle();
    if (!row) return { error: 'Refund not found' };
    if (!['draft', 'posted'].includes(String(row.status))) {
      return { error: 'Cannot cancel this refund' };
    }

    const { error } = await supabase
      .from('accounting_vendor_refunds')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_by: scope.session!.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', refundId);

    if (error) return { error: error.message };
    return getAccountingVendorRefundDetail(refundId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to cancel refund',
    };
  }
}
