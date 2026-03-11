'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

export type QuotationStatus = 'quotation' | 'quotation_sent' | 'sales_order';

export type Quotation = {
  id: string;
  quotation_number: string | null;
  customer_name: string;
  product_service: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  taxes: number;
  expiration_date: string | null;
  payment_terms: string;
  status: QuotationStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type QuotationLog = {
  id: string;
  quotation_id: string;
  action: 'created' | 'updated' | 'deleted' | 'status_changed' | 'printed' | 'log_note' | 'activity';
  previous_status: string | null;
  new_status: string | null;
  performed_by: string;
  performed_at: string;
  details: Record<string, unknown> | null;
};

function ensureAdmin(session: { role: string } | null) {
  if (!session || session.role !== 'admin') {
    throw new Error('Unauthorized');
  }
}

async function logQuotationAction(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  quotationId: string,
  action: QuotationLog['action'],
  performedBy: string,
  previousStatus?: string | null,
  newStatus?: string | null,
  details?: Record<string, unknown>
) {
  await supabase.from('quotation_logs').insert([
    {
      quotation_id: quotationId,
      action,
      previous_status: previousStatus || null,
      new_status: newStatus || null,
      performed_by: performedBy,
      details: details || null,
    },
  ]);
}

async function generateQuotationNumber(supabase: Awaited<ReturnType<typeof createAdminClient>>): Promise<string> {
  const { data: lastQuotation } = await supabase
    .from('quotations')
    .select('quotation_number')
    .not('quotation_number', 'is', null)
    .order('quotation_number', { ascending: false })
    .limit(1);

  let nextNum = 1;
  if (lastQuotation && lastQuotation.length > 0 && lastQuotation[0].quotation_number) {
    const match = lastQuotation[0].quotation_number.match(/S(\d+)/);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }
  return `S${String(nextNum).padStart(5, '0')}`;
}

export async function createQuotation(formData: FormData) {
  try {
    const session = await getSession();
    ensureAdmin(session);
    if (!session) {
      return { error: 'Unauthorized' };
    }

    const customer_name = String(formData.get('customer_name') || '').trim();
    const product_service = String(formData.get('product_service') || '').trim();
    const quantity = parseFloat(String(formData.get('quantity') || '0'));
    const unit_price = parseFloat(String(formData.get('unit_price') || '0'));
    const taxes = parseFloat(String(formData.get('taxes') || '0'));
    const expiration_date = String(formData.get('expiration_date') || '').trim() || null;
    const payment_terms = String(formData.get('payment_terms') || 'Immediate').trim();

    if (!customer_name || !product_service) {
      return { error: 'Customer name and product/service are required' };
    }

    if (quantity <= 0 || unit_price <= 0) {
      return { error: 'Quantity and unit price must be greater than zero' };
    }

    // Calculate total with taxes
    const untaxed = quantity * unit_price;
    const tax_amount = untaxed * (taxes / 100);
    const total_amount = untaxed + tax_amount;

    const supabase = await createAdminClient();

    // Generate quotation number
    const quotation_number = await generateQuotationNumber(supabase);

    const { data, error } = await supabase
      .from('quotations')
      .insert([
        {
          quotation_number,
          customer_name,
          product_service,
          quantity,
          unit_price,
          total_amount,
          taxes,
          expiration_date,
          payment_terms,
          status: 'quotation',
          created_by: session.username,
        },
      ])
      .select()
      .single();

    if (error || !data) {
      return { error: error?.message || 'Failed to create quotation' };
    }

    // Log the creation
    await logQuotationAction(
      supabase,
      data.id,
      'created',
      session.username,
      null,
      'quotation',
      { customer_name, product_service, quantity, unit_price, total_amount, taxes }
    );

    revalidatePath('/admin/dashboard');
    return { quotation: data as Quotation };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function getAllQuotations(status?: QuotationStatus) {
  try {
    const session = await getSession();
    ensureAdmin(session);
    if (!session) {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();
    let query = supabase.from('quotations').select('*').order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      return { error: error.message };
    }

    return { quotations: (data || []) as Quotation[] };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function updateQuotation(formData: FormData) {
  try {
    const session = await getSession();
    ensureAdmin(session);
    if (!session) {
      return { error: 'Unauthorized' };
    }

    const id = String(formData.get('id') || '').trim();
    if (!id) {
      return { error: 'Quotation id is required' };
    }

    const customer_name = String(formData.get('customer_name') || '').trim();
    const product_service = String(formData.get('product_service') || '').trim();
    const quantity = parseFloat(String(formData.get('quantity') || '0'));
    const unit_price = parseFloat(String(formData.get('unit_price') || '0'));
    const taxes = parseFloat(String(formData.get('taxes') || '0'));
    const expiration_date = String(formData.get('expiration_date') || '').trim() || null;
    const payment_terms = String(formData.get('payment_terms') || 'Immediate').trim();

    if (!customer_name || !product_service) {
      return { error: 'Customer name and product/service are required' };
    }

    if (quantity <= 0 || unit_price <= 0) {
      return { error: 'Quantity and unit price must be greater than zero' };
    }

    // Calculate total with taxes
    const untaxed = quantity * unit_price;
    const tax_amount = untaxed * (taxes / 100);
    const total_amount = untaxed + tax_amount;

    const supabase = await createAdminClient();

    // Get current quotation to compare changes
    const { data: currentQuotation } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', id)
      .single();

    if (!currentQuotation) {
      return { error: 'Quotation not found' };
    }

    const { data, error } = await supabase
      .from('quotations')
      .update({
        customer_name,
        product_service,
        quantity,
        unit_price,
        total_amount,
        taxes,
        expiration_date,
        payment_terms,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return { error: error?.message || 'Failed to update quotation' };
    }

    // Log the update with previous and new values
    await logQuotationAction(
      supabase,
      id,
      'updated',
      session.username,
      currentQuotation.status,
      data.status,
      {
        previous: {
          customer_name: currentQuotation.customer_name,
          product_service: currentQuotation.product_service,
          quantity: currentQuotation.quantity,
          unit_price: currentQuotation.unit_price,
          total_amount: currentQuotation.total_amount,
          taxes: currentQuotation.taxes || 0,
        },
        new: {
          customer_name,
          product_service,
          quantity,
          unit_price,
          total_amount,
          taxes,
        },
      }
    );

    revalidatePath('/admin/dashboard');
    return { quotation: data as Quotation };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function deleteQuotation(id: string) {
  try {
    const session = await getSession();
    ensureAdmin(session);
    if (!session) {
      return { error: 'Unauthorized' };
    }

    if (!id) {
      return { error: 'Quotation id is required' };
    }

    const supabase = await createAdminClient();

    // Get quotation before deletion for logging
    const { data: quotation } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', id)
      .single();

    const { error } = await supabase.from('quotations').delete().eq('id', id);

    if (error) {
      return { error: error.message };
    }

    // Log the deletion
    if (quotation) {
      await logQuotationAction(
        supabase,
        id,
        'deleted',
        session.username,
        quotation.status,
        null,
        {
          customer_name: quotation.customer_name,
          product_service: quotation.product_service,
          quantity: quotation.quantity,
          unit_price: quotation.unit_price,
          total_amount: quotation.total_amount,
        }
      );
    }

    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function sendQuotation(
  id: string,
  messageData?: { phone_number?: string; whatsapp_message?: string }
) {
  try {
    const session = await getSession();
    ensureAdmin(session);
    if (!session) {
      return { error: 'Unauthorized' };
    }

    if (!id) {
      return { error: 'Quotation id is required' };
    }

    const supabase = await createAdminClient();

    // Get current quotation
    const { data: currentQuotation, error: fetchError } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !currentQuotation) {
      return { error: fetchError?.message || 'Quotation not found' };
    }

    // ── Try sending via WhatsApp Business Cloud API (if configured) ──
    let whatsappMessageId: string | null = null;
    let sendMethod = 'whatsapp_web';

    if (messageData?.phone_number && messageData?.whatsapp_message) {
      const whatsappResult = await sendWhatsAppMessage(
        messageData.phone_number.trim(),
        messageData.whatsapp_message.trim()
      );

      if (whatsappResult.useWebFallback) {
        // API not configured — frontend already opened WhatsApp Web
        sendMethod = 'whatsapp_web';
      } else if (!whatsappResult.success) {
        // API configured but failed — still allow status update since WhatsApp Web was already opened
        console.error('[sendQuotation] WhatsApp API error:', whatsappResult.error);
        sendMethod = 'whatsapp_web';
      } else {
        // API sent successfully
        sendMethod = 'whatsapp_api';
        whatsappMessageId = whatsappResult.messageId || null;
      }
    }

    // ── Update quotation status ──
    let updatedData = currentQuotation;

    if (currentQuotation.status === 'quotation') {
      const { data, error } = await supabase
        .from('quotations')
        .update({
          status: 'quotation_sent',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error || !data) {
        return { error: error?.message || 'Failed to update quotation status' };
      }
      updatedData = data;
    }

    // Log the send action
    await logQuotationAction(
      supabase,
      id,
      'status_changed',
      session.username,
      currentQuotation.status,
      updatedData.status,
      {
        action: 'Send Quotation via WhatsApp',
        send_method: sendMethod,
        phone_number: messageData?.phone_number || null,
        whatsapp_message: messageData?.whatsapp_message || null,
        whatsapp_message_id: whatsappMessageId,
      }
    );

    revalidatePath('/admin/dashboard');
    return { quotation: updatedData as Quotation };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function confirmOrder(id: string) {
  try {
    const session = await getSession();
    ensureAdmin(session);
    if (!session) {
      return { error: 'Unauthorized' };
    }

    if (!id) {
      return { error: 'Quotation id is required' };
    }

    const supabase = await createAdminClient();

    // Get current quotation
    const { data: currentQuotation, error: fetchError } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !currentQuotation) {
      return { error: fetchError?.message || 'Quotation not found' };
    }

    if (currentQuotation.status !== 'quotation_sent' && currentQuotation.status !== 'quotation') {
      return { error: 'Only quotations can be confirmed as orders' };
    }

    const { data, error } = await supabase
      .from('quotations')
      .update({
        status: 'sales_order',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return { error: error?.message || 'Failed to confirm order' };
    }

    // Log the status change
    await logQuotationAction(
      supabase,
      id,
      'status_changed',
      session.username,
      currentQuotation.status,
      'sales_order',
      { action: 'Confirm Order' }
    );

    revalidatePath('/admin/dashboard');
    return { quotation: data as Quotation };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function getQuotationLogs(quotationId: string) {
  try {
    const session = await getSession();
    ensureAdmin(session);
    if (!session) {
      return { error: 'Unauthorized' };
    }

    if (!quotationId) {
      return { error: 'Quotation id is required' };
    }

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('quotation_logs')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('performed_at', { ascending: false });

    if (error) {
      return { error: error.message };
    }

    return { logs: (data || []) as QuotationLog[] };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function logQuotationPrint(quotationId: string) {
  try {
    const session = await getSession();
    ensureAdmin(session);
    if (!session) {
      return { error: 'Unauthorized' };
    }

    if (!quotationId) {
      return { error: 'Quotation id is required' };
    }

    const supabase = await createAdminClient();

    // Get quotation details for logging
    const { data: quotation } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', quotationId)
      .single();

    if (!quotation) {
      return { error: 'Quotation not found' };
    }

    // Log the print action
    await logQuotationAction(
      supabase,
      quotationId,
      'printed',
      session.username,
      quotation.status,
      quotation.status,
      {
        action: 'Quotation Printed',
        quotation_number: quotation.quotation_number || `QT-${quotation.id.substring(0, 8).toUpperCase()}`,
      }
    );

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function addQuotationLogNote(quotationId: string, note: string) {
  try {
    const session = await getSession();
    ensureAdmin(session);
    if (!session) {
      return { error: 'Unauthorized' };
    }

    if (!quotationId || !note.trim()) {
      return { error: 'Quotation id and note are required' };
    }

    const supabase = await createAdminClient();

    // Get quotation to capture current status
    const { data: quotation } = await supabase
      .from('quotations')
      .select('status')
      .eq('id', quotationId)
      .single();

    if (!quotation) {
      return { error: 'Quotation not found' };
    }

    await logQuotationAction(
      supabase,
      quotationId,
      'log_note',
      session.username,
      quotation.status,
      quotation.status,
      { note: note.trim() }
    );

    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function addQuotationActivity(
  quotationId: string,
  summary: string,
  dueDate: string | null
) {
  try {
    const session = await getSession();
    ensureAdmin(session);
    if (!session) {
      return { error: 'Unauthorized' };
    }

    if (!quotationId || !summary.trim()) {
      return { error: 'Quotation id and activity summary are required' };
    }

    const supabase = await createAdminClient();

    // Get quotation to capture current status
    const { data: quotation } = await supabase
      .from('quotations')
      .select('status')
      .eq('id', quotationId)
      .single();

    if (!quotation) {
      return { error: 'Quotation not found' };
    }

    await logQuotationAction(
      supabase,
      quotationId,
      'activity',
      session.username,
      quotation.status,
      quotation.status,
      {
        summary: summary.trim(),
        due_date: dueDate || null,
      }
    );

    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}
