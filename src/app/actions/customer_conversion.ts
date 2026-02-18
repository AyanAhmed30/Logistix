'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';
import { getLeadComments } from './leads';

export type ConvertedCustomer = {
  id: string;
  name: string;
  phone_number: string;
  customer_id_formatted: string;
  sales_agent_id: string;
  lead_id: string;
  converted_at: string;
  created_at: string;
};

export type ConvertedCustomerWithDetails = ConvertedCustomer & {
  sales_agents: {
    id: string;
    name: string;
    username: string | null;
    code: string | null;
  } | null;
  leads: {
    id: string;
    name: string;
    number: string;
    source: string;
  } | null;
};

export async function convertLeadToCustomer(leadId: string) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'sales_agent') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    // Get sales agent by username
    const { data: salesAgent, error: agentError } = await supabase
      .from('sales_agents')
      .select('id, code')
      .eq('username', session.username)
      .single();

    if (agentError || !salesAgent) {
      return { error: 'Sales agent not found' };
    }

    if (!salesAgent.code) {
      return { error: 'Sales agent code is not set. Please contact admin.' };
    }

    // Get the lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return { error: 'Lead not found' };
    }

    // Check if lead belongs to this sales agent
    if (lead.sales_agent_id !== salesAgent.id) {
      return { error: 'Unauthorized: Lead does not belong to you' };
    }

    // Check if lead is already converted
    if (lead.converted) {
      return { error: 'Lead has already been converted to customer' };
    }

    // Check if lead is in Win status
    if (lead.status !== 'Win') {
      return { error: 'Lead must be in Win status before conversion' };
    }

    // Check if customer already exists for this lead
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('lead_id', leadId)
      .maybeSingle();

    if (existingCustomer) {
      return { error: 'Customer already exists for this lead' };
    }

    // Get the highest customer_sequence_number for this sales agent
    const { data: lastCustomer } = await supabase
      .from('customers')
      .select('customer_sequence_number')
      .eq('sales_agent_id', salesAgent.id)
      .not('customer_sequence_number', 'is', null)
      .order('customer_sequence_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Calculate next sequence number (starting from 0)
    const nextSequence = lastCustomer?.customer_sequence_number !== undefined 
      ? lastCustomer.customer_sequence_number + 1 
      : 0;

    // Format customer ID: [SalesAgentCode][CustomerSequenceNumber] with zero-padded 2 digits
    const customerIdFormatted = `${salesAgent.code}${nextSequence.toString().padStart(2, '0')}`;

    // Create customer record
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert([{
        name: lead.name,
        phone_number: lead.number,
        address: '', // Will be filled later
        city: '', // Will be filled later
        company_name: lead.name, // Use lead name as company name initially
        sales_agent_id: salesAgent.id,
        lead_id: leadId,
        customer_id_formatted: customerIdFormatted,
        customer_sequence_number: nextSequence,
        converted_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (customerError) {
      return { error: customerError.message };
    }

    // Mark lead as converted
    const { error: updateError } = await supabase
      .from('leads')
      .update({ converted: true })
      .eq('id', leadId);

    if (updateError) {
      // Rollback customer creation if lead update fails
      await supabase.from('customers').delete().eq('id', customer.id);
      return { error: 'Failed to mark lead as converted' };
    }

    // Copy comments to customer (if needed - we'll keep them in lead_comments table linked to lead_id)
    // Comments are already linked to lead_id, so they'll be accessible via the lead relationship

    revalidatePath('/sales-agent/dashboard');
    revalidatePath('/admin/dashboard');
    return { success: true, customer: customer as ConvertedCustomer };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getAllConvertedCustomersForSalesAgent() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'sales_agent') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    // Get sales agent by username
    const { data: salesAgent, error: agentError } = await supabase
      .from('sales_agents')
      .select('id')
      .eq('username', session.username)
      .single();

    if (agentError || !salesAgent) {
      return { error: 'Sales agent not found' };
    }

    // Get all converted customers for this sales agent
    const { data, error } = await supabase
      .from('customers')
      .select(`
        *,
        leads (
          id,
          name,
          number,
          source
        )
      `)
      .eq('sales_agent_id', salesAgent.id)
      .not('lead_id', 'is', null)
      .order('converted_at', { ascending: false });

    if (error) {
      return { error: error.message };
    }

    type SupabaseCustomerResponse = {
      id: string;
      name: string;
      phone_number: string;
      customer_id_formatted: string;
      sales_agent_id: string;
      lead_id: string;
      converted_at: string;
      created_at: string;
      leads: {
        id: string;
        name: string;
        number: string;
        source: string;
      } | null;
    };

    const customers = (data || []).map((c: SupabaseCustomerResponse) => ({
      id: c.id,
      name: c.name,
      phone_number: c.phone_number,
      customer_id_formatted: c.customer_id_formatted,
      sales_agent_id: c.sales_agent_id,
      lead_id: c.lead_id,
      converted_at: c.converted_at,
      created_at: c.created_at,
      leads: c.leads,
    })) as ConvertedCustomerWithDetails[];

    return { customers };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getAllConvertedCustomersForAdmin() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    // Get all converted customers first
    const { data: customersData, error: customersError } = await supabase
      .from('customers')
      .select('*')
      .not('lead_id', 'is', null)
      .order('converted_at', { ascending: false });

    if (customersError) {
      return { error: customersError.message };
    }

    if (!customersData || customersData.length === 0) {
      return { customers: [] };
    }

    // Get unique sales agent IDs and lead IDs
    const salesAgentIds = [...new Set(customersData.map((c: { sales_agent_id: string }) => c.sales_agent_id).filter(Boolean))];
    const leadIds = [...new Set(customersData.map((c: { lead_id: string }) => c.lead_id).filter(Boolean))];

    // Fetch sales agents separately
    const { data: salesAgentsData, error: salesAgentsError } = await supabase
      .from('sales_agents')
      .select('id, name, username, code')
      .in('id', salesAgentIds);

    if (salesAgentsError) {
      return { error: `Failed to fetch sales agents: ${salesAgentsError.message}` };
    }

    // Fetch leads separately
    const { data: leadsData, error: leadsError } = await supabase
      .from('leads')
      .select('id, name, number, source')
      .in('id', leadIds);

    if (leadsError) {
      return { error: `Failed to fetch leads: ${leadsError.message}` };
    }

    // Create lookup maps
    const salesAgentsMap = new Map((salesAgentsData || []).map((sa: { id: string; name: string; username: string | null; code: string | null }) => [sa.id, sa]));
    const leadsMap = new Map((leadsData || []).map((l: { id: string; name: string; number: string; source: string }) => [l.id, l]));

    // Combine the data
    const customers = customersData.map((customer: {
      id: string;
      name: string;
      phone_number: string;
      customer_id_formatted: string;
      sales_agent_id: string;
      lead_id: string;
      converted_at: string;
      created_at: string;
    }) => ({
      id: customer.id,
      name: customer.name,
      phone_number: customer.phone_number,
      customer_id_formatted: customer.customer_id_formatted,
      sales_agent_id: customer.sales_agent_id,
      lead_id: customer.lead_id,
      converted_at: customer.converted_at,
      created_at: customer.created_at,
      sales_agents: salesAgentsMap.get(customer.sales_agent_id) || null,
      leads: leadsMap.get(customer.lead_id) || null,
    })) as ConvertedCustomerWithDetails[];

    return { customers };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}
