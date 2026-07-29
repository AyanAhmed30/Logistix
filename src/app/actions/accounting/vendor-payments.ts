'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getAccountingBillDetail } from '@/app/actions/accounting/bills';
import type { AccountingBillStatus } from '@/app/actions/accounting/bills';
import {
  computePaymentState,
  paymentMethodLabel,
  type AccountingPaymentMethod,
  type AccountingPaymentState,
} from '@/lib/accounting-payments';
import { resolveVendorAccountingScope } from '@/lib/accounting-vendor-scope';

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function sumPayments(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  billId: string
) {
  const { data } = await supabase
    .from('accounting_vendor_payments')
    .select('amount')
    .eq('bill_id', billId);
  return round2((data || []).reduce((s, r) => s + (Number(r.amount) || 0), 0));
}

async function refreshBillPaymentState(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  billId: string,
  username: string
) {
  const { data: bill } = await supabase
    .from('accounting_vendor_bills')
    .select('id, total_amount, due_date, status, payment_state')
    .eq('id', billId)
    .maybeSingle();
  if (!bill) return { error: 'Bill not found' as const };

  const amountPaid = await sumPayments(supabase, billId);
  const computed = computePaymentState({
    total: Number(bill.total_amount) || 0,
    amountPaid,
    dueDate: bill.due_date ? String(bill.due_date) : null,
    workflowStatus: String(bill.status || ''),
  });

  const workflowStatus = String(bill.status) as AccountingBillStatus;
  let nextStatus = workflowStatus;
  if (workflowStatus === 'posted' || workflowStatus === 'paid') {
    nextStatus = computed.paymentState === 'paid' ? 'paid' : 'posted';
  }

  await supabase
    .from('accounting_vendor_bills')
    .update({
      amount_paid: computed.amountPaid,
      amount_residual: computed.outstanding,
      payment_state: computed.paymentState,
      status: nextStatus,
      updated_by: username,
      updated_at: new Date().toISOString(),
    })
    .eq('id', billId);

  return {
    amountPaid: computed.amountPaid,
    outstanding: computed.outstanding,
    paymentState: computed.paymentState as AccountingPaymentState,
    previousPaymentState: String(bill.payment_state || 'not_paid'),
    previousStatus: workflowStatus,
    nextStatus,
  };
}

export type RegisterVendorPaymentInput = {
  payment_date: string;
  amount: number;
  payment_method: AccountingPaymentMethod;
  reference?: string | null;
  notes?: string | null;
};

export async function registerVendorBillPayment(
  billId: string,
  input: RegisterVendorPaymentInput
) {
  try {
    const scope = await resolveVendorAccountingScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const amount = round2(Number(input.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: 'Payment amount must be greater than zero' };
    }
    const method = input.payment_method;
    if (!['cash', 'bank_transfer', 'cheque'].includes(method)) {
      return { error: 'Invalid payment method' };
    }
    const paymentDate = String(input.payment_date || '').trim();
    if (!paymentDate) return { error: 'Payment date is required' };

    const supabase = await createAdminClient();
    const { data: bill, error: loadError } = await supabase
      .from('accounting_vendor_bills')
      .select('*')
      .eq('id', billId)
      .maybeSingle();

    if (loadError || !bill) return { error: loadError?.message || 'Bill not found' };
    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      bill.organization_id &&
      String(bill.organization_id) !== scope.organizationId
    ) {
      return { error: 'Bill not in the selected organization' };
    }

    const status = String(bill.status);
    if (status !== 'posted' && status !== 'paid') {
      return { error: 'Payments can only be registered on Posted bills' };
    }

    const orgId = bill.organization_id
      ? String(bill.organization_id)
      : scope.organizationId;
    if (!orgId) return { error: 'Bill organization is missing' };

    const alreadyPaid = await sumPayments(supabase, billId);
    const total = round2(Number(bill.total_amount) || 0);
    const outstanding = round2(Math.max(0, total - alreadyPaid));
    if (amount - outstanding > 0.004) {
      return {
        error: `Payment amount cannot exceed outstanding balance (${outstanding.toFixed(2)})`,
      };
    }

    const { data: payment, error: payError } = await supabase
      .from('accounting_vendor_payments')
      .insert([
        {
          organization_id: orgId,
          bill_id: billId,
          payment_date: paymentDate,
          amount,
          payment_method: method,
          reference: String(input.reference || '').trim() || null,
          notes: String(input.notes || '').trim() || null,
          paid_by: scope.session!.username,
          created_by: scope.session!.username,
        },
      ])
      .select('id')
      .single();

    if (payError || !payment) {
      if (payError && /accounting_vendor_payments|relation/i.test(payError.message)) {
        return {
          error: 'Run create_accounting_vendors_module.sql migration.',
        };
      }
      return { error: payError?.message || 'Failed to register payment' };
    }

    const refreshed = await refreshBillPaymentState(
      supabase,
      billId,
      scope.session!.username
    );
    if ('error' in refreshed && refreshed.error) return { error: refreshed.error };

    try {
      await supabase.from('accounting_vendor_bill_logs').insert([
        {
          bill_id: billId,
          action: 'payment_registered',
          previous_status: refreshed.previousStatus,
          new_status: refreshed.nextStatus,
          performed_by: scope.session!.username,
          details: {
            amount,
            payment_method: method,
            payment_method_label: paymentMethodLabel(method),
            payment_id: payment.id,
            outstanding: refreshed.outstanding,
            payment_date: paymentDate,
          },
        },
      ]);
    } catch {
      // optional
    }

    return getAccountingBillDetail(billId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to register payment',
    };
  }
}

