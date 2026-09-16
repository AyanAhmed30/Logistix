'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/utils/supabase/server';
import { requireAnyChildModule, isAccessDenied } from '@/lib/auth/require-access';
import { resolveCrmOrganizationScope } from '@/app/actions/crm/shared';
import { logOpportunityChatterAudit } from '@/app/actions/crm/chatter';
import { canAccessLeadForInquiry } from '@/lib/inquiry-crm-access';
import { isCrmQualifiedStage } from '@/lib/crm-inquiry-utils';
import { resolveSalesAgentForSession } from '@/lib/legacy-user-bridge';
import { formatLeadPhoneForStorage, normalizePakistaniPhone } from '@/lib/pakistan-phone';
import { resolveContactCustomerId } from '@/lib/contact-lead-id';
import { normalizeLeadSource } from '@/lib/lead-source';
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
    lead_inquiry_id: string | null;
  };
  lead: Lead;
  inquiries: LeadInquiry[];
  approvedInquiryId: string | null;
  allowInquiry: boolean;
};

type OpportunityInquiryContext =
  | {
      scope: Exclude<Awaited<ReturnType<typeof resolveCrmOrganizationScope>>, { error: string }>;
      supabase: Awaited<ReturnType<typeof createAdminClient>>;
      opportunity: {
        id: string;
        name: string;
        stage_name: string;
        stage_is_won: boolean;
        stage_is_lost: boolean;
        contact_id: string | null;
        customer_name: string | null;
        contact_person_name: string | null;
        email: string | null;
        phone: string | null;
        mobile: string | null;
        source: string | null;
        salesperson_id: string | null;
        organization_id: string;
        salesperson_name: string | null;
        lead_inquiry_id: string | null;
      };
    }
  | { error: string };

type OpportunityRow = {
  id: string;
  name: string;
  stage_id: string;
  contact_id: string | null;
  contact_person_id: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  source: string | null;
  salesperson_id: string | null;
  organization_id: string | null;
  lead_inquiry_id?: string | null;
  created_by?: string | null;
};

const OPPORTUNITY_SELECT = `
  id, name, stage_id, contact_id, contact_person_id,
  email, phone, mobile, source, salesperson_id, organization_id, lead_inquiry_id, created_by
`;

const OPPORTUNITY_SELECT_LEGACY = `
  id, name, stage_id, contact_id, contact_person_id,
  email, phone, mobile, source, salesperson_id, organization_id, created_by
`;

async function fetchOpportunityById(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  opportunityId: string,
  organizationId?: string | null
): Promise<{ data: OpportunityRow | null; error: string | null }> {
  let query = supabase
    .from('crm_opportunities')
    .select(OPPORTUNITY_SELECT)
    .eq('id', opportunityId);

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  let { data, error } = await query.maybeSingle();
  if (error && /lead_inquiry_id|column/i.test(error.message)) {
    let fallback = supabase
      .from('crm_opportunities')
      .select(OPPORTUNITY_SELECT_LEGACY)
      .eq('id', opportunityId);
    if (organizationId) {
      fallback = fallback.eq('organization_id', organizationId);
    }
    const retry = await fallback.maybeSingle();
    data = retry.data as typeof data;
    error = retry.error;
  }

  if (error) return { data: null, error: error.message || 'Failed to load opportunity.' };
  return { data: (data as OpportunityRow | null) || null, error: null };
}

