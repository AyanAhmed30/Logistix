'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';
import {
  validateInquiryProductInfoForSend,
  type InquiryProductFields,
} from '@/lib/inquiry-form-validation';
import {
  getEmptyCalculatorValues,
  parseStoredCalculatorPayload,
  sanitizeCalculatorValues,
  serializeCalculatorPayload,
  SHARED_CALCULATOR_DEFAULT_KEYS,
  withDerivedInvValue,
} from '@/lib/inquiry-calculator';
import { uploadToInquiryImagesBucket } from '@/lib/inquiry-storage';

export type InquiryStatus = 'pending' | 'in_progress' | 'quotation_sent' | 'completed';

type InquiryConfirmationLite = {
  id: string;
  status: string;
  created_at: string;
};

/** Fields required by the sales-agent inquiry workspace list/detail UI (excludes heavy JSON blobs). */
const SALES_AGENT_LEAD_INQUIRIES_SELECT = `
  id,
  lead_id,
  inquiry_group_id,
  version_number,
  is_current_version,
  description,
  image_url,
  additional_image_urls,
  product_name,
  total_weight,
  cbm,
  quantity,
  status,
  sent_to_accounting,
  sent_to_operations,
  sent_at,
  approval_status,
  approved_at,
  created_at,
  updated_at,
  inquiry_confirmations (
    id,
    status,
    created_at
  )
`;

function sanitizeInquiriesForSession(
  rows: (LeadInquiry & { inquiry_confirmations?: InquiryConfirmationLite[] })[],
  role: string
) {
  const visibleRows =
    role === 'sales_agent' ? rows.filter((row) => row.approval_status !== 'rejected') : rows;
  const sanitized = visibleRows.map((row) => ({
    ...row,
    inquiry_confirmations:
      role === 'sales_agent'
        ? (row.inquiry_confirmations || []).filter((c) => c.status === 'approved')
        : (row.inquiry_confirmations || []),
  }));

  const approvedCandidate = [...sanitized]
    .filter(
      (row) =>
        row.approval_status === 'approved' ||
        (row.inquiry_confirmations || []).some((c) => c.status === 'approved')
    )
    .sort((a, b) => {
      const aApproved =
        a.approved_at ||
        (a.inquiry_confirmations || []).find((c) => c.status === 'approved')?.created_at ||
        a.updated_at;
      const bApproved =
        b.approved_at ||
        (b.inquiry_confirmations || []).find((c) => c.status === 'approved')?.created_at ||
        b.updated_at;
      return new Date(bApproved || 0).getTime() - new Date(aApproved || 0).getTime();
    })[0];

  return {
    inquiries: sanitized,
    approvedInquiryId: approvedCandidate?.id || null,
  };
}

export async function listInquiriesForLead(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  leadId: string,
  role: string
) {
  const { data, error } = await supabase
    .from('lead_inquiries')
    .select(SALES_AGENT_LEAD_INQUIRIES_SELECT)
    .eq('lead_id', leadId)
    .order('version_number', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) return { error: error.message };

  return sanitizeInquiriesForSession(
    (data || []) as (LeadInquiry & { inquiry_confirmations?: InquiryConfirmationLite[] })[],
    role
  );
}

export type LeadInquiry = {
  id: string;
  lead_id: string;
  inquiry_group_id?: string;
  version_number?: number;
  is_current_version?: boolean;
  description: string;
  image_url: string | null;
  additional_image_urls?: string[] | null;
  link_url: string | null;
  product_name: string;
  total_weight: string;
  cbm: string;
  quantity: string;
  status: InquiryStatus;
  sent_to_accounting: boolean;
  sent_to_operations: boolean;
  sent_at: string | null;
  approval_status?: 'sent' | 'approved' | 'rejected';
  approved_at?: string | null;
  calculator_values: Record<string, string> | Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  inquiry_confirmations?: {
    original_image_url: string | null;
    id: string;
    status: string;
    created_at: string;
  }[];
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
    original_image_url: string | null;
    sales_additional_image_urls?: string[] | null;
    additional_image_1_url?: string | null;
    additional_image_2_url?: string | null;
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

export type LeadActivityAction =
  | 'lead_created'
  | 'lead_updated'
  | 'inquiry_created_draft'
  | 'inquiry_edited'
  | 'inquiry_sent'
  | 'inquiry_resent'
  | 'inquiry_viewed'
  | 'inquiry_status_changed';

export type LeadActivityLog = {
  id: string;
  lead_id: string;
  inquiry_id: string | null;
  inquiry_version: number | null;
  action_type: LeadActivityAction;
  action_label: string;
  metadata: Record<string, unknown> | null;
  previous_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  performed_by: string;
  performed_at: string;
};

export type LeadChatMessage = {
  id: string;
  lead_id: string;
  inquiry_id: string | null;
  message: string;
  sender_role: 'sales_agent' | 'operations' | 'admin';
  sender_username: string;
  created_at: string;
};

export type LeadChatNotification = {
  id: string;
  chat_message_id: string;
  lead_id: string;
  inquiry_id: string | null;
  sender_role: 'sales_agent' | 'operations' | 'admin';
  sender_username: string;
  recipient_role: 'sales_agent' | 'operations' | 'admin';
  recipient_username: string;
  is_read: boolean;
  created_at: string;
  notification_type?: 'chat' | 'lifecycle';
  event_type?: 'inquiry_sent' | 'sent_for_admin_approval' | 'approved' | 'rejected' | 'lead_transferred';
  message?: string;
  leads?: {
    lead_id_formatted: string | null;
  } | null;
};

type OperationsInquiriesPage = {
  inquiries: LeadInquiryWithLead[];
  hasMore: boolean;
  nextOffset: number;
};

const OPERATIONS_INQUIRY_CACHE_TTL_MS = 30000;
const OPERATIONS_INQUIRY_CACHE_MAX_ENTRIES = 120;
const operationsInquiriesCache = new Map<string, { expiresAt: number; data: OperationsInquiriesPage }>();

function buildOperationsInquiriesCacheKey(input: { role: string; limit: number; offset: number; search: string }) {
  return `${input.role}|${input.limit}|${input.offset}|${input.search.toLowerCase()}`;
}

function readOperationsInquiriesCache(key: string) {
  const now = Date.now();
  const hit = operationsInquiriesCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    operationsInquiriesCache.delete(key);
    return null;
  }
  return hit.data;
}

function writeOperationsInquiriesCache(key: string, data: OperationsInquiriesPage) {
  if (operationsInquiriesCache.size >= OPERATIONS_INQUIRY_CACHE_MAX_ENTRIES) {
    operationsInquiriesCache.clear();
  }
  operationsInquiriesCache.set(key, {
    expiresAt: Date.now() + OPERATIONS_INQUIRY_CACHE_TTL_MS,
    data,
  });
}

function invalidateOperationsInquiriesCache() {
  operationsInquiriesCache.clear();
}

