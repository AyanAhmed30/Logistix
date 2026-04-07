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

    for (const alloc of allocations) {
      const amount = parseAmount(alloc.amount);
      if (amount <= 0) {
        return { error: 'Allocation amount must be greater than zero.' };
      }

      const hasInvoice = Boolean(alloc.invoice_id);
      const hasBill = Boolean(alloc.vendor_bill_id);
      if ((hasInvoice && hasBill) || (!hasInvoice && !hasBill)) {
        return { error: 'Each allocation must target exactly one document.' };
      }

      if (hasInvoice) {
        if (payment.payment_type !== 'inbound') {
          return { error: 'Inbound payment is required for invoice reconciliation.' };
        }
        const { data: invoice, error: invoiceError } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', alloc.invoice_id)
          .single();
        if (invoiceError || !invoice) {
          return { error: invoiceError?.message || 'Invoice not found.' };
        }
        if (invoice.partner_id !== payment.partner_id) {
          return { error: 'Payment and invoice partners must match.' };
        }
        if (invoice.invoice_status !== 'posted' && invoice.invoice_status !== 'paid') {
          return { error: 'Only posted/paid invoices can be reconciled.' };
        }
        const outstanding = parseAmount(invoice.outstanding_amount);
        if (amount > outstanding) {
          return { error: `Allocation exceeds invoice outstanding amount (${outstanding}).` };
        }
      } else {
        if (payment.payment_type !== 'outbound') {
          return { error: 'Outbound payment is required for vendor bill reconciliation.' };
        }
        const { data: bill, error: billError } = await supabase
          .from('vendor_bills')
          .select('*')
          .eq('id', alloc.vendor_bill_id)
          .single();
        if (billError || !bill) {
          return { error: billError?.message || 'Vendor bill not found.' };
        }
        if (bill.vendor_partner_id !== payment.partner_id) {
          return { error: 'Payment and vendor bill partners must match.' };
        }
        if (bill.status !== 'posted' && bill.status !== 'paid') {
          return { error: 'Only posted/paid vendor bills can be reconciled.' };
        }
        const outstanding = parseAmount(bill.outstanding_amount);
        if (amount > outstanding) {
          return { error: `Allocation exceeds vendor bill outstanding amount (${outstanding}).` };
        }
      }
    }

    for (const alloc of allocations) {
      const amount = parseAmount(alloc.amount);
      const { error: allocErr } = await supabase.from('payment_allocations').insert([
        {
          payment_id: paymentId,
          invoice_id: alloc.invoice_id || null,
          vendor_bill_id: alloc.vendor_bill_id || null,
          amount,
          created_by: session.username,
        },
      ]);
      if (allocErr) return { error: allocErr.message };

      if (alloc.invoice_id) {
        const { data: invoice, error: invoiceError } = await supabase
          .from('invoices')
          .select('id, paid_amount, outstanding_amount, total_amount')
          .eq('id', alloc.invoice_id)
          .single();
        if (invoiceError || !invoice) return { error: invoiceError?.message || 'Invoice not found.' };

        const nextPaid = parseAmount(invoice.paid_amount) + amount;
        const nextOutstanding = Math.max(parseAmount(invoice.total_amount) - nextPaid, 0);
        const nextStatus = nextOutstanding === 0 ? 'paid' : 'posted';
        const nextPaymentStatus = nextOutstanding === 0 ? 'paid' : nextPaid > 0 ? 'partial' : 'unpaid';

        const { error } = await supabase
          .from('invoices')
          .update({
            paid_amount: nextPaid,
            outstanding_amount: nextOutstanding,
            invoice_status: nextStatus,
            payment_status: nextPaymentStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', alloc.invoice_id);
        if (error) return { error: error.message };
      } else if (alloc.vendor_bill_id) {
        const { data: bill, error: billError } = await supabase
          .from('vendor_bills')
          .select('id, paid_amount, outstanding_amount, total_amount')
          .eq('id', alloc.vendor_bill_id)
          .single();
        if (billError || !bill) return { error: billError?.message || 'Vendor bill not found.' };

        const nextPaid = parseAmount(bill.paid_amount) + amount;
        const nextOutstanding = Math.max(parseAmount(bill.total_amount) - nextPaid, 0);
        const nextStatus = nextOutstanding === 0 ? 'paid' : 'posted';
        const { error } = await supabase
          .from('vendor_bills')
          .update({
            paid_amount: nextPaid,
            outstanding_amount: nextOutstanding,
            status: nextStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', alloc.vendor_bill_id);
        if (error) return { error: error.message };
      }
    }

    const { error: paymentUpdateError } = await supabase
      .from('payments')
      .update({
        allocated_amount: allocatedSoFar + requestedAllocation,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentId);
    if (paymentUpdateError) return { error: paymentUpdateError.message };

    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}
