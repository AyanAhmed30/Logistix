import { createAdminClient } from '@/utils/supabase/server';
import { eventToJournalMapper } from '@/lib/accounting/eventToJournalMapper';
import { buildIdempotencyKey, type AccountingEvent } from '@/lib/accounting/events';
import {
  validateBusinessFlow,
  validateCodCollectedWithinInvoice,
  validatePaymentWithinOutstanding,
  validateVendorBillMatchesShipmentCost,
} from '@/lib/accounting/flowValidators';

function ensureEventShape(event: AccountingEvent) {
  if (!event.event_id) throw new Error('event_id is required');
  if (!event.reference_id) throw new Error('reference_id is required');
  if (!event.event_type) throw new Error('event_type is required');
}

async function preValidateCrossModule(event: AccountingEvent) {
  if (event.event_type === 'PAYMENT_RECEIVED' || event.event_type === 'PAYMENT_MADE') {
    const paymentAmount = Number(event.payload.amount || 0);
    const outstandingAmount = Number(event.payload.outstanding_amount || paymentAmount);
    await validatePaymentWithinOutstanding({ paymentAmount, outstandingAmount });
  }

  if (event.event_type === 'COD_COLLECTED') {
    await validateCodCollectedWithinInvoice({
      codCollected: Number(event.payload.amount || 0),
      invoiceAmount: Number(event.payload.invoice_amount || 0),
    });
  }

  if (event.event_type === 'VENDOR_BILL_POSTED') {
    await validateVendorBillMatchesShipmentCost({
      vendorBillAmount: Number(event.payload.amount || 0),
      shipmentCostAmount: Number(event.payload.shipment_cost_amount || event.payload.amount || 0),
    });
  }
}

async function trackOperationalOnlyEvent(event: AccountingEvent) {
  const supabase = await createAdminClient();
  const idempotency = event.idempotency_key || buildIdempotencyKey(event.event_type, event.reference_id);
  const { error } = await supabase.from('event_logs').upsert(
    {
      event_id: event.event_id,
      event_type: event.event_type,
      reference_id: event.reference_id,
      idempotency_key: idempotency,
      source_module: event.source_module,
      processed: true,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      processing_error: null,
    },
    { onConflict: 'idempotency_key' }
  );
  if (error) throw new Error(error.message);
}

export async function processAccountingEvent(input: AccountingEvent) {
  const event: AccountingEvent = {
    ...input,
    idempotency_key: input.idempotency_key || buildIdempotencyKey(input.event_type, input.reference_id),
  };
  ensureEventShape(event);

  await preValidateCrossModule(event);

  const plan = await eventToJournalMapper(event);
  if (!plan) {
    await trackOperationalOnlyEvent(event);
    return {
      processed: true,
      skipped: true,
      reason: 'No accounting impact for this event',
      event_id: event.event_id,
    };
  }

  if (plan.source_type === 'invoice' && plan.source_id) {
    await validateBusinessFlow(plan.source_id, 'invoice');
  }

  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc('process_mapped_journal_event', {
    p_event_id: event.event_id,
    p_event_type: event.event_type,
    p_reference_id: event.reference_id,
    p_idempotency_key: event.idempotency_key,
    p_source_module: event.source_module,
    p_created_by_module: plan.created_by_module,
    p_source_type: plan.source_type,
    p_source_id: plan.source_id,
    p_entry_date: plan.entryDate,
    p_journal_id: plan.journalId,
    p_reference: plan.reference,
    p_lines: JSON.stringify(plan.lines),
  });

  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : null;
  return {
    processed: Boolean(row?.processed),
    journal_entry_id: row?.journal_entry_id || null,
    message: row?.message || 'Processed',
    event_id: event.event_id,
  };
}
