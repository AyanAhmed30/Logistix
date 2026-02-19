'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

export type ImportInvoiceItem = {
  id: string;
  invoice_id: string;
  product_name: string;
  hs_code: string;
  unit: string;
  no_of_units: number;
  unit_price: number;
  total_amount: number;
  item_order: number;
  created_at: string;
  updated_at: string;
};

export type ImportInvoice = {
  id: string;
  invoice_no: string;
  bill_to_name: string;
  bill_to_address?: string;
  bill_to_ntn?: string;
  bill_to_phone?: string;
  bill_to_email?: string;
  ship_to_name: string;
  ship_to_address?: string;
  ship_to_ntn?: string;
  ship_to_phone?: string;
  ship_to_email?: string;
  payment_terms?: string;
  shipped_via?: string;
  coo?: string;
  port_loading?: string;
  port_discharge?: string;
  shipping_terms?: string;
  exporter_bank_name?: string;
  exporter_bank_address?: string;
  exporter_bank_swift?: string;
  exporter_account_name?: string;
  exporter_account_address?: string;
  exporter_account_number?: string;
  importer_bank_name?: string;
  importer_bank_address?: string;
  importer_bank_swift?: string;
  importer_account_name?: string;
  importer_account_address?: string;
  importer_account_number?: string;
  importer_iban_number?: string;
  created_at: string;
  updated_at: string;
  items?: ImportInvoiceItem[];
};

export async function createImportInvoice(formData: FormData) {
  try {
    const session = await getSession();
    if (!session) {
      return { error: 'Unauthorized' };
    }

    // Allow admins or sales agents with "import-invoice" permission
    if (session.role === 'admin') {
      // Admin has access
    } else if (session.role === 'sales_agent') {
      const { hasPermission } = await import('@/lib/auth/permissions');
      const hasAccess = await hasPermission('import-invoice');
      if (!hasAccess) {
        return { error: 'Unauthorized' };
      }
    } else {
      return { error: 'Unauthorized' };
    }

    const invoice_no = formData.get('invoice_no') as string;
    const bill_to_name = formData.get('bill_to_name') as string;
    const bill_to_address = formData.get('bill_to_address') as string;
    const bill_to_ntn = formData.get('bill_to_ntn') as string;
    const bill_to_phone = formData.get('bill_to_phone') as string;
    const bill_to_email = formData.get('bill_to_email') as string;
    const ship_to_name = formData.get('ship_to_name') as string;
    const ship_to_address = formData.get('ship_to_address') as string;
    const ship_to_ntn = formData.get('ship_to_ntn') as string;
    const ship_to_phone = formData.get('ship_to_phone') as string;
    const ship_to_email = formData.get('ship_to_email') as string;
    const payment_terms = formData.get('payment_terms') as string;
    const shipped_via = formData.get('shipped_via') as string;
    const coo = formData.get('coo') as string;
    const port_loading = formData.get('port_loading') as string;
    const port_discharge = formData.get('port_discharge') as string;
    const shipping_terms = formData.get('shipping_terms') as string;
    const exporter_bank_name = formData.get('exporter_bank_name') as string;
    const exporter_bank_address = formData.get('exporter_bank_address') as string;
    const exporter_bank_swift = formData.get('exporter_bank_swift') as string;
    const exporter_account_name = formData.get('exporter_account_name') as string;
    const exporter_account_address = formData.get('exporter_account_address') as string;
    const exporter_account_number = formData.get('exporter_account_number') as string;
    const importer_bank_name = formData.get('importer_bank_name') as string;
    const importer_bank_address = formData.get('importer_bank_address') as string;
    const importer_bank_swift = formData.get('importer_bank_swift') as string;
    const importer_account_name = formData.get('importer_account_name') as string;
    const importer_account_address = formData.get('importer_account_address') as string;
    const importer_account_number = formData.get('importer_account_number') as string;
    const importer_iban_number = formData.get('importer_iban_number') as string;

    if (!invoice_no?.trim() || !bill_to_name?.trim() || !ship_to_name?.trim()) {
      return { error: 'Invoice No., Bill To Name, and Ship To Name are required' };
    }

    // Parse products from formData
    const products: Array<{
      product_name: string;
      hs_code: string;
      unit: string;
      no_of_units: number;
      unit_price: number;
      total_amount: number;
    }> = [];

    let index = 0;
    while (formData.get(`products[${index}][product_name]`)) {
      const product_name = formData.get(`products[${index}][product_name]`) as string;
      const hs_code = formData.get(`products[${index}][hs_code]`) as string;
      const unit = formData.get(`products[${index}][unit]`) as string;
      const no_of_units = parseFloat(formData.get(`products[${index}][no_of_units]`) as string);
      const unit_price = parseFloat(formData.get(`products[${index}][unit_price]`) as string);
      const total_amount = parseFloat(formData.get(`products[${index}][total_amount]`) as string);

      if (!product_name?.trim() || !hs_code?.trim() || !unit?.trim()) {
        return { error: `Product ${index + 1}: Product Name, HS Code, and Unit are required` };
      }

      if (no_of_units < 0 || unit_price < 0 || total_amount < 0) {
        return { error: `Product ${index + 1}: Units, unit price, and total amount must be non-negative numbers` };
      }

      products.push({
        product_name: product_name.trim(),
        hs_code: hs_code.trim(),
        unit: unit.trim(),
        no_of_units,
        unit_price,
        total_amount,
      });
      index++;
    }

    if (products.length === 0) {
      return { error: 'At least one product is required' };
    }

    const supabase = await createAdminClient();

    // Create invoice
    const { data: invoiceData, error: invoiceError } = await supabase
      .from('import_invoices')
      .insert([{
        invoice_no: invoice_no.trim(),
        bill_to_name: bill_to_name.trim(),
        bill_to_address: bill_to_address?.trim() || null,
        bill_to_ntn: bill_to_ntn?.trim() || null,
        bill_to_phone: bill_to_phone?.trim() || null,
        bill_to_email: bill_to_email?.trim() || null,
        ship_to_name: ship_to_name.trim(),
        ship_to_address: ship_to_address?.trim() || null,
        ship_to_ntn: ship_to_ntn?.trim() || null,
        ship_to_phone: ship_to_phone?.trim() || null,
        ship_to_email: ship_to_email?.trim() || null,
        payment_terms: payment_terms?.trim() || null,
        shipped_via: shipped_via?.trim() || null,
        coo: coo?.trim() || null,
        port_loading: port_loading?.trim() || null,
        port_discharge: port_discharge?.trim() || null,
        shipping_terms: shipping_terms?.trim() || null,
        exporter_bank_name: exporter_bank_name?.trim() || null,
        exporter_bank_address: exporter_bank_address?.trim() || null,
        exporter_bank_swift: exporter_bank_swift?.trim() || null,
        exporter_account_name: exporter_account_name?.trim() || null,
        exporter_account_address: exporter_account_address?.trim() || null,
        exporter_account_number: exporter_account_number?.trim() || null,
        importer_bank_name: importer_bank_name?.trim() || null,
        importer_bank_address: importer_bank_address?.trim() || null,
        importer_bank_swift: importer_bank_swift?.trim() || null,
        importer_account_name: importer_account_name?.trim() || null,
        importer_account_address: importer_account_address?.trim() || null,
        importer_account_number: importer_account_number?.trim() || null,
        importer_iban_number: importer_iban_number?.trim() || null,
      }])
      .select()
      .single();

    if (invoiceError) {
      return { error: invoiceError.message || 'Failed to create import invoice' };
    }

    // Create invoice items
    const items = products.map((product, idx) => ({
      invoice_id: invoiceData.id,
      product_name: product.product_name,
      hs_code: product.hs_code,
      unit: product.unit,
      no_of_units: product.no_of_units,
      unit_price: product.unit_price,
      total_amount: product.total_amount,
      item_order: idx,
    }));

    const { error: itemsError } = await supabase
      .from('import_invoice_items')
      .insert(items);

    if (itemsError) {
      // Rollback invoice if items insertion fails
      await supabase.from('import_invoices').delete().eq('id', invoiceData.id);
      return { error: itemsError.message || 'Failed to create invoice items' };
    }

    // Fetch complete invoice with items
    const { data: completeInvoice, error: fetchError } = await supabase
      .from('import_invoices')
      .select(`
        *,
        items:import_invoice_items(*)
      `)
      .eq('id', invoiceData.id)
      .single();

    if (fetchError) {
      return { error: fetchError.message || 'Failed to fetch invoice' };
    }

    revalidatePath('/admin/dashboard');
    return { success: true, invoice: completeInvoice as ImportInvoice };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred while creating import invoice' };
  }
}

