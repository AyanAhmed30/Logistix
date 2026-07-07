'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import {
  debugLeadPhoneDuplicate,
  formatLeadPhoneForStorage,
  normalizePakistaniPhone,
} from '@/lib/pakistan-phone';
import { listInquiriesForLead, type LeadInquiry } from '@/app/actions/inquiries';

const LEAD_DETAIL_SELECT =
  'id, lead_id_formatted, name, number, source, status, sales_agent_id, created_by_sales_agent_id, transferred_from_sales_agent_id, transferred_at, converted, created_at, updated_at';

export type LeadStatus = 'Leads' | 'Inquiry Received' | 'Quotation Sent' | 'Negotiation' | 'Win' | 'Follow up' | 'Lose';

export type Lead = {
  id: string;
  lead_id_formatted: string | null;
  name: string;
  number: string;
  source: 'Meta' | 'LinkedIn' | 'WhatsApp' | 'Others';
  status: LeadStatus;
  sales_agent_id: string;
  created_by_sales_agent_id?: string | null;
  transferred_from_sales_agent_id?: string | null;
  transferred_at?: string | null;
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

export type TransferableSalesAgent = {
  id: string;
  name: string;
  username: string | null;
};

export type LeadTransferRecord = {
  id: string;
  lead_id: string;
  transferred_at: string;
  status_before_transfer: LeadStatus;
  lead_id_formatted_snapshot: string | null;
  lead_name_snapshot: string;
  lead_number_snapshot: string;
  lead_source_snapshot: 'Meta' | 'LinkedIn' | 'WhatsApp' | 'Others';
  from_sales_agent_id: string;
  to_sales_agent_id: string;
  from_sales_agent_name: string;
  from_sales_agent_username: string | null;
  to_sales_agent_name: string;
  to_sales_agent_username: string | null;
};

export type LeadWithSalesAgent = Lead & {
  sales_agents: {
    id: string;
    name: string;
    username: string | null;
  } | null;
};

async function addLeadLifecycleLog(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  input: {
    leadId: string;
    actionType: 'lead_created' | 'lead_updated';
    actionLabel: string;
    performedBy: string;
    previousValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  }
) {
  const { error } = await supabase.from('lead_activity_logs').insert([
    {
      lead_id: input.leadId,
      inquiry_id: null,
      inquiry_version: null,
      action_type: input.actionType,
      action_label: input.actionLabel,
      metadata: input.metadata || null,
      previous_values: input.previousValues || null,
      new_values: input.newValues || null,
      performed_by: input.performedBy,
    },
  ]);
  if (error) {
    console.error('[lead_activity_logs] insert failed:', error.message);
  }
}

type DuplicateLeadMatch = {
  id: string;
  name: string;
  lead_id_formatted: string | null;
};

function formatDuplicateLeadPhoneError(duplicate: DuplicateLeadMatch): string {
  const customerName = (duplicate.name || '').trim() || 'Unknown';
  const leadNumber = duplicate.lead_id_formatted?.trim();

  if (leadNumber) {
    return `This phone number already exists. It is associated with Lead #${leadNumber} (${customerName}).`;
  }

  return `This phone number already exists. It is associated with ${customerName}.`;
}

function scheduleLeadDashboardRevalidation() {
  after(() => {
    revalidatePath('/sales-agent/dashboard');
    revalidatePath('/admin/dashboard');
  });
}

function randomLeadIdFormatted() {
  return String(100000 + Math.floor(Math.random() * 900000));
}

function isDuplicateLeadIdError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = error.message || '';
  return (
    error.code === '23505' &&
    (message.includes('lead_id_formatted') || message.includes('leads_lead_id_formatted_key'))
  );
}

