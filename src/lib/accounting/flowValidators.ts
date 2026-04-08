import { createAdminClient } from '@/utils/supabase/server';

function toAmount(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function validateInvoiceToJournalConsistency(invoiceId: string, expectedTotal: number) {
  const supabase = await createAdminClient();
  const { data: entry, error } = await supabase
    .from('journal_entries')
    .select('id, total_debit, total_credit, status, source_type, source_id')
    .eq('source_type', 'invoice')
    .eq('source_id', invoiceId)
    .eq('status', 'posted')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!entry) throw new Error('Missing posted journal entry for invoice');
  const totalDebit = toAmount(entry.total_debit);
  const totalCredit = toAmount(entry.total_credit);
  const expected = toAmount(expectedTotal);
  if (totalDebit !== expected || totalCredit !== expected) {
    throw new Error('Invoice total mismatch with journal entry totals');
  }
}

export async function validatePaymentWithinOutstanding(args: { paymentAmount: number; outstandingAmount: number }) {
  const payment = toAmount(args.paymentAmount);
  const outstanding = toAmount(args.outstandingAmount);
  if (payment <= 0) throw new Error('Payment amount must be greater than zero');
  if (payment > outstanding) throw new Error('Payment amount cannot exceed outstanding receivable/payable');
}

export async function validateCodCollectedWithinInvoice(args: { codCollected: number; invoiceAmount: number }) {
  const cod = toAmount(args.codCollected);
  const invoice = toAmount(args.invoiceAmount);
  if (cod > invoice) throw new Error('COD collected cannot exceed invoice amount');
}

export async function validateVendorBillMatchesShipmentCost(args: { vendorBillAmount: number; shipmentCostAmount: number }) {
  const bill = toAmount(args.vendorBillAmount);
  const cost = toAmount(args.shipmentCostAmount);
  if (bill !== cost) throw new Error('Vendor bill amount must match shipment cost sheet');
}

export async function validateBusinessFlow(entityId: string, type: 'shipment' | 'invoice' | 'payment') {
  const supabase = await createAdminClient();
  if (type === 'shipment') {
    const [{ data: costs, error: costsErr }, { data: charges, error: chargesErr }] = await Promise.all([
      supabase.from('shipment_cost_sheets').select('id').eq('shipment_id', entityId).limit(1),
      supabase.from('customer_charge_sheets').select('id').eq('shipment_id', entityId).limit(1),
    ]);
    if (costsErr) throw new Error(costsErr.message);
    if (chargesErr) throw new Error(chargesErr.message);
    if (!costs || costs.length === 0) throw new Error('Shipment flow invalid: no shipment cost entries');
    if (!charges || charges.length === 0) throw new Error('Shipment flow invalid: no customer charge entries');
    return;
  }

  if (type === 'invoice') {
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('id, quotation_id, total_amount')
      .eq('id', entityId)
      .single();
    if (error || !invoice) throw new Error(error?.message || 'Invoice not found');
    if (!invoice.quotation_id) throw new Error('Invoice flow invalid: invoice is not linked to quotation');
    await validateInvoiceToJournalConsistency(entityId, toAmount(invoice.total_amount));
    return;
  }

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('id, amount, allocated_amount')
    .eq('id', entityId)
    .single();
  if (paymentError || !payment) throw new Error(paymentError?.message || 'Payment not found');
  if (toAmount(payment.allocated_amount) > toAmount(payment.amount)) {
    throw new Error('Payment flow invalid: allocated amount exceeds payment amount');
  }
}