export async function getAllImportInvoices() {
  try {
    const session = await getSession();
    if (!session) {
      return { error: 'Unauthorized' };
    }

    // Allow admins or sales agents with "import-invoice" permission
    if (session.role === 'admin') {
      // Admin has access
    } else if (session.role === 'sales_agent') {
      const { hasPermission } = await import('@/lib/auth/permissions');
      const hasAccess = await hasPermission('import-invoice');
      if (!hasAccess) {
        return { error: 'Unauthorized' };
      }
    } else {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('import_invoices')
      .select(`
        *,
        items:import_invoice_items(*)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      return { error: error.message || 'Failed to fetch import invoices' };
    }

    return { invoices: (data || []) as ImportInvoice[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred while fetching import invoices' };
  }
}

export async function deleteImportInvoice(id: string) {
  try {
    const session = await getSession();
    if (!session) {
      return { error: 'Unauthorized' };
    }

    // Allow admins or sales agents with "import-invoice" permission
    if (session.role === 'admin') {
      // Admin has access
    } else if (session.role === 'sales_agent') {
      const { hasPermission } = await import('@/lib/auth/permissions');
      const hasAccess = await hasPermission('import-invoice');
      if (!hasAccess) {
        return { error: 'Unauthorized' };
      }
    } else {
      return { error: 'Unauthorized' };
    }

    if (!id) {
      return { error: 'Invoice ID is required' };
    }

    const supabase = await createAdminClient();

    const { error } = await supabase
      .from('import_invoices')
      .delete()
      .eq('id', id);

    if (error) {
      return { error: error.message || 'Failed to delete import invoice' };
    }

    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred while deleting import invoice' };
  }
}
