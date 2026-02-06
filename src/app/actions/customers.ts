'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

export type Customer = {
  id: string;
  name: string;
  address: string;
  city: string;
  phone_number: string;
  company_name: string;
  customer_code: string | null;
  sequential_number: number | null;
  created_at: string;
  updated_at: string;
};

export async function createCustomer(formData: FormData) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const name = formData.get('name') as string;
    const address = formData.get('address') as string;
    const city = formData.get('city') as string;
    const phone_number = formData.get('phone_number') as string;
    const company_name = formData.get('company_name') as string;

    if (!name?.trim() || !address?.trim() || !city?.trim() || !phone_number?.trim() || !company_name?.trim()) {
      return { error: 'All fields are required' };
    }

    const supabase = await createAdminClient();

    // Get the highest sequential number to continue from (don't fill gaps)
    const { data: lastCustomer } = await supabase
      .from('customers')
      .select('sequential_number')
      .not('sequential_number', 'is', null)
      .order('sequential_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextSequence = 1;
    if (lastCustomer && lastCustomer.sequential_number) {
      nextSequence = lastCustomer.sequential_number + 1;
    }

    // Create single customer with next sequential number
    const { data, error } = await supabase
      .from('customers')
      .insert([{
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        phone_number: phone_number.trim(),
        company_name: company_name.trim(),
        sequential_number: nextSequence
      }])
      .select()
      .single();

    if (error) {
      // Check if table doesn't exist
      if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
        return { error: 'Customers table does not exist. Please run the SQL migration in Supabase.' };
      }
      return { error: error.message };
    }

    revalidatePath('/admin/dashboard');
    return { success: true, customer: data as Customer };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getAllCustomers() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('sequential_number', { ascending: true, nullsFirst: false });

    if (error) {
      // Check if table doesn't exist
      if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
        return { error: 'Customers table does not exist. Please run the SQL migration in Supabase.' };
      }
      return { error: error.message };
    }

    return { customers: (data || []) as Customer[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getAvailableCustomerSequences() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    // Get all customers with their sequential numbers, ordered
    const { data: allCustomers, error: allError } = await supabase
      .from('customers')
      .select('id, sequential_number')
      .not('sequential_number', 'is', null)
      .order('sequential_number', { ascending: true });

    if (allError) {
      return { error: allError.message };
    }

    // Get assigned customers
    const { data: assignedCustomers, error: assignedError } = await supabase
      .from('sales_agent_customers')
      .select('customer_id');

    if (assignedError) {
      return { error: assignedError.message };
    }

    const assignedIds = new Set((assignedCustomers || []).map((ac: { customer_id: string }) => ac.customer_id));

    // Filter to get only unassigned customers
    const unassigned = (allCustomers || []).filter(
      (c: { id: string; sequential_number: number | null }) => 
        c.sequential_number !== null && !assignedIds.has(c.id)
    );

    const sequences = Array.from(new Set(
      unassigned
        .map((c: { sequential_number: number | null }) => c.sequential_number)
        .filter((seq): seq is number => seq !== null)
    )).sort((a, b) => a - b);

    return { sequences };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function updateCustomer(formData: FormData) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const id = formData.get('id') as string;
    const name = formData.get('name') as string;
    const address = formData.get('address') as string;
    const city = formData.get('city') as string;
    const phone_number = formData.get('phone_number') as string;
    const company_name = formData.get('company_name') as string;

    if (!id || !name?.trim() || !address?.trim() || !city?.trim() || !phone_number?.trim() || !company_name?.trim()) {
      return { error: 'All fields are required' };
    }

    const supabase = await createAdminClient();

    const { error } = await supabase
      .from('customers')
      .update({ 
        name: name.trim(), 
        address: address.trim(), 
        city: city.trim(), 
        phone_number: phone_number.trim(), 
        company_name: company_name.trim(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      // Check if table doesn't exist
      if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
        return { error: 'Customers table does not exist. Please run the SQL migration in Supabase.' };
      }
      return { error: error.message };
    }

    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function deleteCustomer(formData: FormData) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const id = formData.get('id') as string;
    if (!id) {
      return { error: 'Customer id is required' };
    }

    const supabase = await createAdminClient();

    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);

    if (error) {
      // Check if table doesn't exist
      if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
        return { error: 'Customers table does not exist. Please run the SQL migration in Supabase.' };
      }
      return { error: error.message };
    }

    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}
