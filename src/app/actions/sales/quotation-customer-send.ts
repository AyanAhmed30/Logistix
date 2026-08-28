'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { sessionHasSalesAccess } from '@/lib/auth/require-access';
import {
  getSalesQuotationDetail,
  type SalesQuotationDetail,
} from '@/app/actions/sales/quotation-form';
import {
  INQUIRY_IMAGES_BUCKET,
  ensureInquiryImagesBucket,
} from '@/lib/inquiry-storage';

export type SendQuotationToCustomerResult =
  | {
      quotation: SalesQuotationDetail;
      inquiryId: string;
      resent: boolean;
      pdfUrl: string;
    }
  | { error: string };

function stripPdfDataUrl(pdfDataUrlOrBase64: string): Buffer {
  const raw = pdfDataUrlOrBase64.trim();
  const base64 = raw.includes('base64,') ? raw.split('base64,')[1] || '' : raw;
  if (!base64) {
    throw new Error('PDF payload is empty');
  }
  return Buffer.from(base64, 'base64');
}

async function resolveLinkedInquiryId(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  quotation: {
    id: string;
    contact_id: string | null;
    opportunity_id: string | null;
    linked_inquiry_id?: string | null;
  }
): Promise<{ inquiryId: string } | { error: string }> {
  if (quotation.linked_inquiry_id) {
    const { data: existing } = await supabase
      .from('lead_inquiries')
      .select('id')
      .eq('id', quotation.linked_inquiry_id)
      .maybeSingle();
    if (existing?.id) {
      return { inquiryId: String(existing.id) };
    }
  }

  if (!quotation.contact_id) {
    return {
      error:
        'This quotation has no customer contact. Select a customer before sending to the mobile app.',
    };
  }

  const { data: contact } = await supabase
    .from('contacts')
    .select('id, phone, mobile')
    .eq('id', quotation.contact_id)
    .maybeSingle();

  if (!contact) {
    return { error: 'Customer contact not found for this quotation.' };
  }

  const phone = String(contact.phone || contact.mobile || '').trim();
  if (!phone) {
    return {
      error:
        'Customer contact has no phone number. Add a phone on the contact so the mobile app can match this customer.',
    };
  }

  // Prefer leads linked to this contact
  const { data: leadsByContact } = await supabase
    .from('leads')
    .select('id')
    .eq('contact_id', quotation.contact_id)
    .order('updated_at', { ascending: false })
    .limit(20);

  let leadIds = (leadsByContact || []).map((l) => String(l.id));

  // Fallback: phone-matched leads (same ownership model as customer portal)
  if (leadIds.length === 0) {
    const { data: phoneLeads } = await supabase
      .from('leads')
      .select('id, number')
      .order('updated_at', { ascending: false })
      .limit(200);

    const digits = phone.replace(/\D/g, '');
    const tail = digits.slice(-10);
    leadIds = (phoneLeads || [])
      .filter((l) => {
        const n = String(l.number || '').replace(/\D/g, '');
        return n && (n === digits || n.endsWith(tail) || digits.endsWith(n.slice(-10)));
      })
      .map((l) => String(l.id));
  }

  if (leadIds.length === 0) {
    return {
      error:
        'No lead/inquiry found for this customer. Create or submit a freight inquiry for this contact first.',
    };
  }

  const { data: inquiries } = await supabase
    .from('lead_inquiries')
    .select('id, lead_id, created_at, sent_to_accounting, customer_submitted, status')
    .in('lead_id', leadIds)
    .or('sent_to_accounting.eq.true,customer_submitted.eq.true')
    .order('created_at', { ascending: false })
    .limit(50);

  if (!inquiries || inquiries.length === 0) {
    return {
      error:
        'No customer-visible inquiry found for this contact. The inquiry must be customer-submitted or sent to Operations before a quotation can be shared in the app.',
    };
  }

  return { inquiryId: String(inquiries[0].id) };
}

/**
 * Upload the SAME staff-generated quotation PDF and make it visible
 * to the matching customer in the mobile app (via linked inquiry).
 *
 * pdfDataUrlOrBase64: data URL or raw base64 from generateSalesQuotationPdf.
 */
