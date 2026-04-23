'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';
import {
  buildInvoicePosting,
  createAndPostJournalEntry,
} from '@/app/actions/accounting_posting';

export type InvoiceStatus = 'draft' | 'approved' | 'confirmed' | 'posted' | 'partially_paid' | 'paid' | 'cancelled';
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

type InvoiceChatterKind = 'message' | 'note' | 'activity';

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

async function resolveCustomerPartnerForQuotation(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  quotation: {
    id: string;
    customer_name: string;
    partner_id?: string | null;
    contact_id?: string | null;
  }
) {
  const quotePartnerId = String(quotation.partner_id || '').trim();
  if (quotePartnerId) {
    const { data: existingPartner } = await supabase
      .from('partners')
      .select('id, name, partner_type, status')
      .eq('id', quotePartnerId)
      .eq('status', 'active')
      .single();

    if (existingPartner && canPartnerBeCustomer(existingPartner.partner_type)) {
      return { partner: existingPartner };
    }
  }

  const customerName = String(quotation.customer_name || '').trim();

  // 1) Try exact active customer/both by name
  if (customerName) {
    const { data: byNameRows } = await supabase
      .from('partners')
      .select('id, name, partner_type, status')
      .eq('status', 'active')
      .ilike('name', customerName)
      .limit(5);

    const customerCandidates = (byNameRows || []).filter((p) =>
      canPartnerBeCustomer(p.partner_type)
    );

    if (customerCandidates.length === 1) {
      return { partner: customerCandidates[0] };
    }
  }

  // 2) If quotation links to a contact, auto-create a customer partner
  //    (or upgrade an existing vendor/agent to "both")
  let contactPayload: {
    name: string;
    email: string | null;
    phone: string | null;
    street: string | null;
    street2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    country: string | null;
  } | null = null;

  const contactId = String(quotation.contact_id || '').trim();
  if (contactId) {
    const { data: c } = await supabase
      .from('contacts')
      .select('name, email, phone, street, street2, city, state, zip, country')
      .eq('id', contactId)
      .single();
    if (c) {
      contactPayload = {
        name: String(c.name || '').trim(),
        email: (c.email as string | null) ?? null,
        phone: (c.phone as string | null) ?? null,
        street: (c.street as string | null) ?? null,
        street2: (c.street2 as string | null) ?? null,
        city: (c.city as string | null) ?? null,
        state: (c.state as string | null) ?? null,
        zip: (c.zip as string | null) ?? null,
        country: (c.country as string | null) ?? null,
      };
    }
  }

  const fallbackName = contactPayload?.name || customerName;
  if (!fallbackName) {
    return {
      error:
        'Quotation is missing customer linkage. Please select a valid contact/customer before creating invoice.',
    };
  }

  const address = [
    contactPayload?.street,
    contactPayload?.street2,
    contactPayload?.city,
    contactPayload?.state,
    contactPayload?.zip,
    contactPayload?.country,
  ]
    .map((v) => (v ? String(v).trim() : ''))
    .filter((v) => v.length > 0)
    .join(', ');

  // If partner exists with same name but non-customer type, upgrade to "both"
  const { data: sameNamePartner } = await supabase
    .from('partners')
    .select('id, name, partner_type, status')
    .eq('status', 'active')
    .ilike('name', fallbackName)
    .limit(1)
    .single();

  if (sameNamePartner) {
    if (!canPartnerBeCustomer(sameNamePartner.partner_type)) {
      const { data: upgraded } = await supabase
        .from('partners')
        .update({
          partner_type: 'both',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sameNamePartner.id)
        .select('id, name, partner_type, status')
        .single();
      if (upgraded) return { partner: upgraded };
    } else {
      return { partner: sameNamePartner };
    }
  }

  // Create a brand-new customer partner
  const { data: createdPartner, error: createErr } = await supabase
    .from('partners')
    .insert([
      {
        name: fallbackName,
        partner_type: 'customer',
        email: contactPayload?.email || null,
        phone: contactPayload?.phone || null,
        address: address || null,
        status: 'active',
      },
    ])
    .select('id, name, partner_type, status')
    .single();

  if (createErr || !createdPartner) {
    return { error: createErr?.message || 'Failed to create customer partner.' };
  }

  return { partner: createdPartner };
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
      .select('*')
      .eq('quotation_id', quotationId)
      .single();

    if (existingInvoice) {
      return {
        invoice: existingInvoice as Invoice,
        alreadyExists: true,
      };
    }

    // Generate invoice number
    const invoiceDate = new Date();
    const year = invoiceDate.getFullYear();
    const invoiceNumber = await generateInvoiceNumber(supabase, year);
    const invoiceDateString = invoiceDate.toISOString().split('T')[0];
    const dueDateString = invoiceDateString;

    const partnerResolve = await resolveCustomerPartnerForQuotation(supabase, quotation);
    if ('error' in partnerResolve && partnerResolve.error) {
      return { error: partnerResolve.error };
    }
    if (!('partner' in partnerResolve) || !partnerResolve.partner) {
      return { error: 'Unable to resolve a valid customer partner for this quotation.' };
    }
    const customerPartner = partnerResolve.partner;

    // Keep quotation.partner_id synchronized so subsequent actions don't fail.
    await supabase
      .from('quotations')
      .update({
        partner_id: customerPartner.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', quotationId);

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

/**
 * Manual invoice creation path used by the Accounting Invoice editor when the
 * user opens a fresh "New" form (not coming from an existing quotation).
 *
 * To keep accounting integrity consistent, we first create a minimal
 * `sales_order` quotation and then reuse `createInvoiceFromSalesOrder`.
 */
export async function createManualInvoice(formData: FormData) {
  try {
    const session = await getSession();
    ensureAdminOrSalesAgent(session);
    if (!session) return { error: 'Unauthorized' };

    const customer_name = String(formData.get('customer_name') || '').trim();
    const manual_invoice_number = String(formData.get('invoice_number') || '').trim();
    const product_service = String(formData.get('product_service') || '').trim();
    const quantity = parseFloat(String(formData.get('quantity') || '0'));
    const unit_price = parseFloat(String(formData.get('unit_price') || '0'));
    const total_amount = parseFloat(String(formData.get('total_amount') || '0'));
    const invoice_date = String(formData.get('invoice_date') || '').trim();
    const due_date = String(formData.get('due_date') || '').trim() || null;

    if (!customer_name || !product_service || !invoice_date) {
      return { error: 'Customer, product/service and invoice date are required.' };
    }
    if (quantity <= 0 || unit_price <= 0 || total_amount <= 0) {
      return { error: 'Quantity, unit price and total amount must be greater than zero.' };
    }

    const supabase = await createAdminClient();

    // Best-effort partner linkage from customer name.
    let partner_id: string | null = null;
    const { data: partnerRows } = await supabase
      .from('partners')
      .select('id, partner_type, status')
      .eq('status', 'active')
      .ilike('name', customer_name)
      .limit(5);
    const customerPartners = (partnerRows || []).filter((p) =>
      canPartnerBeCustomer(String(p.partner_type || ''))
    );
    if (customerPartners.length === 1) {
      partner_id = customerPartners[0].id as string;
    }

    // Create minimal quotation as sales order.
    const { data: quote, error: qErr } = await supabase
      .from('quotations')
      .insert([
        {
          quotation_number: null,
          partner_id,
          customer_name,
          product_service,
          quantity,
          unit_price,
          total_amount,
          taxes: 0,
          uom: 'pcs / u',
          expiration_date: due_date,
          payment_terms: 'Immediate',
          status: 'sales_order',
          created_by: session.username,
        },
      ])
      .select('id')
      .single();

    if (qErr || !quote) {
      return { error: qErr?.message || 'Failed to create source sales order.' };
    }

    // Reuse the canonical invoice creation path.
    const created = await createInvoiceFromSalesOrder(String(quote.id));
    if ('error' in created && created.error) return created;

    if ('invoice' in created && created.invoice && manual_invoice_number) {
      // Let user override auto-number when explicitly entered.
      const { data: updated, error: updateErr } = await supabase
        .from('invoices')
        .update({
          invoice_number: manual_invoice_number,
          updated_at: new Date().toISOString(),
        })
        .eq('id', created.invoice.id)
        .select('*')
        .single();

      if (!updateErr && updated) {
        await logInvoiceAction(
          supabase,
          updated.id,
          'updated',
          session.username,
          updated.invoice_status,
          updated.invoice_status,
          { action: 'Invoice Number Updated', invoice_number: manual_invoice_number }
        );
        return { invoice: updated as Invoice };
      }
    }

    return created;
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create invoice',
    };
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

export async function getInvoiceById(invoiceId: string) {
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
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (error || !data) {
      return { error: error?.message || 'Invoice not found' };
    }

    return { invoice: data as Invoice };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function getInvoicesByContact(contactId: string) {
  try {
    const session = await getSession();
    ensureAdminOrSalesAgent(session);
    if (!session) return { error: 'Unauthorized' };
    if (!contactId) return { error: 'Contact id is required' };

    const supabase = await createAdminClient();

    const { data: contact } = await supabase
      .from('contacts')
      .select('id, name')
      .eq('id', contactId)
      .single();
    if (!contact) return { invoices: [] as Invoice[] };

    const contactName = String(contact.name || '').trim();

    let qQuery = supabase
      .from('quotations')
      .select('id')
      .order('created_at', { ascending: false });

    qQuery = contactName
      ? qQuery.or(`contact_id.eq.${contactId},customer_name.ilike.${contactName}`)
      : qQuery.eq('contact_id', contactId);

    const { data: quoteRows, error: qErr } = await qQuery;
    if (qErr) return { error: qErr.message };

    const quotationIds = (quoteRows || []).map((q) => q.id);
    if (quotationIds.length === 0) return { invoices: [] as Invoice[] };

    const { data: invoices, error: invErr } = await supabase
      .from('invoices')
      .select('*')
      .in('quotation_id', quotationIds)
      .order('created_at', { ascending: false });
    if (invErr) return { error: invErr.message };

    return { invoices: (invoices || []) as Invoice[] };
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

    const invoice_number = String(formData.get('invoice_number') || '').trim();
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
        ...(invoice_number ? { invoice_number } : {}),
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
          invoice_number: currentInvoice.invoice_number,
          customer_name: currentInvoice.customer_name,
          product_service: currentInvoice.product_service,
          quantity: currentInvoice.quantity,
          unit_price: currentInvoice.unit_price,
          total_amount: currentInvoice.total_amount,
          invoice_date: currentInvoice.invoice_date,
        },
        new: {
          invoice_number: invoice_number || currentInvoice.invoice_number,
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
      return { error: 'Only invoices with status "Draft" can be approved' };
    }

    const { data, error } = await supabase
      .from('invoices')
      .update({
        invoice_status: 'approved',
        approved_by: session.username,
        approved_at: new Date().toISOString(),
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
      'approved',
      { action: 'Approve Invoice' }
    );

    revalidatePath('/admin/dashboard');
    revalidatePath('/sales-agent/dashboard');
    return { invoice: data as Invoice };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function approveInvoice(id: string) {
  return confirmInvoice(id);
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

    if (currentInvoice.invoice_status !== 'approved' && currentInvoice.invoice_status !== 'confirmed') {
      return { error: 'Only approved invoices can be posted' };
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
        posted_by: session.username,
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
      currentInvoice.invoice_status,
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
  if (!id?.trim()) {
    return { error: 'Invoice id is required' };
  }
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
    if (invoice.invoice_status === 'posted' || invoice.invoice_status === 'partially_paid' || invoice.invoice_status === 'paid') {
      return { error: 'Posted invoices must be cancelled via reversal.' };
    }
    if (invoice.invoice_status === 'cancelled') {
      return { error: 'Invoice is already cancelled.' };
    }

    const { data, error } = await supabase
      .from('invoices')
      .update({
        invoice_status: 'cancelled',
        cancelled_by: session.username,
        cancelled_at: new Date().toISOString(),
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

export async function reverseInvoice(id: string) {
  try {
    const session = await getSession();
    ensureAdminOrSalesAgent(session);
    if (!session) return { error: 'Unauthorized' };
    if (!id) return { error: 'Invoice id is required' };

    const supabase = await createAdminClient();
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchError || !invoice) return { error: fetchError?.message || 'Invoice not found' };
    if (invoice.invoice_status !== 'posted' && invoice.invoice_status !== 'partially_paid' && invoice.invoice_status !== 'paid') {
      return { error: 'Only posted invoices can be reversed' };
    }
    if (!invoice.posted_journal_entry_id) {
      return { error: 'Posted invoice is missing journal entry reference' };
    }

    const { data: reversalRows, error: reversalError } = await supabase.rpc('reverse_journal_entry_strict', {
      p_original_entry_id: invoice.posted_journal_entry_id,
    });
    if (reversalError) return { error: reversalError.message || 'Failed to reverse invoice journal entry' };
    const reversal = Array.isArray(reversalRows) ? reversalRows[0] : null;
    if (!reversal) return { error: 'Failed to reverse invoice journal entry' };

    const { data: reversalInvoice, error: insertError } = await supabase
      .from('invoices')
      .insert([
        {
          quotation_id: invoice.quotation_id,
          partner_id: invoice.partner_id,
          invoice_number: `${invoice.invoice_number}-REV`,
          customer_name: invoice.customer_name,
          product_service: `${invoice.product_service} (REV)`,
          quantity: invoice.quantity,
          unit_price: invoice.unit_price,
          total_amount: invoice.total_amount,
          invoice_date: new Date().toISOString().slice(0, 10),
          due_date: invoice.due_date,
          payment_status: 'unpaid',
          invoice_status: 'cancelled',
          paid_amount: 0,
          outstanding_amount: 0,
          posted_journal_entry_id: reversal.reversal_entry_id,
          created_by: session.username,
          original_invoice_id: invoice.id,
        },
      ])
      .select('*')
      .single();
    if (insertError || !reversalInvoice) return { error: insertError?.message || 'Failed to create reversal invoice record' };

    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        invoice_status: 'cancelled',
        reversed_invoice_id: reversalInvoice.id,
        reversed_by: session.username,
        reversed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (updateError) return { error: updateError.message || 'Failed to update original invoice status' };

    await logInvoiceAction(
      supabase,
      id,
      'status_changed',
      session.username,
      invoice.invoice_status,
      'cancelled',
      {
        action: 'Reverse Invoice',
        reversal_invoice_id: reversalInvoice.id,
        reversal_journal_entry_id: reversal.reversal_entry_id,
      },
    );

    revalidatePath('/admin/dashboard');
    revalidatePath('/sales-agent/dashboard');
    return {
      success: true,
      reversal_invoice_id: reversalInvoice.id as string,
      reversal_journal_entry_id: reversal.reversal_entry_id as string,
    };
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

export async function addInvoiceLogNote(invoiceId: string, note: string) {
  try {
    const session = await getSession();
    ensureAdminOrSalesAgent(session);
    if (!session) return { error: 'Unauthorized' };
    if (!invoiceId || !note.trim()) return { error: 'Invoice id and note are required' };

    const supabase = await createAdminClient();
    const { data: invoice } = await supabase
      .from('invoices')
      .select('invoice_status')
      .eq('id', invoiceId)
      .single();
    if (!invoice) return { error: 'Invoice not found' };

    await logInvoiceAction(
      supabase,
      invoiceId,
      'updated',
      session.username,
      invoice.invoice_status,
      invoice.invoice_status,
      { chatter_kind: 'note' as InvoiceChatterKind, note: note.trim() }
    );
    revalidatePath('/admin/dashboard');
    revalidatePath('/sales-agent/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to add note' };
  }
}

export async function addInvoiceMessage(invoiceId: string, message: string) {
  try {
    const session = await getSession();
    ensureAdminOrSalesAgent(session);
    if (!session) return { error: 'Unauthorized' };
    if (!invoiceId || !message.trim()) return { error: 'Invoice id and message are required' };

    const supabase = await createAdminClient();
    const { data: invoice } = await supabase
      .from('invoices')
      .select('invoice_status')
      .eq('id', invoiceId)
      .single();
    if (!invoice) return { error: 'Invoice not found' };

    await logInvoiceAction(
      supabase,
      invoiceId,
      'updated',
      session.username,
      invoice.invoice_status,
      invoice.invoice_status,
      { chatter_kind: 'message' as InvoiceChatterKind, message: message.trim() }
    );
    revalidatePath('/admin/dashboard');
    revalidatePath('/sales-agent/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to add message' };
  }
}

export async function addInvoiceActivity(
  invoiceId: string,
  summary: string,
  dueDate: string | null
) {
  try {
    const session = await getSession();
    ensureAdminOrSalesAgent(session);
    if (!session) return { error: 'Unauthorized' };
    if (!invoiceId || !summary.trim()) return { error: 'Invoice id and summary are required' };

    const supabase = await createAdminClient();
    const { data: invoice } = await supabase
      .from('invoices')
      .select('invoice_status')
      .eq('id', invoiceId)
      .single();
    if (!invoice) return { error: 'Invoice not found' };

    await logInvoiceAction(
      supabase,
      invoiceId,
      'updated',
      session.username,
      invoice.invoice_status,
      invoice.invoice_status,
      {
        chatter_kind: 'activity' as InvoiceChatterKind,
        summary: summary.trim(),
        due_date: dueDate || null,
      }
    );
    revalidatePath('/admin/dashboard');
    revalidatePath('/sales-agent/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to add activity' };
  }
}

export async function getCurrentInvoiceUsername() {
  try {
    const session = await getSession();
    ensureAdminOrSalesAgent(session);
    if (!session) return { error: 'Unauthorized' };
    return { username: session.username || '' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unable to resolve current user' };
  }
}