async function canAccessLeadChat(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  session: Awaited<ReturnType<typeof getSession>>,
  leadId: string
): Promise<{ allowed: boolean; error?: string }> {
  if (!session) return { allowed: false, error: 'Unauthorized' };
  if (!leadId) return { allowed: false, error: 'Lead id is required' };

  if (session.role === 'admin' || session.role === 'operations') {
    return { allowed: true };
  }

  if (session.role === 'sales_agent') {
    const { data: salesAgent } = await supabase
      .from('sales_agents')
      .select('id')
      .eq('username', session.username)
      .maybeSingle();

    if (!salesAgent) return { allowed: false, error: 'Unauthorized' };

    const { data: lead } = await supabase
      .from('leads')
      .select('id')
      .eq('id', leadId)
      .eq('sales_agent_id', salesAgent.id)
      .maybeSingle();

    return { allowed: !!lead, error: lead ? undefined : 'Unauthorized' };
  }

  return { allowed: false, error: 'Unauthorized' };
}

function toComparableValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

function isValidDecimal(value: string) {
  if (!value.trim()) return true;
  return /^(?:\d+|\d+\.\d+|\d*\.\d+)$/.test(value.trim());
}

type InquirySaveTargetRow = {
  id: string;
  lead_id: string;
  sent_to_accounting: boolean;
};

function inquiryIsSent(row: Pick<InquirySaveTargetRow, 'sent_to_accounting'>) {
  return Boolean(row.sent_to_accounting);
}

