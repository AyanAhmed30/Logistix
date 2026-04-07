'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';
import {
  buildInvoicePosting,
  createAndPostJournalEntry,
} from '@/app/actions/accounting_posting';

export type InvoiceStatus = 'draft' | 'confirmed' | 'posted' | 'paid' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paid' | 'partial';

export type Invoice = {
  id: string;
  quotation_id: string;
  partner_id: string | null;
  invoice_number: string;
  customer_name: string;
  product_service: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  invoice_date: string;
  due_date: string | null;
  payment_status: PaymentStatus;
  invoice_status: InvoiceStatus;
  paid_amount: number;
  outstanding_amount: number;
  posted_journal_entry_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type InvoiceLog = {
  id: string;
  invoice_id: string;
  action: 'created' | 'updated' | 'deleted' | 'status_changed' | 'payment_registered' | 'printed';
  previous_status: string | null;
  new_status: string | null;
  performed_by: string;
  performed_at: string;
  details: Record<string, unknown> | null;
};

function ensureAdminOrSalesAgent(session: { role: string } | null) {
  if (!session || (session.role !== 'admin' && session.role !== 'sales_agent')) {
    throw new Error('Unauthorized');
  }
}

async function generateInvoiceNumber(supabase: Awaited<ReturnType<typeof createAdminClient>>, year: number): Promise<string> {
  // Format: INV/YYYY/XXXX (e.g., INV/2026/0001)
  const prefix = `INV/${year}/`;
  
  // Get the highest sequence number for this year
  const { data: existingInvoices } = await supabase
    .from('invoices')
    .select('invoice_number')
    .like('invoice_number', `${prefix}%`)
    .order('invoice_number', { ascending: false })
    .limit(1);

  let nextSequence = 1;
  if (existingInvoices && existingInvoices.length > 0) {
    const lastNumber = existingInvoices[0].invoice_number;
    const sequencePart = lastNumber.replace(prefix, '');
    const lastSequence = parseInt(sequencePart, 10);
    if (!isNaN(lastSequence)) {
      nextSequence = lastSequence + 1;
    }
  }

  return `${prefix}${nextSequence.toString().padStart(4, '0')}`;
}

function canPartnerBeCustomer(partnerType: string) {
  return partnerType === 'customer' || partnerType === 'both';
}

function parseAmount(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function logInvoiceAction(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  invoiceId: string,
  action: InvoiceLog['action'],
  performedBy: string,
  previousStatus?: string | null,
  newStatus?: string | null,
  details?: Record<string, unknown>
) {
  await supabase.from('invoice_logs').insert([
    {
      invoice_id: invoiceId,
      action,
      previous_status: previousStatus || null,
      new_status: newStatus || null,
      performed_by: performedBy,
      details: details || null,
    },
  ]);
}

export async function createInvoiceFromSalesOrder(quotationId: string) {
  try {
    const session = await getSession();
    ensureAdminOrSalesAgent(session);
    if (!session) {
      return { error: 'Unauthorized' };
    }

    if (!quotationId) {
      return { error: 'Quotation id is required' };
    }

    const supabase = await createAdminClient();

    // Check if quotation exists and is a sales order
    const { data: quotation, error: quotationError } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', quotationId)
      .eq('status', 'sales_order')
      .single();

    if (quotationError || !quotation) {
      return { error: 'Sales order not found or quotation is not confirmed as sales order' };
    }

    // Check if invoice already exists for this quotation
    const { data: existingInvoice } = await supabase
      .from('invoices')
      .select('id, invoice_number')
      .eq('quotation_id', quotationId)
      .single();

    if (existingInvoice) {
      return { error: `Invoice already exists for this sales order: ${existingInvoice.invoice_number}` };
    }

    // Generate invoice number
    const invoiceDate = new Date();
    const year = invoiceDate.getFullYear();
    const invoiceNumber = await generateInvoiceNumber(supabase, year);
    const invoiceDateString = invoiceDate.toISOString().split('T')[0];
    const dueDateString = invoiceDateString;

    const quotePartnerId = String(quotation.partner_id || '').trim();
    if (!quotePartnerId) {
      return {
        error: 'Quotation is missing customer partner linkage. Update quotation partner before creating invoice.',
      };
    }

    const { data: customerPartner, error: partnerError } = await supabase
      .from('partners')
      .select('id, name, partner_type, status')
      .eq('id', quotePartnerId)
      .eq('status', 'active')
      .single();

    if (partnerError || !customerPartner || !canPartnerBeCustomer(customerPartner.partner_type)) {
      return {
        error: `Active customer partner for quotation "${quotation.customer_name}" is invalid.`,
      };
    }

    // Create invoice
    const { data, error } = await supabase
      .from('invoices')
      .insert([
        {
          quotation_id: quotationId,
          partner_id: customerPartner.id,
          invoice_number: invoiceNumber,
          customer_name: quotation.customer_name,
          product_service: quotation.product_service,
          quantity: quotation.quantity,
          unit_price: quotation.unit_price,
          total_amount: quotation.total_amount,
          invoice_date: invoiceDateString,
          due_date: dueDateString,
          payment_status: 'unpaid',
          invoice_status: 'draft',
          paid_amount: 0,
          outstanding_amount: quotation.total_amount,
          created_by: session.username,
        },
      ])
      .select()
      .single();

    if (error || !data) {
      return { error: error?.message || 'Failed to create invoice' };
    }

    // Log the creation
    await logInvoiceAction(
      supabase,
      data.id,
      'created',
      session.username,
      null,
      'draft',
      {
        quotation_id: quotationId,
        partner_id: customerPartner.id,
        customer_name: quotation.customer_name,
        product_service: quotation.product_service,
        quantity: quotation.quantity,
        unit_price: quotation.unit_price,
        total_amount: quotation.total_amount,
      }
    );

    revalidatePath('/admin/dashboard');
    revalidatePath('/sales-agent/dashboard');
    return { invoice: data as Invoice };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function getAllInvoices(status?: InvoiceStatus) {
  try {
    const session = await getSession();
    ensureAdminOrSalesAgent(session);
    if (!session) {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();
    let query = supabase.from('invoices').select('*').order('created_at', { ascending: false });

    if (status) {
      query = query.eq('invoice_status', status);
    }

    const { data, error } = await query;

    if (error) {
      return { error: error.message };
    }

    return { invoices: (data || []) as Invoice[] };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

/**
 * Get invoices created by the current sales agent only.
 */
export async function getAllInvoicesForSalesAgent(status?: InvoiceStatus) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'sales_agent') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();
    let query = supabase
      .from('invoices')
      .select('*')
      .eq('created_by', session.username)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('invoice_status', status);
    }

    const { data, error } = await query;

    if (error) {
      return { error: error.message };
    }

    return { invoices: (data || []) as Invoice[] };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function getInvoiceByQuotationId(quotationId: string) {
  try {
    const session = await getSession();
    ensureAdminOrSalesAgent(session);
    if (!session) {
      return { error: 'Unauthorized' };
    }

    if (!quotationId) {
      return { error: 'Quotation id is required' };
    }

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('quotation_id', quotationId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No invoice found
        return { invoice: null };
      }
      return { error: error.message };
    }

    return { invoice: data as Invoice };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function updateInvoice(formData: FormData) {
  try {
    const session = await getSession();
    ensureAdminOrSalesAgent(session);
    if (!session) {
      return { error: 'Unauthorized' };
    }

    const id = String(formData.get('id') || '').trim();
    if (!id) {
      return { error: 'Invoice id is required' };
    }

    const customer_name = String(formData.get('customer_name') || '').trim();
    const product_service = String(formData.get('product_service') || '').trim();
    const quantity = parseFloat(String(formData.get('quantity') || '0'));
    const unit_price = parseFloat(String(formData.get('unit_price') || '0'));
    const total_amount = parseFloat(String(formData.get('total_amount') || '0'));
    const invoice_date = String(formData.get('invoice_date') || '').trim();
    const due_date = String(formData.get('due_date') || '').trim() || null;

    if (!customer_name || !product_service || !invoice_date) {
      return { error: 'Customer name, product/service, and invoice date are required' };
    }

    if (quantity <= 0 || unit_price <= 0 || total_amount <= 0) {
      return { error: 'Quantity, unit price, and total amount must be greater than zero' };
    }

    const supabase = await createAdminClient();

    // Get current invoice to compare changes
    const { data: currentInvoice } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (!currentInvoice) {
      return { error: 'Invoice not found' };
    }

    if (currentInvoice.invoice_status === 'posted' || currentInvoice.invoice_status === 'paid') {
      return { error: 'Posted/Paid invoices cannot be modified.' };
    }

    const { data, error } = await supabase
      .from('invoices')
      .update({
        customer_name,
        product_service,
        quantity,
        unit_price,
        total_amount,
        invoice_date,
        due_date,
        outstanding_amount: Math.max(total_amount - parseAmount(currentInvoice.paid_amount), 0),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return { error: error?.message || 'Failed to update invoice' };
    }

    // Log the update
    await logInvoiceAction(
      supabase,
      id,
      'updated',
      session.username,
      currentInvoice.invoice_status,
      data.invoice_status,
      {
        previous: {
          customer_name: currentInvoice.customer_name,
          product_service: currentInvoice.product_service,
          quantity: currentInvoice.quantity,
          unit_price: currentInvoice.unit_price,
          total_amount: currentInvoice.total_amount,
          invoice_date: currentInvoice.invoice_date,
        },
        new: {
          customer_name,
          product_service,
          quantity,
          unit_price,
          total_amount,
          invoice_date,
        },
      }
    );

    revalidatePath('/admin/dashboard');
    revalidatePath('/sales-agent/dashboard');
    return { invoice: data as Invoice };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function deleteInvoice(id: string) {
  try {
    const session = await getSession();
    ensureAdminOrSalesAgent(session);
    if (!session) {
      return { error: 'Unauthorized' };
    }

    if (!id) {
      return { error: 'Invoice id is required' };
    }

    const supabase = await createAdminClient();

    // Get invoice before deletion for logging
    const { data: invoice } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (invoice && (invoice.invoice_status === 'posted' || invoice.invoice_status === 'paid')) {
      return { error: 'Posted/Paid invoices cannot be deleted.' };
    }

    const { error } = await supabase.from('invoices').delete().eq('id', id);

    if (error) {
      return { error: error.message };
    }

    // Log the deletion (before the record is deleted)
    if (invoice) {
      await logInvoiceAction(
        supabase,
        id,
        'deleted',
        session.username,
        invoice.invoice_status,
        null,
        {
          invoice_number: invoice.invoice_number,
          customer_name: invoice.customer_name,
          product_service: invoice.product_service,
          quantity: invoice.quantity,
          unit_price: invoice.unit_price,
          total_amount: invoice.total_amount,
        }
      );
    }

    revalidatePath('/admin/dashboard');
    revalidatePath('/sales-agent/dashboard');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function confirmInvoice(id: string) {
  try {
    const session = await getSession();
    ensureAdminOrSalesAgent(session);
    if (!session) {
      return { error: 'Unauthorized' };
    }

    if (!id) {
      return { error: 'Invoice id is required' };
    }

    const supabase = await createAdminClient();

    // Get current invoice
    const { data: currentInvoice, error: fetchError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !currentInvoice) {
      return { error: fetchError?.message || 'Invoice not found' };
    }

    if (currentInvoice.invoice_status !== 'draft') {
      return { error: 'Only invoices with status "Draft" can be confirmed' };
    }

    const { data, error } = await supabase
      .from('invoices')
      .update({
        invoice_status: 'confirmed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return { error: error?.message || 'Failed to confirm invoice' };
    }

    // Log the status change
    await logInvoiceAction(
      supabase,
      id,
      'status_changed',
      session.username,
      'draft',
      'confirmed',
      { action: 'Confirm Invoice' }
    );

    revalidatePath('/admin/dashboard');
    revalidatePath('/sales-agent/dashboard');
    return { invoice: data as Invoice };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function postInvoice(id: string) {
  try {
    const session = await getSession();
    ensureAdminOrSalesAgent(session);
    if (!session) {
      return { error: 'Unauthorized' };
    }

    if (!id) {
      return { error: 'Invoice id is required' };
    }

    const supabase = await createAdminClient();

    // Get current invoice
    const { data: currentInvoice, error: fetchError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !currentInvoice) {
      return { error: fetchError?.message || 'Invoice not found' };
    }

    if (currentInvoice.invoice_status !== 'confirmed') {
      return { error: 'Only confirmed invoices can be posted' };
    }

    if (!currentInvoice.partner_id) {
      return { error: 'Customer partner is required before posting.' };
    }

    if (parseAmount(currentInvoice.total_amount) <= 0) {
      return { error: 'Invoice total amount must be greater than zero.' };
    }

    const posting = await buildInvoicePosting({
      amount: parseAmount(currentInvoice.total_amount),
      partnerId: currentInvoice.partner_id,
      invoiceNumber: currentInvoice.invoice_number,
      entryDate: currentInvoice.invoice_date,
    });

    const journalEntryId = await createAndPostJournalEntry({
      reference: `INV-${currentInvoice.invoice_number}`,
      entryDate: currentInvoice.invoice_date,
      journalId: posting.journalId,
      lines: posting.lines,
    });

    const { data, error } = await supabase
      .from('invoices')
      .update({
        invoice_status: 'posted',
        payment_status: parseAmount(currentInvoice.total_amount) > 0 ? 'unpaid' : 'paid',
        posted_journal_entry_id: journalEntryId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return { error: error?.message || 'Failed to post invoice' };
    }

    // Log the posting
    await logInvoiceAction(
      supabase,
      id,
      'status_changed',
      session.username,
      'confirmed',
      'posted',
      {
        action: 'Post Invoice',
        posted_journal_entry_id: journalEntryId,
      },
    );

    revalidatePath('/admin/dashboard');
    revalidatePath('/sales-agent/dashboard');
    return { invoice: data as Invoice, postedJournalEntryId: journalEntryId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function registerPayment(id: string) {
  return { error: 'Use Payments + Reconciliation module to register payments.' };
}

export async function cancelInvoice(id: string) {
  try {
    const session = await getSession();
    ensureAdminOrSalesAgent(session);
    if (!session) {
      return { error: 'Unauthorized' };
    }
    if (!id) {
      return { error: 'Invoice id is required' };
    }

    const supabase = await createAdminClient();
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchError || !invoice) {
      return { error: fetchError?.message || 'Invoice not found' };
    }
    if (invoice.invoice_status === 'posted' || invoice.invoice_status === 'paid') {
      return { error: 'Posted/Paid invoices cannot be cancelled directly.' };
    }
    if (invoice.invoice_status === 'cancelled') {
      return { error: 'Invoice is already cancelled.' };
    }

    const { data, error } = await supabase
      .from('invoices')
      .update({
        invoice_status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) {
      return { error: error?.message || 'Failed to cancel invoice' };
    }

    await logInvoiceAction(
      supabase,
      id,
      'status_changed',
      session.username,
      invoice.invoice_status,
      'cancelled',
      { action: 'Cancel Invoice' },
    );

    revalidatePath('/admin/dashboard');
    revalidatePath('/sales-agent/dashboard');
    return { invoice: data as Invoice };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function getInvoiceLogs(invoiceId: string) {
  try {
    const session = await getSession();
    ensureAdminOrSalesAgent(session);
    if (!session) {
      return { error: 'Unauthorized' };
    }

    if (!invoiceId) {
      return { error: 'Invoice id is required' };
    }

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('invoice_logs')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('performed_at', { ascending: false });

    if (error) {
      return { error: error.message };
    }

    return { logs: (data || []) as InvoiceLog[] };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function logInvoicePrint(invoiceId: string) {
  try {
    const session = await getSession();
    ensureAdminOrSalesAgent(session);
    if (!session) {
      return { error: 'Unauthorized' };
    }

    if (!invoiceId) {
      return { error: 'Invoice id is required' };
    }

    const supabase = await createAdminClient();

    // Get invoice details for logging
    const { data: invoice } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (!invoice) {
      return { error: 'Invoice not found' };
    }

    // Log the print action
    await logInvoiceAction(
      supabase,
      invoiceId,
      'printed',
      session.username,
      invoice.invoice_status,
      invoice.invoice_status,
      {
        action: 'Invoice Printed',
        invoice_number: invoice.invoice_number,
      }
    );

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}
