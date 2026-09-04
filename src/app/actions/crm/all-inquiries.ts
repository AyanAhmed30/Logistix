'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession, type SessionPayload } from '@/lib/auth/session';
import { sessionHasCrmAccess, sessionHasSalesAccess } from '@/lib/auth/require-access';
import { resolveCrmOrganizationScope } from '@/app/actions/crm/shared';
import { canAccessLeadForInquiry } from '@/lib/inquiry-crm-access';
import { resolveCrmVisibilityScope } from '@/lib/crm-visibility';
import {
  applyOrganizationFilter,
  isMissingOrganizationColumnError,
} from '@/lib/admin-organization-context';
import {
  collectInquiryAttachmentUrls,
  collectOperationsConfirmationAttachmentUrls,
} from '@/lib/inquiry-attachments';
import {
  buildApprovedInquiryPricing,
  parsePricingConfig,
  parseStoredCalculatorPayload,
} from '@/lib/inquiry-calculator';
import {
  resolveInquiryWorkflowStatus,
  type InquiryWorkflowStatus,
} from '@/lib/inquiry-workflow';

const LIST_SELECT = `
  id,
  lead_id,
  product_name,
  quantity,
  description,
  sent_to_accounting,
  sent_at,
  approval_status,
  approved_at,
  created_at,
  updated_at,
  organization_id,
  created_by,
  crm_opportunity_id,
  leads!inner (
    id,
    lead_id_formatted,
    contact_id,
    name,
    number,
    sales_agent_id,
    organization_id,
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

const DETAIL_SELECT = `
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
  organization_id,
  crm_opportunity_id,
  created_by,
  created_at,
  updated_at,
  leads (
    id,
    lead_id_formatted,
    contact_id,
    name,
    number,
    source,
    sales_agent_id,
    organization_id,
    crm_opportunity_id,
    sales_agents!leads_sales_agent_id_fkey (
      id,
      name,
      username
    )
  ),
  inquiry_confirmations (
    id,
    status,
    created_at,
    hs_code,
    product_name,
    total_weight,
    cbm,
    quantity,
    original_image_url,
    sales_additional_image_urls,
    additional_image_1_url,
    additional_image_2_url,
    operations_additional_image_urls,
    calculator_values,
    submitted_by,
    reviewed_by,
    reviewed_at,
    rejection_reason
  )
