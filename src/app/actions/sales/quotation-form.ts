'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession, type SessionPayload } from '@/lib/auth/session';
import { sessionHasSalesAccess } from '@/lib/auth/require-access';
import {
  computeOrderDeliveryFulfillment,
  fulfillmentToLegacyDeliveryStatus,
  validateDeliveredQuantity,
} from '@/lib/sales-delivery-status';
import {
  mapQuotationDbStatusToUi,
  type SalesQuotationUiStatus,
} from '@/lib/sales-navigation';

export type SalesQuotationLineInput = {
  id?: string | null;
  product_id?: string | null;
  sequence?: number;
  product_name: string;
  description?: string | null;
  quantity: number;
  qty_delivered?: number;
  uom: string;
  unit_price: number;
  discount: number;
  taxes: number;
  display_type?: 'product' | 'line_section' | 'line_note';
};

export type SalesQuotationFormPayload = {
  contact_id: string | null;
  customer_name: string;
  contact_person_id?: string | null;
  delivery_address_id?: string | null;
  invoice_address_id?: string | null;
  salesperson_id?: string | null;
  sales_team?: string | null;
  customer_reference?: string | null;
  pricelist?: string | null;
  fiscal_position?: string | null;
  payment_terms?: string | null;
  quotation_date?: string | null;
  expiration_date?: string | null;
  internal_notes?: string | null;
  customer_notes?: string | null;
  opportunity_id?: string | null;
  linked_inquiry_id?: string | null;
  lines: SalesQuotationLineInput[];
};

export type SalesQuotationLine = {
  id: string;
  quotation_id: string;
  product_id: string | null;
  sequence: number;
  product_name: string;
  description: string | null;
  quantity: number;
  qty_delivered: number;
  uom: string;
  unit_price: number;
  discount: number;
  taxes: number;
  line_total: number;
};

export type SalesQuotationDetail = {
  id: string;
  quotation_number: string;
  contact_id: string | null;
  customer_name: string;
  contact_person_id: string | null;
  delivery_address_id: string | null;
  invoice_address_id: string | null;
  salesperson_id: string | null;
  sales_team: string | null;
  customer_reference: string | null;
  pricelist: string | null;
  fiscal_position: string | null;
  payment_terms: string;
  quotation_date: string | null;
  expiration_date: string | null;
  internal_notes: string | null;
  customer_notes: string | null;
  opportunity_id: string | null;
  organization_id: string | null;
  status: string;
  status_ui: SalesQuotationUiStatus;
  is_locked: boolean;
  delivery_status: 'waiting' | 'ready' | 'delivered';
  revision: number;
  total_amount: number;
  untaxed_amount: number;
  tax_amount: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  linked_inquiry_id?: string | null;
  customer_pdf_url?: string | null;
  customer_pdf_path?: string | null;
  sent_to_customer_at?: string | null;
  sent_to_customer_by?: string | null;
  lines: SalesQuotationLine[];
  opportunity_name?: string | null;
  salesperson_name?: string | null;
};

export type SalesQuotationVersion = {
  id: string;
  quotation_id: string;
  revision: number;
  status: string | null;
  created_by: string | null;
  created_at: string;
};

export type SalesQuotationLog = {
  id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  performed_by: string;
  performed_at: string;
  details: Record<string, unknown> | null;
};

