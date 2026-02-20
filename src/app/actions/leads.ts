'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

export type LeadStatus = 'Leads' | 'Inquiry Received' | 'Quotation Sent' | 'Negotiation' | 'Win';

export type Lead = {
  id: string;
  name: string;
  number: string;
  source: 'Meta' | 'LinkedIn' | 'WhatsApp' | 'Others';
  status: LeadStatus;
  sales_agent_id: string;
  converted: boolean;
  created_at: string;
  updated_at: string;
};

export type LeadComment = {
  id: string;
  lead_id: string;
  comment: string;
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
    if (!session) {
      return { error: 'Unauthorized' };
    }

    // Allow admins or sales agents with "lead" permission
    if (session.role === 'admin') {
      // Admin has access
    } else if (session.role === 'sales_agent') {
      const { hasPermission } = await import('@/lib/auth/permissions');
      const hasAccess = await hasPermission('lead');
      if (!hasAccess) {
        return { error: 'Unauthorized' };
      }
    } else {
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

    // Create the lead with initial status 'Leads'
    const { data, error } = await supabase
      .from('leads')
      .insert([{
        name: name.trim(),
        number: number.trim(),
        source: source as 'Meta' | 'LinkedIn' | 'WhatsApp' | 'Others',
        status: 'Leads',
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
    if (!session) {
      return { error: 'Unauthorized' };
    }

    // Allow admins or sales agents with "lead" or "pipeline" permission
    // (pipeline needs to view leads to manage them)
    if (session.role === 'admin') {
      // Admin has access
    } else if (session.role === 'sales_agent') {
      const { hasPermission } = await import('@/lib/auth/permissions');
      const hasLead = await hasPermission('lead');
      const hasPipeline = await hasPermission('pipeline');
      if (!hasLead && !hasPipeline) {
        return { error: 'Unauthorized' };
      }
    } else {
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

    // Ensure all leads have a status (for existing leads created before migration)
    const leadsWithStatus = (data || []).map((lead: Lead) => {
      if (!lead.status) {
        return { ...lead, status: 'Leads' as LeadStatus };
      }
      return lead;
    });

    return { leads: leadsWithStatus as Lead[] };
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

export async function updateLeadStatus(leadId: string, status: LeadStatus) {
  try {
    const session = await getSession();
    if (!session) {
      return { error: 'Unauthorized' };
    }

    // Allow admins or sales agents with "pipeline" permission
    if (session.role === 'admin') {
      // Admin has access
    } else if (session.role === 'sales_agent') {
      const { hasPermission } = await import('@/lib/auth/permissions');
      const hasAccess = await hasPermission('pipeline');
      if (!hasAccess) {
        return { error: 'Unauthorized' };
      }
    } else {
      return { error: 'Unauthorized' };
    }

    // Normalize and validate status value
    const normalizedStatus = (typeof status === 'string' ? status.trim() : String(status)) as LeadStatus;
    const validStatuses: LeadStatus[] = ['Leads', 'Inquiry Received', 'Quotation Sent', 'Negotiation', 'Win'];
    
    if (!validStatuses.includes(normalizedStatus)) {
      return { error: `Invalid status "${status}". Must be one of: ${validStatuses.join(', ')}` };
    }

    const supabase = await createAdminClient();

    // Verify the lead belongs to this sales agent
    const { data: salesAgent, error: agentError } = await supabase
      .from('sales_agents')
      .select('id')
      .eq('username', session.username)
      .single();

    if (agentError || !salesAgent) {
      return { error: 'Sales agent not found' };
    }

    // Check if lead belongs to this sales agent
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('sales_agent_id, status')
      .eq('id', leadId)
      .single();

    if (leadError || !lead || lead.sales_agent_id !== salesAgent.id) {
      return { error: 'Lead not found or unauthorized' };
    }

    // If lead doesn't have a status, set it to 'Leads' first (for existing leads)
    if (!lead.status) {
      const { error: initError } = await supabase
        .from('leads')
        .update({ status: 'Leads' })
        .eq('id', leadId);
      
      if (initError) {
        return { error: `Failed to initialize lead status: ${initError.message}` };
      }
    }

    // Update the status with normalized value
    const { data, error } = await supabase
      .from('leads')
      .update({ 
        status: normalizedStatus, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', leadId)
      .select()
      .single();

    if (error) {
      // If constraint error, provide more helpful message
      if (error.message.includes('check constraint') || error.message.includes('leads_status_check')) {
        return { error: `Invalid status value. Status must be one of: Leads, Inquiry Received, Quotation Sent, Negotiation, Win` };
      }
      return { error: error.message };
    }

    revalidatePath('/sales-agent/dashboard');
    return { success: true, lead: data as Lead };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getLeadComments(leadId: string) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'sales_agent') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    // Verify the lead belongs to this sales agent
    const { data: salesAgent, error: agentError } = await supabase
      .from('sales_agents')
      .select('id')
      .eq('username', session.username)
      .single();

    if (agentError || !salesAgent) {
      return { error: 'Sales agent not found' };
    }

    // Check if lead belongs to this sales agent
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('sales_agent_id')
      .eq('id', leadId)
      .single();

    if (leadError || !lead || lead.sales_agent_id !== salesAgent.id) {
      return { error: 'Lead not found or unauthorized' };
    }

    // Get comments
    const { data, error } = await supabase
      .from('lead_comments')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (error) {
      return { error: error.message };
    }

    return { comments: (data || []) as LeadComment[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function createLeadComment(leadId: string, comment: string) {
  try {
    const session = await getSession();
    if (!session) {
      return { error: 'Unauthorized' };
    }

    // Allow admins or sales agents with "lead" or "pipeline" permission
    if (session.role === 'admin') {
      // Admin has access
    } else if (session.role === 'sales_agent') {
      const { hasPermission } = await import('@/lib/auth/permissions');
      const hasLead = await hasPermission('lead');
      const hasPipeline = await hasPermission('pipeline');
      if (!hasLead && !hasPipeline) {
        return { error: 'Unauthorized' };
      }
    } else {
      return { error: 'Unauthorized' };
    }

    if (!comment?.trim()) {
      return { error: 'Comment is required' };
    }

    const supabase = await createAdminClient();

    // Verify the lead belongs to this sales agent
    const { data: salesAgent, error: agentError } = await supabase
      .from('sales_agents')
      .select('id')
      .eq('username', session.username)
      .single();

    if (agentError || !salesAgent) {
      return { error: 'Sales agent not found' };
    }

    // Check if lead belongs to this sales agent
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('sales_agent_id')
      .eq('id', leadId)
      .single();

    if (leadError || !lead || lead.sales_agent_id !== salesAgent.id) {
      return { error: 'Lead not found or unauthorized' };
    }

    // Create comment
    const { data, error } = await supabase
      .from('lead_comments')
      .insert([{
        lead_id: leadId,
        comment: comment.trim()
      }])
      .select()
      .single();

    if (error) {
      return { error: error.message };
    }

    revalidatePath('/sales-agent/dashboard');
    return { success: true, comment: data as LeadComment };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function updateLeadComment(commentId: string, comment: string) {
  try {
    const session = await getSession();
    if (!session) {
      return { error: 'Unauthorized' };
    }

    // Allow admins or sales agents with "lead" or "pipeline" permission
    if (session.role === 'admin') {
      // Admin has access
    } else if (session.role === 'sales_agent') {
      const { hasPermission } = await import('@/lib/auth/permissions');
      const hasLead = await hasPermission('lead');
      const hasPipeline = await hasPermission('pipeline');
      if (!hasLead && !hasPipeline) {
        return { error: 'Unauthorized' };
      }
    } else {
      return { error: 'Unauthorized' };
    }

    if (!comment?.trim()) {
      return { error: 'Comment is required' };
    }

    const supabase = await createAdminClient();

    // Verify the comment belongs to a lead owned by this sales agent
    const { data: salesAgent, error: agentError } = await supabase
      .from('sales_agents')
      .select('id')
      .eq('username', session.username)
      .single();

    if (agentError || !salesAgent) {
      return { error: 'Sales agent not found' };
    }

    // Get the comment to find the lead_id
    const { data: commentData, error: commentError } = await supabase
      .from('lead_comments')
      .select('lead_id')
      .eq('id', commentId)
      .single();

    if (commentError || !commentData) {
      return { error: 'Comment not found' };
    }

    // Verify the lead belongs to this sales agent
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('sales_agent_id')
      .eq('id', commentData.lead_id)
      .single();

    if (leadError || !lead || lead.sales_agent_id !== salesAgent.id) {
      return { error: 'Comment not found or unauthorized' };
    }

    // Update comment
    const { data, error } = await supabase
      .from('lead_comments')
      .update({ 
        comment: comment.trim(),
        updated_at: new Date().toISOString()
      })
      .eq('id', commentId)
      .select()
      .single();

    if (error) {
      return { error: error.message };
    }

    revalidatePath('/sales-agent/dashboard');
    return { success: true, comment: data as LeadComment };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function deleteLeadComment(commentId: string) {
  try {
    const session = await getSession();
    if (!session) {
      return { error: 'Unauthorized' };
    }

    // Allow admins or sales agents with "lead" or "pipeline" permission
    if (session.role === 'admin') {
      // Admin has access
    } else if (session.role === 'sales_agent') {
      const { hasPermission } = await import('@/lib/auth/permissions');
      const hasLead = await hasPermission('lead');
      const hasPipeline = await hasPermission('pipeline');
      if (!hasLead && !hasPipeline) {
        return { error: 'Unauthorized' };
      }
    } else {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    // Verify the comment belongs to a lead owned by this sales agent
    const { data: salesAgent, error: agentError } = await supabase
      .from('sales_agents')
      .select('id')
      .eq('username', session.username)
      .single();

    if (agentError || !salesAgent) {
      return { error: 'Sales agent not found' };
    }

    // Get the comment to find the lead_id
    const { data: commentData, error: commentError } = await supabase
      .from('lead_comments')
      .select('lead_id')
      .eq('id', commentId)
      .single();

    if (commentError || !commentData) {
      return { error: 'Comment not found' };
    }

    // Verify the lead belongs to this sales agent
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('sales_agent_id')
      .eq('id', commentData.lead_id)
      .single();

    if (leadError || !lead || lead.sales_agent_id !== salesAgent.id) {
      return { error: 'Comment not found or unauthorized' };
    }

    // Delete comment
    const { error } = await supabase
      .from('lead_comments')
      .delete()
      .eq('id', commentId);

    if (error) {
      return { error: error.message };
    }

    revalidatePath('/sales-agent/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}
