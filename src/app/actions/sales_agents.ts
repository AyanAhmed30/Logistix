'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

export type SalesAgent = {
  id: string;
  name: string;
  email: string;
  phone_number: string;
  code: string | null;
  created_at: string;
  updated_at: string;
};

type CustomerAssignment = {
  customer_id: string;
  sales_agent_id: string;
  sales_agents: {
    name: string;
    code: string | null;
  } | null | Array<{
    name: string;
    code: string | null;
  }>;
};

export async function createSalesAgent(formData: FormData) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const phone_number = formData.get('phone_number') as string;
    const fromSeq = formData.get('from_seq') ? parseInt(formData.get('from_seq') as string, 10) : null;
    const toSeq = formData.get('to_seq') ? parseInt(formData.get('to_seq') as string, 10) : null;

    if (!name?.trim() || !email?.trim() || !phone_number?.trim()) {
      return { error: 'Name, email, and phone number are required' };
    }

    if (fromSeq !== null && toSeq !== null) {
      if (fromSeq > toSeq) {
        return { error: 'From sequence must be less than or equal to To sequence' };
      }
      if (fromSeq < 1 || toSeq < 1) {
        return { error: 'Sequence numbers must be positive' };
      }
    }

    const supabase = await createAdminClient();

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

    // Create the sales agent first
    const { data, error } = await supabase
      .from('sales_agents')
      .insert([{ 
        name: name.trim(), 
        email: email.trim(), 
        phone_number: phone_number.trim(),
        code: nextCode
      }])
      .select()
      .single();

    if (error) {
      if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
        return { error: 'Sales agents table does not exist. Please run the SQL migration in Supabase.' };
      }
      return { error: error.message };
    }

    const salesAgentId = data.id;
    const agentCode = nextCode;

    // Assign customers by sequence range if provided
    if (fromSeq !== null && toSeq !== null) {
      // Get all customers in the specified sequence range
      const { data: customersInRange, error: customersError } = await supabase
        .from('customers')
        .select('id, sequential_number')
        .gte('sequential_number', fromSeq)
        .lte('sequential_number', toSeq)
        .order('sequential_number', { ascending: true });

      if (customersError) {
        await supabase.from('sales_agents').delete().eq('id', salesAgentId);
        return { error: customersError.message };
      }

      if (!customersInRange || customersInRange.length === 0) {
        await supabase.from('sales_agents').delete().eq('id', salesAgentId);
        return { error: `No customers found in sequence range ${fromSeq}-${toSeq}` };
      }

      // Check if any customers are already assigned
      const customerIds = customersInRange.map(c => c.id);
      const { data: existingAssignments, error: checkError } = await supabase
        .from('sales_agent_customers')
        .select('customer_id, sales_agent_id, sales_agents(name)')
        .in('customer_id', customerIds);

      if (checkError) {
        await supabase.from('sales_agents').delete().eq('id', salesAgentId);
        return { error: checkError.message };
      }

      if (existingAssignments && existingAssignments.length > 0) {
        await supabase.from('sales_agents').delete().eq('id', salesAgentId);
        const assignedCustomers = (existingAssignments as CustomerAssignment[]).map((a) => {
          const agent = Array.isArray(a.sales_agents) ? a.sales_agents[0] : a.sales_agents;
          return {
            customerId: a.customer_id,
            agentName: agent?.name || 'Unknown'
          };
        });
        return { 
          error: `Some customers in this range are already assigned to other agents`,
          details: assignedCustomers
        };
      }

      // Generate customer codes using existing sequential numbers
      const updates = [];
      const assignments = [];
      
      for (const customer of customersInRange) {
        const sequenceNumber = customer.sequential_number;
        if (!sequenceNumber) continue;
        
        const customerCode = `${agentCode}${sequenceNumber.toString().padStart(2, '0')}`;

        updates.push(
          supabase
            .from('customers')
            .update({
              customer_code: customerCode
            })
            .eq('id', customer.id)
        );

        assignments.push({
          sales_agent_id: salesAgentId,
          customer_id: customer.id
        });
      }

      // Execute all updates
      const updateResults = await Promise.all(updates);
      const updateError = updateResults.find(r => r.error);
      if (updateError?.error) {
        await supabase.from('sales_agents').delete().eq('id', salesAgentId);
        return { error: updateError.error.message || 'Failed to update customer codes' };
      }

      // Insert assignments
      const { error: assignError } = await supabase
        .from('sales_agent_customers')
        .insert(assignments);

      if (assignError) {
        await supabase.from('sales_agent_customers').delete().eq('sales_agent_id', salesAgentId);
        await supabase.from('sales_agents').delete().eq('id', salesAgentId);
        return { error: assignError.message };
      }
    }

    revalidatePath('/admin/dashboard');
    return { success: true, salesAgent: { ...data, code: agentCode } as SalesAgent };
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
    const email = formData.get('email') as string;
    const phone_number = formData.get('phone_number') as string;

    if (!id || !name?.trim() || !email?.trim() || !phone_number?.trim()) {
      return { error: 'All fields are required' };
    }

    const supabase = await createAdminClient();

    const { error } = await supabase
      .from('sales_agents')
      .update({ 
        name: name.trim(), 
        email: email.trim(), 
        phone_number: phone_number.trim(),
        updated_at: new Date().toISOString()
      })
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
