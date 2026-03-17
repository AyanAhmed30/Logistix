'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

export type OperationsUser = {
  id: string;
  name: string;
  username: string;
  password: string;
  created_at: string;
  updated_at: string;
};

export async function createOperationsUser(formData: FormData) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const name = formData.get('name') as string;
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;

    if (!name?.trim() || !username?.trim() || !password?.trim()) {
      return { error: 'Name, username, and password are required' };
    }

    const supabase = await createAdminClient();

    // Check if username already exists in operations_users
    const { data: existingOps } = await supabase
      .from('operations_users')
      .select('id')
      .eq('username', username.trim())
      .maybeSingle();

    if (existingOps) {
      return { error: 'Username already exists in Operations users' };
    }

    // Also check sales_agents and app_users to prevent duplicate usernames across roles
    const { data: existingSales } = await supabase
      .from('sales_agents')
      .select('id')
      .eq('username', username.trim())
      .maybeSingle();

    if (existingSales) {
      return { error: 'Username already exists (used by a Sales Agent)' };
    }

    const { data: existingAppUser } = await supabase
      .from('app_users')
      .select('id')
      .eq('username', username.trim())
      .maybeSingle();

    if (existingAppUser) {
      return { error: 'Username already exists (used by another user)' };
    }

    const { data, error } = await supabase
      .from('operations_users')
      .insert([{
        name: name.trim(),
        username: username.trim(),
        password: password.trim(),
      }])
      .select()
      .single();

    if (error) {
      if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
        return { error: 'Operations users table does not exist. Please run the SQL migration in Supabase.' };
      }
      if (error.code === '23505') {
        return { error: 'Username already exists' };
      }
      return { error: error.message };
    }

    revalidatePath('/admin/dashboard');
    return { success: true, operationsUser: data as OperationsUser };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getAllOperationsUsers() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('operations_users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
        return { operationsUsers: [] };
      }
      return { error: error.message };
    }
    return { operationsUsers: (data || []) as OperationsUser[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function updateOperationsUser(formData: FormData) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const id = formData.get('id') as string;
    const name = formData.get('name') as string;
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;

    if (!id || !name?.trim() || !username?.trim() || !password?.trim()) {
      return { error: 'All fields are required' };
    }

    const supabase = await createAdminClient();

    // Check for duplicate username (excluding current user)
    const { data: existing } = await supabase
      .from('operations_users')
      .select('id')
      .eq('username', username.trim())
      .neq('id', id)
      .maybeSingle();

    if (existing) {
      return { error: 'Username already exists' };
    }

    const { data, error } = await supabase
      .from('operations_users')
      .update({
        name: name.trim(),
        username: username.trim(),
        password: password.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return { error: error.message };

    revalidatePath('/admin/dashboard');
    return { success: true, operationsUser: data as OperationsUser };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function deleteOperationsUser(formData: FormData) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const id = formData.get('id') as string;
    if (!id) {
      return { error: 'User id is required' };
    }

    const supabase = await createAdminClient();

    const { error } = await supabase
      .from('operations_users')
      .delete()
      .eq('id', id);

    if (error) return { error: error.message };

    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}
