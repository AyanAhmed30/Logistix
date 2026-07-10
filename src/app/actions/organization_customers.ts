'use server';

import { revalidatePath } from 'next/cache';
import { requireOrganizationContext } from '@/lib/organization-auth';

export type OrganizationCustomer = {
  id: string;
  organization_id: string;
  customer_name: string;
  company_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  postal_code: string;
  tax_vat_number: string;
  notes: string | null;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
};

const CUSTOMER_SELECT =
  'id, organization_id, customer_name, company_name, email, phone, address, city, country, postal_code, tax_vat_number, notes, status, created_at, updated_at';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+()\d\s-]{7,20}$/;

function validateCustomerInput(input: {
  customer_name: string;
  email: string;
  phone: string;
}) {
  if (!input.customer_name.trim()) {
    return 'Customer name is required';
  }
  if (!input.email.trim() || !EMAIL_PATTERN.test(input.email.trim())) {
    return 'Please enter a valid email address';
  }
  if (!input.phone.trim() || !PHONE_PATTERN.test(input.phone.trim())) {
    return 'Please enter a valid phone number';
  }
  return null;
}

export async function getOrganizationCustomers(options?: { status?: 'active' | 'archived' }) {
  try {
    const ctx = await requireOrganizationContext();
    if ('error' in ctx) return { error: ctx.error };

    const status = options?.status || 'active';

    const { data, error } = await ctx.supabase
      .from('organization_customers')
      .select(CUSTOMER_SELECT)
      .eq('organization_id', ctx.organization.id)
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.message.includes('does not exist') || error.code === '42P01') {
        return { customers: [] };
      }
      return { error: error.message };
    }

    return { customers: (data || []) as OrganizationCustomer[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function createOrganizationCustomer(formData: FormData) {
  try {
    const ctx = await requireOrganizationContext();
    if ('error' in ctx) return { error: ctx.error };

    const customer_name = String(formData.get('customer_name') || '').trim();
    const company_name = String(formData.get('company_name') || '').trim();
    const email = String(formData.get('email') || '').trim();
    const phone = String(formData.get('phone') || '').trim();
    const address = String(formData.get('address') || '').trim();
    const city = String(formData.get('city') || '').trim();
    const country = String(formData.get('country') || '').trim();
    const postal_code = String(formData.get('postal_code') || '').trim();
    const tax_vat_number = String(formData.get('tax_vat_number') || '').trim();
    const notes = String(formData.get('notes') || '').trim();

    const validationError = validateCustomerInput({ customer_name, email, phone });
    if (validationError) return { error: validationError };

    const { data, error } = await ctx.supabase
      .from('organization_customers')
      .insert([
        {
          organization_id: ctx.organization.id,
          customer_name,
          company_name,
          email,
          phone,
          address,
          city,
          country,
          postal_code,
          tax_vat_number,
          notes: notes || null,
          status: 'active',
        },
      ])
      .select(CUSTOMER_SELECT)
      .single();

    if (error) {
      if (error.message.includes('does not exist') || error.code === '42P01') {
        return { error: 'Organization customers table does not exist. Please run the SQL migration in Supabase.' };
      }
      return { error: error.message };
    }

    revalidatePath('/organization/dashboard');
    return { success: true, customer: data as OrganizationCustomer };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function updateOrganizationCustomer(formData: FormData) {
  try {
    const ctx = await requireOrganizationContext();
    if ('error' in ctx) return { error: ctx.error };

    const id = String(formData.get('id') || '').trim();
    const customer_name = String(formData.get('customer_name') || '').trim();
    const company_name = String(formData.get('company_name') || '').trim();
    const email = String(formData.get('email') || '').trim();
    const phone = String(formData.get('phone') || '').trim();
    const address = String(formData.get('address') || '').trim();
    const city = String(formData.get('city') || '').trim();
    const country = String(formData.get('country') || '').trim();
    const postal_code = String(formData.get('postal_code') || '').trim();
    const tax_vat_number = String(formData.get('tax_vat_number') || '').trim();
    const notes = String(formData.get('notes') || '').trim();

    if (!id) return { error: 'Customer id is required' };

    const validationError = validateCustomerInput({ customer_name, email, phone });
    if (validationError) return { error: validationError };

    const { data, error } = await ctx.supabase
      .from('organization_customers')
      .update({
        customer_name,
        company_name,
        email,
        phone,
        address,
        city,
        country,
        postal_code,
        tax_vat_number,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', ctx.organization.id)
      .select(CUSTOMER_SELECT)
      .single();

    if (error) return { error: error.message };
    if (!data) return { error: 'Customer not found' };

    revalidatePath('/organization/dashboard');
    return { success: true, customer: data as OrganizationCustomer };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function archiveOrganizationCustomer(formData: FormData) {
  try {
    const ctx = await requireOrganizationContext();
    if ('error' in ctx) return { error: ctx.error };

    const id = String(formData.get('id') || '').trim();
    if (!id) return { error: 'Customer id is required' };

    const { error } = await ctx.supabase
      .from('organization_customers')
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

export async function restoreOrganizationCustomer(formData: FormData) {
  try {
    const ctx = await requireOrganizationContext();
    if ('error' in ctx) return { error: ctx.error };

    const id = String(formData.get('id') || '').trim();
    if (!id) return { error: 'Customer id is required' };

    const { error } = await ctx.supabase
      .from('organization_customers')
      .update({
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', ctx.organization.id)
      .eq('status', 'archived');

    if (error) return { error: error.message };

    revalidatePath('/organization/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}
