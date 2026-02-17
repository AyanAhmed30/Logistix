'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

export type Lead = {
  id: string;
  name: string;
  number: string;
  source: 'Meta' | 'LinkedIn' | 'WhatsApp' | 'Others';
  sales_agent_id: string;
  created_at: string;
  updated_at: string;
};

export type LeadWithSalesAgent = Lead & {
  sales_agents: {
    id: string;
    name: string;
    username: string | null;
  } | null;
};

export async function createLead(formData: FormData) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'sales_agent') {
      return { error: 'Unauthorized' };
    }

    const name = formData.get('name') as string;
    const number = formData.get('number') as string;
    const source = formData.get('source') as string;

    if (!name?.trim() || !number?.trim() || !source?.trim()) {
      return { error: 'Name, number, and source are required' };
    }

    if (!['Meta', 'LinkedIn', 'WhatsApp', 'Others'].includes(source)) {
      return { error: 'Invalid source. Must be one of: Meta, LinkedIn, WhatsApp, Others' };
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

    // Create the lead
    const { data, error } = await supabase
      .from('leads')
      .insert([{
        name: name.trim(),
        number: number.trim(),
        source: source as 'Meta' | 'LinkedIn' | 'WhatsApp' | 'Others',
        sales_agent_id: salesAgent.id
      }])
      .select()
      .single();

    if (error) {
      if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
        return { error: 'Leads table does not exist. Please run the SQL migration in Supabase.' };
      }
      return { error: error.message };
    }

    revalidatePath('/sales-agent/dashboard');
    revalidatePath('/admin/dashboard');
    return { success: true, lead: data as Lead };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getAllLeadsForSalesAgent() {
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

    // Get all leads for this sales agent
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('sales_agent_id', salesAgent.id)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
        return { error: 'Leads table does not exist. Please run the SQL migration in Supabase.' };
      }
      return { error: error.message };
    }

    return { leads: (data || []) as Lead[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getAllLeadsForAdmin() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    // Get all leads with sales agent information
    const { data, error } = await supabase
      .from('leads')
      .select(`
        *,
        sales_agents (
          id,
          name,
          username
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
        return { error: 'Leads table does not exist. Please run the SQL migration in Supabase.' };
      }
      return { error: error.message };
    }

    // Transform the data to match LeadWithSalesAgent type
    type SupabaseLeadResponse = {
      id: string;
      name: string;
      number: string;
      source: 'Meta' | 'LinkedIn' | 'WhatsApp' | 'Others';
      sales_agent_id: string;
      created_at: string;
      updated_at: string;
      sales_agents: {
        id: string;
        name: string;
        username: string | null;
      } | null;
    };

    const leadsWithAgent = (data || []).map((lead: SupabaseLeadResponse) => ({
      ...lead,
      sales_agents: lead.sales_agents || null
    })) as LeadWithSalesAgent[];

    return { leads: leadsWithAgent };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}
