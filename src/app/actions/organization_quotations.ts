'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { requireOrganizationContext } from '@/lib/organization-auth';
import {
  computeOrganizationQuotationLine,
  computeOrganizationQuotationTotals,
  parseOrganizationQuotationLineItems,
  type OrganizationQuotationLineItem,
} from '@/lib/organization-quotation';
import {
  generateOrganizationRfqNumber,
  reserveUniqueOrganizationRfqNumber,
} from '@/lib/organization-rfq-number';

export type OrganizationQuotation = {
  id: string;
  organization_id: string;
  organization_customer_id: string;
  quotation_number: string;
  source_reference: string;
  invoice_date: string;
  due_date: string;
  payment_communication: string;
  bank_account: string;
  line_items: OrganizationQuotationLineItem[];
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  status: 'quotation' | 'sent' | 'archived';
  created_at: string;
  updated_at: string;
  organization_customers?: {
    customer_name: string;
    company_name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    country: string;
    postal_code: string;
    tax_vat_number: string;
  } | null;
};

const QUOTATION_SELECT = `
  id,
  organization_id,
  organization_customer_id,
  quotation_number,
  source_reference,
  invoice_date,
  due_date,
  payment_communication,
  bank_account,
  line_items,
  subtotal,
  discount_total,
  tax_total,
  grand_total,
  status,
  created_at,
  updated_at,
  organization_customers (
    customer_name,
    company_name,
    email,
    phone,
    address,
    city,
    country,
    postal_code,
    tax_vat_number
  )
`;

function normalizeQuotation(row: Record<string, unknown>): OrganizationQuotation {
  return {
    ...(row as OrganizationQuotation),
    line_items: parseOrganizationQuotationLineItems(row.line_items),
    subtotal: Number(row.subtotal) || 0,
    discount_total: Number(row.discount_total) || 0,
    tax_total: Number(row.tax_total) || 0,
    grand_total: Number(row.grand_total) || 0,
  };
}

async function generateOrganizationQuotationNumber(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  organizationId: string
) {
  const year = new Date().getFullYear();
  const prefix = `QT/${year}/`;

  const { data } = await supabase
    .from('organization_quotations')
    .select('quotation_number')
    .eq('organization_id', organizationId)
    .ilike('quotation_number', `${prefix}%`)
    .order('quotation_number', { ascending: false })
    .limit(1);

  let nextNum = 1;
  const latest = data?.[0]?.quotation_number;
  if (latest) {
    const match = latest.match(/QT\/\d{4}\/(\d+)/);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }

  return `${prefix}${String(nextNum).padStart(5, '0')}`;
}

function parseLineItemsFromForm(formData: FormData) {
  const raw = String(formData.get('line_items_json') || '').trim();
  if (!raw) return { error: 'At least one line item is required' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: 'Invalid quotation line items' };
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: 'At least one line item is required' };
  }

  const lineItems = parsed
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const description = String(row.description || '').trim();
      if (!description) return null;
      return computeOrganizationQuotationLine(
        description,
        String(row.quantity || ''),
        String(row.quantity_uom || 'kg'),
        parseFloat(String(row.unit_price || '0')) || 0
      );
    })
    .filter((item): item is OrganizationQuotationLineItem => Boolean(item));

  if (lineItems.length === 0) {
    return { error: 'At least one valid line item is required' };
  }

  return { lineItems };
}

