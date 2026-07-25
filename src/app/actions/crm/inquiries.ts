'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/utils/supabase/server';
import { requireAnyChildModule, isAccessDenied } from '@/lib/auth/require-access';
import { requireCrmOrganizationScope } from '@/app/actions/crm/shared';
import { logOpportunityChatterAudit } from '@/app/actions/crm/chatter';
import { canAccessLeadForInquiry } from '@/lib/inquiry-crm-access';
import { isCrmQualifiedStage } from '@/lib/crm-inquiry-utils';
import { resolveSalesAgentForSession } from '@/lib/legacy-user-bridge';
import { formatLeadPhoneForStorage, normalizePakistaniPhone } from '@/lib/pakistan-phone';
import type { Lead } from '@/app/actions/leads';
import type { LeadInquiry } from '@/app/actions/inquiries';
import { listInquiriesForLead } from '@/app/actions/inquiries';

export type CrmOpportunityInquirySummary = {
  total: number;
  latest_status: string | null;
  latest_approval_status: string | null;
  latest_product_name: string | null;
  latest_sent_at: string | null;
};

export type CrmOpportunityInquiryBootstrap = {
  opportunity: {
    id: string;
    name: string;
    stage_name: string;
    contact_id: string | null;
    customer_name: string | null;
    contact_person_name: string | null;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    salesperson_id: string | null;
    salesperson_name: string | null;
    organization_id: string;
    source: string | null;
  };
  lead: Lead;
  inquiries: LeadInquiry[];
  approvedInquiryId: string | null;
  allowInquiry: boolean;
};

async function loadOpportunityContext(opportunityId: string) {
  const scope = await requireCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const supabase = await createAdminClient();
  let query = supabase
    .from('crm_opportunities')
    .select(
      `
      id, name, stage_id, contact_id, contact_person_id,
      email, phone, mobile, source, salesperson_id, organization_id,
      crm_pipeline_stages ( name, is_won, is_lost )
    `
    )
    .eq('id', opportunityId);

  if (!scope.isGlobalAdminView) {
    query = query.eq('organization_id', scope.organizationId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'Opportunity not found.' };

  const stageRaw = data.crm_pipeline_stages as
    | { name?: string; is_won?: boolean; is_lost?: boolean }
    | { name?: string; is_won?: boolean; is_lost?: boolean }[]
    | null;
  const stage = Array.isArray(stageRaw) ? stageRaw[0] : stageRaw;
  const stageName = String(stage?.name || '');

  let customerName: string | null = null;
  let contactPersonName: string | null = null;
  if (data.contact_id) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('name, company_name')
      .eq('id', data.contact_id)
      .maybeSingle();
    if (contact) {
      customerName = String(contact.company_name || contact.name || '').trim() || null;
    }
  }
  if (data.contact_person_id) {
    const { data: person } = await supabase
      .from('contacts')
      .select('name')
      .eq('id', data.contact_person_id)
      .maybeSingle();
    contactPersonName = person?.name ? String(person.name) : null;
  }

  let salespersonName: string | null = null;
  if (data.salesperson_id) {
    const { data: agent } = await supabase
      .from('sales_agents')
      .select('name, username')
      .eq('id', data.salesperson_id)
      .maybeSingle();
    salespersonName = agent?.name
      ? String(agent.name)
      : agent?.username
        ? String(agent.username)
        : null;
  }

  return {
    scope,
    supabase,
    opportunity: {
      id: String(data.id),
      name: String(data.name),
      stage_name: stageName,
      stage_is_won: Boolean(stage?.is_won),
      stage_is_lost: Boolean(stage?.is_lost),
      contact_id: data.contact_id ? String(data.contact_id) : null,
      customer_name: customerName,
      contact_person_name: contactPersonName,
      email: data.email ? String(data.email) : null,
      phone: data.phone ? String(data.phone) : null,
      mobile: data.mobile ? String(data.mobile) : null,
      source: data.source ? String(data.source) : null,
      salesperson_id: data.salesperson_id ? String(data.salesperson_id) : null,
      organization_id: String(data.organization_id),
      salesperson_name: salespersonName,
    },
  };
}

