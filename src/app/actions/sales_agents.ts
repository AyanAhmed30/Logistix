'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

export type SalesAgent = {
  id: string;
  name: string;
  username: string | null;
  email: string | null;
  phone_number: string | null;
  code: string | null;
  created_at: string;
  updated_at: string;
};

export async function createSalesAgent(formData: FormData) {
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

    // Check if username already exists
    const { data: existingAgent } = await supabase
      .from('sales_agents')
      .select('id')
      .eq('username', username.trim())
      .maybeSingle();

    if (existingAgent) {
      return { error: 'Username already exists' };
    }

    // Get the highest existing code to generate next code
    const { data: existingAgents } = await supabase
      .from('sales_agents')
      .select('code')
      .not('code', 'is', null)
      .order('code', { ascending: false })
      .limit(1);

    let nextCode = '101';
    if (existingAgents && existingAgents.length > 0 && existingAgents[0].code) {
      const highestCode = parseInt(existingAgents[0].code, 10);
      nextCode = (highestCode + 1).toString();
    }

    // Create the sales agent
    const { data, error } = await supabase
      .from('sales_agents')
      .insert([{ 
        name: name.trim(), 
        username: username.trim(),
        password: password.trim(),
        code: nextCode
      }])
      .select()
      .single();

    if (error) {
      if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
        return { error: 'Sales agents table does not exist. Please run the SQL migration in Supabase.' };
      }
      if (error.code === '23505') {
        return { error: 'Username already exists' };
      }
      return { error: error.message };
    }

    revalidatePath('/admin/dashboard');
    return { success: true, salesAgent: { ...data, code: nextCode } as SalesAgent };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getAllSalesAgents() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('sales_agents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
        return { error: 'Sales agents table does not exist. Please run the SQL migration in Supabase.' };
      }
      return { error: error.message };
    }

    return { salesAgents: (data || []) as SalesAgent[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getAllCustomersWithAssignments() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    // Get all customers with their assigned sales agent
    const { data, error } = await supabase
      .from('customers')
      .select(`
        *,
        sales_agent_customers(
          sales_agent_id,
          sales_agents(id, name, email, code)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
        return { error: 'Required tables do not exist. Please run the SQL migrations in Supabase.' };
      }
      return { error: error.message };
    }

    return { customers: data || [] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function allocateCustomersToSalesAgent(formData: FormData) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const salesAgentId = formData.get('sales_agent_id') as string;
    const customerIds = formData.getAll('customer_ids') as string[];

    if (!salesAgentId || customerIds.length === 0) {
      return { error: 'Sales agent ID and at least one customer ID are required' };
    }

    const supabase = await createAdminClient();

    // Get sales agent with code
    const { data: salesAgent, error: agentError } = await supabase
      .from('sales_agents')
      .select('id, code')
      .eq('id', salesAgentId)
      .single();

    if (agentError || !salesAgent) {
      return { error: 'Sales agent not found' };
    }

    if (!salesAgent.code) {
      return { error: 'Sales agent code is missing. Please update the sales agent.' };
    }

    // Check if any customers are already assigned
    const { data: existingAssignments, error: checkError } = await supabase
      .from('sales_agent_customers')
      .select('customer_id')
      .in('customer_id', customerIds);

    if (checkError) {
      return { error: checkError.message };
    }

    if (existingAssignments && existingAssignments.length > 0) {
      return { error: 'Some customers are already assigned to sales agents' };
    }

    // Get the highest sequential number for this sales agent
    const { data: agentCustomers } = await supabase
      .from('sales_agent_customers')
      .select('customer_id, customers(customer_code, sequential_number)')
      .eq('sales_agent_id', salesAgentId);

    let nextSequence = 1;
    if (agentCustomers && agentCustomers.length > 0) {
      const sequences = agentCustomers
        .map((ac) => {
          const customers = ac.customers as { sequential_number: number | null } | null | Array<{ sequential_number: number | null }>;
          const customer = Array.isArray(customers) ? customers[0] : customers;
          return customer?.sequential_number || 0;
        })
        .filter((seq: number) => seq > 0);
      
      if (sequences.length > 0) {
        nextSequence = Math.max(...sequences) + 1;
      }
    }

    // Generate customer codes and update customers
    const updates = [];
    const assignments = [];
    
    for (let i = 0; i < customerIds.length; i++) {
      const customerId = customerIds[i];
      const sequenceNumber = nextSequence + i;
      const customerCode = `${salesAgent.code}${sequenceNumber.toString().padStart(2, '0')}`;

      updates.push(
        supabase
          .from('customers')
          .update({
            customer_code: customerCode,
            sequential_number: sequenceNumber
          })
          .eq('id', customerId)
      );

      assignments.push({
        sales_agent_id: salesAgentId,
        customer_id: customerId
      });
    }

    // Execute all updates
    const updateResults = await Promise.all(updates);
    const updateError = updateResults.find(r => r.error);
    if (updateError?.error) {
      return { error: updateError.error.message || 'Failed to update customer codes' };
    }

    // Insert assignments
    const { error: assignError } = await supabase
      .from('sales_agent_customers')
      .insert(assignments);

    if (assignError) {
      return { error: assignError.message };
    }

    revalidatePath('/admin/dashboard');
    return { success: true, allocated: customerIds.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function updateSalesAgent(formData: FormData) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const id = formData.get('id') as string;
    const name = formData.get('name') as string;
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;

    if (!id || !name?.trim() || !username?.trim()) {
      return { error: 'Name and username are required' };
    }

    const supabase = await createAdminClient();

    // Check if username is taken by another agent
    const { data: existingAgent } = await supabase
      .from('sales_agents')
      .select('id')
      .eq('username', username.trim())
      .neq('id', id)
      .maybeSingle();

    if (existingAgent) {
      return { error: 'Username already exists' };
    }

    const updateData: { name: string; username: string; password?: string; updated_at: string } = {
      name: name.trim(),
      username: username.trim(),
      updated_at: new Date().toISOString()
    };

    // Only update password if provided
    if (password?.trim()) {
      updateData.password = password.trim();
    }

    const { error } = await supabase
      .from('sales_agents')
      .update(updateData)
      .eq('id', id);

    if (error) {
      if (error.code === '23505') {
        return { error: 'Username already exists' };
      }
      return { error: error.message };
    }

    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function deleteSalesAgent(formData: FormData) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const id = formData.get('id') as string;
    if (!id) {
      return { error: 'Sales agent id is required' };
    }

    const supabase = await createAdminClient();

    const { error } = await supabase
      .from('sales_agents')
      .delete()
      .eq('id', id);

    if (error) {
      return { error: error.message };
    }

    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}