async function resolveOpportunityIdFromInquiry(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  inquiryId: string
): Promise<string | null> {
  const { data: inquiry } = await supabase
    .from('lead_inquiries')
    .select('id, crm_opportunity_id')
    .eq('id', inquiryId)
    .maybeSingle();

  if (inquiry?.crm_opportunity_id) {
    return String(inquiry.crm_opportunity_id);
  }

  const { data: byLeadInquiry } = await supabase
    .from('crm_opportunities')
    .select('id')
    .eq('lead_inquiry_id', inquiryId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return byLeadInquiry?.id ? String(byLeadInquiry.id) : null;
}

/**
 * Notification deep-links must open even when the opportunity has a null /
 * mismatched organization_id (common for mobile-submitted inquiries).
 * Still require salesperson / creator / lead ownership when bypassing org filter.
 */
async function canAccessOpportunityDeepLink(
  scope: Exclude<Awaited<ReturnType<typeof resolveCrmOrganizationScope>>, { error: string }>,
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  row: OpportunityRow
): Promise<boolean> {
  if (scope.isGlobalAdminView) return true;

  const oppOrg = row.organization_id ? String(row.organization_id) : null;
  if (oppOrg && scope.organizationId && oppOrg === scope.organizationId) {
    const { resolveCrmVisibilityScope, canAccessCrmOpportunityRow } = await import(
      '@/lib/crm-visibility'
    );
    const visibility = await resolveCrmVisibilityScope(scope.session);
    return canAccessCrmOpportunityRow(visibility, {
      salesperson_id: row.salesperson_id,
      created_by: row.created_by,
    });
  }

  const { resolveCrmVisibilityScope } = await import('@/lib/crm-visibility');
  const visibility = await resolveCrmVisibilityScope(scope.session);
  const username = String(scope.session.username || '').trim();

  if (
    visibility.salesAgentId &&
    row.salesperson_id &&
    String(row.salesperson_id) === visibility.salesAgentId
  ) {
    return true;
  }
  if (username && row.created_by && String(row.created_by) === username) {
    return true;
  }

  // Fall back to lead ownership for the bound inquiry.
  let leadId: string | null = null;
  if (row.lead_inquiry_id) {
    const { data: inquiry } = await supabase
      .from('lead_inquiries')
      .select('lead_id')
      .eq('id', row.lead_inquiry_id)
      .maybeSingle();
    leadId = inquiry?.lead_id ? String(inquiry.lead_id) : null;
  }

  if (!leadId && visibility.salesAgentId) {
    const { data: leadByOpp } = await supabase
      .from('leads')
      .select('id, sales_agent_id')
      .eq('crm_opportunity_id', row.id)
      .maybeSingle();
    if (
      leadByOpp &&
      visibility.salesAgentId &&
      String(leadByOpp.sales_agent_id) === visibility.salesAgentId
    ) {
      return true;
    }
  }

  if (leadId && visibility.salesAgentId) {
    const { data: lead } = await supabase
      .from('leads')
      .select('id, sales_agent_id')
      .eq('id', leadId)
      .maybeSingle();
    if (lead && String(lead.sales_agent_id) === visibility.salesAgentId) {
      return true;
    }
  }

  return false;
}

async function mapOpportunityContext(
  scope: Exclude<Awaited<ReturnType<typeof resolveCrmOrganizationScope>>, { error: string }>,
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  data: OpportunityRow
): Promise<Exclude<OpportunityInquiryContext, { error: string }>> {
  // Best-effort repair: assign the viewer's org when the opportunity has none.
  if (!data.organization_id && scope.organizationId && !scope.isGlobalAdminView) {
    const { error: repairError } = await supabase
      .from('crm_opportunities')
      .update({ organization_id: scope.organizationId, updated_at: new Date().toISOString() })
      .eq('id', data.id)
      .is('organization_id', null);
    if (!repairError) {
      data = { ...data, organization_id: scope.organizationId };
    }
  }

  const { data: stageRow } = await supabase
    .from('crm_pipeline_stages')
    .select('name, is_won, is_lost')
    .eq('id', data.stage_id)
    .maybeSingle();
  const stageName = String(stageRow?.name || '');

  let customerName: string | null = null;
  let contactPersonName: string | null = null;
  let salespersonName: string | null = null;

  const contactPromise = data.contact_id
    ? supabase
        .from('contacts')
        .select('name, company_name')
        .eq('id', data.contact_id)
        .maybeSingle()
    : Promise.resolve({ data: null });
  const personPromise = data.contact_person_id
    ? supabase
        .from('contacts')
        .select('name')
        .eq('id', data.contact_person_id)
        .maybeSingle()
    : Promise.resolve({ data: null });
  const agentPromise = data.salesperson_id
    ? supabase
        .from('sales_agents')
        .select('name, username')
        .eq('id', data.salesperson_id)
        .maybeSingle()
    : Promise.resolve({ data: null });

  const [contactRes, personRes, agentRes] = await Promise.all([
    contactPromise,
    personPromise,
    agentPromise,
  ]);

  if (contactRes.data) {
    customerName =
      String(contactRes.data.name || contactRes.data.company_name || '').trim() || null;
  }
  if (personRes.data?.name) {
    contactPersonName = String(personRes.data.name);
  }
  if (agentRes.data) {
    salespersonName = agentRes.data.name
      ? String(agentRes.data.name)
      : agentRes.data.username
        ? String(agentRes.data.username)
        : null;
  }

  return {
    scope,
    supabase,
    opportunity: {
      id: String(data.id),
      name: String(data.name),
      stage_name: stageName,
      stage_is_won: Boolean(stageRow?.is_won),
      stage_is_lost: Boolean(stageRow?.is_lost),
      contact_id: data.contact_id ? String(data.contact_id) : null,
      customer_name: customerName,
      contact_person_name: contactPersonName,
      email: data.email ? String(data.email) : null,
      phone: data.phone ? String(data.phone) : null,
      mobile: data.mobile ? String(data.mobile) : null,
      source: data.source ? String(data.source) : null,
      salesperson_id: data.salesperson_id ? String(data.salesperson_id) : null,
      organization_id: data.organization_id
        ? String(data.organization_id)
        : String(scope.organizationId || ''),
      salesperson_name: salespersonName,
      lead_inquiry_id: data.lead_inquiry_id ? String(data.lead_inquiry_id) : null,
    },
  };
}

async function loadOpportunityContext(
  opportunityId: string,
  options?: { inquiryId?: string | null }
): Promise<OpportunityInquiryContext> {
  const scope = await resolveCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const supabase = await createAdminClient();
  const candidateIds: string[] = [];
  if (opportunityId?.trim()) candidateIds.push(opportunityId.trim());

  const inquiryId = options?.inquiryId?.trim() || '';
  if (inquiryId) {
    const fromInquiry = await resolveOpportunityIdFromInquiry(supabase, inquiryId);
    if (fromInquiry && !candidateIds.includes(fromInquiry)) {
      candidateIds.push(fromInquiry);
    }
  }

  if (candidateIds.length === 0) {
    return { error: 'Opportunity not found.' };
  }

  for (const candidateId of candidateIds) {
    // 1) Preferred: active organization scope (pipeline list behavior).
    if (!scope.isGlobalAdminView && scope.organizationId) {
      const scoped = await fetchOpportunityById(supabase, candidateId, scope.organizationId);
      if (scoped.error && !/not found/i.test(scoped.error)) {
        // keep trying unscoped / other candidates
      }
      if (scoped.data) {
        return mapOpportunityContext(scope, supabase, scoped.data);
      }
    }

    // 2) Deep-link fallback: load by id without org filter (null / mismatched org).
    const unscoped = await fetchOpportunityById(supabase, candidateId, null);
    if (unscoped.error) return { error: unscoped.error };
    if (unscoped.data) {
      const allowed = await canAccessOpportunityDeepLink(scope, supabase, unscoped.data);
      if (allowed) {
        return mapOpportunityContext(scope, supabase, unscoped.data);
      }
    }
  }

  return { error: 'Opportunity not found.' };
}

function inquiriesForCrmOpportunity(
  inquiries: LeadInquiry[],
  opportunityId: string,
  leadInquiryId: string | null
): LeadInquiry[] {
  const visible = inquiries.filter((inq) => String(inq.status || '').toLowerCase() !== 'draft');
  const bound = visible.filter((inq) => {
    if (leadInquiryId && inq.id === leadInquiryId) return true;
    if (inq.crm_opportunity_id && String(inq.crm_opportunity_id) === opportunityId) {
      return true;
    }
    return false;
  });
  if (bound.length > 0) return bound;
  const anyLinked = visible.some((inq) => Boolean(inq.crm_opportunity_id));
  if (!leadInquiryId && !anyLinked) return visible;
  return bound;
}

function mapLeadRow(row: Record<string, unknown>): Lead {
  return {
    id: String(row.id),
    lead_id_formatted: row.lead_id_formatted ? String(row.lead_id_formatted) : null,
    name: String(row.name || ''),
    number: String(row.number || ''),
    source: normalizeLeadSource(row.source as string | null),
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

async function syncLeadCustomerIdFromContact(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  leadRow: Record<string, unknown>,
  contactId: string | null
): Promise<Lead> {
  const current = leadRow.lead_id_formatted
    ? String(leadRow.lead_id_formatted).trim()
    : '';
  // Fast path: bridge lead already has a valid Customer ID.
  if (/^\d{6}$/.test(current)) {
    return mapLeadRow(leadRow);
  }

  const resolvedContactId =
    contactId || (leadRow.contact_id ? String(leadRow.contact_id) : null);
  if (!resolvedContactId) return mapLeadRow(leadRow);

  const customerId = await resolveContactCustomerId(supabase, resolvedContactId);
  if (!customerId) return mapLeadRow(leadRow);

  if (current !== customerId) {
    await supabase
      .from('leads')
      .update({ lead_id_formatted: customerId })
      .eq('id', String(leadRow.id));
  }

  return mapLeadRow({ ...leadRow, lead_id_formatted: customerId });
}

async function resolveLeadForCrmOpportunityWithContext(
  ctx: Exclude<OpportunityInquiryContext, { error: string }>,
  opportunityId: string
): Promise<{ lead: Lead } | { error: string }> {
  const { supabase, opportunity, scope } = ctx;

  const trySelectLead = async (leadId: string) => {
    const withBridge = await supabase
      .from('leads')
      .select(
        'id, lead_id_formatted, name, number, source, status, sales_agent_id, created_by_sales_agent_id, transferred_from_sales_agent_id, transferred_at, converted, created_at, updated_at, contact_id, crm_opportunity_id'
      )
      .eq('id', leadId)
      .maybeSingle();
    if (!withBridge.error) return (withBridge.data as Record<string, unknown> | null);
    if (!/crm_opportunity_id|column/i.test(withBridge.error.message)) return null;
    const fallback = await supabase
      .from('leads')
      .select(
        'id, lead_id_formatted, name, number, source, status, sales_agent_id, created_by_sales_agent_id, transferred_from_sales_agent_id, transferred_at, converted, created_at, updated_at, contact_id'
      )
      .eq('id', leadId)
      .maybeSingle();
    return (fallback.data as Record<string, unknown> | null) || null;
  };

  const leadSelect =
    'id, lead_id_formatted, name, number, source, status, sales_agent_id, created_by_sales_agent_id, transferred_from_sales_agent_id, transferred_at, converted, created_at, updated_at, contact_id, crm_opportunity_id';

  // Prefer the lead that owns this opportunity's bound inquiry
  if (opportunity.lead_inquiry_id) {
    const { data: inquiryLead } = await supabase
      .from('lead_inquiries')
      .select('lead_id')
      .eq('id', opportunity.lead_inquiry_id)
      .maybeSingle();
    if (inquiryLead?.lead_id) {
      const bound = await trySelectLead(String(inquiryLead.lead_id));
      if (bound) {
        return {
          lead: await syncLeadCustomerIdFromContact(
            supabase,
            bound,
            opportunity.contact_id
          ),
        };
      }
    }
  }

  const { data: byOpp } = await supabase
    .from('leads')
    .select(leadSelect)
    .eq('crm_opportunity_id', opportunityId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (byOpp) {
    return {
      lead: await syncLeadCustomerIdFromContact(
        supabase,
        byOpp as Record<string, unknown>,
        opportunity.contact_id
      ),
    };
  }

  if (opportunity.contact_id) {
    const { data: byContact } = await supabase
      .from('leads')
      .select(leadSelect)
      .eq('contact_id', opportunity.contact_id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (byContact) {
      void supabase
        .from('leads')
        .update({ crm_opportunity_id: opportunityId })
        .eq('id', byContact.id)
        .is('crm_opportunity_id', null);
      return {
        lead: await syncLeadCustomerIdFromContact(
          supabase,
          byContact as Record<string, unknown>,
          opportunity.contact_id
        ),
      };
    }

    const { data: contact } = await supabase
      .from('contacts')
      .select('legacy_lead_id, name, phone, source')
      .eq('id', opportunity.contact_id)
      .maybeSingle();

    if (contact?.legacy_lead_id) {
      const legacy = await trySelectLead(String(contact.legacy_lead_id));
      if (legacy) {
        void supabase
          .from('leads')
          .update({
            crm_opportunity_id: opportunityId,
            contact_id: opportunity.contact_id,
          })
          .eq('id', legacy.id as string);
        return {
          lead: await syncLeadCustomerIdFromContact(
            supabase,
            legacy,
            opportunity.contact_id
          ),
        };
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
  // leads.source CHECK allows only Meta|LinkedIn|WhatsApp|Others.
  // crm_opportunities.source is free-text (e.g. contact_auto) — never copy raw.
  const source = normalizeLeadSource(opportunity.source);

  let customerId: string | null = null;
  if (opportunity.contact_id) {
    customerId = await resolveContactCustomerId(supabase, opportunity.contact_id);
  }

  if (!customerId) {
    return {
      error:
        'This contact has no Customer ID. Open the contact and save it so a permanent Customer ID can be assigned, then try again.',
    };
  }

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
    lead_id_formatted: customerId,
  };

  const { data: created, error } = await supabase
    .from('leads')
    .insert(insertRow)
    .select(leadSelect)
    .single();

  if (error || !created) {
    return { error: error?.message || 'Failed to create inquiry bridge lead.' };
  }

  return { lead: mapLeadRow(created as Record<string, unknown>) };
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

  return resolveLeadForCrmOpportunityWithContext(ctx, opportunityId);
}

export async function getCrmOpportunityInquiryBootstrap(
  opportunityId: string,
  inquiryId?: string | null
): Promise<{ bootstrap: CrmOpportunityInquiryBootstrap } | { error: string }> {
  const auth = await requireAnyChildModule(['crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const ctx = await loadOpportunityContext(opportunityId, { inquiryId });
  if ('error' in ctx) return { error: ctx.error };

  // Single opportunity load — resolve lead reuses the same context.
  const leadResult = await resolveLeadForCrmOpportunityWithContext(ctx, ctx.opportunity.id);
  if ('error' in leadResult) return { error: leadResult.error };

  const [access, listed] = await Promise.all([
    canAccessLeadForInquiry(ctx.scope.session, ctx.supabase, leadResult.lead.id, {
      crmOpportunityId: ctx.opportunity.id,
    }),
    listInquiriesForLead(ctx.supabase, leadResult.lead.id, ctx.scope.session.role),
  ]);

  if (!access.allowed) return { error: access.error || 'Unauthorized' };
  if ('error' in listed) return { error: listed.error };

  const inquiries = inquiriesForCrmOpportunity(
    listed.inquiries || [],
    ctx.opportunity.id,
    ctx.opportunity.lead_inquiry_id
  );
  // Prefer the notification's inquiryId when it belongs to this opportunity/lead.
  const preferredInquiryId = inquiryId?.trim() || null;
  if (
    preferredInquiryId &&
    !inquiries.some((inq) => inq.id === preferredInquiryId) &&
    (listed.inquiries || []).some((inq) => inq.id === preferredInquiryId)
  ) {
    const preferred = (listed.inquiries || []).find((inq) => inq.id === preferredInquiryId);
    if (preferred && String(preferred.status || '').toLowerCase() !== 'draft') {
      inquiries.unshift(preferred);
    }
  }

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
        lead_inquiry_id: preferredInquiryId || ctx.opportunity.lead_inquiry_id,
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
  const ctx = await loadOpportunityContext(opportunityId);
  const leadInquiryId = 'opportunity' in ctx ? ctx.opportunity.lead_inquiry_id : null;

  let query = supabase
    .from('lead_inquiries')
    .select('id, status, approval_status, product_name, sent_at, created_at')
    .order('created_at', { ascending: false });

  if (leadInquiryId) {
    query = query.eq('id', leadInquiryId);
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
  /** Skip Next.js revalidation — inquiry UI updates optimistically. */
  skipRevalidate?: boolean;
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

  if (!input.skipRevalidate) {
    revalidatePath(`/crm/opportunities/${input.opportunityId}`);
    revalidatePath(`/crm/opportunities/${input.opportunityId}/inquiry`);
  }
}