export type AccountingVendorPaymentListItem = {
  id: string;
  payment_number: string;
  payment_date: string;
  amount: number;
  payment_method: AccountingPaymentMethod;
  reference: string | null;
  notes: string | null;
  status: 'posted';
  organization_id: string;
  organization_name: string | null;
  bill_id: string;
  bill_number: string | null;
  vendor_name: string | null;
  vendor_lead_id: string | null;
  contact_id: string | null;
  amount_residual: number | null;
  created_at: string;
};

export async function getAccountingVendorPayments(filters: {
  search?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  try {
    const scope = await resolveVendorAccountingScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return {
        payments: [] as AccountingVendorPaymentListItem[],
        total: 0,
        page: 1,
        pageSize: 40,
      };
    }

    const supabase = await createAdminClient();
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(100, Math.max(10, filters.pageSize || 40));
    const needle = String(filters.search || '').trim();

    let matchingBillIds: string[] | null = null;
    if (needle) {
      const like = `%${needle}%`;
      let billQ = supabase
        .from('accounting_vendor_bills')
        .select('id')
        .or(
          `bill_number.ilike.${like},vendor_name.ilike.${like},vendor_lead_id.ilike.${like}`
        );
      if (scope.organizationId && !scope.isGlobalAdminView) {
        billQ = billQ.eq('organization_id', scope.organizationId);
      }
      const { data: hits } = await billQ.limit(200);
      matchingBillIds = (hits || []).map((b) => String(b.id));
    }

    let query = supabase
      .from('accounting_vendor_payments')
      .select('*', { count: 'exact' });

    if (scope.organizationId && !scope.isGlobalAdminView) {
      query = query.eq('organization_id', scope.organizationId);
    }

    if (needle) {
      const like = `%${needle}%`;
      if (matchingBillIds?.length) {
        query = query.or(
          `reference.ilike.${like},notes.ilike.${like},paid_by.ilike.${like},bill_id.in.(${matchingBillIds.join(',')})`
        );
      } else {
        query = query.or(
          `reference.ilike.${like},notes.ilike.${like},paid_by.ilike.${like}`
        );
      }
    }

    query = query
      .order('payment_date', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    const { data, error, count } = await query;
    if (error) {
      if (/accounting_vendor_payments|relation/i.test(error.message)) {
        return {
          payments: [] as AccountingVendorPaymentListItem[],
          total: 0,
          page,
          pageSize,
        };
      }
      return { error: error.message };
    }

    const rows = data || [];
    const billIds = [...new Set(rows.map((r) => String(r.bill_id)).filter(Boolean))];
    const orgIds = [
      ...new Set(rows.map((r) => String(r.organization_id)).filter(Boolean)),
    ];

    const billMap = new Map<
      string,
      {
        bill_number: string | null;
        vendor_name: string | null;
        vendor_lead_id: string | null;
        contact_id: string | null;
        amount_residual: number | null;
      }
    >();
    if (billIds.length) {
      const { data: bills } = await supabase
        .from('accounting_vendor_bills')
        .select(
          'id, bill_number, vendor_name, vendor_lead_id, contact_id, amount_residual'
        )
        .in('id', billIds);
      for (const b of bills || []) {
        billMap.set(String(b.id), {
          bill_number: b.bill_number ? String(b.bill_number) : null,
          vendor_name: b.vendor_name ? String(b.vendor_name) : null,
          vendor_lead_id: b.vendor_lead_id ? String(b.vendor_lead_id) : null,
          contact_id: b.contact_id ? String(b.contact_id) : null,
          amount_residual:
            b.amount_residual != null ? Number(b.amount_residual) : null,
        });
      }
    }

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

    const payments: AccountingVendorPaymentListItem[] = rows.map((r) => {
      const bill = billMap.get(String(r.bill_id)) || {
        bill_number: null,
        vendor_name: null,
        vendor_lead_id: null,
        contact_id: null,
        amount_residual: null,
      };
      const id = String(r.id);
      return {
        id,
        payment_number: `VPAY-${id.slice(0, 8).toUpperCase()}`,
        payment_date: String(r.payment_date || ''),
        amount: Number(r.amount) || 0,
        payment_method:
          (String(r.payment_method) as AccountingPaymentMethod) || 'bank_transfer',
        reference: r.reference ? String(r.reference) : null,
        notes: r.notes ? String(r.notes) : null,
        status: 'posted',
        organization_id: String(r.organization_id),
        organization_name: orgMap.get(String(r.organization_id)) || null,
        bill_id: String(r.bill_id),
        bill_number: bill.bill_number,
        vendor_name: bill.vendor_name,
        vendor_lead_id: bill.vendor_lead_id,
        contact_id: bill.contact_id,
        amount_residual: bill.amount_residual,
        created_at: String(r.created_at || ''),
      };
    });

    return { payments, total: count ?? payments.length, page, pageSize };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load payments',
    };
  }
}