function mapLeadRow(row: Record<string, unknown>): Lead {
  return {
    id: String(row.id),
    lead_id_formatted: row.lead_id_formatted ? String(row.lead_id_formatted) : null,
    name: String(row.name || ''),
    number: String(row.number || ''),
    source: (row.source as Lead['source']) || 'Others',
    status: (row.status as Lead['status']) || 'Leads',
    sales_agent_id: String(row.sales_agent_id || ''),
    created_by_sales_agent_id: row.created_by_sales_agent_id
      ? String(row.created_by_sales_agent_id)
      : null,
    transferred_from_sales_agent_id: row.transferred_from_sales_agent_id
      ? String(row.transferred_from_sales_agent_id)
      : null,
    transferred_at: row.transferred_at ? String(row.transferred_at) : null,
    converted: Boolean(row.converted),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

/** Find or create a legacy lead bridge row for CRM inquiry workflow. */
export async function resolveLeadForCrmOpportunity(opportunityId: string): Promise<
  | { lead: Lead }
  | { error: string }
> {
  const auth = await requireAnyChildModule(['crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const ctx = await loadOpportunityContext(opportunityId);
  if ('error' in ctx) return { error: ctx.error };

  const { supabase, opportunity, scope } = ctx;

  const trySelectLead = async (leadId: string) => {
    const { data } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle();
    return data as Record<string, unknown> | null;
  };

  const { data: byOpp } = await supabase
    .from('leads')
    .select('*')
    .eq('crm_opportunity_id', opportunityId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (byOpp) {
    return { lead: mapLeadRow(byOpp as Record<string, unknown>) };
  }

  if (opportunity.contact_id) {
    const { data: byContact } = await supabase
      .from('leads')
      .select('*')
      .eq('contact_id', opportunity.contact_id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (byContact) {
      await supabase
        .from('leads')
        .update({ crm_opportunity_id: opportunityId })
        .eq('id', byContact.id)
        .is('crm_opportunity_id', null);
      return { lead: mapLeadRow(byContact as Record<string, unknown>) };
    }

    const { data: contact } = await supabase
      .from('contacts')
      .select('legacy_lead_id, name, phone, source')
      .eq('id', opportunity.contact_id)
      .maybeSingle();

    if (contact?.legacy_lead_id) {
      const legacy = await trySelectLead(String(contact.legacy_lead_id));
      if (legacy) {
        await supabase
          .from('leads')
          .update({
            crm_opportunity_id: opportunityId,
            contact_id: opportunity.contact_id,
          })
          .eq('id', legacy.id as string);
        return { lead: mapLeadRow(legacy) };
      }
    }
  }

  const agent =
    (opportunity.salesperson_id ? { id: opportunity.salesperson_id } : null) ||
    (await resolveSalesAgentForSession(supabase, scope.session));

  if (!agent?.id) {
    return { error: 'No salesperson is linked to this opportunity. Assign a salesperson first.' };
  }

  const phoneRaw = opportunity.phone || opportunity.mobile || '';
  const normalized = phoneRaw ? normalizePakistaniPhone(phoneRaw) : null;
  const number =
    normalized?.ok
      ? formatLeadPhoneForStorage(phoneRaw, normalized.value)
      : phoneRaw.trim() || '00000000000';
  const numberNormalized = normalized?.ok ? normalized.value : null;

  const leadName = opportunity.customer_name || opportunity.name || 'CRM Customer';
  const source = (opportunity.source as Lead['source']) || 'Others';

  const insertRow: Record<string, unknown> = {
    name: leadName,
    number,
    number_normalized: numberNormalized,
    source,
    status: 'Inquiry Received',
    sales_agent_id: agent.id,
    created_by_sales_agent_id: agent.id,
    organization_id: opportunity.organization_id,
    contact_id: opportunity.contact_id,
    crm_opportunity_id: opportunityId,
    converted: false,
  };

  const { data: created, error } = await supabase
    .from('leads')
    .insert(insertRow)
    .select('*')
    .single();

  if (error || !created) {
    return { error: error?.message || 'Failed to create inquiry bridge lead.' };
  }

  return { lead: mapLeadRow(created as Record<string, unknown>) };
}

export async function getCrmOpportunityInquiryBootstrap(
  opportunityId: string
): Promise<{ bootstrap: CrmOpportunityInquiryBootstrap } | { error: string }> {
  const auth = await requireAnyChildModule(['crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const ctx = await loadOpportunityContext(opportunityId);
  if ('error' in ctx) return { error: ctx.error };

  const leadResult = await resolveLeadForCrmOpportunity(opportunityId);
  if ('error' in leadResult) return { error: leadResult.error };

  const access = await canAccessLeadForInquiry(
    ctx.scope.session,
    ctx.supabase,
    leadResult.lead.id,
    { crmOpportunityId: opportunityId }
  );
  if (!access.allowed) return { error: access.error || 'Unauthorized' };

  const listed = await listInquiriesForLead(
    ctx.supabase,
    leadResult.lead.id,
    ctx.scope.session.role
  );
  if ('error' in listed) return { error: listed.error };

  const inquiries = listed.inquiries || [];
  const approvedInquiryId =
    inquiries.find((inq) => inq.approval_status === 'approved')?.id || null;

  return {
    bootstrap: {
      opportunity: {
        id: ctx.opportunity.id,
        name: ctx.opportunity.name,
        stage_name: ctx.opportunity.stage_name,
        contact_id: ctx.opportunity.contact_id,
        customer_name: ctx.opportunity.customer_name,
        contact_person_name: ctx.opportunity.contact_person_name,
        email: ctx.opportunity.email,
        phone: ctx.opportunity.phone,
        mobile: ctx.opportunity.mobile,
        salesperson_id: ctx.opportunity.salesperson_id,
        salesperson_name: ctx.opportunity.salesperson_name,
        organization_id: ctx.opportunity.organization_id,
        source: ctx.opportunity.source,
      },
      lead: leadResult.lead,
      inquiries,
      approvedInquiryId,
      allowInquiry: isCrmQualifiedStage(ctx.opportunity.stage_name),
    },
  };
}

export async function getCrmOpportunityInquirySummary(
  opportunityId: string
): Promise<{ summary: CrmOpportunityInquirySummary } | { error: string }> {
  const auth = await requireAnyChildModule(['crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const leadResult = await resolveLeadForCrmOpportunity(opportunityId);
  const leadId = 'lead' in leadResult ? leadResult.lead.id : null;

  const supabase = await createAdminClient();
  let query = supabase
    .from('lead_inquiries')
    .select('id, status, approval_status, product_name, sent_at, created_at')
    .order('created_at', { ascending: false });

  if (leadId) {
    query = query.or(`crm_opportunity_id.eq.${opportunityId},lead_id.eq.${leadId}`);
  } else {
    query = query.eq('crm_opportunity_id', opportunityId);
  }

  const { data, error } = await query;

  if (error) {
    if (/crm_opportunity_id|column/i.test(error.message)) {
      if (!leadId) {
        return {
          summary: {
            total: 0,
            latest_status: null,
            latest_approval_status: null,
            latest_product_name: null,
            latest_sent_at: null,
          },
        };
      }
      const fallback = await supabase
        .from('lead_inquiries')
        .select('id, status, approval_status, product_name, sent_at, created_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });
      if (fallback.error) return { error: fallback.error.message };
      const rows = fallback.data || [];
      const latest = rows[0];
      return {
        summary: {
          total: rows.length,
          latest_status: latest?.status ? String(latest.status) : null,
          latest_approval_status: latest?.approval_status
            ? String(latest.approval_status)
            : null,
          latest_product_name: latest?.product_name ? String(latest.product_name) : null,
          latest_sent_at: latest?.sent_at ? String(latest.sent_at) : null,
        },
      };
    }
    return { error: error.message };
  }

  const rows = data || [];
  const latest = rows[0];
  return {
    summary: {
      total: rows.length,
      latest_status: latest?.status ? String(latest.status) : null,
      latest_approval_status: latest?.approval_status
        ? String(latest.approval_status)
        : null,
      latest_product_name: latest?.product_name ? String(latest.product_name) : null,
      latest_sent_at: latest?.sent_at ? String(latest.sent_at) : null,
    },
  };
}

export async function logCrmInquiryEvent(input: {
  opportunityId: string;
  organizationId: string;
  performedBy: string;
  event: 'created' | 'sent' | 'updated' | 'status_changed';
  inquiryId?: string;
  detail?: string;
}) {
  const labels: Record<string, string> = {
    created: 'Inquiry created',
    sent: 'Inquiry sent',
    updated: 'Inquiry updated',
    status_changed: 'Inquiry status changed',
  };
  const body = input.detail
    ? `${labels[input.event] || 'Inquiry event'}: ${input.detail}`
    : labels[input.event] || 'Inquiry event';

  await logOpportunityChatterAudit({
    opportunityId: input.opportunityId,
    organizationId: input.organizationId,
    performedBy: input.performedBy,
    body,
    metadata: {
      event: `inquiry_${input.event}`,
      inquiry_id: input.inquiryId || null,
    },
  });

  revalidatePath(`/crm/opportunities/${input.opportunityId}`);
  revalidatePath(`/crm/opportunities/${input.opportunityId}/inquiry`);
}
