'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

export type SalesAgent = {
  id: string;
  name: string;
  email: string;
  phone_number: string;
  created_at: string;
  updated_at: string;
};

export type SerialRange = {
  id: string;
  sales_agent_id: string;
  serial_from: string;
  serial_to: string;
  assigned_at: string;
};

type CustomerAssignment = {
  customer_id: string;
  sales_agent_id: string;
  sales_agents: {
    name: string;
  } | null | Array<{
    name: string;
  }>;
};

type SerialRangeWithAgent = {
  id: string;
  serial_from: string;
  serial_to: string;
  sales_agents: {
    name: string;
    email: string;
  } | null | Array<{
    name: string;
    email: string;
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
    const customerIds = formData.getAll('customer_ids') as string[];
    const serialFrom = formData.get('serial_from') as string;
    const serialTo = formData.get('serial_to') as string;

    if (!name?.trim() || !email?.trim() || !phone_number?.trim()) {
      return { error: 'Name, email, and phone number are required' };
    }

    const supabase = await createAdminClient();

    // Create the sales agent first
    const { data, error } = await supabase
      .from('sales_agents')
      .insert([{ 
        name: name.trim(), 
        email: email.trim(), 
        phone_number: phone_number.trim() 
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

    // Assign customers if provided
    if (customerIds.length > 0) {
      // Check if any customers are already assigned
      const { data: existingAssignments, error: checkError } = await supabase
        .from('sales_agent_customers')
        .select('customer_id, sales_agent_id, sales_agents(name)')
        .in('customer_id', customerIds);

      if (checkError) {
        // Rollback: delete the created sales agent
        await supabase.from('sales_agents').delete().eq('id', salesAgentId);
        return { error: checkError.message };
      }

      if (existingAssignments && existingAssignments.length > 0) {
        // Rollback: delete the created sales agent
        await supabase.from('sales_agents').delete().eq('id', salesAgentId);
        const assignedCustomers = (existingAssignments as CustomerAssignment[]).map((a) => {
          const agent = Array.isArray(a.sales_agents) ? a.sales_agents[0] : a.sales_agents;
          return {
            customerId: a.customer_id,
            agentName: agent?.name || 'Unknown'
          };
        });
        return { 
          error: `Some customers are already assigned to other agents`,
          details: assignedCustomers
        };
      }

      // Insert customer assignments
      const assignments = customerIds.map(customerId => ({
        sales_agent_id: salesAgentId,
        customer_id: customerId
      }));

      const { error: assignError } = await supabase
        .from('sales_agent_customers')
        .insert(assignments);

      if (assignError) {
        // Rollback: delete the created sales agent
        await supabase.from('sales_agents').delete().eq('id', salesAgentId);
        return { error: assignError.message };
      }
    }

    // Assign serial range if provided
    if (serialFrom && serialTo) {
      // Validate range
      if (serialFrom > serialTo) {
        // Rollback: delete the created sales agent and customer assignments
        await supabase.from('sales_agent_customers').delete().eq('sales_agent_id', salesAgentId);
        await supabase.from('sales_agents').delete().eq('id', salesAgentId);
        return { error: 'Serial "from" must be less than or equal to serial "to"' };
      }

      // Check for overlapping ranges
      const { data: allRanges, error: checkError } = await supabase
        .from('sales_agent_serial_ranges')
        .select('id, serial_from, serial_to, sales_agents(name, email)');

      if (checkError) {
        if (checkError.message.includes('does not exist') || checkError.message.includes('relation') || checkError.code === '42P01') {
          // Table doesn't exist yet, skip serial range assignment
        } else {
          // Rollback
          await supabase.from('sales_agent_customers').delete().eq('sales_agent_id', salesAgentId);
          await supabase.from('sales_agents').delete().eq('id', salesAgentId);
          return { error: checkError.message };
        }
      } else {
        // Check for overlaps
        const overlappingRanges = (allRanges || []).filter((r) => {
          const range = r as SerialRangeWithAgent;
          return range.serial_from <= serialTo && range.serial_to >= serialFrom;
        });

        if (overlappingRanges.length > 0) {
          // Rollback
          await supabase.from('sales_agent_customers').delete().eq('sales_agent_id', salesAgentId);
          await supabase.from('sales_agents').delete().eq('id', salesAgentId);
          const overlaps = overlappingRanges.map((r) => {
            const range = r as SerialRangeWithAgent;
            const agent = Array.isArray(range.sales_agents) ? range.sales_agents[0] : range.sales_agents;
            return {
              range: `${range.serial_from}-${range.serial_to}`,
              agentName: agent?.name || 'Unknown'
            };
          });
          return { 
            error: `Serial range overlaps with existing assignments`,
            details: overlaps
          };
        }

        // Insert serial range
        const { error: rangeError } = await supabase
          .from('sales_agent_serial_ranges')
          .insert({
            sales_agent_id: salesAgentId,
            serial_from: serialFrom,
            serial_to: serialTo
          });

        if (rangeError) {
          // Rollback
          await supabase.from('sales_agent_customers').delete().eq('sales_agent_id', salesAgentId);
          await supabase.from('sales_agents').delete().eq('id', salesAgentId);
          return { error: rangeError.message };
        }
      }
    }

    revalidatePath('/admin/dashboard');
    return { success: true, salesAgent: data as SalesAgent };
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
          sales_agents(id, name, email)
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

export async function getAllSerialNumbers() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    // Get all unique serial numbers from cartons, sorted
    const { data, error } = await supabase
      .from('cartons')
      .select('carton_serial_number')
      .order('carton_serial_number', { ascending: true });

    if (error) {
      return { error: error.message };
    }

    const serialNumbers = (data || [])
      .map((c) => c.carton_serial_number)
      .filter((s): s is string => !!s)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    return { serialNumbers };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getSerialRangesWithAssignments() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    // Get all serial ranges with their assigned sales agents
    const { data, error } = await supabase
      .from('sales_agent_serial_ranges')
      .select(`
        *,
        sales_agents(id, name, email)
      `)
      .order('serial_from', { ascending: true });

    if (error) {
      if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
        return { error: 'Required tables do not exist. Please run the SQL migrations in Supabase.' };
      }
      return { error: error.message };
    }

    return { serialRanges: data || [] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function assignCustomersToSalesAgent(salesAgentId: string, customerIds: string[]) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    if (!salesAgentId || customerIds.length === 0) {
      return { error: 'Sales agent ID and at least one customer ID are required' };
    }

    const supabase = await createAdminClient();

    // Check if any customers are already assigned
    const { data: existingAssignments, error: checkError } = await supabase
      .from('sales_agent_customers')
      .select('customer_id, sales_agent_id, sales_agents(name)')
      .in('customer_id', customerIds);

    if (checkError) {
      return { error: checkError.message };
    }

    if (existingAssignments && existingAssignments.length > 0) {
      const assignedCustomers = (existingAssignments as CustomerAssignment[]).map((a) => {
        const agent = Array.isArray(a.sales_agents) ? a.sales_agents[0] : a.sales_agents;
        return {
          customerId: a.customer_id,
          agentName: agent?.name || 'Unknown'
        };
      });
      return { 
        error: `Some customers are already assigned to other agents`,
        details: assignedCustomers
      };
    }

    // Insert new assignments
    const assignments = customerIds.map(customerId => ({
      sales_agent_id: salesAgentId,
      customer_id: customerId
    }));

    const { error: insertError } = await supabase
      .from('sales_agent_customers')
      .insert(assignments);

    if (insertError) {
      return { error: insertError.message };
    }

    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function assignSerialRangeToSalesAgent(
  salesAgentId: string,
  serialFrom: string,
  serialTo: string
) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    if (!salesAgentId || !serialFrom || !serialTo) {
      return { error: 'Sales agent ID, serial from, and serial to are required' };
    }

    // Validate range
    if (serialFrom > serialTo) {
      return { error: 'Serial "from" must be less than or equal to serial "to"' };
    }

    const supabase = await createAdminClient();

    // Check for overlapping ranges - get all ranges and check in code
    const { data: allRanges, error: checkError } = await supabase
      .from('sales_agent_serial_ranges')
      .select('id, serial_from, serial_to, sales_agents(name, email)');

    if (checkError) {
      if (checkError.message.includes('does not exist') || checkError.message.includes('relation') || checkError.code === '42P01') {
        return { error: 'Required tables do not exist. Please run the SQL migrations in Supabase.' };
      }
      return { error: checkError.message };
    }

    // Check for overlaps: ranges overlap if (from1 <= to2) AND (to1 >= from2)
    const overlappingRanges = (allRanges || []).filter((r) => {
      const range = r as SerialRangeWithAgent;
      return range.serial_from <= serialTo && range.serial_to >= serialFrom;
    });

    if (overlappingRanges.length > 0) {
      const overlaps = overlappingRanges.map((r) => {
        const range = r as SerialRangeWithAgent;
        const agent = Array.isArray(range.sales_agents) ? range.sales_agents[0] : range.sales_agents;
        return {
          range: `${range.serial_from}-${range.serial_to}`,
          agentName: agent?.name || 'Unknown'
        };
      });
      return { 
        error: `Serial range overlaps with existing assignments`,
        details: overlaps
      };
    }

    // Insert new range
    const { error: insertError } = await supabase
      .from('sales_agent_serial_ranges')
      .insert({
        sales_agent_id: salesAgentId,
        serial_from: serialFrom,
        serial_to: serialTo
      });

    if (insertError) {
      return { error: insertError.message };
    }

    revalidatePath('/admin/dashboard');
    return { success: true };
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
