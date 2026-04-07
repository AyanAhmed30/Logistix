'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/utils/supabase/server';

type AllocationTarget = { invoice_id?: string; vendor_bill_id?: string };

function ensureAdmin(session: { role: string } | null) {
  if (!session || session.role !== 'admin') {
    throw new Error('Unauthorized');
  }
}

function parseAmount(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getReconciliationData(partnerId?: string) {
  try {
    const session = await getSession();
    ensureAdmin(session);
    const supabase = await createAdminClient();

    let paymentsQuery = supabase
      .from('payments')
      .select('*')
      .eq('status', 'posted')
      .order('payment_date', { ascending: false });

    let invoicesQuery = supabase
      .from('invoices')
      .select('*')
      .in('invoice_status', ['posted', 'paid'])
      .order('invoice_date', { ascending: false });

    let billsQuery = supabase
      .from('vendor_bills')
      .select('*')
      .in('status', ['posted', 'paid'])
      .order('bill_date', { ascending: false });

    if (partnerId) {
      paymentsQuery = paymentsQuery.eq('partner_id', partnerId);
      invoicesQuery = invoicesQuery.eq('partner_id', partnerId);
      billsQuery = billsQuery.eq('vendor_partner_id', partnerId);
    }

    const [{ data: payments, error: pErr }, { data: invoices, error: iErr }, { data: bills, error: bErr }] =
      await Promise.all([paymentsQuery, invoicesQuery, billsQuery]);
    if (pErr) return { error: pErr.message };
    if (iErr) return { error: iErr.message };
    if (bErr) return { error: bErr.message };

    return {
      payments: payments || [],
      invoices: invoices || [],
      vendorBills: bills || [],
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function reconcilePayment(
  paymentId: string,
  allocations: Array<AllocationTarget & { amount: number }>
) {
  try {
    const session = await getSession();
    ensureAdmin(session);
    if (!session) return { error: 'Unauthorized' };
    const supabase = await createAdminClient();
    if (!paymentId) return { error: 'Payment id is required.' };
    if (!Array.isArray(allocations) || allocations.length === 0) {
      return { error: 'At least one allocation is required.' };
    }

    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .single();
    if (paymentError || !payment) return { error: paymentError?.message || 'Payment not found.' };
    if (payment.status !== 'posted') return { error: 'Only posted payments can be reconciled.' };

    const allocatedSoFar = parseAmount(payment.allocated_amount);
    const paymentAmount = parseAmount(payment.amount);
    const requestedAllocation = allocations.reduce((sum, item) => sum + parseAmount(item.amount), 0);
    if (requestedAllocation <= 0) return { error: 'Allocation amount must be greater than zero.' };
    if (allocatedSoFar + requestedAllocation > paymentAmount) {
      return { error: 'Cannot reconcile more than remaining payment amount.' };
    }

    const normalizedAllocations = allocations.map((alloc) => ({
      invoice_id: alloc.invoice_id || null,
      vendor_bill_id: alloc.vendor_bill_id || null,
      amount: parseAmount(alloc.amount),
    }));

    const { error: rpcError } = await supabase.rpc('reconcile_payment_allocations', {
      p_payment_id: paymentId,
      p_allocations: normalizedAllocations,
      p_actor: session.username,
    });
    if (rpcError) return { error: rpcError.message };

    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}