export async function getOrganizationQuotations() {
  try {
    const ctx = await requireOrganizationContext();
    if ('error' in ctx) return { error: ctx.error };

    const { data, error } = await ctx.supabase
      .from('organization_quotations')
      .select(QUOTATION_SELECT)
      .eq('organization_id', ctx.organization.id)
      .neq('status', 'archived')
      .order('created_at', { ascending: false });

    if (error) {
      if (error.message.includes('does not exist') || error.code === '42P01') {
        return { quotations: [] };
      }
      return { error: error.message };
    }

    return {
      quotations: (data || []).map((row) => normalizeQuotation(row as Record<string, unknown>)),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getNextOrganizationQuotationNumber() {
  try {
    const ctx = await requireOrganizationContext();
    if ('error' in ctx) return { error: ctx.error };

    const quotation_number = await generateOrganizationQuotationNumber(
      ctx.supabase,
      ctx.organization.id
    );
    const rfq_number = await generateOrganizationRfqNumber(ctx.supabase, ctx.organization.id);
    return { quotation_number, rfq_number };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function createOrganizationQuotation(formData: FormData) {
  try {
    const ctx = await requireOrganizationContext();
    if ('error' in ctx) return { error: ctx.error };

    const organization_customer_id = String(formData.get('organization_customer_id') || '').trim();
    const invoice_date = String(formData.get('invoice_date') || '').trim();
    const due_date = String(formData.get('due_date') || '').trim();
    const payment_communication = String(formData.get('payment_communication') || '').trim();
    const bank_account = String(formData.get('bank_account') || '').trim();
    const discount_percent = parseFloat(String(formData.get('discount_percent') || '0')) || 0;
    const sales_tax_percent = parseFloat(String(formData.get('sales_tax_percent') || '0')) || 0;

    if (!organization_customer_id) return { error: 'Customer is required' };
    if (!invoice_date || !due_date) return { error: 'Quotation date and valid until date are required' };

    const { data: customer, error: customerError } = await ctx.supabase
      .from('organization_customers')
      .select('id')
      .eq('id', organization_customer_id)
      .eq('organization_id', ctx.organization.id)
      .eq('status', 'active')
      .maybeSingle();

    if (customerError) return { error: customerError.message };
    if (!customer) return { error: 'Selected customer was not found' };

    const lineItemsResult = parseLineItemsFromForm(formData);
    if ('error' in lineItemsResult) return { error: lineItemsResult.error };

    const totals = computeOrganizationQuotationTotals(
      lineItemsResult.lineItems,
      discount_percent,
      sales_tax_percent
    );
    const quotation_number = await generateOrganizationQuotationNumber(
      ctx.supabase,
      ctx.organization.id
    );
    const source_reference = await reserveUniqueOrganizationRfqNumber(
      ctx.supabase,
      ctx.organization.id
    );

    const { data, error } = await ctx.supabase
      .from('organization_quotations')
      .insert([
        {
          organization_id: ctx.organization.id,
          organization_customer_id,
          quotation_number,
          source_reference,
          invoice_date,
          due_date,
          payment_communication: payment_communication,
          bank_account,
          line_items: lineItemsResult.lineItems,
          subtotal: totals.subtotal,
          discount_total: totals.discount_total,
          tax_total: totals.tax_total,
          grand_total: totals.grand_total,
          status: 'quotation',
        },
      ])
      .select(QUOTATION_SELECT)
      .single();

    if (error) {
      if (error.message.includes('does not exist') || error.code === '42P01') {
        return { error: 'Organization quotations table does not exist. Please run the SQL migration in Supabase.' };
      }
      return { error: error.message };
    }

    revalidatePath('/organization/dashboard');
    return { success: true, quotation: normalizeQuotation(data as Record<string, unknown>) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function updateOrganizationQuotation(formData: FormData) {
  try {
    const ctx = await requireOrganizationContext();
    if ('error' in ctx) return { error: ctx.error };

    const id = String(formData.get('id') || '').trim();
    const organization_customer_id = String(formData.get('organization_customer_id') || '').trim();
    const invoice_date = String(formData.get('invoice_date') || '').trim();
    const due_date = String(formData.get('due_date') || '').trim();
    const payment_communication = String(formData.get('payment_communication') || '').trim();
    const bank_account = String(formData.get('bank_account') || '').trim();
    const discount_percent = parseFloat(String(formData.get('discount_percent') || '0')) || 0;
    const sales_tax_percent = parseFloat(String(formData.get('sales_tax_percent') || '0')) || 0;

    if (!id) return { error: 'Quotation id is required' };
    if (!organization_customer_id) return { error: 'Customer is required' };
    if (!invoice_date || !due_date) return { error: 'Quotation date and valid until date are required' };

    const { data: customer, error: customerError } = await ctx.supabase
      .from('organization_customers')
      .select('id')
      .eq('id', organization_customer_id)
      .eq('organization_id', ctx.organization.id)
      .eq('status', 'active')
      .maybeSingle();

    if (customerError) return { error: customerError.message };
    if (!customer) return { error: 'Selected customer was not found' };

    const lineItemsResult = parseLineItemsFromForm(formData);
    if ('error' in lineItemsResult) return { error: lineItemsResult.error };

    const totals = computeOrganizationQuotationTotals(
      lineItemsResult.lineItems,
      discount_percent,
      sales_tax_percent
    );

    const { data, error } = await ctx.supabase
      .from('organization_quotations')
      .update({
        organization_customer_id,
        invoice_date,
        due_date,
        payment_communication,
        bank_account,
        line_items: lineItemsResult.lineItems,
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        tax_total: totals.tax_total,
        grand_total: totals.grand_total,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', ctx.organization.id)
      .neq('status', 'archived')
      .select(QUOTATION_SELECT)
      .single();

    if (error) return { error: error.message };
    if (!data) return { error: 'Quotation not found' };

    revalidatePath('/organization/dashboard');
    return { success: true, quotation: normalizeQuotation(data as Record<string, unknown>) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function archiveOrganizationQuotation(formData: FormData) {
  try {
    const ctx = await requireOrganizationContext();
    if ('error' in ctx) return { error: ctx.error };

    const id = String(formData.get('id') || '').trim();
    if (!id) return { error: 'Quotation id is required' };

    const { error } = await ctx.supabase
      .from('organization_quotations')
      .update({
        status: 'archived',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', ctx.organization.id);

    if (error) return { error: error.message };

    revalidatePath('/organization/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}
