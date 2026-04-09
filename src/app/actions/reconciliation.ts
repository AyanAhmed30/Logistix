'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/utils/supabase/server';
import {
  calculate_exchange_difference,
  post_exchange_gain_loss,
} from '@/lib/accounting/multiCurrency';

type AllocationTarget = { invoice_id?: string; vendor_bill_id?: string };
type LineMatchInput = {
  invoice_line_id: string;
  payment_line_id: string;
  amount: number;
};
type BankMatchInput = {
  payment_line_id: string;
  bank_line_id: string;
  amount: number;
  tolerance?: number;
};
type CodMatchInput = {
  cod_collection_line_id: string;
  offset_lines: Array<{ line_id: string; amount: number }>;
  finalize?: boolean;
};

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
      .in('status', ['posted', 'reconciled'])
      .order('payment_date', { ascending: false });

    let invoicesQuery = supabase
      .from('invoices')
      .select('*')
      .in('invoice_status', ['posted', 'partially_paid', 'paid'])
      .order('invoice_date', { ascending: false });

    let billsQuery = supabase
      .from('vendor_bills')
      .select('*')
      .in('status', ['posted', 'partially_paid', 'paid'])
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
    if (payment.status !== 'posted' && payment.status !== 'reconciled') {
      return { error: 'Only posted/reconciled payments can be reconciled.' };
    }

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

export async function reconcile_invoice_payment(input: LineMatchInput) {
  try {
    const session = await getSession();
    ensureAdmin(session);
    if (!session) return { error: 'Unauthorized' };
    const supabase = await createAdminClient();

    const amount = parseAmount(input.amount);
    if (!input.invoice_line_id || !input.payment_line_id) {
      return { error: 'Invoice line and payment line are required.' };
    }
    if (amount <= 0) return { error: 'Amount must be greater than zero.' };

    const { data, error } = await supabase.rpc('reconcile_invoice_payment', {
      p_invoice_line_id: input.invoice_line_id,
      p_payment_line_id: input.payment_line_id,
      p_amount: amount,
      p_actor: session.username,
    });
    if (error) return { error: error.message };

    // Optional realized FX recognition at settlement time.
    // If both lines carry foreign amounts, compare implied base from open unit rates.
    const { data: lines, error: linesErr } = await supabase
      .from('journal_entry_lines')
      .select('id, account_id, exchange_rate, foreign_amount, base_currency_amount, journal_entry_id')
      .in('id', [input.invoice_line_id, input.payment_line_id]);
    if (!linesErr && Array.isArray(lines) && lines.length === 2) {
      const inv = lines.find((l) => l.id === input.invoice_line_id);
      const pay = lines.find((l) => l.id === input.payment_line_id);
      const invRate = parseAmount(inv?.exchange_rate);
      const payRate = parseAmount(pay?.exchange_rate);
      const invForeign = parseAmount(inv?.foreign_amount);
      const payForeign = parseAmount(pay?.foreign_amount);
      if (invRate > 0 && payRate > 0 && invForeign > 0 && payForeign > 0) {
        const settledForeign = Math.min(invForeign, payForeign, amount / Math.max(invRate, 0.00000001), amount / Math.max(payRate, 0.00000001));
        if (settledForeign > 0) {
          const originalBase = settledForeign * invRate;
          const settledBase = settledForeign * payRate;
          const diff = calculate_exchange_difference({ originalBase, settledBase });
          if (diff.type !== 'none') {
            const { data: paymentJe } = await supabase
              .from('journal_entry_lines')
              .select('journal_entry_id')
              .eq('id', input.payment_line_id)
              .single();
            let journalId: string | null = null;
            if (paymentJe?.journal_entry_id) {
              const { data: je } = await supabase
                .from('journal_entries')
                .select('journal_id')
                .eq('id', paymentJe.journal_entry_id)
                .single();
              journalId = je?.journal_id || null;
            }
            if (journalId && inv?.account_id) {
              await post_exchange_gain_loss({
                reference: `FX-SETTLE-${String(data)}`,
                entryDate: new Date().toISOString().slice(0, 10),
                journalId,
                arApAccountId: inv.account_id,
                difference: diff.difference,
              });
            }
          }
        }
      }
    }

    revalidatePath('/admin/dashboard');
    return { success: true, reconciliation_id: data as string };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function reconcile_payment_bank(input: BankMatchInput) {
  try {
    const session = await getSession();
    ensureAdmin(session);
    if (!session) return { error: 'Unauthorized' };
    const supabase = await createAdminClient();

    const amount = parseAmount(input.amount);
    const tolerance = parseAmount(input.tolerance || 0);
    if (!input.payment_line_id || !input.bank_line_id) {
      return { error: 'Payment line and bank line are required.' };
    }
    if (amount <= 0) return { error: 'Amount must be greater than zero.' };

    const { data, error } = await supabase.rpc('reconcile_payment_bank', {
      p_payment_line_id: input.payment_line_id,
      p_bank_line_id: input.bank_line_id,
      p_amount: amount,
      p_actor: session.username,
      p_tolerance: tolerance,
    });
    if (error) return { error: error.message };

    revalidatePath('/admin/dashboard');
    return { success: true, reconciliation_id: data as string };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function reconcile_cod_settlement(input: CodMatchInput) {
  try {
    const session = await getSession();
    ensureAdmin(session);
    if (!session) return { error: 'Unauthorized' };
    const supabase = await createAdminClient();

    if (!input.cod_collection_line_id) return { error: 'COD collection line is required.' };
    if (!Array.isArray(input.offset_lines) || input.offset_lines.length === 0) {
      return { error: 'At least one offset line is required.' };
    }
    const normalized = input.offset_lines.map((item) => ({
      line_id: item.line_id,
      amount: parseAmount(item.amount),
    }));
    if (normalized.some((item) => !item.line_id || item.amount <= 0)) {
      return { error: 'Each offset line must have valid line_id and amount > 0.' };
    }

    const { data, error } = await supabase.rpc('reconcile_cod_settlement', {
      p_cod_collection_line_id: input.cod_collection_line_id,
      p_offset_lines: normalized,
      p_actor: session.username,
      p_finalize: Boolean(input.finalize),
    });
    if (error) return { error: error.message };

    revalidatePath('/admin/dashboard');
    return { success: true, reconciliation_id: data as string };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function unreconcile(reconciliationId: string) {
  try {
    const session = await getSession();
    ensureAdmin(session);
    if (!session) return { error: 'Unauthorized' };
    if (!reconciliationId) return { error: 'Reconciliation id is required.' };
    const supabase = await createAdminClient();

    const { error } = await supabase.rpc('unreconcile', {
      p_reconciliation_id: reconciliationId,
      p_actor: session.username,
    });
    if (error) return { error: error.message };

    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}