async function findDuplicateLeadByPhone(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  originalPhone: string,
  canonicalPhone: string,
  excludeLeadId?: string
): Promise<DuplicateLeadMatch | null> {
  debugLeadPhoneDuplicate({
    original: originalPhone,
    normalized: canonicalPhone,
    query: 'leads.number_normalized = canonical',
  });

  let columnQuery = supabase
    .from('leads')
    .select('id, name, lead_id_formatted')
    .eq('number_normalized', canonicalPhone)
    .limit(1);

  if (excludeLeadId) {
    columnQuery = columnQuery.neq('id', excludeLeadId);
  }

  const { data: columnRows, error: columnError } = await columnQuery;
  if (!columnError) {
    const match = (columnRows || [])[0] ?? null;
    debugLeadPhoneDuplicate({
      original: originalPhone,
      normalized: canonicalPhone,
      query: 'leads.number_normalized = canonical',
      matchingLeadId: match?.id ?? null,
    });
    return match;
  }

  if (!columnError.message.includes('number_normalized')) {
    throw new Error(columnError.message);
  }

  debugLeadPhoneDuplicate({
    original: originalPhone,
    normalized: canonicalPhone,
    query: 'find_lead_by_normalized_phone(p_phone, p_exclude_id)',
  });

  const { data: rpcRows, error: rpcError } = await supabase.rpc('find_lead_by_normalized_phone', {
    p_phone: canonicalPhone,
    p_exclude_id: excludeLeadId ?? null,
  });

  if (!rpcError) {
    const match = ((rpcRows as DuplicateLeadMatch[] | null) || [])[0] ?? null;
    debugLeadPhoneDuplicate({
      original: originalPhone,
      normalized: canonicalPhone,
      query: 'find_lead_by_normalized_phone(p_phone, p_exclude_id)',
      matchingLeadId: match?.id ?? null,
    });
    return match;
  }

  // Fallback when migration/RPC is not yet applied: exact match on raw number.
  if (rpcError.message.includes('find_lead_by_normalized_phone')) {
    let exactQuery = supabase
      .from('leads')
      .select('id, name, lead_id_formatted')
      .eq('number', canonicalPhone)
      .limit(1);

    if (excludeLeadId) {
      exactQuery = exactQuery.neq('id', excludeLeadId);
    }

    const { data: exactRows, error: exactError } = await exactQuery;
    if (exactError) {
      return null;
    }

    const match = (exactRows || [])[0] ?? null;
    debugLeadPhoneDuplicate({
      original: originalPhone,
      normalized: canonicalPhone,
      query: 'leads.number = canonical (fallback)',
      matchingLeadId: match?.id ?? null,
    });
    return match;
  }

  throw new Error(rpcError.message);
}

