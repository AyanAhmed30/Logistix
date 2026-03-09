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
  status: InquiryStatus;
  sent_to_accounting: boolean;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadInquiryWithLead = LeadInquiry & {
  leads: {
    id: string;
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
  description: string,
  imageUrl: string | null,
  linkUrl: string | null
) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();

    // Check if inquiry already exists for this lead
    const { data: existing } = await supabase
      .from('lead_inquiries')
      .select('id')
      .eq('lead_id', leadId)
      .maybeSingle();

    if (existing) {
      // Update existing inquiry
      const { data, error } = await supabase
        .from('lead_inquiries')
        .update({
          description: description.trim(),
          image_url: imageUrl || null,
          link_url: linkUrl || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) return { error: error.message };
      return { success: true, inquiry: data as LeadInquiry };
    } else {
      // Create new inquiry
      const { data, error } = await supabase
        .from('lead_inquiries')
        .insert([{
          lead_id: leadId,
          description: description.trim(),
          image_url: imageUrl || null,
          link_url: linkUrl || null,
          status: 'pending',
          sent_to_accounting: false,
        }])
        .select()
        .single();

      if (error) return { error: error.message };
      return { success: true, inquiry: data as LeadInquiry };
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

    // Get inquiry for this lead
    const { data: inquiry, error: inquiryError } = await supabase
      .from('lead_inquiries')
      .select('*')
      .eq('lead_id', leadId)
      .maybeSingle();

    if (inquiryError || !inquiry) {
      return { error: 'No inquiry found for this lead. Please add inquiry details first.' };
    }

    if (!inquiry.description || inquiry.description.trim() === '') {
      return { error: 'Please add inquiry description before sending.' };
    }

    // Update inquiry status
    const { data, error } = await supabase
      .from('lead_inquiries')
      .update({
        sent_to_accounting: true,
        sent_at: new Date().toISOString(),
        status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', inquiry.id)
      .select()
      .single();

    if (error) return { error: error.message };

    revalidatePath('/sales-agent/dashboard');
    revalidatePath('/admin/dashboard');
    return { success: true, inquiry: data as LeadInquiry };
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
      .maybeSingle();

    if (error) return { error: error.message };
    return { inquiry: (data as LeadInquiry) || null };
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
          name,
          number,
          source,
          sales_agent_id,
          sales_agents (
            id,
            name,
            username
          )
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
  }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
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
      previousValues.image_url = current.image_url;
      newValues.image_url = updates.image_url;
    }
    if (updates.link_url !== undefined && updates.link_url !== current.link_url) {
      previousValues.link_url = current.link_url;
      newValues.link_url = updates.link_url;
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
    return { success: true, inquiry: data as LeadInquiry };
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