`;

export type SalesAllInquiryListItem = {
  id: string;
  product_name: string;
  customer_name: string;
  lead_number: string;
  quantity: string;
  sent_at: string | null;
  workflow: InquiryWorkflowStatus;
};

export type SalesInquiryCustomerDetails = {
  id: string | null;
  name: string;
  company_name: string | null;
  company_type: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  website: string | null;
  job_position: string | null;
  industry: string | null;
  tax_id: string | null;
  street: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  lead_id_formatted: string | null;
};

export type SalesInquiryDetail = {
  id: string;
  lead_id: string;
  lead_number: string;
  product_name: string;
  quantity: string;
  total_weight: string;
  cbm: string;
  description: string;
  link_url: string | null;
  hs_code: string;
  sent_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  sales_agent_name: string | null;
  opportunity_id: string | null;
  opportunity_name: string | null;
  workflow: InquiryWorkflowStatus;
  customer: SalesInquiryCustomerDetails;
  calculator_values: Record<string, unknown> | null;
  operations_description: string;
  valuation_ruling_applied: string;
  valuation_ruling_number: string;
  valuation_ruling_attachment_url: string;
  sales_attachment_urls: string[];
  operations_attachment_urls: string[];
  confirmation: {
    id: string;
    status: string;
    submitted_by: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    rejection_reason: string | null;
  } | null;
  pricing: {
    unit_price: number;
    total_amount: number;
    final_price: number;
  } | null;
};

type LeadEmbed = {
  id?: string;
  lead_id_formatted?: string | null;
  contact_id?: string | null;
  name?: string | null;
  number?: string | null;
  source?: string | null;
  sales_agent_id?: string | null;
  organization_id?: string | null;
  crm_opportunity_id?: string | null;
  sales_agents?:
    | { id?: string; name?: string | null; username?: string | null }
    | { id?: string; name?: string | null; username?: string | null }[]
    | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function leadFromRow(row: Record<string, unknown>): LeadEmbed | null {
  return firstEmbed(row.leads as LeadEmbed | LeadEmbed[] | null);
}

function salesAgentName(lead: LeadEmbed | null): string | null {
  const agent = firstEmbed(lead?.sales_agents ?? null);
  return agent?.name ? String(agent.name) : null;
}

function confirmationsFromRow(row: Record<string, unknown>): Array<{
  id?: string;
  status?: string;
  created_at?: string;
}> {
  const raw = row.inquiry_confirmations;
  return Array.isArray(raw) ? (raw as Array<{ id?: string; status?: string; created_at?: string }>) : [];
}

async function requireSalesInquiryAccess(): Promise<
  { session: SessionPayload } | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };
  if (!sessionHasCrmAccess(session) && !sessionHasSalesAccess(session)) {
    return { error: 'Unauthorized' };
  }
  return { session };
}

function rowMatchesAssignedVisibility(
  row: Record<string, unknown>,
  salesAgentId: string | null,
  username: string
): boolean {
  const lead = leadFromRow(row);
  if (salesAgentId && String(lead?.sales_agent_id || '') === salesAgentId) return true;
  if (username && String(row.created_by || '') === username) return true;
  return false;
}

export async function getSalesAllInquiries(): Promise<
  { inquiries: SalesAllInquiryListItem[] } | { error: string }
> {
  try {
    const auth = await requireSalesInquiryAccess();
    if ('error' in auth) return { error: auth.error };

    const scope = await resolveCrmOrganizationScope();
    if ('error' in scope) return { error: scope.error };

    const visibility = await resolveCrmVisibilityScope(auth.session);
    const supabase = await createAdminClient();

    let query = supabase
      .from('lead_inquiries')
      .select(LIST_SELECT)
      .eq('sent_to_accounting', true)
      .order('sent_at', { ascending: false });

    if (scope.organizationId) {
      query = applyOrganizationFilter(query, scope.organizationId);
    }

    if (visibility.mode === 'assigned' && visibility.salesAgentId) {
      query = query.eq('leads.sales_agent_id', visibility.salesAgentId);
    }

    const { data, error } = await query;

    if (error && scope.organizationId && isMissingOrganizationColumnError(error)) {
      let fallback = supabase
        .from('lead_inquiries')
        .select(LIST_SELECT)
        .eq('sent_to_accounting', true)
        .order('sent_at', { ascending: false });
      if (visibility.mode === 'assigned' && visibility.salesAgentId) {
        fallback = fallback.eq('leads.sales_agent_id', visibility.salesAgentId);
      }
      const retry = await fallback;
      if (retry.error) return { error: retry.error.message };
      return { inquiries: mapListRows(retry.data || [], visibility, auth.session.username) };
    }

    if (error) return { error: error.message };
    return { inquiries: mapListRows(data || [], visibility, auth.session.username) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load inquiries' };
  }
}

function mapListRows(
  rows: unknown[],
  visibility: Awaited<ReturnType<typeof resolveCrmVisibilityScope>>,
  username: string
): SalesAllInquiryListItem[] {
  const filtered =
    visibility.mode === 'assigned' && !visibility.salesAgentId
      ? (rows as Record<string, unknown>[]).filter((row) =>
          rowMatchesAssignedVisibility(row, visibility.salesAgentId, username)
        )
      : (rows as Record<string, unknown>[]);

  return filtered.map((row) => {
    const lead = leadFromRow(row);
    const workflow = resolveInquiryWorkflowStatus({
      sent_to_accounting: Boolean(row.sent_to_accounting),
      approval_status: row.approval_status ? String(row.approval_status) : null,
      confirmations: confirmationsFromRow(row),
    });
    return {
      id: String(row.id),
      product_name: String(row.product_name || 'Inquiry'),
      customer_name: String(lead?.name || '').trim() || '—',
      lead_number: String(lead?.lead_id_formatted || '').trim() || '—',
      quantity: String(row.quantity || '').trim(),
      sent_at: row.sent_at ? String(row.sent_at) : null,
      workflow,
    };
  });
}

export async function getSalesInquiryDetail(
  inquiryId: string
): Promise<{ inquiry: SalesInquiryDetail } | { error: string }> {
  try {
    const auth = await requireSalesInquiryAccess();
    if ('error' in auth) return { error: auth.error };
    if (!inquiryId?.trim()) return { error: 'Inquiry id is required' };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('lead_inquiries')
      .select(DETAIL_SELECT)
      .eq('id', inquiryId.trim())
      .maybeSingle();

    if (error) return { error: error.message };
    if (!data) return { error: 'Inquiry not found' };

    const row = data as Record<string, unknown>;
    if (!row.sent_to_accounting) {
      return { error: 'Inquiry not found' };
    }

    const lead = leadFromRow(row);
    const leadId = String(row.lead_id || lead?.id || '');
    const access = await canAccessLeadForInquiry(auth.session, supabase, leadId, {
      crmOpportunityId: row.crm_opportunity_id ? String(row.crm_opportunity_id) : null,
    });
    if (!access.allowed) {
      return { error: access.error || 'Unauthorized' };
    }

    const confirmations = Array.isArray(row.inquiry_confirmations)
      ? [...(row.inquiry_confirmations as Record<string, unknown>[])].sort((a, b) => {
          const aTime = a.created_at ? new Date(String(a.created_at)).getTime() : 0;
          const bTime = b.created_at ? new Date(String(b.created_at)).getTime() : 0;
          return bTime - aTime;
        })
      : [];
    const latestConfirmation = confirmations[0] || null;
    const approvedConfirmation =
      confirmations.find((c) => String(c.status || '') === 'approved') || latestConfirmation;

    const calculatorRaw =
      asRecord(row.calculator_values) ||
      asRecord(approvedConfirmation?.calculator_values) ||
      null;
    const parsed = parseStoredCalculatorPayload(calculatorRaw);
    const primary = parsed.calculators[0] || {};
    const hsCode =
      String(approvedConfirmation?.hs_code || primary.hs_code || '').trim();

    const pricing = buildApprovedInquiryPricing(calculatorRaw, {
      weightKg: String(row.total_weight || approvedConfirmation?.total_weight || ''),
      quantity: String(row.quantity || approvedConfirmation?.quantity || ''),
      cbm: String(row.cbm || approvedConfirmation?.cbm || ''),
      pricingConfig: parsePricingConfig(primary),
    });

    const salesUrls = collectInquiryAttachmentUrls(
      String(row.image_url || approvedConfirmation?.original_image_url || '') || null,
      Array.isArray(row.additional_image_urls)
        ? (row.additional_image_urls as string[])
        : Array.isArray(approvedConfirmation?.sales_additional_image_urls)
          ? (approvedConfirmation?.sales_additional_image_urls as string[])
          : []
    );

    const operationsUrls = approvedConfirmation
      ? collectOperationsConfirmationAttachmentUrls({
          operations_additional_image_urls: Array.isArray(
            approvedConfirmation.operations_additional_image_urls
          )
            ? (approvedConfirmation.operations_additional_image_urls as string[])
            : null,
          additional_image_1_url: approvedConfirmation.additional_image_1_url
            ? String(approvedConfirmation.additional_image_1_url)
            : null,
          additional_image_2_url: approvedConfirmation.additional_image_2_url
            ? String(approvedConfirmation.additional_image_2_url)
            : null,
          calculator_values: asRecord(approvedConfirmation.calculator_values),
        }).filter((url) => url !== parsed.valuationRulingAttachmentUrl)
      : [];

    let customer = await loadCustomerForInquiry(supabase, {
      contactId: lead?.contact_id ? String(lead.contact_id) : null,
      leadName: String(lead?.name || ''),
      leadPhone: String(lead?.number || ''),
      leadNumber: String(lead?.lead_id_formatted || ''),
    });

    let opportunityName: string | null = null;
    const opportunityId = row.crm_opportunity_id
      ? String(row.crm_opportunity_id)
      : lead?.crm_opportunity_id
        ? String(lead.crm_opportunity_id)
        : null;
    if (opportunityId) {
      const { data: opp } = await supabase
        .from('crm_opportunities')
        .select('name, contact_id, email, phone, mobile')
        .eq('id', opportunityId)
        .maybeSingle();
      opportunityName = opp?.name ? String(opp.name) : null;
      if (opp && !customer.id && opp.contact_id) {
        customer = await loadCustomerForInquiry(supabase, {
          contactId: String(opp.contact_id),
          leadName: customer.name,
          leadPhone: customer.phone || String(opp.phone || opp.mobile || ''),
          leadNumber: customer.lead_id_formatted || '',
        });
      } else if (opp) {
        customer = {
          ...customer,
          email: customer.email || (opp.email ? String(opp.email) : null),
          phone: customer.phone || (opp.phone ? String(opp.phone) : null),
          mobile: customer.mobile || (opp.mobile ? String(opp.mobile) : null),
        };
      }
    }

    const workflow = resolveInquiryWorkflowStatus({
      sent_to_accounting: Boolean(row.sent_to_accounting),
      approval_status: row.approval_status ? String(row.approval_status) : null,
      confirmations,
    });

    return {
      inquiry: {
        id: String(row.id),
        lead_id: leadId,
        lead_number: String(lead?.lead_id_formatted || '').trim() || '—',
        product_name: String(row.product_name || ''),
        quantity: String(row.quantity || ''),
        total_weight: String(row.total_weight || ''),
        cbm: String(row.cbm || ''),
        description: String(row.description || ''),
        link_url: row.link_url ? String(row.link_url) : null,
        hs_code: hsCode,
        sent_at: row.sent_at ? String(row.sent_at) : null,
        approved_at: row.approved_at ? String(row.approved_at) : null,
        created_at: String(row.created_at || ''),
        updated_at: String(row.updated_at || ''),
        sales_agent_name: salesAgentName(lead),
        opportunity_id: opportunityId,
        opportunity_name: opportunityName,
        workflow,
        customer,
        calculator_values: calculatorRaw,
        operations_description: parsed.operationsDescription,
        valuation_ruling_applied: parsed.valuationRulingApplied,
        valuation_ruling_number: parsed.valuationRulingNumber,
        valuation_ruling_attachment_url: parsed.valuationRulingAttachmentUrl,
        sales_attachment_urls: salesUrls,
        operations_attachment_urls: operationsUrls,
        confirmation: latestConfirmation
          ? {
              id: String(latestConfirmation.id || ''),
              status: String(latestConfirmation.status || ''),
              submitted_by: latestConfirmation.submitted_by
                ? String(latestConfirmation.submitted_by)
                : null,
              reviewed_by: latestConfirmation.reviewed_by
                ? String(latestConfirmation.reviewed_by)
                : null,
              reviewed_at: latestConfirmation.reviewed_at
                ? String(latestConfirmation.reviewed_at)
                : null,
              rejection_reason: latestConfirmation.rejection_reason
                ? String(latestConfirmation.rejection_reason)
                : null,
            }
          : null,
        pricing: pricing
          ? {
              unit_price: pricing.unit_price,
              total_amount: pricing.total_amount,
              final_price: pricing.final_price,
            }
          : null,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load inquiry' };
  }
}

async function loadCustomerForInquiry(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  input: {
    contactId: string | null;
    leadName: string;
    leadPhone: string;
    leadNumber: string;
  }
): Promise<SalesInquiryCustomerDetails> {
  const fallback: SalesInquiryCustomerDetails = {
    id: null,
    name: input.leadName || '—',
    company_name: null,
    company_type: null,
    email: null,
    phone: input.leadPhone || null,
    mobile: null,
    website: null,
    job_position: null,
    industry: null,
    tax_id: null,
    street: null,
    street2: null,
    city: null,
    state: null,
    zip: null,
    country: null,
    lead_id_formatted: input.leadNumber || null,
  };

  if (!input.contactId) return fallback;

  const { data: contact } = await supabase
    .from('contacts')
    .select(
      'id, name, company_name, company_type, email, phone, mobile, website, job_position, industry, tax_id, street, street2, city, state, zip, country, lead_id_formatted'
    )
    .eq('id', input.contactId)
    .maybeSingle();

  if (!contact) return fallback;

  return {
    id: String(contact.id),
    name: String(contact.name || fallback.name),
    company_name: contact.company_name ? String(contact.company_name) : null,
    company_type: contact.company_type ? String(contact.company_type) : null,
    email: contact.email ? String(contact.email) : null,
    phone: contact.phone ? String(contact.phone) : fallback.phone,
    mobile: contact.mobile ? String(contact.mobile) : null,
    website: contact.website ? String(contact.website) : null,
    job_position: contact.job_position ? String(contact.job_position) : null,
    industry: contact.industry ? String(contact.industry) : null,
    tax_id: contact.tax_id ? String(contact.tax_id) : null,
    street: contact.street ? String(contact.street) : null,
    street2: contact.street2 ? String(contact.street2) : null,
    city: contact.city ? String(contact.city) : null,
    state: contact.state ? String(contact.state) : null,
    zip: contact.zip ? String(contact.zip) : null,
    country: contact.country ? String(contact.country) : null,
    lead_id_formatted: contact.lead_id_formatted
      ? String(contact.lead_id_formatted)
      : fallback.lead_id_formatted,
  };
}
