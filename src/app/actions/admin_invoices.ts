'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

export type AdminInvoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  source?: string | null;
  description?: string | null;
  quantity?: string | null;
  unit_price?: string | null;
  taxes?: string | null;
  amount?: string | null;
  untaxed_amount?: string | null;
  total?: string | null;
  payment_communication?: string | null;
  created_at: string;
  updated_at: string;
};

function ensureAdmin(session: { role: string } | null) {
  if (!session || session.role !== 'admin') {
    throw new Error('Unauthorized');
  }
}

function formatInvoiceNumber(year: number, sequence: number) {
  const seqStr = sequence.toString().padStart(4, '0');
  return `INV/${year}/${seqStr}`;
}

async function generateNextInvoiceNumber(
  supabase: ReturnType<typeof createAdminClient> extends Promise<infer T> ? T : never,
  invoiceDate: string
) {
  const year =
    (invoiceDate && new Date(invoiceDate).getFullYear()) || new Date().getFullYear();

  const patternPrefix = `INV/${year}/`;

  const { data, error } = await supabase
    .from('admin_invoices')
    .select('invoice_number')
    .ilike('invoice_number', `${patternPrefix}%`)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return formatInvoiceNumber(year, 1);
  }

  const last = data[0].invoice_number || '';
  const match = last.match(/INV\/(\d{4})\/(\d{4})/);
  const lastSeq = match ? parseInt(match[2], 10) || 0 : 0;

  return formatInvoiceNumber(year, lastSeq + 1);
}

export async function createAdminInvoice(formData: FormData) {
  try {
    const session = await getSession();
    ensureAdmin(session);

    let invoice_number = String(formData.get('invoice_number') || '').trim();
    const invoice_date = String(formData.get('invoice_date') || '').trim();
    const due_date = String(formData.get('due_date') || '').trim();

    if (!invoice_date || !due_date) {
      return { error: 'Invoice date and due date are required' };
    }

    const supabase = await createAdminClient();

    // If invoice number is not provided, auto-generate based on year + sequence
    if (!invoice_number) {
      invoice_number = await generateNextInvoiceNumber(supabase, invoice_date);
    }

    const { data, error } = await supabase
      .from('admin_invoices')
      .insert([
        {
          invoice_number,
          invoice_date,
          due_date,
          source: (formData.get('source') as string | null) || null,
          description: (formData.get('description') as string | null) || null,
          quantity: (formData.get('quantity') as string | null) || null,
          unit_price: (formData.get('unit_price') as string | null) || null,
          taxes: (formData.get('taxes') as string | null) || null,
          amount: (formData.get('amount') as string | null) || null,
          untaxed_amount: (formData.get('untaxed_amount') as string | null) || null,
          total: (formData.get('total') as string | null) || null,
          payment_communication:
            (formData.get('payment_communication') as string | null) || null,
        },
      ])
      .select()
      .single();

    if (error || !data) {
      return { error: error?.message || 'Failed to create invoice' };
    }

    revalidatePath('/admin/dashboard');
    return { invoice: data as AdminInvoice };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function getAllAdminInvoices() {
  try {
    const session = await getSession();
    ensureAdmin(session);

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('admin_invoices')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return { error: error.message };
    }

    return { invoices: (data || []) as AdminInvoice[] };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function deleteAdminInvoice(id: string) {
  try {
    const session = await getSession();
    ensureAdmin(session);

    if (!id) {
      return { error: 'Invoice id is required' };
    }

    const supabase = await createAdminClient();
    const { error } = await supabase.from('admin_invoices').delete().eq('id', id);

    if (error) {
      return { error: error.message };
    }

    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

export async function updateAdminInvoice(formData: FormData) {
  try {
    const session = await getSession();
    ensureAdmin(session);

    const id = String(formData.get('id') || '').trim();
    if (!id) {
      return { error: 'Invoice id is required' };
    }

    let invoice_number = String(formData.get('invoice_number') || '').trim();
    const invoice_date = String(formData.get('invoice_date') || '').trim();
    const due_date = String(formData.get('due_date') || '').trim();

    if (!invoice_date || !due_date) {
      return { error: 'Invoice date and due date are required' };
    }

    const supabase = await createAdminClient();

    // If invoice number is empty while editing, re-generate based on current date/year
    if (!invoice_number) {
      invoice_number = await generateNextInvoiceNumber(supabase, invoice_date);
    }

    const { data, error } = await supabase
      .from('admin_invoices')
      .update({
        invoice_number,
        invoice_date,
        due_date,
        source: (formData.get('source') as string | null) || null,
        description: (formData.get('description') as string | null) || null,
        quantity: (formData.get('quantity') as string | null) || null,
        unit_price: (formData.get('unit_price') as string | null) || null,
        taxes: (formData.get('taxes') as string | null) || null,
        amount: (formData.get('amount') as string | null) || null,
        untaxed_amount: (formData.get('untaxed_amount') as string | null) || null,
        total: (formData.get('total') as string | null) || null,
        payment_communication:
          (formData.get('payment_communication') as string | null) || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return { error: error?.message || 'Failed to update invoice' };
    }

    revalidatePath('/admin/dashboard');
    return { invoice: data as AdminInvoice };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { error: message };
  }
}

