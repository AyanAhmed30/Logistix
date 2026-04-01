'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

export type ConfirmationStatus = 'pending' | 'approved' | 'rejected';

export type InquiryConfirmation = {
  id: string;
  inquiry_id: string;
  lead_id: string;
  lead_number: string;
  product_name: string;
  total_weight: string;
  cbm: string;
  quantity: string;
  hs_code: string;
  calculator_values: Record<string, string> | null;
  original_image_url: string | null;
  additional_image_1_url: string | null;
  additional_image_2_url: string | null;
  status: ConfirmationStatus;
  submitted_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InquiryConfirmationWithLead = InquiryConfirmation & {
  leads: {
    id: string;
    name: string;
    number: string;
    lead_id_formatted: string | null;
    source: string;
    sales_agent_id: string;
    sales_agents?: {
      id: string;
      name: string;
      username: string | null;
    } | null;
  } | null;
};

// ─── Fetch inquiry details by 6-digit lead number ───────────────────

export async function getInquiryByLeadNumber(leadNumber: string) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && session.role !== 'operations')) {
      return { error: 'Unauthorized' };
    }

    if (!leadNumber || leadNumber.trim().length !== 6) {
      return { error: 'Please enter a valid 6-digit lead number.' };
    }

    const supabase = await createAdminClient();

    // Find the lead by lead_id_formatted
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select(`
        id,
        name,
        number,
        lead_id_formatted,
        source,
        sales_agent_id,
        sales_agents (
          id,
          name,
          username
        )
      `)
      .eq('lead_id_formatted', leadNumber.trim())
      .maybeSingle();

    if (leadError) return { error: leadError.message };
    if (!lead) return { error: 'No lead found with this number.' };

    // Find the inquiry for this lead
    const { data: inquiry, error: inquiryError } = await supabase
      .from('lead_inquiries')
      .select('*')
      .eq('lead_id', lead.id)
      .eq('sent_to_accounting', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inquiryError) return { error: inquiryError.message };
    if (!inquiry) return { error: 'No inquiry found for this lead.' };

    return {
      lead,
      inquiry: {
        id: inquiry.id,
        product_name: inquiry.product_name || '',
        total_weight: inquiry.total_weight || '',
        cbm: inquiry.cbm || '',
        quantity: inquiry.quantity || '',
        image_url: inquiry.image_url || null,
        description: inquiry.description || '',
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

// ─── Submit inquiry for confirmation (Operations → Admin) ───────────

export async function submitInquiryForConfirmation(data: {
  inquiry_id: string;
  lead_id: string;
  lead_number: string;
  product_name: string;
  total_weight: string;
  cbm: string;
  quantity: string;
  hs_code: string;
  calculator_values: Record<string, string>;
  original_image_url: string | null;
  additional_image_1_url: string | null;
  additional_image_2_url: string | null;
}) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && session.role !== 'operations')) {
      return { error: 'Unauthorized' };
    }

    if (!data.product_name.trim()) {
      return { error: 'Product Name is required.' };
    }

    const supabase = await createAdminClient();
    const { data: currentInquiry } = await supabase
      .from('lead_inquiries')
      .select('product_name, total_weight, cbm, quantity')
      .eq('id', data.inquiry_id)
      .maybeSingle();

    const { data: result, error } = await supabase
      .from('inquiry_confirmations')
      .insert([{
        inquiry_id: data.inquiry_id,
        lead_id: data.lead_id,
        lead_number: data.lead_number.trim(),
        product_name: data.product_name.trim(),
        total_weight: data.total_weight.trim(),
        cbm: data.cbm.trim(),
        quantity: data.quantity.trim(),
        hs_code: (data.hs_code || '').trim(),
        calculator_values: data.calculator_values || {},
        original_image_url: data.original_image_url || null,
        additional_image_1_url: data.additional_image_1_url || null,
        additional_image_2_url: data.additional_image_2_url || null,
        status: 'pending',
        submitted_by: session.username || 'admin',
      }])
      .select()
      .single();

    if (error) return { error: error.message };

    const previousValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};
    if (currentInquiry) {
      if ((currentInquiry.product_name || '') !== (data.product_name || '').trim()) {
        previousValues.product_name = currentInquiry.product_name || '';
        newValues.product_name = data.product_name.trim();
      }
      if ((currentInquiry.total_weight || '') !== (data.total_weight || '').trim()) {
        previousValues.total_weight = currentInquiry.total_weight || '';
        newValues.total_weight = data.total_weight.trim();
      }
      if ((currentInquiry.cbm || '') !== (data.cbm || '').trim()) {
        previousValues.cbm = currentInquiry.cbm || '';
        newValues.cbm = data.cbm.trim();
      }
      if ((currentInquiry.quantity || '') !== (data.quantity || '').trim()) {
        previousValues.quantity = currentInquiry.quantity || '';
        newValues.quantity = data.quantity.trim();
      }
    }

    if ((data.hs_code || '').trim().length > 0) {
      newValues.hs_code = data.hs_code.trim();
    }
    if (data.calculator_values && Object.keys(data.calculator_values).length > 0) {
      newValues.calculator_values = data.calculator_values;
    }

    if (Object.keys(newValues).length > 0) {
      await supabase.from('inquiry_logs').insert([{
        inquiry_id: data.inquiry_id,
        action: 'lead_management_form_updated',
        previous_values: previousValues,
        new_values: newValues,
        performed_by: session.username || 'operations',
      }]);
    }

    const hasAdditionalImages = !!data.additional_image_1_url || !!data.additional_image_2_url;
    if (hasAdditionalImages) {
      await supabase.from('inquiry_logs').insert([{
        inquiry_id: data.inquiry_id,
        action: 'image_uploaded',
        previous_values: null,
        new_values: {
          additional_image_1: data.additional_image_1_url ? 'Attached' : 'None',
          additional_image_2: data.additional_image_2_url ? 'Attached' : 'None',
        },
        performed_by: session.username || 'operations',
      }]);
    }

    await supabase.from('inquiry_logs').insert([{
      inquiry_id: data.inquiry_id,
      action: 'send_for_confirmation',
      previous_values: null,
      new_values: {
        confirmation_id: result.id,
        status: 'pending',
      },
      performed_by: session.username || 'operations',
    }]);

    // Notify the Sales Agent that inquiry was forwarded to Admin for approval.
    const { data: lead } = await supabase
      .from('leads')
      .select('lead_id_formatted, sales_agent_id')
      .eq('id', data.lead_id)
      .maybeSingle();
    if (lead?.sales_agent_id) {
      const { data: salesAgent } = await supabase
        .from('sales_agents')
        .select('username')
        .eq('id', lead.sales_agent_id)
        .maybeSingle();
      if (salesAgent?.username) {
        await supabase.from('inquiry_lifecycle_notifications').insert([{
          lead_id: data.lead_id,
          inquiry_id: data.inquiry_id,
          confirmation_id: result.id,
          sender_role: 'operations',
          sender_username: session.username || 'operations',
          recipient_role: 'sales_agent',
          recipient_username: salesAgent.username,
          event_type: 'sent_for_admin_approval',
          message: `Inquiry for Lead #${lead.lead_id_formatted || data.lead_number} was forwarded to Admin for approval.`,
        }]);
      }
    }

    revalidatePath('/admin/dashboard');
    revalidatePath('/operations/dashboard');
    return { success: true, confirmation: result as InquiryConfirmation };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