export async function getAccountingVendorPaymentDetail(paymentId: string) {
  try {
    const scope = await resolveVendorAccountingScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from('accounting_vendor_payments')
      .select('*')
      .eq('id', paymentId)
      .maybeSingle();

    if (error || !row) return { error: error?.message || 'Payment not found' };
    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      row.organization_id &&
      String(row.organization_id) !== scope.organizationId
    ) {
      return { error: 'Payment not found in the selected organization' };
    }

    const { data: bill } = await supabase
      .from('accounting_vendor_bills')
      .select(
        'id, bill_number, vendor_name, vendor_lead_id, contact_id, amount_residual, total_amount, amount_paid, status'
      )
      .eq('id', row.bill_id)
      .maybeSingle();

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

    const id = String(row.id);
    return {
      payment: {
        id,
        payment_number: `VPAY-${id.slice(0, 8).toUpperCase()}`,
        payment_date: String(row.payment_date || ''),
        amount: Number(row.amount) || 0,
        payment_method:
          (String(row.payment_method) as AccountingPaymentMethod) ||
          'bank_transfer',
        reference: row.reference ? String(row.reference) : null,
        notes: row.notes ? String(row.notes) : null,
        status: 'posted' as const,
        organization_id: String(row.organization_id),
        organization_name,
        bill_id: String(row.bill_id),
        bill_number: bill?.bill_number ? String(bill.bill_number) : null,
        vendor_name: bill?.vendor_name ? String(bill.vendor_name) : null,
        vendor_lead_id: bill?.vendor_lead_id
          ? String(bill.vendor_lead_id)
          : null,
        contact_id: bill?.contact_id ? String(bill.contact_id) : null,
        amount_residual:
          bill?.amount_residual != null ? Number(bill.amount_residual) : null,
        bill_total: bill?.total_amount != null ? Number(bill.total_amount) : null,
        bill_amount_paid:
          bill?.amount_paid != null ? Number(bill.amount_paid) : null,
        created_at: String(row.created_at || ''),
        paid_by: row.paid_by ? String(row.paid_by) : null,
      },
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load payment',
    };
  }
}

export async function getAccountingBillPayments(billId: string) {
  try {
    const scope = await resolveVendorAccountingScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('accounting_vendor_payments')
      .select('*')
      .eq('bill_id', billId)
      .order('payment_date', { ascending: false });

    if (error) {
      if (/accounting_vendor_payments|relation/i.test(error.message)) {
        return { payments: [] };
      }
      return { error: error.message };
    }

    return {
      payments: (data || []).map((r) => ({
        id: String(r.id),
        payment_date: String(r.payment_date || ''),
        amount: Number(r.amount) || 0,
        payment_method: String(r.payment_method || ''),
        reference: r.reference ? String(r.reference) : null,
        notes: r.notes ? String(r.notes) : null,
        paid_by: r.paid_by ? String(r.paid_by) : null,
        created_at: String(r.created_at || ''),
      })),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load payments',
    };
  }
}
