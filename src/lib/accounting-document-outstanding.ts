/**
 * Server helpers to keep invoice/bill residual in sync with
 * payments + posted credit notes / vendor refunds.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  appliedPaymentAmount,
  outstandingFromComponents,
} from '@/lib/accounting-payments';

type Db = Pick<SupabaseClient, 'from'>;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function sumPostedAdjustments(
  supabase: Db,
  table: 'accounting_credit_notes' | 'accounting_vendor_refunds',
  documentColumn: 'invoice_id' | 'bill_id',
  documentId: string
): Promise<number> {
  const { data, error } = await supabase
    .from(table)
    .select('total_amount, status')
    .eq(documentColumn, documentId)
    .eq('status', 'posted');
  if (error) {
    if (/relation|schema cache|column/i.test(error.message)) return 0;
    throw new Error(error.message);
  }
  return round2(
    (data || []).reduce(
      (s: number, r: { total_amount?: number }) =>
        s + (Number(r.total_amount) || 0),
      0
    )
  );
}

export async function sumPostedCreditNotesForInvoice(
  supabase: Db,
  invoiceId: string
): Promise<number> {
  return sumPostedAdjustments(
    supabase,
    'accounting_credit_notes',
    'invoice_id',
    invoiceId
  );
}

export async function sumPostedVendorRefundsForBill(
  supabase: Db,
  billId: string
): Promise<number> {
  return sumPostedAdjustments(
    supabase,
    'accounting_vendor_refunds',
    'bill_id',
    billId
  );
}

export async function sumAppliedInvoicePayments(
  supabase: Db,
  invoiceId: string
): Promise<number> {
  const { data, error } = await supabase
    .from('accounting_invoice_payments')
    .select('amount, reconcile_status, amount_reconciled')
    .eq('invoice_id', invoiceId);
  if (error) {
    if (/reconcile_status|amount_reconciled|column/i.test(error.message)) {
      const retry = await supabase
        .from('accounting_invoice_payments')
        .select('amount')
        .eq('invoice_id', invoiceId);
      if (retry.error) {
        if (/relation|schema cache/i.test(retry.error.message)) return 0;
        throw new Error(retry.error.message);
      }
      return round2(
        (retry.data || []).reduce(
          (s: number, r: { amount?: number }) => s + (Number(r.amount) || 0),
          0
        )
      );
    }
    if (/relation|schema cache/i.test(error.message)) return 0;
    throw new Error(error.message);
  }
  return round2(
    (data || []).reduce(
      (s: number, r: Record<string, unknown>) =>
        s +
        appliedPaymentAmount({
          amount: Number(r.amount) || 0,
          reconcile_status: r.reconcile_status
            ? String(r.reconcile_status)
            : null,
          amount_reconciled:
            r.amount_reconciled != null ? Number(r.amount_reconciled) : null,
        }),
      0
    )
  );
}

export async function invoiceOpenAmount(
  supabase: Db,
  opts: { invoiceId: string; total: number }
): Promise<number> {
  const [paid, notes] = await Promise.all([
    sumAppliedInvoicePayments(supabase, opts.invoiceId),
    sumPostedCreditNotesForInvoice(supabase, opts.invoiceId),
  ]);
  return outstandingFromComponents({
    total: opts.total,
    amountPaid: paid,
    adjustments: notes,
  });
}

export async function billOpenAmount(
  supabase: Db,
  opts: { billId: string; total: number; amountPaid: number }
): Promise<number> {
  const refunds = await sumPostedVendorRefundsForBill(supabase, opts.billId);
  return outstandingFromComponents({
    total: opts.total,
    amountPaid: opts.amountPaid,
    adjustments: refunds,
  });
}