// ─── Get all confirmations (for Admin Inquiry Confirmation tab) ─────

export async function getAllInquiryConfirmations() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('inquiry_confirmations')
      .select(`
        *,
        leads (
          id,
          name,
          number,
          lead_id_formatted,
          source,
          sales_agent_id,
          sales_agents (
            id,
            name,
            username
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (error) return { error: error.message };
    return { confirmations: (data || []) as InquiryConfirmationWithLead[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

// ─── Get confirmations for a specific inquiry ───────────────────────

export async function getConfirmationsForInquiry(inquiryId: string) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && session.role !== 'operations')) {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('inquiry_confirmations')
      .select('*')
      .eq('inquiry_id', inquiryId)
      .order('created_at', { ascending: false });

    if (error) return { error: error.message };
    return { confirmations: (data || []) as InquiryConfirmation[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

// ─── Admin: Approve confirmation ────────────────────────────────────

export async function approveInquiryConfirmation(confirmationId: string) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('inquiry_confirmations')
      .update({
        status: 'approved',
        reviewed_by: session.username || 'admin',
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', confirmationId)
      .select()
      .single();

    if (error) return { error: error.message };

    // Notify Sales Agent + Operations submitter about approval.
    const { data: lead } = await supabase
      .from('leads')
      .select('lead_id_formatted, sales_agent_id')
      .eq('id', data.lead_id)
      .maybeSingle();
    const recipients: Array<{ role: 'sales_agent' | 'operations'; username: string }> = [];
    if (lead?.sales_agent_id) {
      const { data: salesAgent } = await supabase
        .from('sales_agents')
        .select('username')
        .eq('id', lead.sales_agent_id)
        .maybeSingle();
      if (salesAgent?.username) {
        recipients.push({ role: 'sales_agent', username: salesAgent.username });
      }
    }
    if (data.submitted_by) {
      recipients.push({ role: 'operations', username: data.submitted_by });
    }
    const uniqueRecipients = recipients.filter(
      (r, idx, arr) => arr.findIndex((x) => x.role === r.role && x.username === r.username) === idx
    );
    if (uniqueRecipients.length > 0) {
      await supabase.from('inquiry_lifecycle_notifications').insert(
        uniqueRecipients.map((r) => ({
          lead_id: data.lead_id,
          inquiry_id: data.inquiry_id,
          confirmation_id: data.id,
          sender_role: 'admin',
          sender_username: session.username || 'admin',
          recipient_role: r.role,
          recipient_username: r.username,
          event_type: 'approved',
          message: `Inquiry for Lead #${lead?.lead_id_formatted || data.lead_number} was approved by Admin.`,
        }))
      );
    }

    revalidatePath('/admin/dashboard');
    revalidatePath('/operations/dashboard');
    revalidatePath('/sales-agent/dashboard'); // Sales agent should see approved status
    return { success: true, confirmation: data as InquiryConfirmation };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

