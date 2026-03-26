'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

export type InquiryStatus = 'pending' | 'in_progress' | 'quotation_sent' | 'completed';

export type LeadInquiry = {
  id: string;
  lead_id: string;
  description: string;
  image_url: string | null;
  link_url: string | null;
  product_name: string;
  total_weight: string;
  cbm: string;
  quantity: string;
  status: InquiryStatus;
  sent_to_accounting: boolean;
  sent_to_operations: boolean;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadInquiryWithLead = LeadInquiry & {
  leads: {
    id: string;
    lead_id_formatted: string | null;
    name: string;
    number: string;
    source: string;
    sales_agent_id: string;
    sales_agents?: {
      id: string;
      name: string;
      username: string | null;
    } | null;
  } | null;
  inquiry_confirmations?: {
    id: string;
    status: string;
    created_at: string;
  }[];
};

export type InquiryQuotation = {
  id: string;
  inquiry_id: string;
  lead_id: string;
  quotation_number: string;
  customer_name: string;
  product_service: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  notes: string | null;
  created_by: string;
  sent_to_client: boolean;
  sent_to_client_at: string | null;
  sent_to_agent: boolean;
  sent_to_agent_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type InquiryLog = {
  id: string;
  inquiry_id: string;
  action: string;
  previous_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  performed_by: string;
  performed_at: string;
};

// ========== Sales Agent Actions ==========

export async function saveInquiry(
  leadId: string,
  data: {
    product_name: string;
    total_weight: string;
    cbm: string;
    quantity: string;
    image_url: string | null;
    description: string;
  }
) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();

    // Always work with the latest inquiry for this lead.
    // If the latest inquiry was already sent to Accounting, we create a new inquiry row
    // to avoid overwriting history when the agent sends again for the same lead.
    const { data: latest } = await supabase
      .from('lead_inquiries')
      .select('id, sent_to_accounting')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const inquiryData = {
      product_name: data.product_name.trim(),
      total_weight: data.total_weight.trim(),
      cbm: data.cbm.trim(),
      quantity: data.quantity.trim(),
      description: data.description.trim(),
      image_url: data.image_url || null,
      updated_at: new Date().toISOString(),
    };

    if (latest && !latest.sent_to_accounting) {
      // Load current values to compute diffs for inquiry logs.
      const { data: current, error: currentError } = await supabase
        .from('lead_inquiries')
        .select('*')
        .eq('id', latest.id)
        .single();

      if (currentError || !current) {
        return { error: 'Inquiry not found for update' };
      }

      // Update the latest draft inquiry
      const { data: result, error } = await supabase
        .from('lead_inquiries')
        .update(inquiryData)
        .eq('id', latest.id)
        .select()
        .single();

      if (error) return { error: error.message };

      // Log only when there are actual field changes.
      const previousValues: Record<string, unknown> = {};
      const newValues: Record<string, unknown> = {};

      if (inquiryData.description !== (current.description || '')) {
        previousValues.description = current.description;
        newValues.description = inquiryData.description;
      }
      if (inquiryData.image_url !== (current.image_url || null)) {
        previousValues.image_url = current.image_url ? 'Attached' : 'None';
        newValues.image_url = inquiryData.image_url ? 'Attached' : 'Removed';
      }
      if ((inquiryData.product_name || '') !== (current.product_name || '')) {
        previousValues.product_name = current.product_name;
        newValues.product_name = inquiryData.product_name;
      }
      if ((inquiryData.total_weight || '') !== (current.total_weight || '')) {
        previousValues.total_weight = current.total_weight;
        newValues.total_weight = inquiryData.total_weight;
      }
      if ((inquiryData.cbm || '') !== (current.cbm || '')) {
        previousValues.cbm = current.cbm;
        newValues.cbm = inquiryData.cbm;
      }
      if ((inquiryData.quantity || '') !== (current.quantity || '')) {
        previousValues.quantity = current.quantity;
        newValues.quantity = inquiryData.quantity;
      }

      if (Object.keys(newValues).length > 0) {
        await supabase.from('inquiry_logs').insert([
          {
            inquiry_id: latest.id,
            action: 'updated',
            previous_values: previousValues,
            new_values: newValues,
            performed_by: session.username || 'sales-agent',
          },
        ]);
      }

      return { success: true, inquiry: result as LeadInquiry };
    } else {
      // Create a new inquiry (either first ever, or latest was already sent)
      const { data: result, error } = await supabase
        .from('lead_inquiries')
        .insert([{
          lead_id: leadId,
          ...inquiryData,
          status: 'pending',
          sent_to_accounting: false,
          sent_to_operations: false,
        }])
        .select()
        .single();

      if (error) return { error: error.message };

      // Log the creation so UI history/activity can show the version.
      await supabase.from('inquiry_logs').insert([
        {
          inquiry_id: result.id,
          action: 'created',
          previous_values: null,
          new_values: {
            product_name: inquiryData.product_name,
            total_weight: inquiryData.total_weight,
            cbm: inquiryData.cbm,
            quantity: inquiryData.quantity,
            description: inquiryData.description,
            image_url: inquiryData.image_url ? 'Attached' : 'None',
          },
          performed_by: session.username || 'sales-agent',
        },
      ]);

      return { success: true, inquiry: result as LeadInquiry };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function sendInquiryToAccounting(leadId: string) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();

    // Get the latest unsent inquiry draft for this lead.
    // This avoids overwriting an already-sent inquiry when the sales agent sends again.
    const { data: inquiry, error: inquiryError } = await supabase
      .from('lead_inquiries')
      .select('*')
      .eq('lead_id', leadId)
      .eq('sent_to_accounting', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inquiryError || !inquiry) {
      return { error: 'No inquiry found for this lead. Please add inquiry details first.' };
    }

    if (!inquiry.product_name || inquiry.product_name.trim() === '') {
      return { error: 'Please add a product name before sending.' };
    }

    // Update inquiry status - send to accounting (operations reads from same flag)
    const updatePayload: Record<string, unknown> = {
      sent_to_accounting: true,
      sent_at: new Date().toISOString(),
      status: 'pending',
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('lead_inquiries')
      .update(updatePayload)
      .eq('id', inquiry.id)
      .select()
      .single();

    if (error) return { error: error.message };

    // Add status change log so the activity/history UI shows the "send" event.
    await supabase.from('inquiry_logs').insert([
      {
        inquiry_id: inquiry.id,
        action: 'status_changed',
        previous_values: { sent_to_accounting: false },
        new_values: {
          sent_to_accounting: true,
          sent_at: updatePayload.sent_at,
        },
        performed_by: session.username || 'sales-agent',
      },
    ]);

    revalidatePath('/sales-agent/dashboard');
    revalidatePath('/admin/dashboard');
    revalidatePath('/operations/dashboard');
    return { success: true, inquiry: data as LeadInquiry };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

// ========== Sales Agent Inquiry Tracking ==========

export type InquiryTrackingStatus = 'none' | 'draft' | 'sent' | 'approved';

export type InquiryTrackingInfo = {
  lead_id: string;
  status: InquiryTrackingStatus;
  sent_at: string | null;
  approved_at: string | null;
};

/**
 * Get inquiry tracking statuses for all leads belonging to the current sales agent.
 * Used by the Pipeline view to show which leads have inquiries sent/approved.
 * 
 * Visibility rules:
 * - "approved" is shown to sales agent so they know the inquiry is good to proceed
 * - "rejected" is NOT shown to sales agent (only visible to operations)
 */
export async function getInquiryTrackingForSalesAgent() {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();

    // Get sales agent by username
    const { data: salesAgent, error: agentError } = await supabase
      .from('sales_agents')
      .select('id')
      .eq('username', session.username)
      .maybeSingle();

    if (agentError || !salesAgent) {
      return { tracking: [] as InquiryTrackingInfo[] };
    }

    // Get all inquiries for this agent using relational filter
    // (avoids huge `.in(...)` lists for agents with many leads).
    const { data: inquiries, error: inquiryError } = await supabase
      .from('lead_inquiries')
      .select(`
        id,
        lead_id,
        created_at,
        sent_to_accounting,
        sent_at,
        leads!inner (
          id,
          sales_agent_id
        ),
        inquiry_confirmations (
          id,
          status,
          created_at
        )
      `)
      .eq('leads.sales_agent_id', salesAgent.id);

    if (inquiryError) {
      return { tracking: [] as InquiryTrackingInfo[] };
    }

    type TrackingInquiryRow = {
      id: string;
      lead_id: string;
      created_at: string | null;
      sent_to_accounting: boolean;
      sent_at: string | null;
      inquiry_confirmations?: { id: string; status: string; created_at: string }[];
    };

    // If multiple inquiries exist for the same lead, pick the newest one only.
    const tracking: InquiryTrackingInfo[] = [];
    const seenLeadIds = new Set<string>();

    // Ensure newest inquiries come first so we keep the first record per lead_id.
    const sortedInquiries = ([...(inquiries || [])] as TrackingInquiryRow[]).sort((a, b) => {
      const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bCreated - aCreated;
    });

    for (const inq of sortedInquiries) {
      if (seenLeadIds.has(inq.lead_id)) continue;
      seenLeadIds.add(inq.lead_id);

      // Check if any confirmation is approved (latest first)
      const confirmations = inq.inquiry_confirmations || [];
      const sorted = [...confirmations].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const latestApproved = sorted.find((c) => c.status === 'approved');

      let status: InquiryTrackingStatus = 'draft';
      let approved_at: string | null = null;

      if (latestApproved) {
        status = 'approved';
        approved_at = latestApproved.created_at;
      } else if (inq.sent_to_accounting) {
        status = 'sent';
      }

      tracking.push({
        lead_id: inq.lead_id,
        status,
        sent_at: inq.sent_at,
        approved_at,
      });
    }

    return { tracking };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

/**
 * Get all inquiries for the current sales agent with full lead and confirmation details.
 * Used by the Inquiry Tracking tab in the Sales Agent Dashboard.
 * Only shows "approved" confirmations (rejected is hidden from sales agent).
 */
export async function getAllInquiriesForSalesAgent() {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();

    // Get sales agent by username
    const { data: salesAgent, error: agentError } = await supabase
      .from('sales_agents')
      .select('id')
      .eq('username', session.username)
      .maybeSingle();

    if (agentError || !salesAgent) {
      return { inquiries: [] as LeadInquiryWithLead[] };
    }

    // Fetch all inquiries for the agent's leads (including drafts and sent ones)
    // using relational filter to avoid very large `.in(...)` payloads.
    const { data, error } = await supabase
      .from('lead_inquiries')
      .select(`
        *,
        leads!inner (
          id,
          lead_id_formatted,
          name,
          number,
          source,
          sales_agent_id,
          sales_agents (
            id,
            name,
            username
          )
        ),
        inquiry_confirmations (
          id,
          status,
          created_at
        )
      `)
      .eq('leads.sales_agent_id', salesAgent.id)
      .order('created_at', { ascending: false });

    if (error) return { error: error.message };
    return { inquiries: (data || []) as LeadInquiryWithLead[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getInquiryForLead(leadId: string) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('lead_inquiries')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return { error: error.message };
    return { inquiry: (data as LeadInquiry) || null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

/**
 * Get all inquiry versions for a lead (newest first).
 * Used to show inquiry history in Sales Agent and Operations UI.
 */
export async function getInquiryHistoryForLead(leadId: string) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();

    // Role-based guard for sales agents: allow only their own lead.
    if (session.role === 'sales_agent') {
      const { data: salesAgent } = await supabase
        .from('sales_agents')
        .select('id')
        .eq('username', session.username)
        .maybeSingle();

      if (!salesAgent) return { error: 'Unauthorized' };

      const { data: lead } = await supabase
        .from('leads')
        .select('id, sales_agent_id')
        .eq('id', leadId)
        .maybeSingle();

      if (!lead || lead.sales_agent_id !== salesAgent.id) {
        return { error: 'Unauthorized' };
      }
    } else if (session.role !== 'admin' && session.role !== 'operations') {
      return { error: 'Unauthorized' };
    }

    const { data, error } = await supabase
      .from('lead_inquiries')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (error) return { error: error.message };
    return { inquiries: (data || []) as LeadInquiry[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getQuotationsForLead(leadId: string) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('inquiry_quotations')
      .select('*')
      .eq('lead_id', leadId)
      .order('version', { ascending: false });

    if (error) return { error: error.message };
    return { quotations: (data || []) as InquiryQuotation[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

// ========== Admin/Accounting Actions ==========

export async function getAllInquiriesForAccounting() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('lead_inquiries')
      .select(`
        *,
        leads (
          id,
          lead_id_formatted,
          name,
          number,
          source,
          sales_agent_id,
          sales_agents (
            id,
            name,
            username
          )
        ),
        inquiry_confirmations (
          id,
          status,
          created_at
        )
      `)
      .eq('sent_to_accounting', true)
      .order('sent_at', { ascending: false });

    if (error) return { error: error.message };
    return { inquiries: (data || []) as LeadInquiryWithLead[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

// ========== Operations Actions ==========

export async function getAllInquiriesForOperations() {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && session.role !== 'operations')) {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    // Query using sent_to_accounting as the source of truth
    // Every inquiry sent to accounting is also visible in operations
    // Also fetch related inquiry_confirmations so Operations can see approval status
    const { data, error } = await supabase
      .from('lead_inquiries')
      .select(`
        *,
        leads (
          id,
          lead_id_formatted,
          name,
          number,
          source,
          sales_agent_id,
          sales_agents (
            id,
            name,
            username
          )
        ),
        inquiry_confirmations (
          id,
          status,
          created_at
        )
      `)
      .eq('sent_to_accounting', true)
      .order('sent_at', { ascending: false });

    if (error) return { error: error.message };
    return { inquiries: (data || []) as LeadInquiryWithLead[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function updateInquiryForAccounting(
  inquiryId: string,
  updates: {
    description?: string;
    status?: InquiryStatus;
    image_url?: string | null;
    link_url?: string | null;
    product_name?: string;
    total_weight?: string;
    cbm?: string;
    quantity?: string;
  }
) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && session.role !== 'operations' && session.role !== 'sales_agent')) {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    // Get current inquiry for comparison
    const { data: current, error: fetchError } = await supabase
      .from('lead_inquiries')
      .select('*')
      .eq('id', inquiryId)
      .single();

    if (fetchError || !current) {
      return { error: 'Inquiry not found' };
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.description !== undefined) updateData.description = updates.description.trim();
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.image_url !== undefined) updateData.image_url = updates.image_url;
    if (updates.link_url !== undefined) updateData.link_url = updates.link_url;
    if (updates.product_name !== undefined) updateData.product_name = updates.product_name.trim();
    if (updates.total_weight !== undefined) updateData.total_weight = updates.total_weight.trim();
    if (updates.cbm !== undefined) updateData.cbm = updates.cbm.trim();
    if (updates.quantity !== undefined) updateData.quantity = updates.quantity.trim();

    const { data, error } = await supabase
      .from('lead_inquiries')
      .update(updateData)
      .eq('id', inquiryId)
      .select()
      .single();

    if (error) return { error: error.message };

    // Log the change
    const previousValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    if (updates.description !== undefined && updates.description !== current.description) {
      previousValues.description = current.description;
      newValues.description = updates.description;
    }
    if (updates.status !== undefined && updates.status !== current.status) {
      previousValues.status = current.status;
      newValues.status = updates.status;
    }
    if (updates.image_url !== undefined && updates.image_url !== current.image_url) {
      previousValues.image_url = current.image_url ? 'Attached' : 'None';
      newValues.image_url = updates.image_url ? 'Attached' : 'Removed';
    }
    if (updates.link_url !== undefined && updates.link_url !== current.link_url) {
      previousValues.link_url = current.link_url;
      newValues.link_url = updates.link_url;
    }
    if (updates.product_name !== undefined && updates.product_name !== current.product_name) {
      previousValues.product_name = current.product_name;
      newValues.product_name = updates.product_name;
    }
    if (updates.total_weight !== undefined && updates.total_weight !== current.total_weight) {
      previousValues.total_weight = current.total_weight;
      newValues.total_weight = updates.total_weight;
    }
    if (updates.cbm !== undefined && updates.cbm !== current.cbm) {
      previousValues.cbm = current.cbm;
      newValues.cbm = updates.cbm;
    }
    if (updates.quantity !== undefined && updates.quantity !== current.quantity) {
      previousValues.quantity = current.quantity;
      newValues.quantity = updates.quantity;
    }

    // Only log if there are actual changes
    if (Object.keys(newValues).length > 0) {
      await supabase.from('inquiry_logs').insert([{
        inquiry_id: inquiryId,
        action: 'updated',
        previous_values: previousValues,
        new_values: newValues,
        performed_by: session.username || 'admin',
      }]);
    }

    revalidatePath('/admin/dashboard');
    revalidatePath('/operations/dashboard');
    return { success: true, inquiry: data as LeadInquiry };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function deleteInquiry(inquiryId: string) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && session.role !== 'operations')) {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    // Delete related confirmations first (cascade should handle this, but be explicit)
    await supabase
      .from('inquiry_confirmations')
      .delete()
      .eq('inquiry_id', inquiryId);

    // Delete related logs
    await supabase
      .from('inquiry_logs')
      .delete()
      .eq('inquiry_id', inquiryId);

    // Delete the inquiry itself
    const { error } = await supabase
      .from('lead_inquiries')
      .delete()
      .eq('id', inquiryId);

    if (error) return { error: error.message };

    revalidatePath('/admin/dashboard');
    revalidatePath('/sales-agent/dashboard');
    revalidatePath('/operations/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getInquiryLogs(inquiryId: string) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('inquiry_logs')
      .select('*')
      .eq('inquiry_id', inquiryId)
      .order('performed_at', { ascending: false });

    if (error) return { error: error.message };
    return { logs: (data || []) as InquiryLog[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getInquiryLogsForLead(leadId: string) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && session.role !== 'operations')) {
      return { error: 'Unauthorized' };
    }

    if (!leadId) return { error: 'Lead id is required' };

    const supabase = await createAdminClient();

    const { data: inquiryRows, error: inquiryErr } = await supabase
      .from('lead_inquiries')
      .select('id')
      .eq('lead_id', leadId);

    if (inquiryErr) return { error: inquiryErr.message };

    const inquiryIds = (inquiryRows || []).map((r) => r.id);
    if (inquiryIds.length === 0) return { logs: [] as InquiryLog[] };

    const { data, error } = await supabase
      .from('inquiry_logs')
      .select('*')
      .in('inquiry_id', inquiryIds)
      .order('performed_at', { ascending: true });

    if (error) return { error: error.message };
    return { logs: (data || []) as InquiryLog[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function addInquiryLogNote(inquiryId: string, note: string) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && session.role !== 'operations')) {
      return { error: 'Unauthorized' };
    }

    if (!inquiryId || !note.trim()) {
      return { error: 'Inquiry id and note are required' };
    }

    const supabase = await createAdminClient();

    const { error } = await supabase
      .from('inquiry_logs')
      .insert([{
        inquiry_id: inquiryId,
        action: 'log_note',
        previous_values: null,
        new_values: { note: note.trim() },
        performed_by: session.username || 'operations',
      }]);

    if (error) return { error: error.message };

    revalidatePath('/admin/dashboard');
    revalidatePath('/operations/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function addInquiryActivity(
  inquiryId: string,
  summary: string,
  dueDate: string | null
) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && session.role !== 'operations')) {
      return { error: 'Unauthorized' };
    }

    if (!inquiryId || !summary.trim()) {
      return { error: 'Inquiry id and activity summary are required' };
    }

    const supabase = await createAdminClient();

    const { error } = await supabase
      .from('inquiry_logs')
      .insert([{
        inquiry_id: inquiryId,
        action: 'activity',
        previous_values: null,
        new_values: {
          summary: summary.trim(),
          due_date: dueDate || null,
        },
        performed_by: session.username || 'operations',
      }]);

    if (error) return { error: error.message };

    revalidatePath('/admin/dashboard');
    revalidatePath('/operations/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function createInquiryQuotation(
  inquiryId: string,
  leadId: string,
  customerName: string,
  productService: string,
  quantity: number,
  unitPrice: number,
  totalAmount: number,
  notes: string | null
) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    // Get current version count
    const { data: existing } = await supabase
      .from('inquiry_quotations')
      .select('version')
      .eq('inquiry_id', inquiryId)
      .order('version', { ascending: false })
      .limit(1);

    const nextVersion = existing && existing.length > 0 ? existing[0].version + 1 : 1;

    // Generate quotation number
    const year = new Date().getFullYear();
    const quotationNumber = `IQ/${year}/${String(nextVersion).padStart(4, '0')}-${leadId.substring(0, 4).toUpperCase()}`;

    const { data, error } = await supabase
      .from('inquiry_quotations')
      .insert([{
        inquiry_id: inquiryId,
        lead_id: leadId,
        quotation_number: quotationNumber,
        customer_name: customerName.trim(),
        product_service: productService.trim(),
        quantity,
        unit_price: unitPrice,
        total_amount: totalAmount,
        notes: notes?.trim() || null,
        created_by: session.username || 'admin',
        version: nextVersion,
      }])
      .select()
      .single();

    if (error) return { error: error.message };

    // Update inquiry status
    await supabase
      .from('lead_inquiries')
      .update({
        status: 'quotation_sent',
        updated_at: new Date().toISOString(),
      })
      .eq('id', inquiryId);

    revalidatePath('/admin/dashboard');
    revalidatePath('/sales-agent/dashboard');
    return { success: true, quotation: data as InquiryQuotation };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getQuotationsForInquiry(inquiryId: string) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('inquiry_quotations')
      .select('*')
      .eq('inquiry_id', inquiryId)
      .order('version', { ascending: false });

    if (error) return { error: error.message };
    return { quotations: (data || []) as InquiryQuotation[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function markQuotationSentToClient(quotationId: string) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('inquiry_quotations')
      .update({
        sent_to_client: true,
        sent_to_client_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', quotationId)
      .select()
      .single();

    if (error) return { error: error.message };

    revalidatePath('/admin/dashboard');
    return { success: true, quotation: data as InquiryQuotation };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function markQuotationSentToAgent(quotationId: string) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('inquiry_quotations')
      .update({
        sent_to_agent: true,
        sent_to_agent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', quotationId)
      .select()
      .single();

    if (error) return { error: error.message };

    revalidatePath('/admin/dashboard');
    revalidatePath('/sales-agent/dashboard');
    return { success: true, quotation: data as InquiryQuotation };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function uploadInquiryImage(leadId: string, file: File) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();

    const fileExt = file.name.split('.').pop();
    const fileName = `inquiry_${leadId}_${Date.now()}.${fileExt}`;
    const filePath = `inquiries/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('inquiry-images')
      .upload(filePath, file);

    if (uploadError) {
      // If bucket doesn't exist, store as data URL fallback
      return { error: 'Image upload not available. Please add a link instead.' };
    }

    const { data: urlData } = supabase.storage
      .from('inquiry-images')
      .getPublicUrl(filePath);

    return { success: true, url: urlData.publicUrl };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}