async function getNextInquiryVersionNumber(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  leadId: string
) {
  const { data: maxVersionRow } = await supabase
    .from('lead_inquiries')
    .select('version_number')
    .eq('lead_id', leadId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  return maxVersionRow?.version_number ? Number(maxVersionRow.version_number) + 1 : 1;
}

async function addLeadActivityLog(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  input: {
    leadId: string;
    inquiryId?: string | null;
    inquiryVersion?: number | null;
    actionType: LeadActivityAction;
    actionLabel: string;
    performedBy: string;
    metadata?: Record<string, unknown> | null;
    previousValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
  }
) {
  const { error } = await supabase.from('lead_activity_logs').insert([
    {
      lead_id: input.leadId,
      inquiry_id: input.inquiryId || null,
      inquiry_version: input.inquiryVersion ?? null,
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

// ========== Sales Agent Actions ==========

export async function saveInquiry(
  leadId: string,
  data: {
    product_name: string;
    total_weight: string;
    cbm: string;
    quantity: string;
    image_url: string | null;
    additional_image_urls?: string[] | null;
    description: string;
  },
  inquiryId?: string,
  options?: {
    forceNewInquiry?: boolean;
  }
) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();

    const forceNewInquiry = Boolean(options?.forceNewInquiry);
    const explicitInquiryId = forceNewInquiry ? undefined : inquiryId;

    let targetRow: InquirySaveTargetRow | null = null;

    if (explicitInquiryId) {
      const { data: row } = await supabase
        .from('lead_inquiries')
        .select('id, lead_id, sent_to_accounting')
        .eq('id', explicitInquiryId)
        .maybeSingle();
      targetRow = (row as InquirySaveTargetRow | null) || null;
    } else if (!forceNewInquiry) {
      const { data: row } = await supabase
        .from('lead_inquiries')
        .select('id, lead_id, sent_to_accounting')
        .eq('lead_id', leadId)
        .order('version_number', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      targetRow = (row as InquirySaveTargetRow | null) || null;
    }

    const shouldUpdateExisting =
      Boolean(targetRow?.id) &&
      (Boolean(explicitInquiryId) || !inquiryIsSent(targetRow as InquirySaveTargetRow));

    const inquiryData = {
      product_name: data.product_name.trim(),
      total_weight: data.total_weight.trim(),
      cbm: data.cbm.trim(),
      quantity: data.quantity.trim(),
      description: data.description.trim(),
      image_url: data.image_url || null,
      additional_image_urls: Array.isArray(data.additional_image_urls) ? data.additional_image_urls : [],
      updated_at: new Date().toISOString(),
    };

    if (!isValidDecimal(inquiryData.cbm)) {
      return { error: 'CBM must be a valid decimal number (e.g. 1.5).' };
    }

    if (shouldUpdateExisting && targetRow?.id) {
      // Update an existing unsent draft, or an explicitly selected inquiry.
      const { data: current, error: currentError } = await supabase
        .from('lead_inquiries')
        .select('*')
        .eq('id', targetRow.id)
        .single();

      if (currentError || !current) {
        return { error: 'Inquiry not found for update' };
      }
      if (current.lead_id !== leadId) {
        return { error: 'Inquiry does not belong to this lead' };
      }

      const { data: result, error } = await supabase
        .from('lead_inquiries')
        .update(inquiryData)
        .eq('id', targetRow.id)
        .select()
        .single();

      if (error) return { error: error.message };

      // Log only when there are actual field changes.
      const previousValues: Record<string, unknown> = {};
      const newValues: Record<string, unknown> = {};

      if (toComparableValue(inquiryData.description) !== toComparableValue(current.description)) {
        previousValues.description = current.description;
        newValues.description = inquiryData.description;
      }
      if (toComparableValue(inquiryData.image_url) !== toComparableValue(current.image_url)) {
        previousValues.image_url = current.image_url ? 'Attached' : 'None';
        newValues.image_url = inquiryData.image_url ? 'Attached' : 'Removed';
      }
      if (toComparableValue(inquiryData.product_name) !== toComparableValue(current.product_name)) {
        previousValues.product_name = current.product_name;
        newValues.product_name = inquiryData.product_name;
      }
      if (toComparableValue(inquiryData.total_weight) !== toComparableValue(current.total_weight)) {
        previousValues.total_weight = current.total_weight;
        newValues.total_weight = inquiryData.total_weight;
      }
      if (toComparableValue(inquiryData.cbm) !== toComparableValue(current.cbm)) {
        previousValues.cbm = current.cbm;
        newValues.cbm = inquiryData.cbm;
      }
      if (toComparableValue(inquiryData.quantity) !== toComparableValue(current.quantity)) {
        previousValues.quantity = current.quantity;
        newValues.quantity = inquiryData.quantity;
      }

      if (Object.keys(newValues).length > 0) {
        await supabase.from('inquiry_logs').insert([
          {
            inquiry_id: targetRow.id,
            action: 'inquiry_edited',
            previous_values: previousValues,
            new_values: newValues,
            performed_by: session.username || 'sales-agent',
          },
        ]);
        await addLeadActivityLog(supabase, {
          leadId,
          inquiryId: targetRow.id,
          inquiryVersion: null,
          actionType: 'inquiry_edited',
          actionLabel: 'Inquiry updated',
          performedBy: session.username || 'sales-agent',
          previousValues,
          newValues,
        });
      }

      return { success: true, inquiry: result as LeadInquiry };
    } else {
      // Always insert a new row for additional inquiries on the same lead.
      const nextVersion = await getNextInquiryVersionNumber(supabase, leadId);
      const versionGroupId = crypto.randomUUID();

      const { data: result, error } = await supabase
        .from('lead_inquiries')
        .insert([{
          lead_id: leadId,
          inquiry_group_id: versionGroupId,
          version_number: nextVersion,
          is_current_version: true,
          ...inquiryData,
          status: 'pending',
          sent_to_accounting: false,
          sent_to_operations: false,
          approval_status: 'draft',
          approved_at: null,
        }])
        .select()
        .single();

      if (error) return { error: error.message };

      await supabase.from('inquiry_logs').insert([
        {
          inquiry_id: result.id,
          action: 'inquiry_created_draft',
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

      await addLeadActivityLog(supabase, {
        leadId,
        inquiryId: result.id,
        inquiryVersion: nextVersion,
        actionType: 'inquiry_created_draft',
        actionLabel: 'Inquiry created (draft)',
        performedBy: session.username || 'sales-agent',
        newValues: {
          product_name: inquiryData.product_name,
          total_weight: inquiryData.total_weight,
          cbm: inquiryData.cbm,
          quantity: inquiryData.quantity,
          description: inquiryData.description,
          version_number: nextVersion,
        },
      });

      return { success: true, inquiry: result as LeadInquiry };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function sendInquiryToAccounting(inquiryId: string) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();

    const { data: inquiry, error: inquiryError } = await supabase
      .from('lead_inquiries')
      .select('*')
      .eq('id', inquiryId)
      .maybeSingle();

    if (inquiryError || !inquiry) {
      return { error: 'Inquiry not found. Please add inquiry details first.' };
    }

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
        .eq('id', inquiry.lead_id)
        .maybeSingle();
      if (!lead || lead.sales_agent_id !== salesAgent.id) {
        return { error: 'Unauthorized' };
      }
    }

    if (!inquiry.product_name || inquiry.product_name.trim() === '') {
      return { error: 'Please add a product name before sending.' };
    }

    const sendFieldCheck = validateInquiryProductInfoForSend({
      product_name: inquiry.product_name || '',
      total_weight: inquiry.total_weight || '',
      cbm: inquiry.cbm || '',
      quantity: inquiry.quantity || '',
    });
    if (!sendFieldCheck.valid) {
      const firstError = Object.values(sendFieldCheck.errors)[0];
      return { error: firstError || 'Please complete all required product information before sending.' };
    }

    // Update inquiry status - send to accounting (operations reads from same flag)
    const updatePayload: Record<string, unknown> = {
      sent_to_accounting: true,
      sent_at: new Date().toISOString(),
      approval_status: 'sent',
      approved_at: null,
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

    const wasAlreadySent = Boolean(inquiry.sent_to_accounting);
    const action = wasAlreadySent ? 'inquiry_resent' : 'inquiry_sent';
    const actionLabel = wasAlreadySent ? 'Inquiry Re-Sent' : 'Inquiry Sent';

    const [{ data: leadForNotification }, { data: operationsUsers }] = await Promise.all([
      supabase.from('leads').select('lead_id_formatted').eq('id', inquiry.lead_id).maybeSingle(),
      supabase.from('operations_users').select('username'),
    ]);

    await Promise.all([
      supabase.from('inquiry_logs').insert([
        {
          inquiry_id: inquiry.id,
          action,
          previous_values: { sent_to_accounting: inquiry.sent_to_accounting, sent_at: inquiry.sent_at },
          new_values: {
            sent_to_accounting: true,
            sent_at: updatePayload.sent_at,
          },
          performed_by: session.username || 'sales-agent',
        },
      ]),
      addLeadActivityLog(supabase, {
        leadId: inquiry.lead_id,
        inquiryId: inquiry.id,
        inquiryVersion: inquiry.version_number || null,
        actionType: wasAlreadySent ? 'inquiry_resent' : 'inquiry_sent',
        actionLabel,
        performedBy: session.username || 'sales-agent',
        previousValues: { sent_to_accounting: inquiry.sent_to_accounting, sent_at: inquiry.sent_at },
        newValues: { sent_to_accounting: true, sent_at: updatePayload.sent_at },
      }),
    ]);

    const leadNumber = leadForNotification?.lead_id_formatted || 'N/A';
    const recipients = (operationsUsers || [])
      .map((u) => u.username)
      .filter((u): u is string => !!u);

    if (recipients.length > 0) {
      await supabase.from('inquiry_lifecycle_notifications').insert(
        recipients.map((username) => ({
          lead_id: inquiry.lead_id,
          inquiry_id: inquiry.id,
          confirmation_id: null,
          sender_role: 'sales_agent',
          sender_username: session.username || 'sales-agent',
          recipient_role: 'operations',
          recipient_username: username,
          event_type: 'inquiry_sent',
          message: `Inquiry sent by Sales Agent for Lead #${leadNumber}.`,
        }))
      );
    }

    revalidatePath('/sales-agent/dashboard');
    revalidatePath('/admin/dashboard');
    revalidatePath('/operations/dashboard');
    invalidateOperationsInquiriesCache();
    return { success: true, inquiry: data as LeadInquiry };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function saveAndSendInquiry(
  leadId: string,
  data: InquiryProductFields & {
    image_url: string | null;
    additional_image_urls?: string[] | null;
    description: string;
  },
  inquiryId?: string,
  options?: {
    forceNewInquiry?: boolean;
  }
) {
  const validation = validateInquiryProductInfoForSend({
    product_name: data.product_name,
    total_weight: data.total_weight,
    cbm: data.cbm,
    quantity: data.quantity,
  });
  if (!validation.valid) {
    const firstError = Object.values(validation.errors)[0];
    return { error: firstError || 'Please complete all required product information before sending.' };
  }

  const saveResult = await saveInquiry(
    leadId,
    {
      product_name: data.product_name,
      total_weight: data.total_weight,
      cbm: data.cbm,
      quantity: data.quantity,
      image_url: data.image_url,
      additional_image_urls: data.additional_image_urls,
      description: data.description,
    },
    inquiryId,
    options
  );

  if ('error' in saveResult) {
    return saveResult;
  }

  const inquiryToSendId = saveResult.inquiry?.id;
  if (!inquiryToSendId) {
    return { error: 'Unable to determine inquiry to send' };
  }

  return sendInquiryToAccounting(inquiryToSendId);
}

export async function createInquiryDraft(leadId: string) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };
    const supabase = await createAdminClient();

    if (session.role !== 'sales_agent') {
      return { error: 'Unauthorized' };
    }

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

    const nextVersion = await getNextInquiryVersionNumber(supabase, leadId);
    const versionGroupId = crypto.randomUUID();

    const { data: result, error } = await supabase
      .from('lead_inquiries')
      .insert([{
        lead_id: leadId,
        inquiry_group_id: versionGroupId,
        version_number: nextVersion,
        is_current_version: true,
        product_name: '',
        total_weight: '',
        cbm: '',
        quantity: '',
        description: '',
        image_url: null,
        additional_image_urls: [],
        status: 'pending',
        sent_to_accounting: false,
        sent_to_operations: false,
        approval_status: 'draft',
        approved_at: null,
      }])
      .select()
      .single();

    if (error) return { error: error.message };

    await supabase.from('inquiry_logs').insert([{
      inquiry_id: result.id,
      action: 'inquiry_created_draft',
      previous_values: null,
      new_values: {
        version_number: nextVersion,
        product_name: '',
        total_weight: '',
        cbm: '',
        quantity: '',
        description: '',
      },
      performed_by: session.username || 'sales-agent',
    }]);
    await addLeadActivityLog(supabase, {
      leadId,
      inquiryId: result.id,
      inquiryVersion: nextVersion,
      actionType: 'inquiry_created_draft',
      actionLabel: 'Inquiry Created (Draft)',
      performedBy: session.username || 'sales-agent',
      newValues: {
        version_number: nextVersion,
      },
    });

    revalidatePath('/sales-agent/dashboard');
    return { success: true, inquiry: result as LeadInquiry };
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
  total_inquiry_count: number;
  sent_inquiry_count: number;
  draft_inquiry_count: number;
  approved_inquiry_count: number;
  pending_inquiry_count: number;
  last_activity_at: string | null;
  approved_inquiry_id: string | null;
  approved_inquiry_version: number | null;
  approved_inquiry_approved_at: string | null;
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
        version_number,
        status,
        approval_status,
        created_at,
        updated_at,
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
      version_number?: number | null;
      status: string;
      approval_status?: 'draft' | 'sent' | 'approved' | 'rejected' | null;
      created_at: string | null;
      sent_to_accounting: boolean;
      sent_at: string | null;
      updated_at: string | null;
      inquiry_confirmations?: { id: string; status: string; created_at: string }[];
    };

    // If multiple inquiries exist for the same lead, pick the newest one only.
    const tracking: InquiryTrackingInfo[] = [];
    const seenLeadIds = new Set<string>();
    const sentCountByLead = new Map<string, number>();
    const totalCountByLead = new Map<string, number>();
    const draftCountByLead = new Map<string, number>();
    const approvedCountByLead = new Map<string, number>();
    const pendingCountByLead = new Map<string, number>();
    const lastActivityByLead = new Map<string, string>();
    const latestApprovedByLead = new Map<
      string,
      { inquiry_id: string; version_number: number | null; approved_at: string | null }
    >();

    // Ensure newest inquiries come first so we keep the first record per lead_id.
    const sortedInquiries = ([...(inquiries || [])] as TrackingInquiryRow[]).sort((a, b) => {
      const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bCreated - aCreated;
    });

    // First pass: aggregate full counts across ALL inquiries per lead.
    for (const inq of sortedInquiries) {
      totalCountByLead.set(inq.lead_id, (totalCountByLead.get(inq.lead_id) || 0) + 1);
      const approvedByConfirmation = (inq.inquiry_confirmations || []).some((c) => c.status === 'approved');
      let approvalStatus = (inq as { approval_status?: string }).approval_status || null;
      if (!inq.sent_to_accounting) {
        approvalStatus = 'draft';
      } else if (approvedByConfirmation) {
        approvalStatus = 'approved';
      } else if (!approvalStatus) {
        approvalStatus = 'sent';
      }

      if (inq.sent_to_accounting) {
        sentCountByLead.set(inq.lead_id, (sentCountByLead.get(inq.lead_id) || 0) + 1);
      }

      if (approvalStatus === 'draft') {
        draftCountByLead.set(inq.lead_id, (draftCountByLead.get(inq.lead_id) || 0) + 1);
      }

      if (approvalStatus === 'approved') {
        approvedCountByLead.set(inq.lead_id, (approvedCountByLead.get(inq.lead_id) || 0) + 1);
      }

      if (approvalStatus === 'sent') {
        pendingCountByLead.set(inq.lead_id, (pendingCountByLead.get(inq.lead_id) || 0) + 1);
      }
      const candidateActivity = inq.updated_at || inq.created_at || null;
      if (candidateActivity && !lastActivityByLead.has(inq.lead_id)) {
        lastActivityByLead.set(inq.lead_id, candidateActivity);
      }

      const approvedConfirmation = (inq.inquiry_confirmations || [])
        .filter((c) => c.status === 'approved')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      if (approvedConfirmation && !latestApprovedByLead.has(inq.lead_id)) {
        latestApprovedByLead.set(inq.lead_id, {
          inquiry_id: inq.id,
          version_number: inq.version_number || null,
          approved_at: approvedConfirmation.created_at || null,
        });
      }
    }

    // Second pass: keep latest inquiry row per lead for status/timestamp.
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
      const approvedMeta = latestApprovedByLead.get(inq.lead_id) || null;

      if (approvedMeta || latestApproved) {
        status = 'approved';
        approved_at = approvedMeta?.approved_at || latestApproved?.created_at || null;
      } else if (inq.sent_to_accounting) {
        status = 'sent';
      }

      tracking.push({
        lead_id: inq.lead_id,
        status,
        sent_at: inq.sent_at,
        approved_at,
        total_inquiry_count: totalCountByLead.get(inq.lead_id) || 0,
        sent_inquiry_count: sentCountByLead.get(inq.lead_id) || 0,
        draft_inquiry_count: draftCountByLead.get(inq.lead_id) || 0,
        approved_inquiry_count: approvedCountByLead.get(inq.lead_id) || 0,
        pending_inquiry_count: pendingCountByLead.get(inq.lead_id) || 0,
        last_activity_at: lastActivityByLead.get(inq.lead_id) || null,
        approved_inquiry_id: approvedMeta?.inquiry_id || null,
        approved_inquiry_version: approvedMeta?.version_number || null,
        approved_inquiry_approved_at: approvedMeta?.approved_at || null,
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
          sales_agents!leads_sales_agent_id_fkey (
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

    const sanitized = ((data || []) as LeadInquiryWithLead[]).map((inq) => ({
      ...inq,
      inquiry_confirmations: (inq.inquiry_confirmations || []).filter((c) => c.status === 'approved'),
    }));
    return { inquiries: sanitized };
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

export async function getInquiriesForLead(leadId: string) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();

    if (session.role === 'sales_agent') {
      const [agentResult, leadResult] = await Promise.all([
        supabase.from('sales_agents').select('id').eq('username', session.username).maybeSingle(),
        supabase.from('leads').select('id, sales_agent_id').eq('id', leadId).maybeSingle(),
      ]);

      const salesAgent = agentResult.data;
      const lead = leadResult.data;

      if (!salesAgent) return { error: 'Unauthorized' };
      if (!lead || lead.sales_agent_id !== salesAgent.id) {
        return { error: 'Unauthorized' };
      }
    } else if (session.role !== 'admin' && session.role !== 'operations') {
      return { error: 'Unauthorized' };
    }

    const result = await listInquiriesForLead(supabase, leadId, session.role);
    if ('error' in result) return result;
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getInquiryAvailabilityForLead(leadId: string) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };
    if (!leadId) return { error: 'Lead id is required' };

    const supabase = await createAdminClient();

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
      .select('id')
      .eq('lead_id', leadId)
      .limit(1);

    if (error) return { error: error.message };

    const hasInquiry = Boolean(data && data.length > 0);
    if (!hasInquiry) {
      return {
        hasInquiry: false,
        message: 'No inquiry found for this lead',
      };
    }

    const inquiryResult = await getInquiriesForLead(leadId);
    if ('error' in inquiryResult) {
      return { error: inquiryResult.error };
    }

    return {
      hasInquiry: true,
      inquiries: inquiryResult.inquiries || [],
    };
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
      .order('version_number', { ascending: false })
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
          sales_agents!leads_sales_agent_id_fkey (
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

const OPERATIONS_LIST_INQUIRY_SELECT = `
  id,
  lead_id,
  product_name,
  status,
  sent_at,
  leads (
    id,
    lead_id_formatted,
    name,
    sales_agents!leads_sales_agent_id_fkey (
      id,
      name
    )
  ),
  inquiry_confirmations (
    id,
    status,
    created_at
  )
`;

const OPERATIONS_DETAIL_INQUIRY_SELECT = `
  id,
  lead_id,
  description,
  image_url,
  additional_image_urls,
  link_url,
  product_name,
  total_weight,
  cbm,
  quantity,
  status,
  sent_to_accounting,
  sent_to_operations,
  sent_at,
  approval_status,
  approved_at,
  calculator_values,
  created_at,
  updated_at,
  leads (
    id,
    lead_id_formatted,
    name,
    number,
    source,
    sales_agent_id,
    sales_agents!leads_sales_agent_id_fkey (
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
`;

function normalizeOperationsInquiryRow(row: Record<string, unknown>): LeadInquiryWithLead {
  const rawLead = Array.isArray(row.leads)
    ? (row.leads[0] as Record<string, unknown> | undefined)
    : (row.leads as Record<string, unknown> | undefined);
  const rawSalesAgent = rawLead && Array.isArray(rawLead.sales_agents)
    ? (rawLead.sales_agents[0] as Record<string, unknown> | undefined)
    : (rawLead?.sales_agents as Record<string, unknown> | undefined);
  return {
    ...(row as LeadInquiryWithLead),
    leads: rawLead
      ? {
          id: String(rawLead.id || ''),
          lead_id_formatted: rawLead.lead_id_formatted ? String(rawLead.lead_id_formatted) : null,
          name: String(rawLead.name || ''),
          number: String(rawLead.number || ''),
          source: String(rawLead.source || ''),
          sales_agent_id: String(rawLead.sales_agent_id || ''),
          sales_agents: rawSalesAgent
            ? {
                id: String(rawSalesAgent.id || ''),
                name: String(rawSalesAgent.name || ''),
                username: rawSalesAgent.username ? String(rawSalesAgent.username) : null,
              }
            : null,
        }
      : null,
  } as LeadInquiryWithLead;
}

async function queryOperationsInquiriesPage(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  input: { pageLimit: number; offset: number; search: string }
): Promise<OperationsInquiriesPage | { error: string }> {
  const { pageLimit, offset, search } = input;

  let matchedLeadIds: string[] = [];
  if (search) {
    const { data: leadRows } = await supabase
      .from('leads')
      .select('id')
      .or(
        [
          `name.ilike.%${search}%`,
          `number.ilike.%${search}%`,
          `source.ilike.%${search}%`,
          `lead_id_formatted.ilike.%${search}%`,
        ].join(',')
      )
      .limit(200);
    matchedLeadIds = (leadRows || []).map((row) => String(row.id || '')).filter(Boolean);
  }

  let query = supabase
    .from('lead_inquiries')
    .select(OPERATIONS_LIST_INQUIRY_SELECT)
    .eq('sent_to_accounting', true)
    .order('sent_at', { ascending: false })
    .range(offset, offset + pageLimit);

  if (search) {
    const leadIdClause = matchedLeadIds.length > 0 ? `,lead_id.in.(${matchedLeadIds.join(',')})` : '';
    query = query.or(
      [
        `product_name.ilike.%${search}%`,
        `description.ilike.%${search}%`,
        `status.ilike.%${search}%`,
        `total_weight.ilike.%${search}%`,
        `cbm.ilike.%${search}%`,
        `quantity.ilike.%${search}%`,
      ].join(',') + leadIdClause
    );
  }

  query = query
    .order('created_at', { foreignTable: 'inquiry_confirmations', ascending: false })
    .limit(1, { foreignTable: 'inquiry_confirmations' });

  const { data, error } = await query;
  if (error) return { error: error.message };

  const rows = ((data || []) as Array<Record<string, unknown>>).map(normalizeOperationsInquiryRow);
  const hasMore = rows.length > pageLimit;
  const inquiries = hasMore ? rows.slice(0, pageLimit) : rows;
  const nextOffset = offset + inquiries.length;
  return { inquiries, hasMore, nextOffset };
}

export async function getAllInquiriesForOperations(input?: {
  limit?: number;
  offset?: number;
  search?: string;
}) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && session.role !== 'operations')) {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    const pageLimit = Math.min(Math.max(Number(input?.limit || 20), 1), 100);
    const offset = Math.max(Number(input?.offset || 0), 0);
    const search = String(input?.search || "").trim();
    const cacheKey = buildOperationsInquiriesCacheKey({
      role: session.role,
      limit: pageLimit,
      offset,
      search,
    });
    const cached = readOperationsInquiriesCache(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await queryOperationsInquiriesPage(supabase, { pageLimit, offset, search });
    if ('error' in result) return result;
    writeOperationsInquiriesCache(cacheKey, result);
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getInquiryForOperations(inquiryId: string) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && session.role !== 'operations')) {
      return { error: 'Unauthorized' };
    }
    if (!inquiryId) return { error: 'Inquiry id is required' };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('lead_inquiries')
      .select(OPERATIONS_DETAIL_INQUIRY_SELECT)
      .eq('id', inquiryId)
      .eq('sent_to_accounting', true)
      .order('created_at', { foreignTable: 'inquiry_confirmations', ascending: false })
      .limit(1, { foreignTable: 'inquiry_confirmations' })
      .maybeSingle();

    if (error) return { error: error.message };
    if (!data) return { error: 'Inquiry not found' };

    return { inquiry: normalizeOperationsInquiryRow(data as Record<string, unknown>) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getOperationsInquiriesBootstrap(input?: {
  limit?: number;
  offset?: number;
  search?: string;
}) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && session.role !== 'operations')) {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();
    const pageLimit = Math.min(Math.max(Number(input?.limit || 20), 1), 100);
    const offset = Math.max(Number(input?.offset || 0), 0);
    const search = String(input?.search || "").trim();
    const cacheKey = buildOperationsInquiriesCacheKey({
      role: session.role,
      limit: pageLimit,
      offset,
      search,
    });
    const cached = readOperationsInquiriesCache(cacheKey);

    const [inquiriesResult, calculatorResult] = await Promise.all([
      cached
        ? Promise.resolve(cached)
        : queryOperationsInquiriesPage(supabase, { pageLimit, offset, search }),
      supabase
        .from('inquiry_calculator_config')
        .select('values')
        .eq('id', 'shared')
        .maybeSingle(),
    ]);

    if ('error' in inquiriesResult) return { error: inquiriesResult.error };

    if (!cached) {
      writeOperationsInquiriesCache(cacheKey, inquiriesResult);
    }

    if (calculatorResult.error) {
      return { error: calculatorResult.error.message };
    }

    const values =
      calculatorResult.data?.values && typeof calculatorResult.data.values === 'object'
        ? (calculatorResult.data.values as Record<string, string>)
        : {};

    return {
      ...inquiriesResult,
      calculatorValues: sanitizeCalculatorValues(values),
    };
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
    additional_image_urls?: string[] | null;
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
    if (updates.additional_image_urls !== undefined) {
      updateData.additional_image_urls = Array.isArray(updates.additional_image_urls)
        ? updates.additional_image_urls.filter((u) => typeof u === 'string' && u.trim().length > 0)
        : [];
    }

    if (updates.cbm !== undefined && !isValidDecimal(updates.cbm)) {
      return { error: 'CBM must be a valid decimal number (e.g. 1.5).' };
    }

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
    if (updates.additional_image_urls !== undefined) {
      const prevImages = Array.isArray(current.additional_image_urls)
        ? current.additional_image_urls.filter((u: unknown) => typeof u === 'string' && String(u).trim().length > 0)
        : [];
      const nextImages = Array.isArray(updates.additional_image_urls)
        ? updates.additional_image_urls.filter((u) => typeof u === 'string' && u.trim().length > 0)
        : [];
      if (JSON.stringify(prevImages) !== JSON.stringify(nextImages)) {
        previousValues.additional_image_urls = `${prevImages.length} image(s)`;
        newValues.additional_image_urls = `${nextImages.length} image(s)`;
      }
    }

    // Only log if there are actual changes
    if (Object.keys(newValues).length > 0) {
      await supabase.from('inquiry_logs').insert([{
        inquiry_id: inquiryId,
        action: 'inquiry_edited',
        previous_values: previousValues,
        new_values: newValues,
        performed_by: session.username || 'admin',
      }]);
      await addLeadActivityLog(supabase, {
        leadId: current.lead_id,
        inquiryId: inquiryId,
        inquiryVersion: current.version_number || null,
        actionType: 'inquiry_edited',
        actionLabel: 'Inquiry Edited',
        performedBy: session.username || 'admin',
        previousValues,
        newValues,
      });
    }

    revalidatePath('/admin/dashboard');
    revalidatePath('/operations/dashboard');
    invalidateOperationsInquiriesCache();
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
    invalidateOperationsInquiriesCache();
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function deleteInquiryForSalesAgent(inquiryId: string) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'sales_agent') {
      return { error: 'Unauthorized' };
    }
    const supabase = await createAdminClient();

    const { data: salesAgent } = await supabase
      .from('sales_agents')
      .select('id')
      .eq('username', session.username)
      .maybeSingle();
    if (!salesAgent) return { error: 'Unauthorized' };

    const { data: inquiry, error: fetchError } = await supabase
      .from('lead_inquiries')
      .select('id, lead_id, product_name, sent_to_accounting, approval_status, version_number')
      .eq('id', inquiryId)
      .maybeSingle();
    if (fetchError || !inquiry) return { error: 'Inquiry not found' };

    const { data: lead } = await supabase
      .from('leads')
      .select('id, sales_agent_id')
      .eq('id', inquiry.lead_id)
      .maybeSingle();
    if (!lead || lead.sales_agent_id !== salesAgent.id) {
      return { error: 'Unauthorized' };
    }

    if (inquiry.approval_status === 'approved') {
      return { error: 'Approved inquiries cannot be deleted.' };
    }

    await addLeadActivityLog(supabase, {
      leadId: inquiry.lead_id,
      inquiryId: inquiry.id,
      inquiryVersion: inquiry.version_number || null,
      actionType: 'inquiry_edited',
      actionLabel: 'Inquiry Deleted',
      performedBy: session.username || 'sales-agent',
      previousValues: { product_name: inquiry.product_name, sent_to_accounting: inquiry.sent_to_accounting },
    });

    const { error } = await supabase
      .from('lead_inquiries')
      .delete()
      .eq('id', inquiryId);
    if (error) return { error: error.message };

    revalidatePath('/sales-agent/dashboard');
    revalidatePath('/admin/dashboard');
    revalidatePath('/operations/dashboard');
    invalidateOperationsInquiriesCache();
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getLatestQuotationPricingByInquiryIds(inquiryIds: string[]) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };
    const ids = Array.isArray(inquiryIds) ? inquiryIds.filter(Boolean) : [];
    if (ids.length === 0) return { pricing: {} as Record<string, { quotation_number: string; unit_price: number; total_amount: number; notes: string | null }> };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('inquiry_quotations')
      .select('inquiry_id, quotation_number, unit_price, total_amount, notes, version')
      .in('inquiry_id', ids)
      .order('version', { ascending: false });
    if (error) return { error: error.message };

    const pricing: Record<string, { quotation_number: string; unit_price: number; total_amount: number; notes: string | null }> = {};
    for (const row of data || []) {
      const inquiryId = String(row.inquiry_id || '');
      if (!inquiryId || pricing[inquiryId]) continue;
      pricing[inquiryId] = {
        quotation_number: String(row.quotation_number || ''),
        unit_price: Number(row.unit_price || 0),
        total_amount: Number(row.total_amount || 0),
        notes: row.notes ? String(row.notes) : null,
      };
    }
    return { pricing };
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

export async function recordInquiryViewed(inquiryId: string) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();
    const { data: inquiry, error } = await supabase
      .from('lead_inquiries')
      .select('id, lead_id, version_number')
      .eq('id', inquiryId)
      .maybeSingle();

    if (error || !inquiry) return { error: 'Inquiry not found' };

    await addLeadActivityLog(supabase, {
      leadId: inquiry.lead_id,
      inquiryId: inquiry.id,
      inquiryVersion: inquiry.version_number || null,
      actionType: 'inquiry_viewed',
      actionLabel: 'Inquiry Viewed',
      performedBy: session.username || 'user',
      metadata: { source: 'sales_agent_dashboard' },
    });

    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getLeadActivityTimeline(leadId: string) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };
    if (!leadId) return { error: 'Lead id is required' };

    const supabase = await createAdminClient();

    if (session.role === 'sales_agent') {
      const { data: salesAgent } = await supabase
        .from('sales_agents')
        .select('id')
        .eq('username', session.username)
        .maybeSingle();
      if (!salesAgent) return { error: 'Unauthorized' };

      const { data: lead } = await supabase
        .from('leads')
        .select('id')
        .eq('id', leadId)
        .eq('sales_agent_id', salesAgent.id)
        .maybeSingle();
      if (!lead) return { error: 'Unauthorized' };
    } else if (session.role !== 'admin' && session.role !== 'operations') {
      return { error: 'Unauthorized' };
    }

    const { data, error } = await supabase
      .from('lead_activity_logs')
      .select('*')
      .eq('lead_id', leadId)
      .order('performed_at', { ascending: false });

    if (error) return { error: error.message };
    return { logs: (data || []) as LeadActivityLog[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getInquiryLogsForLead(leadId: string, inquiryId?: string) {
  try {
    const session = await getSession();
    if (!session) {
      return { error: 'Unauthorized' };
    }

    if (!leadId) return { error: 'Lead id is required' };

    const supabase = await createAdminClient();

    if (session.role === 'sales_agent') {
      const { data: salesAgent } = await supabase
        .from('sales_agents')
        .select('id')
        .eq('username', session.username)
        .maybeSingle();
      if (!salesAgent) return { error: 'Unauthorized' };
      const { data: lead } = await supabase
        .from('leads')
        .select('id')
        .eq('id', leadId)
        .eq('sales_agent_id', salesAgent.id)
        .maybeSingle();
      if (!lead) return { error: 'Unauthorized' };
    } else if (session.role !== 'admin' && session.role !== 'operations') {
      return { error: 'Unauthorized' };
    }

    const { data: inquiryRows, error: inquiryErr } = inquiryId
      ? { data: null, error: null }
      : await supabase
          .from('lead_inquiries')
          .select('id')
          .eq('lead_id', leadId);

    if (inquiryErr) return { error: inquiryErr.message };

    const inquiryIds = inquiryId
      ? [inquiryId]
      : (inquiryRows || []).map((r) => r.id);
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

export async function addInquiryCalculatorFieldLog(
  inquiryId: string,
  field: string,
  previousValue: string,
  newValue: string
) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && session.role !== 'operations')) {
      return { error: 'Unauthorized' };
    }

    if (!inquiryId || !field.trim()) {
      return { error: 'Inquiry id and field are required' };
    }

    const prev = previousValue ?? '';
    const next = newValue ?? '';
    if (prev === next) return { success: true };

    const supabase = await createAdminClient();
    const { error } = await supabase
      .from('inquiry_logs')
      .insert([{
        inquiry_id: inquiryId,
        action: 'calculator_updated',
        previous_values: { [field]: prev },
        new_values: { [field]: next },
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

export async function saveInquiryCalculatorField(
  inquiryId: string,
  field: string,
  value: string
) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && session.role !== 'operations')) {
      return { error: 'Unauthorized' };
    }

    if (!inquiryId?.trim()) {
      return { error: 'Inquiry ID is required.' };
    }

    if (!field.trim()) {
      return { error: 'Field is required' };
    }

    if (field === 'sales_tax_rate') {
      return { error: 'Sales Tax (ST) has been removed from the calculator.' };
    }

    const supabase = await createAdminClient();

    const { data: inquiryRow, error: fetchError } = await supabase
      .from('lead_inquiries')
      .select('calculator_values')
      .eq('id', inquiryId)
      .maybeSingle();

    if (fetchError) {
      return { error: fetchError.message };
    }

    const existingRaw =
      inquiryRow?.calculator_values && typeof inquiryRow.calculator_values === 'object'
        ? (inquiryRow.calculator_values as Record<string, unknown>)
        : {};

    const parsed = parseStoredCalculatorPayload(existingRaw);
    const primary = {
      ...(parsed.calculators[0] ?? getEmptyCalculatorValues()),
      [field]: value ?? '',
    };
    const nextCalculators = [
      withDerivedInvValue(sanitizeCalculatorValues(primary)),
      ...parsed.calculators.slice(1),
    ];
    const nextPayload = serializeCalculatorPayload(
      nextCalculators,
      parsed.operationsDescription
    );

    const { error: updateError } = await supabase
      .from('lead_inquiries')
      .update({
        calculator_values: nextPayload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', inquiryId);

    if (updateError) return { error: updateError.message };

    // Keep shared admin rate defaults in sync only for shared rate keys
    // (does not store inquiry-specific fields like unit_value / hs_code).
    if ((SHARED_CALCULATOR_DEFAULT_KEYS as readonly string[]).includes(field)) {
      const { data: configRow } = await supabase
        .from('inquiry_calculator_config')
        .select('values')
        .eq('id', 'shared')
        .maybeSingle();

      const currentShared =
        configRow?.values && typeof configRow.values === 'object'
          ? (configRow.values as Record<string, string>)
          : {};

      await supabase.from('inquiry_calculator_config').upsert(
        {
          id: 'shared',
          values: sanitizeCalculatorValues({
            ...currentShared,
            [field]: value ?? '',
          }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
    }

    revalidatePath('/admin/dashboard');
    revalidatePath('/operations/dashboard');
    return { success: true, calculatorValues: nextPayload };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function saveInquiryCalculatorPayload(
  inquiryId: string,
  calculatorValues: Record<string, unknown>
) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && session.role !== 'operations')) {
      return { error: 'Unauthorized' };
    }

    if (!inquiryId.trim()) {
      return { error: 'Inquiry ID is required.' };
    }

    const supabase = await createAdminClient();
    const { error } = await supabase
      .from('lead_inquiries')
      .update({
        calculator_values: calculatorValues,
        updated_at: new Date().toISOString(),
      })
      .eq('id', inquiryId);

    if (error) return { error: error.message };

    revalidatePath('/admin/dashboard');
    revalidatePath('/operations/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getSharedInquiryCalculatorValues() {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'admin' && session.role !== 'operations')) {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('inquiry_calculator_config')
      .select('values')
      .eq('id', 'shared')
      .maybeSingle();

    if (error) return { error: error.message };
    const values = sanitizeCalculatorValues(
      data?.values && typeof data.values === 'object'
        ? (data.values as Record<string, unknown>)
        : {}
    );
    return { values };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getLeadChatMessages(leadId: string, inquiryId?: string) {
  try {
    const session = await getSession();
    const supabase = await createAdminClient();
    const access = await canAccessLeadChat(supabase, session, leadId);
    if (!access.allowed) return { error: access.error || 'Unauthorized' };

    let query = supabase
      .from('lead_chat_messages')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true });
    if (inquiryId) {
      query = query.eq('inquiry_id', inquiryId);
    }

    let { data, error } = await query;
    if (error && inquiryId && /inquiry_id/i.test(error.message || '')) {
      // Backward compatibility when DB migration is not applied yet.
      const fallback = await supabase
        .from('lead_chat_messages')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true });
      data = fallback.data;
      error = fallback.error;
    }

    if (error) return { error: error.message };
    return { messages: (data || []) as LeadChatMessage[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function sendLeadChatMessage(leadId: string, message: string, inquiryId?: string) {
  try {
    const session = await getSession();
    const supabase = await createAdminClient();
    const access = await canAccessLeadChat(supabase, session, leadId);
    if (!access.allowed) return { error: access.error || 'Unauthorized' };

    const clean = message.trim();
    if (!clean) return { error: 'Message is required' };

    const senderRole =
      session?.role === 'sales_agent'
        ? 'sales_agent'
        : session?.role === 'operations'
          ? 'operations'
          : 'admin';

    let { data, error } = await supabase
      .from('lead_chat_messages')
      .insert([
        {
          lead_id: leadId,
          inquiry_id: inquiryId || null,
          message: clean,
          sender_role: senderRole,
          sender_username: session?.username || 'user',
        },
      ])
      .select()
      .single();

    if (error && /inquiry_id/i.test(error.message || '')) {
      // Backward compatibility when DB migration is not applied yet.
      const fallback = await supabase
        .from('lead_chat_messages')
        .insert([
          {
            lead_id: leadId,
            message: clean,
            sender_role: senderRole,
            sender_username: session?.username || 'user',
          },
        ])
        .select()
        .single();
      data = fallback.data;
      error = fallback.error;
    }

    if (error || !data) return { error: error?.message || 'Failed to send message' };

    // Create recipient notifications based on sender role.
    if (senderRole === 'sales_agent') {
      const { data: operationsUsers } = await supabase
        .from('operations_users')
        .select('username');

      const recipients = (operationsUsers || [])
        .map((u) => u.username)
        .filter((u): u is string => !!u && u !== (session?.username || ''));

      if (recipients.length > 0) {
        let { error: notifInsertError } = await supabase.from('lead_chat_notifications').insert(
          recipients.map((username) => ({
            chat_message_id: data.id,
            lead_id: leadId,
            inquiry_id: inquiryId || null,
            sender_role: senderRole,
            sender_username: session?.username || 'user',
            recipient_role: 'operations',
            recipient_username: username,
          }))
        );
        if (notifInsertError && /inquiry_id/i.test(notifInsertError.message || '')) {
          const fallback = await supabase.from('lead_chat_notifications').insert(
            recipients.map((username) => ({
              chat_message_id: data.id,
              lead_id: leadId,
              sender_role: senderRole,
              sender_username: session?.username || 'user',
              recipient_role: 'operations',
              recipient_username: username,
            }))
          );
          notifInsertError = fallback.error;
        }
        if (notifInsertError) {
          console.error('[sendLeadChatMessage] notification insert failed:', notifInsertError.message);
        }
      }
    } else if (senderRole === 'operations' || senderRole === 'admin') {
      const { data: lead } = await supabase
        .from('leads')
        .select('sales_agent_id')
        .eq('id', leadId)
        .maybeSingle();

      if (lead?.sales_agent_id) {
        const { data: salesAgent } = await supabase
          .from('sales_agents')
          .select('username')
          .eq('id', lead.sales_agent_id)
          .maybeSingle();

        if (salesAgent?.username && salesAgent.username !== (session?.username || '')) {
          let { error: notifInsertError } = await supabase.from('lead_chat_notifications').insert([
            {
              chat_message_id: data.id,
              lead_id: leadId,
              inquiry_id: inquiryId || null,
              sender_role: senderRole,
              sender_username: session?.username || 'user',
              recipient_role: 'sales_agent',
              recipient_username: salesAgent.username,
            },
          ]);
          if (notifInsertError && /inquiry_id/i.test(notifInsertError.message || '')) {
            const fallback = await supabase.from('lead_chat_notifications').insert([
              {
                chat_message_id: data.id,
                lead_id: leadId,
                sender_role: senderRole,
                sender_username: session?.username || 'user',
                recipient_role: 'sales_agent',
                recipient_username: salesAgent.username,
              },
            ]);
            notifInsertError = fallback.error;
          }
          if (notifInsertError) {
            console.error('[sendLeadChatMessage] notification insert failed:', notifInsertError.message);
          }
        }
      }
    }

    revalidatePath('/sales-agent/dashboard');
    revalidatePath('/operations/dashboard');
    return { message: data as LeadChatMessage };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getMyLeadChatNotifications(limit = 20) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };

    const recipientRole =
      session.role === 'sales_agent'
        ? 'sales_agent'
        : session.role === 'operations'
          ? 'operations'
          : session.role === 'admin'
            ? 'admin'
            : null;

    if (!recipientRole) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();

    const [chatResult, lifecycleResult] = await Promise.all([
      supabase
        .from('lead_chat_notifications')
        .select(`
          *,
          leads (
            lead_id_formatted
          )
        `)
        .eq('recipient_role', recipientRole)
        .eq('recipient_username', session.username)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('inquiry_lifecycle_notifications')
        .select(`
          *,
          leads (
            lead_id_formatted
          )
        `)
        .eq('recipient_role', recipientRole)
        .eq('recipient_username', session.username)
        .order('created_at', { ascending: false })
        .limit(limit),
    ]);

    const { data, error } = chatResult;
    if (error) return { error: error.message };

    const { data: lifecycleData, error: lifecycleError } = lifecycleResult;

    const chatNotifications = ((data || []) as LeadChatNotification[]).map((n) => ({
      ...n,
      notification_type: 'chat' as const,
    }));
    const lifecycleNotifications = ((lifecycleError ? [] : (lifecycleData || [])) as LeadChatNotification[]).map((n) => ({
      ...n,
      notification_type: 'lifecycle' as const,
    }));

    const notifications = [...chatNotifications, ...lifecycleNotifications]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
    const unreadCount = notifications.filter((n) => !n.is_read).length;

    return {
      notifications,
      unreadCount,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function markLeadChatNotificationRead(notificationId: string) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };
    if (!notificationId) return { error: 'Notification id is required' };

    const recipientRole =
      session.role === 'sales_agent'
        ? 'sales_agent'
        : session.role === 'operations'
          ? 'operations'
          : session.role === 'admin'
            ? 'admin'
            : null;
    if (!recipientRole) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();
    const { error } = await supabase
      .from('lead_chat_notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('recipient_role', recipientRole)
      .eq('recipient_username', session.username);

    if (error) return { error: error.message };

    // Also mark inquiry lifecycle notification as read if the id belongs there.
    await supabase
      .from('inquiry_lifecycle_notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('recipient_role', recipientRole)
      .eq('recipient_username', session.username);

    // Ignore "no rows updated" style outcomes; only fail on hard DB errors.
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

    const { data: inquiryRow, error: inqErr } = await supabase
      .from('lead_inquiries')
      .select('id, lead_id')
      .eq('id', inquiryId)
      .maybeSingle();

    if (inqErr) return { error: inqErr.message };
    if (!inquiryRow) return { error: 'Inquiry not found' };

    if (session.role === 'sales_agent') {
      const { data: salesAgent } = await supabase
        .from('sales_agents')
        .select('id')
        .eq('username', session.username)
        .maybeSingle();
      if (!salesAgent) return { error: 'Unauthorized' };
      const { data: lead } = await supabase
        .from('leads')
        .select('sales_agent_id')
        .eq('id', inquiryRow.lead_id)
        .maybeSingle();
      if (!lead || lead.sales_agent_id !== salesAgent.id) {
        return { error: 'Unauthorized' };
      }
    } else if (session.role !== 'admin' && session.role !== 'operations') {
      return { error: 'Unauthorized' };
    }

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

export async function uploadInquiryAttachment(leadId: string, file: File) {
  try {
    const session = await getSession();
    if (!session) return { error: 'Unauthorized' };

    if (!leadId?.trim()) {
      return { error: 'Lead is required before uploading attachments.' };
    }

    const supabase = await createAdminClient();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `inquiry_${leadId}_${Date.now()}_${sanitizedName}`;
    const filePath = `inquiries/${fileName}`;

    const upload = await uploadToInquiryImagesBucket(
      supabase,
      filePath,
      file,
      file.type || 'application/octet-stream'
    );

    if ('error' in upload) {
      return { error: upload.error };
    }

    return { success: true, url: upload.url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function uploadInquiryImage(leadId: string, file: File) {
  return uploadInquiryAttachment(leadId, file);
}