function lineTotal(line: {
  quantity: number;
  unit_price: number;
  discount: number;
  taxes: number;
}) {
  const qty = Number(line.quantity) || 0;
  const price = Number(line.unit_price) || 0;
  const discount = Math.min(100, Math.max(0, Number(line.discount) || 0));
  const taxRate = Math.max(0, Number(line.taxes) || 0);
  const base = qty * price * (1 - discount / 100);
  const tax = base * (taxRate / 100);
  return {
    untaxed: Math.round(base * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round((base + tax) * 100) / 100,
  };
}

function summarizeLines(lines: SalesQuotationLineInput[]) {
  let untaxed = 0;
  let tax = 0;
  let total = 0;
  for (const line of lines) {
    const displayType =
      line.display_type ||
      (Number(line.quantity) === 0 && Number(line.unit_price) === 0
        ? line.product_name === 'Note'
          ? 'line_note'
          : 'line_section'
        : 'product');
    if (displayType !== 'product') continue;
    const amounts = lineTotal(line);
    untaxed += amounts.untaxed;
    tax += amounts.tax;
    total += amounts.total;
  }
  return {
    untaxed: Math.round(untaxed * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

async function resolveSalesOrgScope() {
  const { requireAdminOrganizationScope, sessionUsesOrganizationScope } = await import(
    '@/lib/admin-organization-context'
  );
  const session = await getSession();
  if (!session || !sessionHasSalesAccess(session)) {
    return { error: 'Unauthorized' as const };
  }

  if (!sessionUsesOrganizationScope(session.role)) {
    return { session, organizationId: null as string | null, isGlobalAdminView: false };
  }

  const scope = await requireAdminOrganizationScope();
  if ('error' in scope) {
    if (scope.status === 403) {
      return {
        session,
        organizationId: null as string | null,
        isGlobalAdminView: false,
        empty: true as const,
      };
    }
    return { error: scope.error };
  }

  const { isSuperAdminInAdminContext } = await import('@/lib/auth/super-admin');
  if (!scope.organizationId && isSuperAdminInAdminContext(scope.session)) {
    return { session: scope.session, organizationId: null, isGlobalAdminView: true };
  }

  if (!scope.organizationId) {
    return {
      error: 'Select an organization from the header switcher to use Sales.',
    };
  }

  return {
    session: scope.session,
    organizationId: scope.organizationId,
    isGlobalAdminView: false,
  };
}

async function generateQuotationNumber(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  organizationId: string | null
): Promise<string> {
  const { allocateSalesQuotationNumber } = await import('@/lib/sales-numbering');
  return allocateSalesQuotationNumber(supabase, organizationId);
}

async function logAction(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  quotationId: string,
  action: string,
  performedBy: string,
  previousStatus?: string | null,
  newStatus?: string | null,
  details?: Record<string, unknown>
) {
  await supabase.from('quotation_logs').insert([
    {
      quotation_id: quotationId,
      action,
      previous_status: previousStatus || null,
      new_status: newStatus || null,
      performed_by: performedBy,
      details: details || null,
    },
  ]);
}

async function saveVersionSnapshot(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  quotationId: string,
  revision: number,
  status: string,
  snapshot: Record<string, unknown>,
  createdBy: string
) {
  await supabase.from('quotation_versions').insert([
    {
      quotation_id: quotationId,
      revision,
      status,
      snapshot,
      created_by: createdBy,
    },
  ]);
}

function isEditableStatus(status: string, isLocked: boolean) {
  if (isLocked) return false;
  if (status === 'cancelled') return false;
  // Confirmed Sales Orders remain editable until locked (Delivered qty, etc.)
  return true;
}

async function assertSalesRecordAccess(
  session: { username: string; role: string; permissions?: string[] | null },
  row: Record<string, unknown>
): Promise<string | null> {
  const { resolveSalesAccessRole, salesRoleSeesAllOrgRecords } = await import(
    '@/lib/sales-roles'
  );
  const role = resolveSalesAccessRole(session as SessionPayload);
  if (salesRoleSeesAllOrgRecords(role)) return null;

  if (String(row.created_by || '') === session.username) return null;

  const { resolveCurrentSalespersonId } = await import(
    '@/app/actions/sales/automation'
  );
  const agentId = await resolveCurrentSalespersonId();
  if (agentId && String(row.salesperson_id || '') === agentId) return null;

  return 'Access Denied';
}

function mapRowToDetail(
  row: Record<string, unknown>,
  lines: SalesQuotationLine[],
  extras?: { opportunity_name?: string | null; salesperson_name?: string | null }
): SalesQuotationDetail {
  const sums = summarizeLines(lines);
  const status = String(row.status || 'quotation');
  return {
    id: String(row.id),
    quotation_number: String(row.quotation_number || ''),
    contact_id: row.contact_id ? String(row.contact_id) : null,
    customer_name: String(row.customer_name || ''),
    contact_person_id: row.contact_person_id ? String(row.contact_person_id) : null,
    delivery_address_id: row.delivery_address_id ? String(row.delivery_address_id) : null,
    invoice_address_id: row.invoice_address_id ? String(row.invoice_address_id) : null,
    salesperson_id: row.salesperson_id ? String(row.salesperson_id) : null,
    sales_team: row.sales_team ? String(row.sales_team) : null,
    customer_reference: row.customer_reference ? String(row.customer_reference) : null,
    pricelist: row.pricelist ? String(row.pricelist) : null,
    fiscal_position: row.fiscal_position ? String(row.fiscal_position) : null,
    payment_terms: String(row.payment_terms || 'Immediate'),
    quotation_date: row.quotation_date ? String(row.quotation_date) : null,
    expiration_date: row.expiration_date ? String(row.expiration_date) : null,
    internal_notes: row.internal_notes ? String(row.internal_notes) : null,
    customer_notes: row.customer_notes ? String(row.customer_notes) : null,
    opportunity_id: row.opportunity_id ? String(row.opportunity_id) : null,
    organization_id: row.organization_id ? String(row.organization_id) : null,
    status,
    status_ui: mapQuotationDbStatusToUi(status),
    is_locked: Boolean(row.is_locked),
    delivery_status: (['waiting', 'ready', 'delivered'].includes(
      String(row.delivery_status || '')
    )
      ? String(row.delivery_status)
      : 'waiting') as 'waiting' | 'ready' | 'delivered',
    revision: Number(row.revision) || 1,
    total_amount: Number(row.total_amount) || sums.total,
    untaxed_amount: sums.untaxed,
    tax_amount: sums.tax,
    created_by: String(row.created_by || ''),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
    linked_inquiry_id: row.linked_inquiry_id ? String(row.linked_inquiry_id) : null,
    customer_pdf_url: row.customer_pdf_url ? String(row.customer_pdf_url) : null,
    customer_pdf_path: row.customer_pdf_path ? String(row.customer_pdf_path) : null,
    sent_to_customer_at: row.sent_to_customer_at ? String(row.sent_to_customer_at) : null,
    sent_to_customer_by: row.sent_to_customer_by ? String(row.sent_to_customer_by) : null,
    lines,
    opportunity_name: extras?.opportunity_name ?? null,
    salesperson_name: extras?.salesperson_name ?? null,
  };
}

async function loadLines(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  quotationId: string,
  fallbackRow?: Record<string, unknown>
): Promise<SalesQuotationLine[]> {
  const { data, error } = await supabase
    .from('quotation_lines')
    .select('*')
    .eq('quotation_id', quotationId)
    .order('sequence', { ascending: true });

  if (!error && data && data.length > 0) {
    return data.map((l) => ({
      id: String(l.id),
      quotation_id: String(l.quotation_id),
      product_id: l.product_id ? String(l.product_id) : null,
      sequence: Number(l.sequence) || 10,
      product_name: String(l.product_name || ''),
      description: l.description ? String(l.description) : null,
      quantity: Number(l.quantity) || 0,
      qty_delivered: Number(
        (l as { qty_delivered?: number }).qty_delivered ?? 0
      ),
      uom: String(l.uom || 'pcs / u'),
      unit_price: Number(l.unit_price) || 0,
      discount: Number(l.discount) || 0,
      taxes: Number(l.taxes) || 0,
      line_total: Number(l.line_total) || 0,
    }));
  }

  // Legacy single-line fallback (migration not applied / empty lines)
  if (fallbackRow) {
    const product = String(fallbackRow.product_service || '').trim();
    if (product) {
      const qty = Number(fallbackRow.quantity) || 1;
      const price = Number(fallbackRow.unit_price) || 0;
      const taxes = Number(fallbackRow.taxes) || 0;
      const amounts = lineTotal({
        quantity: qty,
        unit_price: price,
        discount: 0,
        taxes,
      });
      return [
        {
          id: `legacy-${quotationId}`,
          quotation_id: quotationId,
          product_id: null,
          sequence: 10,
          product_name: product,
          description: product,
          quantity: qty,
          qty_delivered: 0,
          uom: String(fallbackRow.uom || 'pcs / u'),
          unit_price: price,
          discount: 0,
          taxes,
          line_total: amounts.total,
        },
      ];
    }
  }

  return [];
}

async function replaceLines(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  quotationId: string,
  lines: SalesQuotationLineInput[]
) {
  await supabase.from('quotation_lines').delete().eq('quotation_id', quotationId);

  if (lines.length === 0) return [];

  const rows = lines.map((line, index) => {
    const amounts = lineTotal(line);
    const qty = Number(line.quantity) || 0;
    let qtyDelivered = Math.max(0, Number(line.qty_delivered) || 0);
    if (qtyDelivered > qty) qtyDelivered = qty;
    return {
      quotation_id: quotationId,
      sequence: line.sequence ?? (index + 1) * 10,
      product_id: line.product_id || null,
      product_name: String(line.product_name || '').trim() || 'Product',
      description: line.description ? String(line.description) : null,
      quantity: qty,
      qty_delivered: qtyDelivered,
      uom: String(line.uom || 'pcs / u'),
      unit_price: Number(line.unit_price) || 0,
      discount: Number(line.discount) || 0,
      taxes: Number(line.taxes) || 0,
      line_total: amounts.total,
      updated_at: new Date().toISOString(),
    };
  });

  const { data, error } = await supabase.from('quotation_lines').insert(rows).select('*');
  if (error) {
    // Migration not applied yet — retry without qty_delivered
    if (/qty_delivered|column/i.test(error.message)) {
      const legacyRows = rows.map(({ qty_delivered: _qd, ...rest }) => rest);
      const retry = await supabase.from('quotation_lines').insert(legacyRows).select('*');
      if (retry.error) throw new Error(retry.error.message);
      return retry.data || [];
    }
    throw new Error(error.message);
  }
  return data || [];
}

function validatePayload(payload: SalesQuotationFormPayload) {
  if (!String(payload.customer_name || '').trim()) {
    return 'Customer is required';
  }
  if (!payload.contact_id) {
    return 'Select a customer from Contacts';
  }
  if (!payload.quotation_date) {
    return 'Quotation date is required';
  }
  if (
    payload.expiration_date &&
    payload.quotation_date &&
    payload.expiration_date < payload.quotation_date
  ) {
    return 'Expiration date cannot be before quotation date';
  }
  if (!payload.lines.length) {
    return 'Add at least one order line';
  }
  for (const line of payload.lines) {
    const displayType =
      line.display_type ||
      (Number(line.quantity) === 0 && Number(line.unit_price) === 0
        ? line.product_name === 'Note'
          ? 'line_note'
          : 'line_section'
        : 'product');
    const label = String(line.product_name || line.description || '').trim();
    if (displayType === 'product' && !label) {
      return 'Each order line needs a product / description';
    }
    if (displayType === 'line_section' && !label) {
      return 'Section title is required';
    }
    if (displayType === 'line_note' && !String(line.description || line.product_name || '').trim()) {
      return 'Note text is required';
    }
    if (displayType === 'product' && (Number(line.quantity) || 0) <= 0) {
      return 'Line quantity must be greater than zero';
    }
    if (displayType === 'product') {
      const deliveredErr = validateDeliveredQuantity(
        Number(line.quantity) || 0,
        Number(line.qty_delivered) || 0
      );
      if (deliveredErr) return deliveredErr;
    }
  }
  return null;
}

function headerFromPayload(payload: SalesQuotationFormPayload, sums: ReturnType<typeof summarizeLines>) {
  const first = payload.lines[0];
  return {
    contact_id: payload.contact_id,
    customer_name: String(payload.customer_name).trim(),
    contact_person_id: payload.contact_person_id || null,
    delivery_address_id: payload.delivery_address_id || null,
    invoice_address_id: payload.invoice_address_id || null,
    salesperson_id: payload.salesperson_id || null,
    sales_team: payload.sales_team || null,
    customer_reference: payload.customer_reference || null,
    pricelist: payload.pricelist || null,
    fiscal_position: payload.fiscal_position || null,
    payment_terms: payload.payment_terms || 'Immediate',
    quotation_date: payload.quotation_date || null,
    expiration_date: payload.expiration_date || null,
    internal_notes: payload.internal_notes || null,
    customer_notes: payload.customer_notes || null,
    opportunity_id: payload.opportunity_id || null,
    ...(payload.linked_inquiry_id
      ? { linked_inquiry_id: payload.linked_inquiry_id }
      : {}),
    product_service: String(first?.product_name || 'Product').trim(),
    quantity: Number(first?.quantity) || 1,
    unit_price: Number(first?.unit_price) || 0,
    taxes: Number(first?.taxes) || 0,
    uom: String(first?.uom || 'pcs / u'),
    total_amount: sums.total,
    updated_at: new Date().toISOString(),
  };
}

/** Prefill for /sales/quotations/new?opportunityId= */
export async function getSalesQuotationPrefillFromOpportunity(opportunityId: string) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('crm_opportunities')
      .select(
        'id, name, contact_id, contact_person_id, salesperson_id, sales_team, expected_revenue, organization_id'
      )
      .eq('id', opportunityId)
      .maybeSingle();

    if (error || !data) return { error: error?.message || 'Opportunity not found' };

    let customer_name = '';
    if (data.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('name')
        .eq('id', data.contact_id)
        .maybeSingle();
      customer_name = contact?.name ? String(contact.name) : '';
    }

    const revenue = Number(data.expected_revenue) || 0;

    return {
      prefill: {
        opportunity_id: String(data.id),
        opportunity_name: String(data.name || ''),
        contact_id: data.contact_id ? String(data.contact_id) : null,
        customer_name,
        contact_person_id: data.contact_person_id ? String(data.contact_person_id) : null,
        salesperson_id: data.salesperson_id ? String(data.salesperson_id) : null,
        sales_team: data.sales_team ? String(data.sales_team) : null,
        expected_revenue: revenue,
      },
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load opportunity',
    };
  }
}

export type SalesQuotationInquiryPrefill = {
  inquiry_id: string;
  opportunity_id: string | null;
  opportunity_name: string | null;
  contact_id: string | null;
  customer_name: string;
  contact_person_id: string | null;
  salesperson_id: string | null;
  sales_team: string | null;
  customer_reference: string | null;
  product_name: string;
  description: string;
  quantity: number;
  unit_price: number;
  uom: string;
  internal_notes: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_mobile: string | null;
};

/** Prefill for /sales/quotations/new?inquiryId= — uses the same inquiry record. */
export async function getSalesQuotationPrefillFromInquiry(inquiryId: string): Promise<
  | { prefill: SalesQuotationInquiryPrefill; existingQuotationId: string | null }
  | { error: string }
> {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('lead_inquiries')
      .select(
        `
        id,
        lead_id,
        product_name,
        quantity,
        total_weight,
        cbm,
        description,
        calculator_values,
        sent_to_accounting,
        approval_status,
        crm_opportunity_id,
        organization_id,
        leads (
          id,
          lead_id_formatted,
          contact_id,
          name,
          number,
          sales_agent_id,
          crm_opportunity_id
        ),
        inquiry_confirmations (
          id,
          status,
          created_at,
          hs_code,
          calculator_values
        )
      `
      )
      .eq('id', inquiryId)
      .maybeSingle();

    if (error || !data) return { error: error?.message || 'Inquiry not found' };

    const { canAccessLeadForInquiry } = await import('@/lib/inquiry-crm-access');
    const leadAccess = await canAccessLeadForInquiry(
      scope.session!,
      supabase,
      String(data.lead_id),
      {
        crmOpportunityId: data.crm_opportunity_id ? String(data.crm_opportunity_id) : null,
      }
    );
    if (!leadAccess.allowed) {
      return { error: leadAccess.error || 'Unauthorized' };
    }

    const {
      resolveInquiryWorkflowStatus,
      buildInquiryQuotationDescription,
    } = await import('@/lib/inquiry-workflow');
    const confirmations = Array.isArray(data.inquiry_confirmations)
      ? (data.inquiry_confirmations as Array<{
          status?: string;
          created_at?: string;
          hs_code?: string;
          calculator_values?: unknown;
        }>)
      : [];
    const workflow = resolveInquiryWorkflowStatus({
      sent_to_accounting: Boolean(data.sent_to_accounting),
      approval_status: data.approval_status ? String(data.approval_status) : null,
      confirmations,
    });
    if (!workflow.isReadyForQuotation) {
      return {
        error: `This inquiry is not ready for quotation yet (${workflow.label}).`,
      };
    }

    const {
      parseStoredCalculatorPayload,
      buildApprovedInquiryPricing,
      parsePricingConfig,
    } = await import('@/lib/inquiry-calculator');

    const approvedConfirmation = [...confirmations]
      .sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      })
      .find((c) => String(c.status || '') === 'approved');

    const calculatorRaw =
      (data.calculator_values && typeof data.calculator_values === 'object'
        ? (data.calculator_values as Record<string, unknown>)
        : null) ||
      (approvedConfirmation?.calculator_values &&
      typeof approvedConfirmation.calculator_values === 'object'
        ? (approvedConfirmation.calculator_values as Record<string, unknown>)
        : null);

    const parsed = parseStoredCalculatorPayload(calculatorRaw);
    const primary = parsed.calculators[0] || {};
    const pricing = buildApprovedInquiryPricing(calculatorRaw, {
      weightKg: String(data.total_weight || ''),
      quantity: String(data.quantity || ''),
      cbm: String(data.cbm || ''),
      pricingConfig: parsePricingConfig(primary),
    });

    const leadRaw = data.leads as
      | {
          lead_id_formatted?: string | null;
          contact_id?: string | null;
          name?: string | null;
          number?: string | null;
          sales_agent_id?: string | null;
          crm_opportunity_id?: string | null;
        }
      | {
          lead_id_formatted?: string | null;
          contact_id?: string | null;
          name?: string | null;
          number?: string | null;
          sales_agent_id?: string | null;
          crm_opportunity_id?: string | null;
        }[]
      | null;
    const lead = Array.isArray(leadRaw) ? leadRaw[0] : leadRaw;

    let contact_id = lead?.contact_id ? String(lead.contact_id) : null;
    let customer_name = String(lead?.name || '').trim();
    let contact_person_id: string | null = null;
    let salesperson_id = lead?.sales_agent_id ? String(lead.sales_agent_id) : null;
    let sales_team: string | null = null;
    const opportunity_id = data.crm_opportunity_id
      ? String(data.crm_opportunity_id)
      : lead?.crm_opportunity_id
        ? String(lead.crm_opportunity_id)
        : null;
    let customer_email: string | null = null;
    let customer_phone = lead?.number ? String(lead.number) : null;
    let customer_mobile: string | null = null;
    let opportunity_name: string | null = null;

    if (opportunity_id) {
      const { data: opp } = await supabase
        .from('crm_opportunities')
        .select('id, name, contact_id, contact_person_id, salesperson_id, sales_team, email, phone, mobile')
        .eq('id', opportunity_id)
        .maybeSingle();
      if (opp) {
        opportunity_name = opp.name ? String(opp.name) : null;
        contact_id = contact_id || (opp.contact_id ? String(opp.contact_id) : null);
        contact_person_id = opp.contact_person_id ? String(opp.contact_person_id) : null;
        salesperson_id = salesperson_id || (opp.salesperson_id ? String(opp.salesperson_id) : null);
        sales_team = opp.sales_team ? String(opp.sales_team) : null;
        customer_email = opp.email ? String(opp.email) : customer_email;
        customer_phone = opp.phone ? String(opp.phone) : customer_phone;
        customer_mobile = opp.mobile ? String(opp.mobile) : customer_mobile;
      }
    }

    if (contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('name, email, phone, mobile')
        .eq('id', contact_id)
        .maybeSingle();
      if (contact?.name) customer_name = String(contact.name);
      if (contact?.email) customer_email = String(contact.email);
      if (contact?.phone) customer_phone = String(contact.phone);
      if (contact?.mobile) customer_mobile = String(contact.mobile);
    }

    const quantity = Number(String(data.quantity || '').replace(/,/g, '')) || 1;
    const unit_price = pricing ? Math.round(pricing.unit_price * 100) / 100 : 0;
    const uom = String(primary.uom || '').trim() || 'Units';
    const hsCode = String(approvedConfirmation?.hs_code || primary.hs_code || '').trim();
    const description = buildInquiryQuotationDescription({
      productName: String(data.product_name || ''),
      quantity: String(data.quantity || ''),
      totalWeight: String(data.total_weight || ''),
      cbm: String(data.cbm || ''),
      description: String(data.description || ''),
      hsCode,
      uom,
      operationsDescription: parsed.operationsDescription,
    });

    const internalNotes = [
      parsed.operationsDescription
        ? `Operations notes: ${parsed.operationsDescription}`
        : '',
      parsed.valuationRulingApplied === 'yes'
        ? `Valuation ruling: ${parsed.valuationRulingNumber || 'Yes'}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    let existingQuotationId: string | null = null;
    const { data: existingQuote, error: existingQuoteError } = await supabase
      .from('quotations')
      .select('id')
      .eq('linked_inquiry_id', inquiryId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!existingQuoteError && existingQuote?.id) {
      existingQuotationId = String(existingQuote.id);
    }

    return {
      prefill: {
        inquiry_id: String(data.id),
        opportunity_id,
        opportunity_name,
        contact_id,
        customer_name,
        contact_person_id,
        salesperson_id,
        sales_team,
        customer_reference: lead?.lead_id_formatted ? String(lead.lead_id_formatted) : null,
        product_name: String(data.product_name || 'Product'),
        description,
        quantity,
        unit_price,
        uom,
        internal_notes: internalNotes || null,
        customer_email,
        customer_phone,
        customer_mobile,
      },
      existingQuotationId,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load inquiry',
    };
  }
}

export async function getSalesQuotationDetail(id: string) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data, error } = await supabase.from('quotations').select('*').eq('id', id).maybeSingle();
    if (error || !data) return { error: error?.message || 'Quotation not found' };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      data.organization_id &&
      String(data.organization_id) !== scope.organizationId
    ) {
      return { error: 'Quotation not found in the selected organization' };
    }

    const denied = await assertSalesRecordAccess(
      scope.session!,
      data as Record<string, unknown>
    );
    if (denied) return { error: denied };

    const lines = await loadLines(supabase, id, data as Record<string, unknown>);

    let opportunity_name: string | null = null;
    if (data.opportunity_id) {
      const { data: opp } = await supabase
        .from('crm_opportunities')
        .select('name')
        .eq('id', data.opportunity_id)
        .maybeSingle();
      opportunity_name = opp?.name ? String(opp.name) : null;
    }

    let salesperson_name: string | null = null;
    if (data.salesperson_id) {
      const { data: sp } = await supabase
        .from('sales_agents')
        .select('name')
        .eq('id', data.salesperson_id)
        .maybeSingle();
      salesperson_name = sp?.name ? String(sp.name) : null;
    }

    return {
      quotation: mapRowToDetail(data as Record<string, unknown>, lines, {
        opportunity_name,
        salesperson_name,
      }),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load quotation',
    };
  }
}

export async function createSalesQuotation(payload: SalesQuotationFormPayload) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { error: 'Select an organization to create quotations' };
    }
    if (scope.isGlobalAdminView || !scope.organizationId) {
      return { error: 'Select a specific organization to create quotations' };
    }

    const validation = validatePayload(payload);
    if (validation) return { error: validation };

    const session = scope.session;
    const supabase = await createAdminClient();
    const sums = summarizeLines(payload.lines);
    const quotation_number = await generateQuotationNumber(
      supabase,
      scope.organizationId
    );
    const header = headerFromPayload(payload, sums);
    const now = new Date().toISOString();

    const insertRow = {
      ...header,
      quotation_number,
      organization_id: scope.organizationId,
      status: 'quotation',
      is_locked: false,
      revision: 1,
      created_by: session.username,
      updated_by: session.username,
      created_at: now,
      updated_at: now,
    };

    let { data, error } = await supabase.from('quotations').insert([insertRow]).select('*').single();

    // Tolerate missing new columns until migration runs
    if (error && /column|schema cache/i.test(error.message)) {
      const minimal = {
        quotation_number,
        contact_id: header.contact_id,
        customer_name: header.customer_name,
        product_service: header.product_service,
        quantity: header.quantity,
        unit_price: header.unit_price,
        taxes: header.taxes,
        uom: header.uom,
        total_amount: header.total_amount,
        expiration_date: header.expiration_date,
        payment_terms: header.payment_terms,
        status: 'quotation',
        created_by: session.username,
        organization_id: scope.organizationId,
        salesperson_id: header.salesperson_id,
      };
      const retry = await supabase.from('quotations').insert([minimal]).select('*').single();
      data = retry.data;
      error = retry.error;
    }

    if (error || !data) return { error: error?.message || 'Failed to create quotation' };

    try {
      await replaceLines(supabase, data.id, payload.lines);
    } catch {
      // lines table may not exist yet — header still saved
    }

    await logAction(supabase, data.id, 'created', session.username, null, 'quotation', {
      quotation_number,
    });

    try {
      await saveVersionSnapshot(
        supabase,
        data.id,
        1,
        'quotation',
        { header, lines: payload.lines, totals: sums },
        session.username
      );
    } catch {
      // versions table optional until migration
    }

    const lines = await loadLines(supabase, data.id, data as Record<string, unknown>);
    return { quotation: mapRowToDetail(data as Record<string, unknown>, lines) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create quotation',
    };
  }
}

export async function updateSalesQuotation(
  id: string,
  payload: SalesQuotationFormPayload
) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const validation = validatePayload(payload);
    if (validation) return { error: validation };

    const supabase = await createAdminClient();
    const { data: existing, error: loadError } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (loadError || !existing) return { error: loadError?.message || 'Quotation not found' };

    const denied = await assertSalesRecordAccess(scope.session!, existing as Record<string, unknown>);
    if (denied) return { error: denied };

    if (!isEditableStatus(String(existing.status), Boolean(existing.is_locked))) {
      return { error: 'This quotation cannot be edited in its current state' };
    }

    const session = scope.session!;
    const sums = summarizeLines(payload.lines);
    const header = headerFromPayload(payload, sums);
    const nextRevision = (Number(existing.revision) || 1) + 1;

    const fulfillment = computeOrderDeliveryFulfillment(
      payload.lines.map((line) => {
        const displayType =
          line.display_type ||
          (Number(line.quantity) === 0 && Number(line.unit_price) === 0
            ? 'line_section'
            : 'product');
        return {
          quantity: Number(line.quantity) || 0,
          qty_delivered: Number(line.qty_delivered) || 0,
          isProduct: displayType === 'product',
        };
      })
    );
    const syncDelivery =
      String(existing.status) === 'sales_order'
        ? { delivery_status: fulfillmentToLegacyDeliveryStatus(fulfillment) }
        : {};

    const { data, error } = await supabase
      .from('quotations')
      .update({
        ...header,
        ...syncDelivery,
        revision: nextRevision,
        updated_by: session.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) return { error: error?.message || 'Failed to update quotation' };

    try {
      await replaceLines(supabase, id, payload.lines);
    } catch {
      // ignore if lines table missing
    }

    await logAction(supabase, id, 'updated', session.username, existing.status, existing.status, {
      revision: nextRevision,
    });

    try {
      await saveVersionSnapshot(
        supabase,
        id,
        nextRevision,
        String(existing.status),
        { header, lines: payload.lines, totals: sums },
        session.username
      );
    } catch {
      // optional
    }

    const lines = await loadLines(supabase, id, data as Record<string, unknown>);
    return { quotation: mapRowToDetail(data as Record<string, unknown>, lines) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to update quotation',
    };
  }
}

export async function markSalesQuotationSent(id: string) {
  return transitionSalesQuotationStatus(id, 'quotation_sent', 'emailed');
}

export async function markSalesQuotationCustomerReview(id: string) {
  return transitionSalesQuotationStatus(id, 'customer_review');
}

export async function confirmSalesQuotation(id: string) {
  return transitionSalesQuotationStatus(id, 'sales_order');
}

export async function cancelSalesQuotation(id: string) {
  return transitionSalesQuotationStatus(id, 'cancelled');
}

async function transitionSalesQuotationStatus(
  id: string,
  nextStatus: string,
  logActionName: string = 'status_changed'
) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: existing, error: loadError } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (loadError || !existing) return { error: loadError?.message || 'Quotation not found' };

    const denied = await assertSalesRecordAccess(
      scope.session!,
      existing as Record<string, unknown>
    );
    if (denied) return { error: denied };

    if (Boolean(existing.is_locked) && nextStatus !== 'cancelled') {
      return { error: 'Locked quotations cannot change status (except cancel is blocked too)' };
    }
    if (Boolean(existing.is_locked)) {
      return { error: 'Locked quotations cannot be cancelled. Unlock first if needed.' };
    }

    const current = String(existing.status);
    const allowed: Record<string, string[]> = {
      quotation: [
        'quotation_sent',
        'customer_review',
        'sales_order',
        'cancelled',
        'expired',
      ],
      quotation_sent: [
        'customer_review',
        'sales_order',
        'cancelled',
        'quotation_sent',
        'expired',
      ],
      customer_review: [
        'sales_order',
        'cancelled',
        'quotation_sent',
        'expired',
      ],
      expired: ['quotation', 'quotation_sent', 'sales_order', 'cancelled'],
      sales_order: ['cancelled'],
      cancelled: [],
    };

    if (!(allowed[current] || []).includes(nextStatus) && current !== nextStatus) {
      return { error: `Cannot move from ${current} to ${nextStatus}` };
    }

    const session = scope.session!;
    const patch: Record<string, unknown> = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
      updated_by: session.username,
    };
    if (nextStatus === 'sales_order') {
      patch.delivery_status = 'waiting';
      patch.invoice_status = 'to_invoice';
    }
    if (nextStatus === 'expired') {
      patch.expired_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('quotations')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) return { error: error?.message || 'Failed to update status' };

    await logAction(
      supabase,
      id,
      logActionName,
      session.username,
      current,
      nextStatus
    );

    const lines = await loadLines(supabase, id, data as Record<string, unknown>);
    return { quotation: mapRowToDetail(data as Record<string, unknown>, lines) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to update status',
    };
  }
}

export async function lockSalesQuotation(id: string, locked: boolean) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: existing, error: loadError } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (loadError || !existing) return { error: loadError?.message || 'Quotation not found' };
    if (String(existing.status) === 'cancelled') {
      return { error: 'Cancelled quotations cannot be locked' };
    }
    if (locked && String(existing.status) !== 'sales_order') {
      return { error: 'Only confirmed quotations (sales orders) can be locked' };
    }

    const session = scope.session!;
    const { data, error } = await supabase
      .from('quotations')
      .update({ is_locked: locked, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) return { error: error?.message || 'Failed to update lock' };

    await logAction(
      supabase,
      id,
      locked ? 'locked' : 'unlocked',
      session.username,
      existing.status,
      existing.status
    );

    const lines = await loadLines(supabase, id, data as Record<string, unknown>);
    return { quotation: mapRowToDetail(data as Record<string, unknown>, lines) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to update lock',
    };
  }
}

export async function duplicateSalesQuotation(id: string) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (scope.isGlobalAdminView || !scope.organizationId) {
      return { error: 'Select a specific organization to duplicate quotations' };
    }

    const loaded = await getSalesQuotationDetail(id);
    if ('error' in loaded && loaded.error) return { error: loaded.error };
    if (!('quotation' in loaded) || !loaded.quotation) {
      return { error: 'Quotation not found' };
    }

    const q = loaded.quotation;
    const result = await createSalesQuotation({
      contact_id: q.contact_id,
      customer_name: q.customer_name,
      contact_person_id: q.contact_person_id,
      delivery_address_id: q.delivery_address_id,
      invoice_address_id: q.invoice_address_id,
      salesperson_id: q.salesperson_id,
      sales_team: q.sales_team,
      customer_reference: q.customer_reference,
      pricelist: q.pricelist,
      fiscal_position: q.fiscal_position,
      payment_terms: q.payment_terms,
      quotation_date: new Date().toISOString().slice(0, 10),
      expiration_date: q.expiration_date,
      internal_notes: q.internal_notes,
      customer_notes: q.customer_notes,
      opportunity_id: q.opportunity_id,
      lines: q.lines.map((line) => ({
        product_name: line.product_name,
        description: line.description,
        quantity: line.quantity,
        qty_delivered: 0,
        uom: line.uom,
        unit_price: line.unit_price,
        discount: line.discount,
        taxes: line.taxes,
        sequence: line.sequence,
      })),
    });

    if ('error' in result && result.error) return { error: result.error };

    const session = scope.session!;
    const supabase = await createAdminClient();
    if (result.quotation) {
      await logAction(supabase, result.quotation.id, 'duplicated', session.username, null, 'quotation', {
        source_id: id,
      });
    }

    return result;
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to duplicate quotation',
    };
  }
}

export async function getSalesQuotationVersions(quotationId: string) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('quotation_versions')
      .select('id, quotation_id, revision, status, created_by, created_at')
      .eq('quotation_id', quotationId)
      .order('revision', { ascending: false });

    if (error) {
      if (/relation|does not exist|column/i.test(error.message)) {
        return { versions: [] as SalesQuotationVersion[] };
      }
      return { error: error.message };
    }

    return {
      versions: (data || []).map((v) => ({
        id: String(v.id),
        quotation_id: String(v.quotation_id),
        revision: Number(v.revision) || 1,
        status: v.status ? String(v.status) : null,
        created_by: v.created_by ? String(v.created_by) : null,
        created_at: String(v.created_at || ''),
      })),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load versions',
    };
  }
}

export async function getSalesQuotationActivity(quotationId: string) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('quotation_logs')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('performed_at', { ascending: false })
      .limit(50);

    if (error) return { error: error.message };

    return {
      logs: (data || []).map((l) => ({
        id: String(l.id),
        action: String(l.action || ''),
        previous_status: l.previous_status ? String(l.previous_status) : null,
        new_status: l.new_status ? String(l.new_status) : null,
        performed_by: String(l.performed_by || ''),
        performed_at: String(l.performed_at || ''),
        details: (l.details as Record<string, unknown> | null) || null,
      })) as SalesQuotationLog[],
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load activity',
    };
  }
}

export async function logSalesQuotationPreview(id: string, kind: 'email' | 'pdf' | 'print') {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    const supabase = await createAdminClient();
    await logAction(
      supabase,
      id,
      kind === 'print' ? 'printed' : 'previewed',
      scope.session!.username,
      null,
      null,
      { kind }
    );
    return { success: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to log preview',
    };
  }
}

async function appendQuotationLog(
  quotationId: string,
  action: string,
  details: Record<string, unknown>
) {
  const scope = await resolveSalesOrgScope();
  if ('error' in scope && scope.error) return { error: scope.error };

  const supabase = await createAdminClient();
  const { data: quotation } = await supabase
    .from('quotations')
    .select('status')
    .eq('id', quotationId)
    .maybeSingle();

  if (!quotation) return { error: 'Quotation not found' };

  const { data, error } = await supabase
    .from('quotation_logs')
    .insert([
      {
        quotation_id: quotationId,
        action,
        previous_status: quotation.status,
        new_status: quotation.status,
        performed_by: scope.session!.username,
        details,
      },
    ])
    .select('*')
    .single();

  if (error || !data) return { error: error?.message || 'Failed to save log' };

  return {
    log: {
      id: String(data.id),
      action: String(data.action || ''),
      previous_status: data.previous_status ? String(data.previous_status) : null,
      new_status: data.new_status ? String(data.new_status) : null,
      performed_by: String(data.performed_by || ''),
      performed_at: String(data.performed_at || ''),
      details: (data.details as Record<string, unknown> | null) || null,
    } as SalesQuotationLog,
  };
}

/** Chatter: customer-facing style message (stored on quotation_logs). */
export async function postSalesQuotationMessage(quotationId: string, message: string) {
  const text = String(message || '').trim();
  if (!quotationId || !text) return { error: 'Message is required' };
  return appendQuotationLog(quotationId, 'log_note', {
    note: text,
    kind: 'message',
  });
}

/** Chatter: internal log note. */
export async function postSalesQuotationNote(quotationId: string, note: string) {
  const text = String(note || '').trim();
  if (!quotationId || !text) return { error: 'Note is required' };
  return appendQuotationLog(quotationId, 'log_note', {
    note: text,
    kind: 'note',
  });
}

/** Chatter: schedule activity / reminder. */
export async function postSalesQuotationActivity(
  quotationId: string,
  summary: string,
  dueDate: string | null
) {
  const text = String(summary || '').trim();
  if (!quotationId || !text) return { error: 'Activity summary is required' };
  return appendQuotationLog(quotationId, 'activity', {
    summary: text,
    due_date: dueDate || null,
  });
}

/** Placeholder delivery status for future Warehouse integration. */
export async function setSalesOrderDeliveryStatus(
  id: string,
  deliveryStatus: 'waiting' | 'ready' | 'delivered'
) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: existing, error: loadError } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (loadError || !existing) return { error: loadError?.message || 'Order not found' };
    if (String(existing.status) !== 'sales_order') {
      return { error: 'Delivery status applies only to confirmed sales orders' };
    }

    const { data, error } = await supabase
      .from('quotations')
      .update({
        delivery_status: deliveryStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      if (error && /delivery_status|column/i.test(error.message)) {
        return {
          error:
            'Run sales_orders_delivery_status.sql migration to enable delivery status.',
        };
      }
      return { error: error?.message || 'Failed to update delivery status' };
    }

    await logAction(
      supabase,
      id,
      'updated',
      scope.session!.username,
      existing.status,
      existing.status,
      { delivery_status: deliveryStatus, note: 'Delivery status placeholder updated' }
    );

    const lines = await loadLines(supabase, id, data as Record<string, unknown>);
    return { quotation: mapRowToDetail(data as Record<string, unknown>, lines) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to update delivery status',
    };
  }
}

