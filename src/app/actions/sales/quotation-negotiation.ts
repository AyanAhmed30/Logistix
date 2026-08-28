'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { sessionHasSalesAccess } from '@/lib/auth/require-access';
import {
  getSalesQuotationDetail,
  type SalesQuotationDetail,
  type SalesQuotationLine,
} from '@/app/actions/sales/quotation-form';
import {
  INQUIRY_IMAGES_BUCKET,
  ensureInquiryImagesBucket,
} from '@/lib/inquiry-storage';

export type NegotiationEvent = {
  id: string;
  event_type: string;
  actor_role: string;
  actor_username: string | null;
  previous_amount: number | null;
  offered_amount: number | null;
  requested_amount: number | null;
  message: string | null;
  created_at: string;
};

export type QuotationNegotiationState = {
  quotationId: string;
  quotationNumber: string;
  status: string;
  isLocked: boolean;
  negotiationStatus: string | null;
  totalAmount: number;
  originalOfferAmount: number | null;
  previousOfferAmount: number | null;
  pendingCustomerRequestAmount: number | null;
  pendingCustomerRequestMessage: string | null;
  pendingCustomerRequestAt: string | null;
  pendingCounterAmount: number | null;
  pendingCounterMessage: string | null;
  pendingCounterAt: string | null;
  customerAcceptedAt: string | null;
  customerDeclinedAt: string | null;
  linkedInquiryId: string | null;
  canNegotiate: boolean;
  events: NegotiationEvent[];
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function isProductLine(line: SalesQuotationLine) {
  // SalesQuotationLine does not expose display_type; treat zero qty+price as non-product.
  if (Number(line.quantity) === 0 && Number(line.unit_price) === 0) {
    return false;
  }
  return true;
}

function lineTotal(line: {
  quantity: number;
  unit_price: number;
  discount: number;
  taxes: number;
}) {
  const qty = Number(line.quantity) || 0;
  const price = Number(line.unit_price) || 0;
  const discount = Math.min(100, Math.max(0, Number(line.discount) || 0));
  const taxRate = Math.max(0, Number(line.taxes) || 0);
  const base = qty * price * (1 - discount / 100);
  const tax = base * (taxRate / 100);
  return round2(base + tax);
}

/** Scale product line unit prices so quotation total matches target. */
function scaleLinesToTargetTotal(
  lines: SalesQuotationLine[],
  targetTotal: number
): SalesQuotationLine[] {
  const target = round2(targetTotal);
  const product = lines.filter(isProductLine);
  const current = round2(product.reduce((sum, l) => sum + lineTotal(l), 0));

  if (product.length === 0) {
    return lines;
  }

  if (current <= 0) {
    const firstId = product[0].id;
    return lines.map((line) => {
      if (line.id !== firstId) return line;
      const qty = Number(line.quantity) || 1;
      const unit = round2(target / qty);
      return {
        ...line,
        unit_price: unit,
        line_total: lineTotal({ ...line, unit_price: unit }),
      };
    });
  }

  const factor = target / current;
  const scaled = lines.map((line) => {
    if (!isProductLine(line)) return line;
    const unit = round2(Number(line.unit_price) * factor);
    return {
      ...line,
      unit_price: unit,
      line_total: lineTotal({ ...line, unit_price: unit }),
    };
  });

  // Fix rounding drift on the largest product line
  const newTotal = round2(
    scaled.filter(isProductLine).reduce((sum, l) => sum + lineTotal(l), 0)
  );
  const drift = round2(target - newTotal);
  if (Math.abs(drift) >= 0.01) {
    const biggest = scaled
      .filter(isProductLine)
      .sort((a, b) => lineTotal(b) - lineTotal(a))[0];
    if (biggest) {
      const qty = Number(biggest.quantity) || 1;
      const adjustedUnit = round2(Number(biggest.unit_price) + drift / qty);
      return scaled.map((line) =>
        line.id === biggest.id
          ? {
              ...line,
              unit_price: adjustedUnit,
              line_total: lineTotal({ ...line, unit_price: adjustedUnit }),
            }
          : line
      );
    }
  }

  return scaled;
}

async function resolveSalesScope():
  Promise<{ session: NonNullable<Awaited<ReturnType<typeof getSession>>> } | { error: string }> {
  const session = await getSession();
  if (!session || !sessionHasSalesAccess(session)) {
    return { error: 'Unauthorized' };
  }
  return { session };
}

function negotiationBlocked(row: Record<string, unknown>): string | null {
  const status = String(row.status || '');
  if (status === 'sales_order') {
    return 'This quotation is already a Sales Order. Negotiation is closed.';
  }
  if (status === 'cancelled') {
    return 'This quotation is cancelled. Negotiation is closed.';
  }
  if (row.is_locked) {
    return 'This quotation is locked. Negotiation is closed.';
  }
  if (row.customer_accepted_at) {
    return 'Customer already accepted this quotation.';
  }
  if (row.customer_declined_at) {
    return 'Customer already declined this quotation.';
  }
  if (String(row.negotiation_status || '') === 'accepted') {
    return 'Negotiation already accepted.';
  }
  if (String(row.negotiation_status || '') === 'declined') {
    return 'Negotiation already declined.';
  }
  if (String(row.negotiation_status || '') === 'closed') {
    return 'Negotiation is closed.';
  }
  return null;
}

function mapNegotiationState(
  row: Record<string, unknown>,
  events: NegotiationEvent[]
): QuotationNegotiationState {
  const status = String(row.status || '');
  const negotiationStatus = row.negotiation_status
    ? String(row.negotiation_status)
    : null;
  const blocked = negotiationBlocked(row);
  return {
    quotationId: String(row.id),
    quotationNumber: String(row.quotation_number || ''),
    status,
    isLocked: Boolean(row.is_locked),
    negotiationStatus,
    totalAmount: Number(row.total_amount) || 0,
    originalOfferAmount:
      row.original_offer_amount == null
        ? null
        : Number(row.original_offer_amount),
    previousOfferAmount:
      row.previous_offer_amount == null
        ? null
        : Number(row.previous_offer_amount),
    pendingCustomerRequestAmount:
      row.pending_customer_request_amount == null
        ? null
        : Number(row.pending_customer_request_amount),
    pendingCustomerRequestMessage: row.pending_customer_request_message
      ? String(row.pending_customer_request_message)
      : null,
    pendingCustomerRequestAt: row.pending_customer_request_at
      ? String(row.pending_customer_request_at)
      : null,
    pendingCounterAmount:
      row.pending_counter_amount == null
        ? null
        : Number(row.pending_counter_amount),
    pendingCounterMessage: row.pending_counter_message
      ? String(row.pending_counter_message)
      : null,
    pendingCounterAt: row.pending_counter_at
      ? String(row.pending_counter_at)
      : null,
    customerAcceptedAt: row.customer_accepted_at
      ? String(row.customer_accepted_at)
      : null,
    customerDeclinedAt: row.customer_declined_at
      ? String(row.customer_declined_at)
      : null,
    linkedInquiryId: row.linked_inquiry_id
      ? String(row.linked_inquiry_id)
      : null,
    canNegotiate: !blocked && Boolean(row.sent_to_customer_at),
    events,
  };
}

export async function getQuotationNegotiationState(quotationId: string) {
  try {
    const scope = await resolveSalesScope();
    if ('error' in scope) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', quotationId)
      .maybeSingle();

    if (error || !row) {
      return { error: error?.message || 'Quotation not found' };
    }

    const { data: eventRows } = await supabase
      .from('quotation_negotiation_events')
      .select(
        'id, event_type, actor_role, actor_username, previous_amount, offered_amount, requested_amount, message, created_at'
      )
      .eq('quotation_id', quotationId)
      .order('created_at', { ascending: true });

    const events: NegotiationEvent[] = (eventRows || []).map((e) => ({
      id: String(e.id),
      event_type: String(e.event_type),
      actor_role: String(e.actor_role),
      actor_username: e.actor_username ? String(e.actor_username) : null,
      previous_amount:
        e.previous_amount == null ? null : Number(e.previous_amount),
      offered_amount:
        e.offered_amount == null ? null : Number(e.offered_amount),
      requested_amount:
        e.requested_amount == null ? null : Number(e.requested_amount),
      message: e.message ? String(e.message) : null,
      created_at: String(e.created_at),
    }));

    return { negotiation: mapNegotiationState(row as Record<string, unknown>, events) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load negotiation',
    };
  }
}

async function applyTotalAndReplaceLines(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  quotation: SalesQuotationDetail,
  targetTotal: number
) {
  const scaled = scaleLinesToTargetTotal(quotation.lines, targetTotal);
  const total = round2(
    scaled.filter(isProductLine).reduce((sum, l) => sum + lineTotal(l), 0)
  );
  const untaxed = round2(
    scaled.filter(isProductLine).reduce((sum, l) => {
      const qty = Number(l.quantity) || 0;
      const price = Number(l.unit_price) || 0;
      const discount = Math.min(100, Math.max(0, Number(l.discount) || 0));
      return sum + qty * price * (1 - discount / 100);
    }, 0)
  );
  const tax = round2(total - untaxed);

  await supabase.from('quotation_lines').delete().eq('quotation_id', quotation.id);
  if (scaled.length > 0) {
    const rows = scaled.map((line, index) => ({
      quotation_id: quotation.id,
      sequence: line.sequence ?? (index + 1) * 10,
      product_id: line.product_id || null,
      product_name: String(line.product_name || '').trim() || 'Product',
      description: line.description ? String(line.description) : null,
      quantity: Number(line.quantity) || 0,
      qty_delivered: Number(line.qty_delivered) || 0,
      uom: String(line.uom || 'pcs / u'),
      unit_price: Number(line.unit_price) || 0,
      discount: Number(line.discount) || 0,
      taxes: Number(line.taxes) || 0,
      line_total: lineTotal(line),
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('quotation_lines').insert(rows);
    if (error && /qty_delivered|column/i.test(error.message)) {
      const legacy = rows.map(({ qty_delivered: _q, ...rest }) => rest);
      const retry = await supabase.from('quotation_lines').insert(legacy);
      if (retry.error) throw new Error(retry.error.message);
    } else if (error) {
      throw new Error(error.message);
    }
  }

  return { total, untaxed, tax };
}

function stripPdfDataUrl(pdfDataUrlOrBase64: string): Buffer {
  const raw = pdfDataUrlOrBase64.trim();
  const base64 = raw.includes('base64,') ? raw.split('base64,')[1] || '' : raw;
  if (!base64) throw new Error('PDF payload is empty');
  return Buffer.from(base64, 'base64');
}

async function uploadCustomerPdf(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  quotationId: string,
  pdfDataUrlOrBase64: string
) {
  const ensured = await ensureInquiryImagesBucket(supabase);
  if (!ensured.ok) {
    throw new Error(ensured.error);
  }

  const bytes = stripPdfDataUrl(pdfDataUrlOrBase64);
  const filePath = `customer-quotes/${quotationId}/${Date.now()}.pdf`;
  let { error: uploadError } = await supabase.storage
    .from(INQUIRY_IMAGES_BUCKET)
    .upload(filePath, bytes, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (uploadError && /bucket not found|bucket does not exist/i.test(uploadError.message)) {
    const retryBucket = await ensureInquiryImagesBucket(supabase);
    if (!retryBucket.ok) throw new Error(retryBucket.error);
    const second = await supabase.storage
      .from(INQUIRY_IMAGES_BUCKET)
      .upload(filePath, bytes, { contentType: 'application/pdf', upsert: false });
    uploadError = second.error;
  }

  if (uploadError) {
    throw new Error(uploadError.message || 'Failed to store quotation PDF');
  }

  const { data: urlData } = supabase.storage
    .from(INQUIRY_IMAGES_BUCKET)
    .getPublicUrl(filePath);

  return { filePath, pdfUrl: urlData.publicUrl };
}

async function notifyInquiryEvent(input: {
  supabase: Awaited<ReturnType<typeof createAdminClient>>;
  inquiryId: string | null;
  salespersonId: string | null;
  senderUsername: string;
  eventType: string;
  message: string;
}) {
  if (!input.inquiryId || !input.salespersonId) return;
  try {
    const { data: inquiryRow } = await input.supabase
      .from('lead_inquiries')
      .select('lead_id')
      .eq('id', input.inquiryId)
      .maybeSingle();
    if (!inquiryRow?.lead_id) return;

    const { data: agent } = await input.supabase
      .from('sales_agents')
      .select('username')
      .eq('id', input.salespersonId)
      .maybeSingle();
    if (!agent?.username) return;

    await input.supabase.from('inquiry_lifecycle_notifications').insert([
      {
        lead_id: inquiryRow.lead_id,
        inquiry_id: input.inquiryId,
        confirmation_id: null,
        sender_role: 'sales_agent',
        sender_username: input.senderUsername,
        recipient_role: 'sales_agent',
        recipient_username: agent.username,
        event_type: input.eventType,
        message: input.message,
      },
    ]);
  } catch {
    // optional
  }
}

/** Save a counter-offer draft (not sent to customer yet). */
export async function saveNegotiationCounterDraft(
  quotationId: string,
  offeredAmount: number,
  message: string
) {
  try {
    const scope = await resolveSalesScope();
    if ('error' in scope) return { error: scope.error };

    const amount = round2(Number(offeredAmount));
    if (!(amount > 0)) return { error: 'Offer amount must be greater than zero' };

    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', quotationId)
      .maybeSingle();

    if (error || !row) return { error: error?.message || 'Quotation not found' };
    if (!row.sent_to_customer_at) {
      return { error: 'Send the quotation to the customer before negotiating.' };
    }

    const blocked = negotiationBlocked(row as Record<string, unknown>);
    if (blocked) return { error: blocked };

    if (!row.pending_customer_request_amount) {
      return { error: 'No pending customer negotiation request to respond to.' };
    }

    const msg = String(message || '').trim() || null;

    const { error: updateError } = await supabase
      .from('quotations')
      .update({
        pending_counter_amount: amount,
        pending_counter_message: msg,
        pending_counter_at: new Date().toISOString(),
        pending_counter_by: scope.session!.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', quotationId);

    if (updateError) {
      if (/pending_counter|negotiation_status|column/i.test(updateError.message)) {
        return {
          error:
            'Run supabase/migrations/020_quotation_negotiation.sql in Supabase before using negotiation.',
        };
      }
      return { error: updateError.message };
    }

    await supabase.from('quotation_negotiation_events').insert([
      {
        quotation_id: quotationId,
        inquiry_id: row.linked_inquiry_id,
        event_type: 'sales_counter_draft',
        actor_role: 'sales',
        actor_username: scope.session!.username,
        previous_amount: row.total_amount,
        offered_amount: amount,
        requested_amount: row.pending_customer_request_amount,
        message: msg,
        metadata: { draft: true },
      },
    ]);

    await supabase.from('quotation_logs').insert([
      {
        quotation_id: quotationId,
        action: 'sales_negotiation_counter_draft',
        previous_status: row.status,
        new_status: row.status,
        performed_by: scope.session!.username,
        details: {
          offered_amount: amount,
          requested_amount: row.pending_customer_request_amount,
          current_amount: row.total_amount,
          message: msg,
        },
      },
    ]);

    return getQuotationNegotiationState(quotationId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to save counter draft',
    };
  }
}

/** Reject customer negotiation request (no price change). */
export async function rejectCustomerNegotiationRequest(
  quotationId: string,
  message: string
) {
  try {
    const scope = await resolveSalesScope();
    if ('error' in scope) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', quotationId)
      .maybeSingle();

    if (error || !row) return { error: error?.message || 'Quotation not found' };
    const blocked = negotiationBlocked(row as Record<string, unknown>);
    if (blocked) return { error: blocked };
    if (!row.pending_customer_request_amount) {
      return { error: 'No pending customer negotiation request.' };
    }

    const msg = String(message || '').trim() || 'Sales declined the requested price.';

    await supabase.from('quotation_negotiation_events').insert([
      {
        quotation_id: quotationId,
        inquiry_id: row.linked_inquiry_id,
        event_type: 'sales_rejected_request',
        actor_role: 'sales',
        actor_username: scope.session!.username,
        previous_amount: row.total_amount,
        offered_amount: row.total_amount,
        requested_amount: row.pending_customer_request_amount,
        message: msg,
      },
    ]);

    const { error: updateError } = await supabase
      .from('quotations')
      .update({
        negotiation_status: 'awaiting_customer',
        pending_customer_request_amount: null,
        pending_customer_request_message: null,
        pending_customer_request_at: null,
        pending_counter_amount: null,
        pending_counter_message: null,
        pending_counter_at: null,
        pending_counter_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', quotationId);

    if (updateError) return { error: updateError.message };

    await supabase.from('quotation_logs').insert([
      {
        quotation_id: quotationId,
        action: 'sales_negotiation_rejected',
        previous_status: row.status,
        new_status: row.status,
        performed_by: scope.session!.username,
        details: {
          message: msg,
          current_amount: row.total_amount,
          requested_amount: row.pending_customer_request_amount,
        },
      },
    ]);

    return getQuotationNegotiationState(quotationId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to reject negotiation',
    };
  }
}

type ApplyAndSendMode = 'accept_request' | 'send_counter';

/**
 * Phase 1: apply commercial totals for accept/counter (same quotation_number).
 * Does not mark as customer-sent until PDF is attached.
 */
export async function applyNegotiationTotals(
  quotationId: string,
  mode: ApplyAndSendMode
): Promise<
  | {
      previousAmount: number;
      newAmount: number;
      message: string | null;
      mode: ApplyAndSendMode;
      requestedAmount: number | null;
    }
  | { error: string }
> {
  try {
    const scope = await resolveSalesScope();
    if ('error' in scope) return { error: scope.error };

    const detailRes = await getSalesQuotationDetail(quotationId);
    if ('error' in detailRes && detailRes.error) return { error: detailRes.error };
    const quotation = (detailRes as { quotation: SalesQuotationDetail }).quotation;

    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', quotationId)
      .maybeSingle();

    if (error || !row) return { error: error?.message || 'Quotation not found' };
    if (!row.sent_to_customer_at || !row.linked_inquiry_id) {
      return { error: 'Quotation must already be linked and sent to a customer inquiry.' };
    }

    const blocked = negotiationBlocked(row as Record<string, unknown>);
    if (blocked) return { error: blocked };

    let targetAmount: number;
    let customerMessage: string | null = null;

    if (mode === 'accept_request') {
      if (row.pending_customer_request_amount == null) {
        return { error: 'No pending customer request to accept.' };
      }
      targetAmount = round2(Number(row.pending_customer_request_amount));
      customerMessage =
        String(row.pending_customer_request_message || '').trim() ||
        'Sales accepted your requested amount.';
    } else {
      if (row.pending_counter_amount == null) {
        return {
          error:
            'Save a counter-offer draft first, then click Send Counter Offer to Customer.',
        };
      }
      targetAmount = round2(Number(row.pending_counter_amount));
      customerMessage =
        String(row.pending_counter_message || '').trim() ||
        'Sales sent a counter offer.';
    }

    if (!(targetAmount > 0)) return { error: 'Invalid offer amount.' };

    const previousAmount = round2(Number(row.total_amount) || 0);
    const sums = await applyTotalAndReplaceLines(supabase, quotation, targetAmount);
    const original =
      row.original_offer_amount == null
        ? previousAmount
        : Number(row.original_offer_amount);

    const { error: updateError } = await supabase
      .from('quotations')
      .update({
        total_amount: sums.total,
        amount_untaxed: sums.untaxed,
        amount_tax: sums.tax,
        unit_price: sums.total,
        previous_offer_amount: previousAmount,
        original_offer_amount: original,
        updated_at: new Date().toISOString(),
        updated_by: scope.session!.username,
        revision: (Number(row.revision) || 1) + 1,
      })
      .eq('id', quotationId);

    if (updateError) {
      // Retry without optional columns that may not exist on older schemas
      const { error: retryError } = await supabase
        .from('quotations')
        .update({
          total_amount: sums.total,
          previous_offer_amount: previousAmount,
          original_offer_amount: original,
          updated_at: new Date().toISOString(),
          updated_by: scope.session!.username,
          revision: (Number(row.revision) || 1) + 1,
        })
        .eq('id', quotationId);
      if (retryError) return { error: retryError.message };
    }

    return {
      previousAmount,
      newAmount: sums.total,
      message: customerMessage,
      mode,
      requestedAmount:
        row.pending_customer_request_amount == null
          ? null
          : Number(row.pending_customer_request_amount),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to apply negotiation totals',
    };
  }
}

/**
 * Phase 2: after totals applied + client PDF generated for NEW amounts,
 * upload PDF and finalize negotiation event / customer visibility.
 */
export async function attachNegotiationCustomerPdf(
  quotationId: string,
  pdfDataUrlOrBase64: string,
  mode: ApplyAndSendMode
): Promise<
  | { quotation: SalesQuotationDetail; negotiation: QuotationNegotiationState; pdfUrl: string }
  | { error: string }
> {
  try {
    const scope = await resolveSalesScope();
    if ('error' in scope) return { error: scope.error };
    if (!pdfDataUrlOrBase64?.trim()) {
      return { error: 'PDF is required before notifying the customer.' };
    }

    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', quotationId)
      .maybeSingle();

    if (error || !row) return { error: error?.message || 'Quotation not found' };
    if (!row.linked_inquiry_id) {
      return { error: 'Quotation is not linked to a customer inquiry.' };
    }

    let uploaded: { filePath: string; pdfUrl: string };
    try {
      uploaded = await uploadCustomerPdf(supabase, quotationId, pdfDataUrlOrBase64);
    } catch (err) {
      return {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to store PDF. Totals may already be updated — use Send Quotation to Customer.',
      };
    }

    const now = new Date().toISOString();
    const newAmount = round2(Number(row.total_amount) || 0);
    const previousAmount =
      row.previous_offer_amount == null
        ? newAmount
        : round2(Number(row.previous_offer_amount));

    const eventType =
      mode === 'accept_request' ? 'sales_accepted_request' : 'sales_counter_sent';
    const logAction =
      mode === 'accept_request'
        ? 'sales_negotiation_accepted'
        : 'sales_negotiation_counter_sent';
    const customerMessage =
      mode === 'accept_request'
        ? String(row.pending_customer_request_message || '').trim() ||
          'Sales accepted your requested amount.'
        : String(row.pending_counter_message || '').trim() ||
          'Sales sent a counter offer.';

    const { data: updated, error: updateError } = await supabase
      .from('quotations')
      .update({
        customer_pdf_path: uploaded.filePath,
        customer_pdf_url: uploaded.pdfUrl,
        sent_to_customer_at: now,
        sent_to_customer_by: scope.session!.username,
        negotiation_status: 'awaiting_customer',
        pending_customer_request_amount: null,
        pending_customer_request_message: null,
        pending_customer_request_at: null,
        pending_counter_amount: null,
        pending_counter_message: null,
        pending_counter_at: null,
        pending_counter_by: null,
        updated_at: now,
        updated_by: scope.session!.username,
      })
      .eq('id', quotationId)
      .select('*')
      .single();

    if (updateError || !updated) {
      return {
        error:
          updateError?.message ||
          'PDF stored but finalize failed. Use Send Quotation to Customer if needed.',
      };
    }

    await supabase.from('quotation_negotiation_events').insert([
      {
        quotation_id: quotationId,
        inquiry_id: row.linked_inquiry_id,
        event_type: eventType,
        actor_role: 'sales',
        actor_username: scope.session!.username,
        previous_amount: previousAmount,
        offered_amount: newAmount,
        requested_amount: row.pending_customer_request_amount,
        message: customerMessage,
        pdf_url: uploaded.pdfUrl,
        pdf_path: uploaded.filePath,
        metadata: { mode, quotation_number: row.quotation_number },
      },
    ]);

    await supabase.from('quotation_logs').insert([
      {
        quotation_id: quotationId,
        action: logAction,
        previous_status: row.status,
        new_status: updated.status,
        performed_by: scope.session!.username,
        details: {
          previous_amount: previousAmount,
          new_amount: newAmount,
          message: customerMessage,
          customer_pdf_url: uploaded.pdfUrl,
          inquiry_id: row.linked_inquiry_id,
        },
      },
    ]);

    await notifyInquiryEvent({
      supabase,
      inquiryId: String(row.linked_inquiry_id),
      salespersonId: row.salesperson_id ? String(row.salesperson_id) : null,
      senderUsername: scope.session!.username,
      eventType: 'quotation_counter_offer',
      message: `Updated offer for quotation ${row.quotation_number || ''} sent to customer (${newAmount}).`,
    });

    const refreshed = await getSalesQuotationDetail(quotationId);
    const negotiation = await getQuotationNegotiationState(quotationId);
    if ('error' in refreshed && refreshed.error) return { error: refreshed.error };
    if ('error' in negotiation && negotiation.error) return { error: negotiation.error };

    return {
      quotation: (refreshed as { quotation: SalesQuotationDetail }).quotation,
      negotiation: (negotiation as { negotiation: QuotationNegotiationState }).negotiation,
      pdfUrl: uploaded.pdfUrl,
    };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to attach negotiation PDF',
    };
  }
}

/** @deprecated Prefer applyNegotiationTotals + attachNegotiationCustomerPdf */
export async function applyNegotiationOfferAndSendToCustomer(
  quotationId: string,
  pdfDataUrlOrBase64: string,
  mode: ApplyAndSendMode
) {
  const applied = await applyNegotiationTotals(quotationId, mode);
  if ('error' in applied) return applied;
  return attachNegotiationCustomerPdf(quotationId, pdfDataUrlOrBase64, mode);
}