async function finishCreateLead(input: {
  supabase: Awaited<ReturnType<typeof createAdminClient>>;
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
  salesAgent: { id: string };
  safeName: string;
  displayPhone: string;
  canonicalPhone: string;
  source: 'Meta' | 'LinkedIn' | 'WhatsApp' | 'Others';
}) {
  const { supabase, session, salesAgent, safeName, displayPhone, canonicalPhone, source } = input;

  const leadInsertBase = {
    name: safeName,
    number: displayPhone,
    number_normalized: canonicalPhone,
    source,
    status: 'Leads' as const,
    sales_agent_id: salesAgent.id,
    created_by_sales_agent_id: salesAgent.id,
  };

  let data: Lead | null = null;
  let lastInsertError: string | null = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: inserted, error } = await supabase
      .from('leads')
      .insert([{ ...leadInsertBase, lead_id_formatted: randomLeadIdFormatted() }])
      .select()
      .single();

    if (!error && inserted) {
      data = inserted as Lead;
      break;
    }

    if (isDuplicateLeadIdError(error)) {
      lastInsertError = error?.message || null;
      continue;
    }

    if (error?.message.includes('number_normalized')) {
      const { data: normalizedRetryData, error: normalizedRetryError } = await supabase
        .from('leads')
        .insert([{
          name: safeName,
          number: displayPhone,
          source,
          status: 'Leads',
          sales_agent_id: salesAgent.id,
          created_by_sales_agent_id: salesAgent.id,
          lead_id_formatted: randomLeadIdFormatted(),
        }])
        .select()
        .single();

      if (!normalizedRetryError && normalizedRetryData) {
        data = normalizedRetryData as Lead;
        break;
      }

      if (isDuplicateLeadIdError(normalizedRetryError)) {
        lastInsertError = normalizedRetryError?.message || null;
        continue;
      }
    }

    if (error?.message.includes('created_by_sales_agent_id') || error?.message.includes('column "created_by_sales_agent_id"')) {
      const { data: retryData, error: retryError } = await supabase
        .from('leads')
        .insert([{
          name: safeName,
          number: displayPhone,
          source,
          status: 'Leads',
          sales_agent_id: salesAgent.id,
          lead_id_formatted: randomLeadIdFormatted(),
        }])
        .select()
        .single();

      if (!retryError && retryData) {
        data = retryData as Lead;
        break;
      }

      if (isDuplicateLeadIdError(retryError)) {
        lastInsertError = retryError?.message || null;
        continue;
      }

      if (retryError) {
        if (retryError.message.includes('does not exist') || retryError.message.includes('relation') || retryError.code === '42P01') {
          return { error: 'Leads table does not exist. Please run the SQL migration in Supabase.' };
        }
        return { error: retryError.message };
      }
    }

    if (error?.message.includes('does not exist') || error?.message.includes('relation') || error?.code === '42P01') {
      return { error: 'Leads table does not exist. Please run the SQL migration in Supabase.' };
    }

    return { error: error?.message || 'Failed to create lead' };
  }

  if (!data) {
    return { error: lastInsertError || 'Unable to generate unique Lead ID. Please try again.' };
  }

  void addLeadLifecycleLog(supabase, {
    leadId: data.id,
    actionType: 'lead_created',
    actionLabel: 'Lead Created',
    performedBy: session.username || 'sales-agent',
    newValues: {
      name: data.name,
      number: data.number,
      source: data.source,
      status: data.status,
    },
  });

  scheduleLeadDashboardRevalidation();
  return { success: true, lead: data };
}