// ─── Admin: Reject confirmation ─────────────────────────────────────

export async function rejectInquiryConfirmation(confirmationId: string) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('inquiry_confirmations')
      .update({
        status: 'rejected',
        reviewed_by: session.username || 'admin',
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', confirmationId)
      .select()
      .single();

    if (error) return { error: error.message };

    // Notify only the Operations submitter about rejection.
    const { data: lead } = await supabase
      .from('leads')
      .select('lead_id_formatted')
      .eq('id', data.lead_id)
      .maybeSingle();
    if (data.submitted_by) {
      await supabase.from('inquiry_lifecycle_notifications').insert([{
        lead_id: data.lead_id,
        inquiry_id: data.inquiry_id,
        confirmation_id: data.id,
        sender_role: 'admin',
        sender_username: session.username || 'admin',
        recipient_role: 'operations',
        recipient_username: data.submitted_by,
        event_type: 'rejected',
        message: `Inquiry for Lead #${lead?.lead_id_formatted || data.lead_number} was rejected by Admin.`,
      }]);
    }

    revalidatePath('/admin/dashboard');
    revalidatePath('/operations/dashboard');
    return { success: true, confirmation: data as InquiryConfirmation };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

// ─── Upload additional image ────────────────────────────────────────

export async function uploadConfirmationImage(file: File, label: string) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();

    const fileExt = file.name.split('.').pop();
    const fileName = `confirmation_${label}_${Date.now()}.${fileExt}`;
    const filePath = `confirmations/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('inquiry-images')
      .upload(filePath, file);

    if (uploadError) {
      return { error: 'Image upload failed. Please try again.' };
    }

    const { data: urlData } = supabase.storage
      .from('inquiry-images')
      .getPublicUrl(filePath);

    return { success: true, url: urlData.publicUrl };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}