export async function sendSalesQuotationToCustomer(
  quotationId: string,
  pdfDataUrlOrBase64: string
): Promise<SendQuotationToCustomerResult> {
  try {
    const session = await getSession();
    if (!session || !sessionHasSalesAccess(session)) {
      return { error: 'Unauthorized' };
    }

    if (!quotationId?.trim()) {
      return { error: 'Quotation id is required' };
    }
    if (!pdfDataUrlOrBase64?.trim()) {
      return { error: 'Quotation PDF is required. Generate/download the PDF first.' };
    }

    const detailRes = await getSalesQuotationDetail(quotationId);
    if ('error' in detailRes && detailRes.error) {
      return { error: detailRes.error };
    }
    if (!('quotation' in detailRes) || !detailRes.quotation) {
      return { error: 'Quotation not found' };
    }

    const quotation = detailRes.quotation;
    if (quotation.status === 'cancelled') {
      return { error: 'Cancelled quotations cannot be sent to the customer.' };
    }
    if (quotation.status === 'sales_order') {
      return { error: 'This document is already a Sales Order.' };
    }
    if (!quotation.contact_id) {
      return {
        error:
          'This quotation has no customer contact. Select a customer before sending to the mobile app.',
      };
    }

    const supabase = await createAdminClient();
    const link = await resolveLinkedInquiryId(supabase, {
      id: quotation.id,
      contact_id: quotation.contact_id,
      opportunity_id: quotation.opportunity_id,
      linked_inquiry_id: quotation.linked_inquiry_id || null,
    });
    if ('error' in link) {
      return { error: link.error };
    }

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = stripPdfDataUrl(pdfDataUrlOrBase64);
    } catch {
      return { error: 'Invalid PDF payload. Please regenerate the PDF and try again.' };
    }
    if (pdfBuffer.byteLength < 100) {
      return { error: 'PDF generation failed. Please try Download PDF first, then send again.' };
    }
    if (pdfBuffer.byteLength > 20 * 1024 * 1024) {
      return { error: 'PDF is too large to send (max 20 MB).' };
    }

    const bucketReady = await ensureInquiryImagesBucket(supabase);
    if (!bucketReady.ok) {
      return { error: bucketReady.error };
    }

    const safeNumber = (quotation.quotation_number || 'quotation').replace(
      /[^a-zA-Z0-9._-]/g,
      '_'
    );
    const filePath = `customer-quotes/${quotation.id}_${Date.now()}_${safeNumber}.pdf`;

    const uploadBytes = new Uint8Array(pdfBuffer);
    const firstAttempt = await supabase.storage
      .from(INQUIRY_IMAGES_BUCKET)
      .upload(filePath, uploadBytes, {
        contentType: 'application/pdf',
        upsert: false,
      });

    let uploadError = firstAttempt.error;
    if (uploadError && /bucket not found|bucket does not exist/i.test(uploadError.message)) {
      const retryBucket = await ensureInquiryImagesBucket(supabase);
      if (!retryBucket.ok) {
        return { error: retryBucket.error };
      }
      const secondAttempt = await supabase.storage
        .from(INQUIRY_IMAGES_BUCKET)
        .upload(filePath, uploadBytes, {
          contentType: 'application/pdf',
          upsert: false,
        });
      uploadError = secondAttempt.error;
    }

    if (uploadError) {
      return { error: uploadError.message || 'Failed to store quotation PDF' };
    }

    const { data: urlData } = supabase.storage
      .from(INQUIRY_IMAGES_BUCKET)
      .getPublicUrl(filePath);
    const pdfUrl = urlData.publicUrl;

    const alreadySent = Boolean(quotation.sent_to_customer_at);
    const now = new Date().toISOString();
    const totalAmount = Number(quotation.total_amount) || 0;

    const { data: existingNeg } = await supabase
      .from('quotations')
      .select('original_offer_amount, negotiation_status')
      .eq('id', quotation.id)
      .maybeSingle();

    const seedOriginal =
      existingNeg == null ||
      existingNeg.original_offer_amount == null ||
      existingNeg.original_offer_amount === undefined;

    const { data: updated, error: updateError } = await supabase
      .from('quotations')
      .update({
        linked_inquiry_id: link.inquiryId,
        customer_pdf_path: filePath,
        customer_pdf_url: pdfUrl,
        sent_to_customer_at: now,
        sent_to_customer_by: session.username,
        status: quotation.status === 'quotation' ? 'quotation_sent' : quotation.status,
        ...(seedOriginal
          ? {
              original_offer_amount: totalAmount,
              negotiation_status: 'awaiting_customer',
            }
          : {}),
        updated_at: now,
        updated_by: session.username,
      })
      .eq('id', quotation.id)
      .select('*')
      .single();

    if (updateError || !updated) {
      return { error: updateError?.message || 'Failed to mark quotation as sent to customer' };
    }

    // Drive mobile "Quote ready" from inquiry status (existing mapping)
    await supabase
      .from('lead_inquiries')
      .update({
        status: 'quotation_sent',
        updated_at: now,
      })
      .eq('id', link.inquiryId);

    await supabase.from('quotation_logs').insert([
      {
        quotation_id: quotation.id,
        action: alreadySent ? 'resent_to_customer' : 'sent_to_customer',
        previous_status: quotation.status,
        new_status: updated.status,
        performed_by: session.username,
        details: {
          inquiry_id: link.inquiryId,
          customer_pdf_path: filePath,
          customer_pdf_url: pdfUrl,
          total_amount: totalAmount,
        },
      },
    ]);

    // Seed immutable negotiation history (same quotation number)
    try {
      if (!alreadySent || seedOriginal) {
        const { count } = await supabase
          .from('quotation_negotiation_events')
          .select('id', { count: 'exact', head: true })
          .eq('quotation_id', quotation.id)
          .eq('event_type', 'original_offer');

        if (!count) {
          await supabase.from('quotation_negotiation_events').insert([
            {
              quotation_id: quotation.id,
              inquiry_id: link.inquiryId,
              event_type: 'original_offer',
              actor_role: 'sales',
              actor_username: session.username,
              previous_amount: null,
              offered_amount: totalAmount,
              message: 'Original quotation offer sent to customer',
              pdf_url: pdfUrl,
              pdf_path: filePath,
              metadata: { quotation_number: quotation.quotation_number },
            },
          ]);
        }
      } else {
        await supabase.from('quotation_negotiation_events').insert([
          {
            quotation_id: quotation.id,
            inquiry_id: link.inquiryId,
            event_type: 'resent_offer',
            actor_role: 'sales',
            actor_username: session.username,
            previous_amount: totalAmount,
            offered_amount: totalAmount,
            message: 'Quotation PDF resent to customer',
            pdf_url: pdfUrl,
            pdf_path: filePath,
            metadata: { quotation_number: quotation.quotation_number },
          },
        ]);
      }
    } catch {
      // negotiation table may not exist until migration 020
    }

    // Optional lifecycle notification for future inbox (ignore failures / role constraints)
    try {
      const { data: inquiryRow } = await supabase
        .from('lead_inquiries')
        .select('lead_id')
        .eq('id', link.inquiryId)
        .maybeSingle();

      if (inquiryRow?.lead_id && quotation.salesperson_id) {
        const { data: agent } = await supabase
          .from('sales_agents')
          .select('username')
          .eq('id', quotation.salesperson_id)
          .maybeSingle();

        if (agent?.username) {
          await supabase.from('inquiry_lifecycle_notifications').insert([
            {
              lead_id: inquiryRow.lead_id,
              inquiry_id: link.inquiryId,
              confirmation_id: null,
              sender_role: 'sales_agent',
              sender_username: session.username,
              recipient_role: 'sales_agent',
              recipient_username: agent.username,
              event_type: 'quotation_sent_to_customer',
              message: `Quotation ${quotation.quotation_number || ''} was sent to the customer mobile app.`,
            },
          ]);
        }
      }
    } catch {
      // non-blocking
    }

    const refreshed = await getSalesQuotationDetail(quotation.id);
    if ('quotation' in refreshed && refreshed.quotation) {
      return {
        quotation: refreshed.quotation,
        inquiryId: link.inquiryId,
        resent: alreadySent,
        pdfUrl,
      };
    }

    return {
      quotation: {
        ...quotation,
        status: String(updated.status),
        linked_inquiry_id: link.inquiryId,
        customer_pdf_url: pdfUrl,
        customer_pdf_path: filePath,
        sent_to_customer_at: now,
        sent_to_customer_by: session.username,
      },
      inquiryId: link.inquiryId,
      resent: alreadySent,
      pdfUrl,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to send quotation to customer',
    };
  }
}

/** Convenience: whether a quotation can be sent (for UI). */
export async function getSalesQuotationCustomerSendState(quotationId: string) {
  try {
    const detail = await getSalesQuotationDetail(quotationId);
    if ('error' in detail && detail.error) return { error: detail.error };
    if (!('quotation' in detail) || !detail.quotation) {
      return { error: 'Quotation not found' };
    }

    const q = detail.quotation;

    return {
      canSend: Boolean(q.contact_id) && q.status !== 'cancelled' && q.status !== 'sales_order',
      hasContact: Boolean(q.contact_id),
      alreadySent: Boolean(q.sent_to_customer_at),
      sentAt: q.sent_to_customer_at || null,
      linkedInquiryId: q.linked_inquiry_id || null,
      pdfUrl: q.customer_pdf_url || null,
      bucket: INQUIRY_IMAGES_BUCKET,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load send state',
    };
  }
}