export async function createLead(formData: FormData) {
  try {
    const session = await getSession();
    if (!session) {
      return { error: 'Unauthorized' };
    }

    // Allow admins or sales agents with "lead" permission
    if (session.role !== 'admin' && session.role !== 'sales_agent') {
      return { error: 'Unauthorized' };
    }

    const name = formData.get('name') as string;
    const number = formData.get('number') as string;
    const source = formData.get('source') as string;

    // Only number and source are required
    if (!number?.trim() || !source?.trim()) {
      return { error: 'Number and source are required' };
    }

    if (!['Meta', 'LinkedIn', 'WhatsApp', 'Others'].includes(source)) {
      return { error: 'Invalid source. Must be one of: Meta, LinkedIn, WhatsApp, Others' };
    }

    const supabase = await createAdminClient();

    // Normalize name: allow it to be empty; NOT NULL constraint is satisfied by using empty string instead of null
    const safeName = (name ?? '').trim();
    const phoneResult = normalizePakistaniPhone(number);
    if (!phoneResult.ok) {
      return { error: phoneResult.error };
    }
    const canonicalPhone = phoneResult.value;
    const displayPhone = formatLeadPhoneForStorage(number, canonicalPhone);

    const [{ data: salesAgent, error: agentError }, duplicateLead] = await Promise.all([
      supabase
        .from('sales_agents')
        .select('id, permissions')
        .eq('username', session.username)
        .single(),
      findDuplicateLeadByPhone(supabase, number, canonicalPhone),
    ]);

    if (agentError?.message.includes('permissions') || agentError?.message.includes('column "permissions"')) {
      const { data: fallbackAgent, error: fallbackError } = await supabase
        .from('sales_agents')
        .select('id')
        .eq('username', session.username)
        .single();

      if (fallbackError || !fallbackAgent) {
        return { error: 'Sales agent not found' };
      }

      if (duplicateLead) {
        return { error: formatDuplicateLeadPhoneError(duplicateLead) };
      }

      return await finishCreateLead({
        supabase,
        session,
        salesAgent: fallbackAgent,
        safeName,
        displayPhone,
        canonicalPhone,
        source: source as 'Meta' | 'LinkedIn' | 'WhatsApp' | 'Others',
      });
    }

    if (agentError || !salesAgent) {
      return { error: 'Sales agent not found' };
    }

    if (session.role === 'sales_agent') {
      const permissions = (salesAgent as { permissions?: string[] | null }).permissions;
      if (Array.isArray(permissions) && !permissions.includes('lead')) {
        return { error: 'Unauthorized' };
      }
    }

    if (duplicateLead) {
      return { error: formatDuplicateLeadPhoneError(duplicateLead) };
    }

    return await finishCreateLead({
      supabase,
      session,
      salesAgent,
      safeName,
      displayPhone,
      canonicalPhone,
      source: source as 'Meta' | 'LinkedIn' | 'WhatsApp' | 'Others',
    });
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

    const pageSize = 1000;
    let from = 0;
    const allLeads: Lead[] = [];

    while (true) {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('sales_agent_id', salesAgent.id)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) {
        if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
          return { error: 'Leads table does not exist. Please run the SQL migration in Supabase.' };
        }
        return { error: error.message };
      }

      const batch = (data || []) as Lead[];
      allLeads.push(...batch);

      if (batch.length < pageSize) {
        break;
      }
      from += pageSize;
    }

    // Ensure all leads have a status (for existing leads created before migration)
    const leadsWithStatus = allLeads.map((lead: Lead) => {
      if (!lead.status) {
        return { ...lead, status: 'Leads' as LeadStatus };
      }
      return lead;
    });

    return {
      leads: leadsWithStatus as Lead[],
      totalCount: leadsWithStatus.length,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getLeadForSalesAgentById(leadId: string) {
  try {
    const result = await getSalesAgentLeadDetailBootstrap(leadId);
    if ('error' in result) return result;
    return { lead: result.lead };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export type LeadDetailBootstrap = {
  lead: Lead;
  inquiries: LeadInquiry[];
  approvedInquiryId: string | null;
};

/** Single round-trip bootstrap for the sales-agent lead detail page (lead + inquiries). */
export async function getSalesAgentLeadDetailBootstrap(
  leadId: string
): Promise<LeadDetailBootstrap | { error: string }> {
  try {
    const session = await getSession();
    if (!session || session.role !== 'sales_agent') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    const [agentResult, leadResult, inquiryResult] = await Promise.all([
      supabase
        .from('sales_agents')
        .select('id, permissions')
        .eq('username', session.username)
        .maybeSingle(),
      supabase.from('leads').select(LEAD_DETAIL_SELECT).eq('id', leadId).maybeSingle(),
      listInquiriesForLead(supabase, leadId, session.role),
    ]);

    if (agentResult.error) {
      if (
        agentResult.error.message.includes('permissions') ||
        agentResult.error.message.includes('column "permissions"')
      ) {
        const { data: fallbackAgent, error: fallbackError } = await supabase
          .from('sales_agents')
          .select('id')
          .eq('username', session.username)
          .maybeSingle();

        if (fallbackError || !fallbackAgent) {
          return { error: 'Sales agent not found' };
        }

        if (leadResult.error) {
          return { error: leadResult.error.message };
        }
        if (!leadResult.data || leadResult.data.sales_agent_id !== fallbackAgent.id) {
          return { error: 'Lead not found' };
        }
        if ('error' in inquiryResult) return inquiryResult;

        const lead = leadResult.data as Lead;
        return {
          lead: lead.status ? lead : { ...lead, status: 'Leads' as LeadStatus },
          inquiries: inquiryResult.inquiries,
          approvedInquiryId: inquiryResult.approvedInquiryId,
        };
      }
      return { error: agentResult.error.message };
    }

    const salesAgent = agentResult.data;
    if (!salesAgent) {
      return { error: 'Sales agent not found' };
    }

    const permissions = (salesAgent as { permissions?: string[] | null }).permissions;
    if (Array.isArray(permissions) && !permissions.includes('lead') && !permissions.includes('pipeline')) {
      return { error: 'Unauthorized' };
    }

    if (leadResult.error) {
      return { error: leadResult.error.message };
    }
    if (!leadResult.data || leadResult.data.sales_agent_id !== salesAgent.id) {
      return { error: 'Lead not found' };
    }
    if ('error' in inquiryResult) return inquiryResult;

    const lead = leadResult.data as Lead;
    return {
      lead: lead.status ? lead : { ...lead, status: 'Leads' as LeadStatus },
      inquiries: inquiryResult.inquiries,
      approvedInquiryId: inquiryResult.approvedInquiryId,
    };
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
        sales_agents!leads_sales_agent_id_fkey (
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
      lead_id_formatted: string | null;
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
    const validStatuses: LeadStatus[] = ['Leads', 'Inquiry Received', 'Quotation Sent', 'Negotiation', 'Win', 'Follow up', 'Lose'];
    
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

    await addLeadLifecycleLog(supabase, {
      leadId,
      actionType: 'lead_updated',
      actionLabel: 'Lead Updated',
      performedBy: session.username || 'sales-agent',
      previousValues: { status: lead.status || 'Leads' },
      newValues: { status: normalizedStatus },
      metadata: { change_type: 'status_transition' },
    });

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
      .select('sales_agent_id, name, number, source')
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
      .select('sales_agent_id, name, number, source')
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

export async function updateLead(formData: FormData) {
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

    const leadId = formData.get('id') as string;
    const name = formData.get('name') as string;
    const number = formData.get('number') as string;
    const source = formData.get('source') as string;

    if (!leadId || !name?.trim() || !number?.trim() || !source?.trim()) {
      return { error: 'Lead ID, name, number, and source are required' };
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

    const phoneResult = normalizePakistaniPhone(number);
    if (!phoneResult.ok) {
      return { error: phoneResult.error };
    }
    const canonicalPhone = phoneResult.value;
    const displayPhone = formatLeadPhoneForStorage(number, canonicalPhone);

    // Verify the lead belongs to this sales agent
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('sales_agent_id, name, number, source')
      .eq('id', leadId)
      .single();

    if (leadError || !lead || lead.sales_agent_id !== salesAgent.id) {
      return { error: 'Lead not found or unauthorized' };
    }

    const duplicateLead = await findDuplicateLeadByPhone(supabase, number, canonicalPhone, leadId);
    if (duplicateLead) {
      return { error: formatDuplicateLeadPhoneError(duplicateLead) };
    }

    // Update the lead
    const { data, error } = await supabase
      .from('leads')
      .update({
        name: name.trim(),
        number: displayPhone,
        number_normalized: canonicalPhone,
        source: source as 'Meta' | 'LinkedIn' | 'WhatsApp' | 'Others',
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select()
      .single();

    if (error) {
      if (error.message.includes('number_normalized')) {
        const { data: retryData, error: retryError } = await supabase
          .from('leads')
          .update({
            name: name.trim(),
            number: displayPhone,
            source: source as 'Meta' | 'LinkedIn' | 'WhatsApp' | 'Others',
            updated_at: new Date().toISOString(),
          })
          .eq('id', leadId)
          .select()
          .single();

        if (!retryError) {
          await addLeadLifecycleLog(supabase, {
            leadId,
            actionType: 'lead_updated',
            actionLabel: 'Lead Updated',
            performedBy: session.username || 'sales-agent',
            previousValues: {
              name: lead.name,
              number: lead.number,
              source: lead.source,
            },
            newValues: {
              name: retryData.name,
              number: retryData.number,
              source: retryData.source,
            },
            metadata: { change_type: 'lead_profile' },
          });

          revalidatePath('/sales-agent/dashboard');
          revalidatePath('/admin/dashboard');
          return { success: true, lead: retryData as Lead };
        }
      }
      if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
        return { error: 'Leads table does not exist. Please run the SQL migration in Supabase.' };
      }
      return { error: error.message };
    }

    await addLeadLifecycleLog(supabase, {
      leadId,
      actionType: 'lead_updated',
      actionLabel: 'Lead Updated',
      performedBy: session.username || 'sales-agent',
      previousValues: {
        name: lead.name,
        number: lead.number,
        source: lead.source,
      },
      newValues: {
        name: data.name,
        number: data.number,
        source: data.source,
      },
      metadata: { change_type: 'lead_profile' },
    });

    revalidatePath('/sales-agent/dashboard');
    revalidatePath('/admin/dashboard');
    return { success: true, lead: data as Lead };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function deleteLead(leadId: string) {
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

    // Verify the lead belongs to this sales agent
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('sales_agent_id')
      .eq('id', leadId)
      .single();

    if (leadError || !lead || lead.sales_agent_id !== salesAgent.id) {
      return { error: 'Lead not found or unauthorized' };
    }

    // Delete the lead (cascade will handle related comments)
    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('id', leadId);

    if (error) {
      if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
        return { error: 'Leads table does not exist. Please run the SQL migration in Supabase.' };
      }
      return { error: error.message };
    }

    revalidatePath('/sales-agent/dashboard');
    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getTransferableSalesAgents() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'sales_agent') {
      return { error: 'Unauthorized' };
    }

    const { hasPermission } = await import('@/lib/auth/permissions');
    const hasAccess = await hasPermission('pipeline');
    if (!hasAccess) {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();
    const { data: currentAgent, error: currentAgentError } = await supabase
      .from('sales_agents')
      .select('id')
      .eq('username', session.username)
      .single();

    if (currentAgentError || !currentAgent) {
      return { error: 'Sales agent not found' };
    }

    const { data, error } = await supabase
      .from('sales_agents')
      .select('id, name, username')
      .neq('id', currentAgent.id)
      .order('name', { ascending: true });

    if (error) {
      return { error: error.message };
    }

    return {
      salesAgents: (data || []) as TransferableSalesAgent[],
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function transferLeadToSalesAgent(leadId: string, targetSalesAgentId: string) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'sales_agent') {
      return { error: 'Unauthorized' };
    }

    const { hasPermission } = await import('@/lib/auth/permissions');
    const hasAccess = await hasPermission('pipeline');
    if (!hasAccess) {
      return { error: 'Unauthorized' };
    }

    if (!leadId || !targetSalesAgentId) {
      return { error: 'Lead and target sales agent are required' };
    }

    const supabase = await createAdminClient();

    const { data: senderAgent, error: senderError } = await supabase
      .from('sales_agents')
      .select('id, name, username')
      .eq('username', session.username)
      .single();

    if (senderError || !senderAgent) {
      return { error: 'Sales agent not found' };
    }

    if (senderAgent.id === targetSalesAgentId) {
      return { error: 'You cannot transfer a lead to yourself' };
    }

    const { data: recipientAgent, error: recipientError } = await supabase
      .from('sales_agents')
      .select('id, name, username')
      .eq('id', targetSalesAgentId)
      .single();

    if (recipientError || !recipientAgent) {
      return { error: 'Target sales agent not found' };
    }

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, lead_id_formatted, name, number, source, status, sales_agent_id')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return { error: 'Lead not found' };
    }

    if (lead.sales_agent_id !== senderAgent.id) {
      return { error: 'Lead not found or unauthorized' };
    }

    const nowIso = new Date().toISOString();

    const { data: updatedLead, error: updateError } = await supabase
      .from('leads')
      .update({
        sales_agent_id: recipientAgent.id,
        transferred_from_sales_agent_id: senderAgent.id,
        transferred_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', leadId)
      .select()
      .single();

    if (updateError) {
      return { error: updateError.message };
    }

    const { error: transferInsertError } = await supabase
      .from('lead_transfers')
      .insert([{
        lead_id: lead.id,
        from_sales_agent_id: senderAgent.id,
        to_sales_agent_id: recipientAgent.id,
        status_before_transfer: lead.status,
        lead_id_formatted_snapshot: lead.lead_id_formatted || null,
        lead_name_snapshot: lead.name || '',
        lead_number_snapshot: lead.number || '',
        lead_source_snapshot: lead.source,
      }]);

    if (transferInsertError) {
      return { error: transferInsertError.message };
    }

    if (recipientAgent.username) {
      const leadRef = lead.lead_id_formatted || lead.id.slice(0, 8);
      const { error: notificationError } = await supabase
        .from('inquiry_lifecycle_notifications')
        .insert([{
          lead_id: lead.id,
          inquiry_id: null,
          confirmation_id: null,
          sender_role: 'sales_agent',
          sender_username: session.username || senderAgent.username || senderAgent.name,
          recipient_role: 'sales_agent',
          recipient_username: recipientAgent.username,
          event_type: 'lead_transferred',
          message: `${senderAgent.name} sent Lead #${leadRef} (${lead.name || 'N/A'}) to you.`,
        }]);

      if (notificationError) {
        return { error: notificationError.message };
      }
    }

    revalidatePath('/sales-agent/dashboard');
    revalidatePath('/admin/dashboard');
    return { success: true, lead: updatedLead as Lead };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getLeadTransferHistoryForCurrentSalesAgent() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'sales_agent') {
      return { error: 'Unauthorized' };
    }

    const { hasPermission } = await import('@/lib/auth/permissions');
    const hasAccess = await hasPermission('pipeline');
    if (!hasAccess) {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();
    const { data: currentAgent, error: currentAgentError } = await supabase
      .from('sales_agents')
      .select('id')
      .eq('username', session.username)
      .single();

    if (currentAgentError || !currentAgent) {
      return { error: 'Sales agent not found' };
    }

    const { data: transferRows, error: transferError } = await supabase
      .from('lead_transfers')
      .select(`
        id,
        lead_id,
        transferred_at,
        status_before_transfer,
        lead_id_formatted_snapshot,
        lead_name_snapshot,
        lead_number_snapshot,
        lead_source_snapshot,
        from_sales_agent_id,
        to_sales_agent_id
      `)
      .or(`from_sales_agent_id.eq.${currentAgent.id},to_sales_agent_id.eq.${currentAgent.id}`)
      .order('transferred_at', { ascending: false });

    if (transferError) {
      return { error: transferError.message };
    }

    const transfers = transferRows || [];
    if (transfers.length === 0) {
      return {
        sentTransfers: [] as LeadTransferRecord[],
        receivedTransfers: [] as LeadTransferRecord[],
      };
    }

    const salesAgentIds = Array.from(
      new Set(
        transfers.flatMap((row) => [row.from_sales_agent_id, row.to_sales_agent_id]).filter(Boolean)
      )
    );

    const { data: salesAgents, error: salesAgentsError } = await supabase
      .from('sales_agents')
      .select('id, name, username')
      .in('id', salesAgentIds);

    if (salesAgentsError) {
      return { error: salesAgentsError.message };
    }

    const byId = new Map(
      (salesAgents || []).map((agent) => [
        agent.id,
        { name: agent.name || 'Unknown', username: agent.username || null },
      ])
    );

    const records: LeadTransferRecord[] = transfers.map((row) => ({
      id: row.id,
      lead_id: row.lead_id,
      transferred_at: row.transferred_at,
      status_before_transfer: row.status_before_transfer as LeadStatus,
      lead_id_formatted_snapshot: row.lead_id_formatted_snapshot || null,
      lead_name_snapshot: row.lead_name_snapshot,
      lead_number_snapshot: row.lead_number_snapshot,
      lead_source_snapshot: row.lead_source_snapshot as 'Meta' | 'LinkedIn' | 'WhatsApp' | 'Others',
      from_sales_agent_id: row.from_sales_agent_id,
      to_sales_agent_id: row.to_sales_agent_id,
      from_sales_agent_name: byId.get(row.from_sales_agent_id)?.name || 'Unknown',
      from_sales_agent_username: byId.get(row.from_sales_agent_id)?.username || null,
      to_sales_agent_name: byId.get(row.to_sales_agent_id)?.name || 'Unknown',
      to_sales_agent_username: byId.get(row.to_sales_agent_id)?.username || null,
    }));

    return {
      sentTransfers: records.filter((record) => record.from_sales_agent_id === currentAgent.id),
      receivedTransfers: records.filter((record) => record.to_sales_agent_id === currentAgent.id),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}
