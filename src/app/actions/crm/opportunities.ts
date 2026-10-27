'use server';

import { after } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';
import { requireAnyChildModule, isAccessDenied } from '@/lib/auth/require-access';
import {
  requireCrmOrganizationScope,
  resolveCrmOrganizationScope,
  revalidateCrmPipelinePaths,
} from '@/app/actions/crm/shared';
import { ensureDefaultCrmStages, resolveCrmPipelineStageForOrg } from '@/app/actions/crm/stages';
import { attachNextActivitiesToOpportunities } from '@/lib/crm-activity-enrichment';
import {
  logOpportunityCreatedAudit,
  logOpportunityCustomerChangedAudit,
  logOpportunityStageChangedAudit,
  logOpportunityUpdatedAudit,
} from '@/app/actions/crm/chatter';
import {
  DEFAULT_CRM_PIPELINE_STAGES,
  buildAdminVirtualStageId,
  parseAdminVirtualStageName,
  CRM_AUTO_OPPORTUNITY_SOURCE,
  buildAutoOpportunityName,
} from '@/lib/crm-pipeline-utils';
import type {
  CrmOpportunityCard,
  CrmOpportunityUpsertInput,
  CrmPipelineBoardFilters,
} from '@/app/actions/crm/types';

function parseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t) => String(t || '').trim()).filter(Boolean);
}

function mapRow(row: Record<string, unknown>): CrmOpportunityCard {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    stage_id: String(row.stage_id),
    name: String(row.name || ''),
    contact_id: row.contact_id ? String(row.contact_id) : null,
    contact_person_id: row.contact_person_id ? String(row.contact_person_id) : null,
    expected_revenue: Number(row.expected_revenue) || 0,
    probability: Number(row.probability) || 0,
    probability_manual: Boolean(row.probability_manual),
    priority: Math.min(3, Math.max(0, Number(row.priority) || 0)) as 0 | 1 | 2 | 3,
    salesperson_id: row.salesperson_id ? String(row.salesperson_id) : null,
    sales_team: row.sales_team ? String(row.sales_team) : null,
    tags: parseTags(row.tags),
    campaign: row.campaign ? String(row.campaign) : null,
    medium: row.medium ? String(row.medium) : null,
    source: row.source ? String(row.source) : null,
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    mobile: row.mobile ? String(row.mobile) : null,
    website: row.website ? String(row.website) : null,
    expected_closing_date: row.expected_closing_date
      ? String(row.expected_closing_date)
      : null,
    internal_notes: row.internal_notes ? String(row.internal_notes) : null,
    lost_reason: row.lost_reason ? String(row.lost_reason) : null,
    lead_score: Number(row.lead_score) || 0,
    date_closed: row.date_closed ? String(row.date_closed) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
    lead_inquiry_id: row.lead_inquiry_id ? String(row.lead_inquiry_id) : null,
    customer_name: null,
    customer_lead_id: null,
    contact_person_name: null,
    salesperson_name: null,
    organization_name: null,
    stage_name: null,
  };
}

function mapCreatedOpportunityCard(
  row: Record<string, unknown>,
  hints: {
    stageName?: string | null;
    customerName?: string | null;
    customerLeadId?: string | null;
    salespersonName?: string | null;
  } = {}
): CrmOpportunityCard {
  const base = mapRow(row);
  return {
    ...base,
    stage_name: hints.stageName || null,
    customer_name: hints.customerName || null,
    customer_lead_id: hints.customerLeadId || null,
    salesperson_name: hints.salespersonName || null,
  };
}

function scheduleOpportunityCreatedSideEffects(input: {
  opportunityId: string;
  organizationId: string;
  username: string;
  opportunityName: string;
  contactId: string;
}) {
  after(async () => {
    const { ensureContactIsCustomer } = await import('@/app/actions/crm/contact-summary');
    await ensureContactIsCustomer(input.contactId);
    await logOpportunityCreatedAudit(
      input.opportunityId,
      input.organizationId,
      input.username,
      input.opportunityName
    );
    const { writeCrmAuditLog } = await import('@/lib/crm-visibility');
    await writeCrmAuditLog({
      organizationId: input.organizationId,
      entityId: input.opportunityId,
      action: 'opportunity_created',
      performedBy: input.username,
      details: { name: input.opportunityName },
    });
  });
}

/** Split id lists for `.in()` lookups so request URLs stay bounded. */
function chunkIds(ids: string[], size = 150): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

function escapePostgrestFilterValue(value: string) {
  const v = String(value || '');
  if (/[\s,().]/.test(v) || v.includes('"')) {
    return `"${v.replace(/"/g, '\\"')}"`;
  }
  return v;
}

/**
 * Resolve contact ids that match pipeline search (Customer ID / phone / name)
 * so the board can filter opportunities in SQL instead of enriching every row.
 */
async function findContactIdsForPipelineSearch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organizationId: string | null,
  rawQuery: string
): Promise<string[]> {
  const needle = String(rawQuery || '').trim();
  if (!needle) return [];

  const withoutHash = needle.replace(/^#+/, '').trim();
  const digits = needle.replace(/\D/g, '');
  const last10 =
    digits.length >= 10
      ? digits.slice(-10)
      : digits.length >= 7
        ? digits
        : null;
  const text = withoutHash
    .replace(/[%_,.()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const parts: string[] = [];
  if (text) {
    const esc = escapePostgrestFilterValue(text);
    parts.push(`name.ilike.%${esc}%`);
    parts.push(`company_name.ilike.%${esc}%`);
    parts.push(`email.ilike.%${esc}%`);
    parts.push(`phone.ilike.%${esc}%`);
    parts.push(`mobile.ilike.%${esc}%`);
    parts.push(`lead_id_formatted.ilike.%${esc}%`);
  }

  const leadToken = withoutHash.replace(/\s/g, '');
  if (/^\d{3,}$/.test(leadToken)) {
    parts.push(`lead_id_formatted.eq.${leadToken}`);
    parts.push(`lead_id_formatted.ilike.%${leadToken}%`);
  }

  if (last10) {
    parts.push(`phone.ilike.%${last10}%`);
    parts.push(`mobile.ilike.%${last10}%`);
  } else if (digits.length >= 3) {
    parts.push(`phone.ilike.%${digits}%`);
    parts.push(`mobile.ilike.%${digits}%`);
  }

  if (!parts.length) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cq: any = supabase
    .from('contacts')
    .select('id')
    .or(parts.join(','))
    .limit(200);
  if (organizationId) {
    cq = cq.eq('organization_id', organizationId);
  }

  const { data, error } = await cq;
  if (error) {
    console.error('[findContactIdsForPipelineSearch]', error.message);
    return [];
  }
  return (data || []).map((row: { id: string }) => String(row.id));
}

/**
 * Narrow the opportunities query for search before enrich (phone / Customer ID / name).
 * Returns forceEmpty when nothing can match.
 */
function applyPipelineSearchToOpportunityQuery(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  rawSearch: string,
  /** From `findContactIdsForPipelineSearch` (resolved up front, in parallel). */
  contactIds: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): { query: any; forceEmpty: boolean } {
  const needle = String(rawSearch || '').trim();
  if (!needle) return { query, forceEmpty: false };

  const withoutHash = needle.replace(/^#+/, '').trim();
  const digits = needle.replace(/\D/g, '');
  const last10 =
    digits.length >= 10
      ? digits.slice(-10)
      : digits.length >= 7
        ? digits
        : null;
  const text = withoutHash
    .replace(/[%_,.()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const oppParts: string[] = [];
  if (text) {
    const esc = escapePostgrestFilterValue(text);
    oppParts.push(`name.ilike.%${esc}%`);
    oppParts.push(`email.ilike.%${esc}%`);
    oppParts.push(`phone.ilike.%${esc}%`);
    oppParts.push(`mobile.ilike.%${esc}%`);
  }
  if (last10) {
    oppParts.push(`phone.ilike.%${last10}%`);
    oppParts.push(`mobile.ilike.%${last10}%`);
  } else if (digits.length >= 3) {
    oppParts.push(`phone.ilike.%${digits}%`);
    oppParts.push(`mobile.ilike.%${digits}%`);
  }
  if (contactIds.length) {
    oppParts.push(`contact_id.in.(${contactIds.join(',')})`);
  }

  if (!oppParts.length) {
    return { query, forceEmpty: true };
  }

  return { query: query.or(oppParts.join(',')), forceEmpty: false };
}

async function enrichOpportunities(
  rows: Record<string, unknown>[],
  options?: { skipLeadIdBackfill?: boolean }
): Promise<CrmOpportunityCard[]> {
  if (rows.length === 0) return [];

  const supabase = await createAdminClient();
  const contactIds = new Set<string>();
  const salespersonIds = new Set<string>();
  const orgIds = new Set<string>();
  const stageIds = new Set<string>();

  for (const row of rows) {
    if (row.contact_id) contactIds.add(String(row.contact_id));
    if (row.contact_person_id) contactIds.add(String(row.contact_person_id));
    if (row.salesperson_id) salespersonIds.add(String(row.salesperson_id));
    if (row.organization_id) orgIds.add(String(row.organization_id));
    if (row.stage_id) stageIds.add(String(row.stage_id));
  }

  const contactIdList = [...contactIds];

  type ContactLookupRow = {
    id: string;
    name?: string | null;
    company_name?: string | null;
    phone?: string | null;
    mobile?: string | null;
    legacy_lead_id?: string | null;
    lead_id_formatted?: string | null;
  };

  // Chunked so large boards stay within PostgREST URL limits.
  async function loadContactsChunk(ids: string[]): Promise<ContactLookupRow[]> {
    const withLeadCol = await supabase
      .from('contacts')
      .select('id, name, company_name, phone, mobile, legacy_lead_id, lead_id_formatted')
      .in('id', ids);

    if (!withLeadCol.error && withLeadCol.data) {
      return withLeadCol.data as ContactLookupRow[];
    }
    const fallback = await supabase
      .from('contacts')
      .select('id, name, company_name, phone, mobile, legacy_lead_id')
      .in('id', ids);
    return (fallback.data || []) as ContactLookupRow[];
  }

  const [contactChunks, salesRes, orgsRes, stagesRes] = await Promise.all([
    Promise.all(chunkIds(contactIdList).map(loadContactsChunk)),
    salespersonIds.size
      ? supabase.from('sales_agents').select('id, name').in('id', [...salespersonIds])
      : Promise.resolve({ data: [] }),
    orgIds.size
      ? supabase.from('organizations').select('id, organization_name').in('id', [...orgIds])
      : Promise.resolve({ data: [] }),
    stageIds.size
      ? supabase.from('crm_pipeline_stages').select('id, name').in('id', [...stageIds])
      : Promise.resolve({ data: [] }),
  ]);
  const contactsData = contactChunks.flat();

  // Customer name = contact.name (e.g. "id check"), not company_name ("testing company").
  const contactMap = new Map(
    contactsData.map((c) => [String(c.id), String(c.name || c.company_name || '').trim()])
  );
  const contactPersonMap = new Map(
    contactsData.map((c) => [String(c.id), String(c.name || '')])
  );
  const salesMap = new Map(
    (salesRes.data || []).map((s) => [String(s.id), String(s.name || '')])
  );
  const orgMap = new Map(
    (orgsRes.data || []).map((o) => [String(o.id), String(o.organization_name || '')])
  );
  const stageMap = new Map(
    (stagesRes.data || []).map((s) => [String(s.id), String(s.name || '')])
  );

  const customerLeadIdMap = new Map<string, string>();
  for (const c of contactsData) {
    const leadId = String(c.lead_id_formatted || '').trim();
    if (/^\d{6}$/.test(leadId)) {
      customerLeadIdMap.set(String(c.id), leadId);
    }
  }

  const missingLeadIds = contactIdList.filter((id) => !customerLeadIdMap.has(id));
  // Skip expensive lead-id backfill during search — only stored Customer IDs are needed.
  if (missingLeadIds.length && !options?.skipLeadIdBackfill) {
    const { fetchContactLeadIds } = await import('@/lib/contact-lead-id');
    const metaById = new Map(
      contactsData.map((c) => [
        String(c.id),
        {
          id: String(c.id),
          legacy_lead_id: c.legacy_lead_id ? String(c.legacy_lead_id) : null,
          phone: c.phone ? String(c.phone) : null,
          mobile: c.mobile ? String(c.mobile) : null,
        },
      ])
    );
    const resolved = await fetchContactLeadIds(
      supabase,
      missingLeadIds.map(
        (id) => metaById.get(id) || { id, legacy_lead_id: null, phone: null, mobile: null }
      )
    );
    for (const [id, leadId] of resolved) {
      customerLeadIdMap.set(id, leadId);
    }
  }

  const contactPhoneMap = new Map(
    contactsData.map((c) => [
      String(c.id),
      String(c.phone || c.mobile || '').trim() || null,
    ])
  );

  return rows.map((row) => {
    const base = mapRow(row);
    const customerId = base.contact_id;
    const contactPhone = customerId ? contactPhoneMap.get(customerId) || null : null;
    return {
      ...base,
      // Prefer opportunity phone; fall back to linked contact phone for search/display.
      phone: base.phone || contactPhone,
      customer_name: customerId ? contactMap.get(customerId) || null : null,
      customer_lead_id: customerId ? customerLeadIdMap.get(customerId) || null : null,
      contact_person_name: base.contact_person_id
        ? contactPersonMap.get(base.contact_person_id) || null
        : null,
      salesperson_name: base.salesperson_id
        ? salesMap.get(base.salesperson_id) || null
        : null,
      organization_name: orgMap.get(base.organization_id) || null,
      stage_name: stageMap.get(base.stage_id) || null,
    };
  });
}

/** Board cards: contact / owner / stage enrichment and next activities in parallel. */
async function enrichBoardOpportunities(
  rows: Record<string, unknown>[],
  needle: string
): Promise<CrmOpportunityCard[]> {
  const [enriched, withActivities] = await Promise.all([
    enrichOpportunities(rows, { skipLeadIdBackfill: Boolean(needle) }),
    attachNextActivitiesToOpportunities(rows.map((row) => ({ id: String(row.id) }))),
  ]);
  return enriched.map((opp, index) => ({
    ...opp,
    ...withActivities[index],
    id: opp.id,
  })) as CrmOpportunityCard[];
}

function validateOpportunityInput(input: CrmOpportunityUpsertInput) {
  const name = String(input.name || '').trim();
  if (!name) return 'Opportunity name is required.';
  if (!input.contact_id) return 'Customer is required.';
  const revenue = Number(input.expected_revenue ?? 0);
  if (!Number.isFinite(revenue) || revenue < 0) return 'Expected revenue cannot be negative.';
  return null;
}

/** Match CRM pipeline cards by name, Customer ID (# optional), phone digits. */
function opportunityMatchesPipelineSearch(
  opp: CrmOpportunityCard,
  rawQuery: string
): boolean {
  const raw = String(rawQuery || '').trim();
  if (!raw) return true;

  const query = raw.toLowerCase();
  const withoutHash = query.replace(/^#+/, '');
  const queryDigits = raw.replace(/\D/g, '');
  const last10 = queryDigits.length >= 10 ? queryDigits.slice(-10) : queryDigits;

  const leadId = String(opp.customer_lead_id || '').toLowerCase();
  const phoneDigits = `${opp.phone || ''}${opp.mobile || ''}`.replace(/\D/g, '');
  const hay = [
    opp.name,
    opp.customer_name,
    opp.customer_lead_id,
    opp.email,
    opp.phone,
    opp.mobile,
    opp.organization_name,
  ]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');

  if (hay.includes(query) || hay.includes(withoutHash)) return true;
  if (leadId && (leadId === withoutHash || leadId.includes(withoutHash))) return true;
  if (last10.length >= 7) {
    if (phoneDigits.includes(last10) || phoneDigits.endsWith(last10)) return true;
  } else if (queryDigits.length >= 3 && phoneDigits.includes(queryDigits)) {
    return true;
  }
  return false;
}

/**
 * Odoo-style automation: ensure exactly one auto Opportunity in Pipeline → New
 * for a newly created Contact. Reuses stage resolution + insert side effects.
 * Does NOT replace manual createCrmOpportunity. Soft-fails; never throws to callers.
 */
export async function ensureAutoOpportunityForNewContact(input: {
  contactId: string;
  contactName: string;
  organizationId: string;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  website?: string | null;
  salespersonId?: string | null;
  createdBy: string;
  customerLeadId?: string | null;
}): Promise<{ opportunityId?: string; skipped?: boolean; error?: string }> {
  try {
    const contactId = String(input.contactId || '').trim();
    const organizationId = String(input.organizationId || '').trim();
    if (!contactId || !organizationId) {
      return { skipped: true, error: 'contact and organization required' };
    }

    const supabase = await createAdminClient();

    // Duplicate protection: only one auto-opportunity per contact
    const { data: existingAuto } = await supabase
      .from('crm_opportunities')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('contact_id', contactId)
      .eq('source', CRM_AUTO_OPPORTUNITY_SOURCE)
      .limit(1)
      .maybeSingle();

    if (existingAuto?.id) {
      return { opportunityId: String(existingAuto.id), skipped: true };
    }

    // Fallback: same auto-generated name already linked to this contact
    const autoName = buildAutoOpportunityName(input.contactName);
    const { data: existingByName } = await supabase
      .from('crm_opportunities')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('contact_id', contactId)
      .eq('name', autoName)
      .limit(1)
      .maybeSingle();

    if (existingByName?.id) {
      return { opportunityId: String(existingByName.id), skipped: true };
    }

    const resolvedStage = await resolveCrmPipelineStageForOrg(organizationId, {
      stageNameHint: 'New',
    });
    if (!resolvedStage) {
      return { error: 'No pipeline stage available' };
    }

    const { resolveSalesAgentForSession } = await import('@/lib/legacy-user-bridge');
    const { getSession } = await import('@/lib/auth/session');
    const session = await getSession();

    // Always assign a salesperson so the card appears under My Pipeline
    // (visibility filters by salesperson_id / created_by for sales agents).
    let salespersonId = input.salespersonId ? String(input.salespersonId) : null;
    if (session) {
      const agent = await resolveSalesAgentForSession(supabase, session);
      if (agent?.id) {
        salespersonId = salespersonId || String(agent.id);
      }
    }
    if (!salespersonId) {
      console.error(
        '[ensureAutoOpportunityForNewContact] missing salesperson_id; opportunity may be hidden from My Pipeline'
      );
    }

    const { probabilityForStageName, computeLeadScore } = await import(
      '@/lib/crm-automation'
    );
    const probability = probabilityForStageName(
      String(resolvedStage.name || 'New'),
      Boolean(resolvedStage.is_won),
      Boolean(resolvedStage.is_lost),
      resolvedStage.default_probability
    );
    const lead_score = computeLeadScore({
      probability,
      expectedRevenue: 0,
      isWon: Boolean(resolvedStage.is_won),
      isLost: Boolean(resolvedStage.is_lost),
      activitiesTotal: 0,
      activitiesDone: 0,
    });

    const now = new Date().toISOString();
    const row = {
      organization_id: organizationId,
      stage_id: resolvedStage.id,
      name: autoName,
      contact_id: contactId,
      contact_person_id: null as string | null,
      expected_revenue: 0,
      probability,
      probability_manual: false,
      lead_score,
      priority: 0,
      salesperson_id: salespersonId,
      sales_team: null as string | null,
      tags: [] as string[],
      campaign: null as string | null,
      medium: null as string | null,
      source: CRM_AUTO_OPPORTUNITY_SOURCE,
      email: input.email || null,
      phone: input.phone || null,
      mobile: input.mobile || null,
      website: input.website || null,
      expected_closing_date: null as string | null,
      internal_notes: null as string | null,
      created_by: input.createdBy,
      updated_at: now,
    };

    let { data, error } = await supabase
      .from('crm_opportunities')
      .insert(row)
      .select('id')
      .single();

    if (error && /probability_manual|lead_score|column/i.test(error.message)) {
      const {
        probability_manual: _pm,
        lead_score: _ls,
        ...legacy
      } = row;
      const retry = await supabase
        .from('crm_opportunities')
        .insert(legacy)
        .select('id')
        .single();
      data = retry.data;
      error = retry.error;
    }

    // Race: concurrent auto-creates
    if (error && /duplicate|unique/i.test(error.message)) {
      const { data: raced } = await supabase
        .from('crm_opportunities')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('contact_id', contactId)
        .eq('source', CRM_AUTO_OPPORTUNITY_SOURCE)
        .limit(1)
        .maybeSingle();
      if (raced?.id) return { opportunityId: String(raced.id), skipped: true };
      return { error: error.message };
    }

    if (error || !data) {
      return { error: error?.message || 'Failed to create auto opportunity' };
    }

    const opportunityId = String(data.id);
    scheduleOpportunityCreatedSideEffects({
      opportunityId,
      organizationId,
      username: input.createdBy,
      opportunityName: autoName,
      contactId,
    });

    try {
      const { revalidatePath } = await import('next/cache');
      revalidatePath('/crm/pipeline');
      revalidatePath('/crm');
      revalidatePath('/admin/dashboard');
    } catch {
      // revalidate is best-effort
    }

    return { opportunityId };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Auto opportunity failed',
    };
  }
}

export async function getCrmPipelineBoard(filters: CrmPipelineBoardFilters = {}) {
  const auth = await requireAnyChildModule(['crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await resolveCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error, stages: [], opportunities: [] };

  const supabase = await createAdminClient();
  const { resolveCrmVisibilityScope, applyCrmVisibilityFilter } = await import(
    '@/lib/crm-visibility'
  );
  const needle = String(filters.search || '').trim();

  if (scope.isGlobalAdminView) {
    // Stage seeding, visibility and search contact lookup are independent —
    // run them together. Virtual admin stages do not depend on the seeding.
    const [, visibility, searchContactIds] = await Promise.all([
      supabase
        .from('organizations')
        .select('id')
        .then(({ data: orgRows }) =>
          Promise.all(
            (orgRows || []).map((org) => ensureDefaultCrmStages(String(org.id)))
          )
        ),
      filters.salespersonId ? Promise.resolve(null) : resolveCrmVisibilityScope(scope.session),
      needle ? findContactIdsForPipelineSearch(supabase, null, needle) : Promise.resolve([]),
    ]);

    const stages = DEFAULT_CRM_PIPELINE_STAGES.map((template) => ({
      id: buildAdminVirtualStageId(template.name),
      organization_id: '__all__',
      name: template.name,
      sequence: template.sequence,
      is_won: template.is_won,
      is_lost: template.is_lost,
      is_folded: false,
      default_probability: template.default_probability,
      created_at: '',
      updated_at: '',
    }));

    let query = supabase.from('crm_opportunities').select('*');

    if (!filters.salespersonId && visibility) {
      query = applyCrmVisibilityFilter(query, visibility);
    }

    if (filters.salespersonId) query = query.eq('salesperson_id', filters.salespersonId);
    if (filters.contactId) query = query.eq('contact_id', filters.contactId);

    if (needle) {
      const narrowed = applyPipelineSearchToOpportunityQuery(query, needle, searchContactIds);
      if (narrowed.forceEmpty) {
        return { stages, opportunities: [], isGlobalAdminView: true as const };
      }
      query = narrowed.query;
    }

    const sortBy = filters.sortBy === 'expected_revenue' ? 'expected_revenue' : 'created_at';
    const ascending = filters.sortDir === 'asc';
    query = query.order(sortBy, { ascending });

    const { data: oppRows, error: oppError } = await query;
    if (oppError) return { error: oppError.message };

    let opportunities = await enrichBoardOpportunities(
      (oppRows || []) as Record<string, unknown>[],
      needle
    );

    if (filters.stageId) {
      const stageName =
        parseAdminVirtualStageName(filters.stageId) ||
        stages.find((s) => s.id === filters.stageId)?.name;
      if (stageName) {
        opportunities = opportunities.filter((o) => o.stage_name === stageName);
      }
    }

    if (needle) {
      opportunities = opportunities.filter((opp) =>
        opportunityMatchesPipelineSearch(opp, needle)
      );
    }

    return { stages, opportunities, isGlobalAdminView: true as const };
  }

  const organizationId = scope.organizationId;
  const [stagesResult, visibility, searchContactIds] = await Promise.all([
    ensureDefaultCrmStages(organizationId).then(() =>
      supabase
        .from('crm_pipeline_stages')
        .select('*')
        .eq('organization_id', organizationId)
        .order('sequence', { ascending: true })
    ),
    filters.salespersonId ? Promise.resolve(null) : resolveCrmVisibilityScope(scope.session),
    needle
      ? findContactIdsForPipelineSearch(supabase, organizationId, needle)
      : Promise.resolve([]),
  ]);
  const { data: stageRows, error: stageError } = stagesResult;

  if (stageError) return { error: stageError.message };

  let query = supabase
    .from('crm_opportunities')
    .select('*')
    .eq('organization_id', organizationId);

  if (!filters.salespersonId && visibility) {
    query = applyCrmVisibilityFilter(query, visibility);
  }

  if (filters.stageId) query = query.eq('stage_id', filters.stageId);
  if (filters.salespersonId) query = query.eq('salesperson_id', filters.salespersonId);
  if (filters.contactId) query = query.eq('contact_id', filters.contactId);

  const mappedStages = (stageRows || []).map((row) => ({
    id: String(row.id),
    organization_id: String(row.organization_id),
    name: String(row.name || ''),
    sequence: Number(row.sequence) || 0,
    is_won: Boolean(row.is_won),
    is_lost: Boolean(row.is_lost),
    is_folded: Boolean(row.is_folded),
    default_probability: Number(row.default_probability ?? 10),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  }));

  if (needle) {
    const narrowed = applyPipelineSearchToOpportunityQuery(query, needle, searchContactIds);
    if (narrowed.forceEmpty) {
      return {
        stages: mappedStages,
        opportunities: [],
        isGlobalAdminView: false as const,
      };
    }
    query = narrowed.query;
  }

  const sortBy = filters.sortBy === 'expected_revenue' ? 'expected_revenue' : 'created_at';
  const ascending = filters.sortDir === 'asc';
  query = query.order(sortBy, { ascending });

  const { data: oppRows, error: oppError } = await query;
  if (oppError) return { error: oppError.message };

  let opportunities = await enrichBoardOpportunities(
    (oppRows || []) as Record<string, unknown>[],
    needle
  );

  if (needle) {
    opportunities = opportunities.filter((opp) =>
      opportunityMatchesPipelineSearch(opp, needle)
    );
  }

  return {
    stages: mappedStages,
    opportunities,
    isGlobalAdminView: false as const,
  };
}

export async function getCrmOpportunityById(opportunityId: string) {
  const auth = await requireAnyChildModule(['crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await resolveCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const supabase = await createAdminClient();
  let query = supabase.from('crm_opportunities').select('*').eq('id', opportunityId);

  if (!scope.isGlobalAdminView) {
    query = query.eq('organization_id', scope.organizationId);
  }

  let { data, error } = await query.maybeSingle();

  // Notification / mobile deep-links: opportunity may have null or mismatched org.
  if (!error && !data && !scope.isGlobalAdminView) {
    const unscoped = await supabase
      .from('crm_opportunities')
      .select('*')
      .eq('id', opportunityId)
      .maybeSingle();
    error = unscoped.error;
    data = unscoped.data;
    if (data) {
      const { resolveCrmVisibilityScope } = await import('@/lib/crm-visibility');
      const visibility = await resolveCrmVisibilityScope(scope.session);
      const username = String(scope.session.username || '').trim();
      const salespersonOk =
        visibility.salesAgentId &&
        data.salesperson_id &&
        String(data.salesperson_id) === visibility.salesAgentId;
      const creatorOk =
        username && data.created_by && String(data.created_by) === username;
      const oppOrg = data.organization_id ? String(data.organization_id) : null;
      const otherCompany =
        Boolean(oppOrg && scope.organizationId && oppOrg !== scope.organizationId);

      // Never leak another company's opportunities to org-wide viewers.
      if (otherCompany && !salespersonOk && !creatorOk) {
        return { error: 'Opportunity not found.' };
      }
      if (!otherCompany && !salespersonOk && !creatorOk && visibility.mode !== 'all') {
        return { error: 'Opportunity not found.' };
      }
      // Repair null org so the card stays visible in the active company pipeline.
      if (!data.organization_id && scope.organizationId && (salespersonOk || creatorOk || visibility.mode === 'all')) {
        await supabase
          .from('crm_opportunities')
          .update({
            organization_id: scope.organizationId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', opportunityId)
          .is('organization_id', null);
        data = { ...data, organization_id: scope.organizationId };
      }
    }
  }

  if (error) return { error: error.message };
  if (!data) return { error: 'Opportunity not found.' };

  const { resolveCrmVisibilityScope, canAccessCrmOpportunityRow } = await import(
    '@/lib/crm-visibility'
  );
  const visibility = await resolveCrmVisibilityScope(scope.session);
  if (!canAccessCrmOpportunityRow(visibility, data as Record<string, unknown>)) {
    // Own-document users already checked above for unscoped; for scoped rows enforce visibility.
    const username = String(scope.session.username || '').trim();
    const salespersonOk =
      visibility.salesAgentId &&
      data.salesperson_id &&
      String(data.salesperson_id) === visibility.salesAgentId;
    const creatorOk =
      username && data.created_by && String(data.created_by) === username;
    if (!salespersonOk && !creatorOk) {
      return { error: 'You do not have access to this opportunity.' };
    }
  }

  const [opportunity] = await enrichOpportunities([data as Record<string, unknown>]);
  return { opportunity };
}

export async function createCrmOpportunity(input: CrmOpportunityUpsertInput) {
  const auth = await requireAnyChildModule(['crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const validationError = validateOpportunityInput(input);
  if (validationError) return { error: validationError };

  const scope = await requireCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const supabase = await createAdminClient();

  // Resolve salesperson: prefer current user's agent for Own Documents users
  const { resolveSalesAgentForSession } = await import('@/lib/legacy-user-bridge');
  const { resolveCrmVisibilityScope } = await import('@/lib/crm-visibility');
  const agent = await resolveSalesAgentForSession(supabase, scope.session);
  const visibility = await resolveCrmVisibilityScope(scope.session);
  let salespersonId = input.salesperson_id || null;
  if (visibility.mode === 'assigned' && agent?.id) {
    salespersonId = agent.id;
  } else if (!salespersonId && agent?.id) {
    salespersonId = agent.id;
  }

  let stageId = input.stage_id;
  const resolvedStage = await resolveCrmPipelineStageForOrg(scope.organizationId, {
    stageId,
    stageNameHint: input.stage_name,
  });
  if (!resolvedStage) {
    return { error: 'No pipeline stage available. Refresh CRM to create default boards.' };
  }
  stageId = resolvedStage.id;
  const stageMeta = resolvedStage;

  const { probabilityForStageName, computeLeadScore } = await import('@/lib/crm-automation');
  const autoProb = probabilityForStageName(
    String(stageMeta?.name || 'New'),
    Boolean(stageMeta?.is_won),
    Boolean(stageMeta?.is_lost),
    stageMeta?.default_probability
  );
  const probability =
    input.probability !== undefined && input.probability !== null
      ? Math.min(100, Math.max(0, Number(input.probability)))
      : autoProb;
  const probability_manual =
    input.probability !== undefined &&
    input.probability !== null &&
    Number(input.probability) !== autoProb;

  const lead_score = computeLeadScore({
    probability,
    expectedRevenue: Number(input.expected_revenue ?? 0),
    isWon: Boolean(stageMeta?.is_won),
    isLost: Boolean(stageMeta?.is_lost),
    activitiesTotal: 0,
    activitiesDone: 0,
  });

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('crm_opportunities')
    .insert({
      organization_id: scope.organizationId,
      stage_id: stageId,
      name: String(input.name).trim(),
      contact_id: input.contact_id,
      contact_person_id: input.contact_person_id || null,
      expected_revenue: Number(input.expected_revenue ?? 0),
      probability,
      probability_manual,
      lead_score,
      priority: Math.min(3, Math.max(0, Number(input.priority ?? 0))),
      salesperson_id: salespersonId,
      sales_team: input.sales_team || null,
      tags: input.tags || [],
      campaign: input.campaign || null,
      medium: input.medium || null,
      source: input.source || null,
      email: input.email || null,
      phone: input.phone || null,
      mobile: input.mobile || null,
      website: input.website || null,
      expected_closing_date: input.expected_closing_date || null,
      internal_notes: input.internal_notes || null,
      created_by: scope.session.username,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error || !data) {
    // Fallback without new columns if migration not applied
    if (error && /probability_manual|lead_score|column/i.test(error.message)) {
      const retry = await supabase
        .from('crm_opportunities')
        .insert({
          organization_id: scope.organizationId,
          stage_id: stageId,
          name: String(input.name).trim(),
          contact_id: input.contact_id,
          contact_person_id: input.contact_person_id || null,
          expected_revenue: Number(input.expected_revenue ?? 0),
          probability,
          priority: Math.min(3, Math.max(0, Number(input.priority ?? 0))),
          salesperson_id: salespersonId,
          sales_team: input.sales_team || null,
          tags: input.tags || [],
          campaign: input.campaign || null,
          medium: input.medium || null,
          source: input.source || null,
          email: input.email || null,
          phone: input.phone || null,
          mobile: input.mobile || null,
          website: input.website || null,
          expected_closing_date: input.expected_closing_date || null,
          internal_notes: input.internal_notes || null,
          created_by: scope.session.username,
          updated_at: now,
        })
        .select('*')
        .single();
      if (retry.error || !retry.data) {
        return { error: retry.error?.message || error.message };
      }
      const opportunity = mapCreatedOpportunityCard(retry.data as Record<string, unknown>, {
        stageName: String(stageMeta?.name || input.stage_name || ''),
        customerName: input.customer_name || null,
        customerLeadId: input.customer_lead_id || null,
        salespersonName: input.salesperson_name || null,
      });
      scheduleOpportunityCreatedSideEffects({
        opportunityId: opportunity.id,
        organizationId: scope.organizationId,
        username: scope.session.username,
        opportunityName: opportunity.name,
        contactId: String(input.contact_id),
      });
      return { opportunity };
    }
    return { error: error?.message || 'Failed to create opportunity.' };
  }
  const opportunity = mapCreatedOpportunityCard(data as Record<string, unknown>, {
    stageName: String(stageMeta?.name || input.stage_name || ''),
    customerName: input.customer_name || null,
    customerLeadId: input.customer_lead_id || null,
    salespersonName: input.salesperson_name || null,
  });
  scheduleOpportunityCreatedSideEffects({
    opportunityId: opportunity.id,
    organizationId: scope.organizationId,
    username: scope.session.username,
    opportunityName: opportunity.name,
    contactId: String(input.contact_id),
  });
  // No revalidatePath — pipeline updates optimistically (same as stage drag).
  return { opportunity };
}

export async function updateCrmOpportunity(input: CrmOpportunityUpsertInput) {
  const auth = await requireAnyChildModule(['crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const id = input.id ? String(input.id) : '';
  if (!id) return { error: 'Opportunity id is required.' };

  const validationError = validateOpportunityInput(input);
  if (validationError) return { error: validationError };

  const scope = await requireCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const supabase = await createAdminClient();
  const { data: existing } = await supabase
    .from('crm_opportunities')
    .select('*')
    .eq('id', id)
    .eq('organization_id', scope.organizationId)
    .maybeSingle();

  if (!existing) return { error: 'Opportunity not found.' };

  const payload: Record<string, unknown> = {
    name: String(input.name).trim(),
    contact_id: input.contact_id,
    contact_person_id: input.contact_person_id || null,
    expected_revenue: Number(input.expected_revenue ?? 0),
    probability: Math.min(100, Math.max(0, Number(input.probability ?? 0))),
    probability_manual: true,
    priority: Math.min(3, Math.max(0, Number(input.priority ?? 0))),
    salesperson_id: input.salesperson_id,
    sales_team: input.sales_team || null,
    tags: input.tags || [],
    campaign: input.campaign || null,
    medium: input.medium || null,
    source: input.source || null,
    email: input.email || null,
    phone: input.phone || null,
    mobile: input.mobile || null,
    website: input.website || null,
    expected_closing_date: input.expected_closing_date || null,
    internal_notes: input.internal_notes || null,
    updated_at: new Date().toISOString(),
  };
  if (input.stage_id) payload.stage_id = input.stage_id;

  const { data, error } = await supabase
    .from('crm_opportunities')
    .update(payload)
    .eq('id', id)
    .eq('organization_id', scope.organizationId)
    .select('*')
    .single();

  if (error || !data) return { error: error?.message || 'Failed to update opportunity.' };
  const [opportunity] = await enrichOpportunities([data as Record<string, unknown>]);
  const [prevOpp] = await enrichOpportunities([existing as Record<string, unknown>]);

  const changes: string[] = [];
  if (prevOpp.name !== opportunity.name) {
    changes.push(`${prevOpp.name} → ${opportunity.name} (Name)`);
  }
  if (prevOpp.stage_id !== opportunity.stage_id) {
    changes.push(
      `${prevOpp.stage_name || '—'} → ${opportunity.stage_name || '—'} (Stage)`
    );
  }
  if (prevOpp.contact_id !== opportunity.contact_id) {
    await logOpportunityCustomerChangedAudit(
      opportunity.id,
      scope.organizationId,
      scope.session.username,
      prevOpp.customer_name || '—',
      opportunity.customer_name || '—'
    );
  }
  if (Number(prevOpp.expected_revenue) !== Number(opportunity.expected_revenue)) {
    changes.push(
      `${prevOpp.expected_revenue} → ${opportunity.expected_revenue} (Expected Revenue)`
    );
  }
  if (Number(prevOpp.probability) !== Number(opportunity.probability)) {
    changes.push(`${prevOpp.probability} → ${opportunity.probability} (Probability)`);
  }
  if (prevOpp.salesperson_id !== opportunity.salesperson_id) {
    changes.push(
      `${prevOpp.salesperson_name || '—'} → ${opportunity.salesperson_name || '—'} (Salesperson)`
    );
  }

  await logOpportunityUpdatedAudit(
    opportunity.id,
    scope.organizationId,
    scope.session.username,
    changes
  );

  await revalidateCrmPipelinePaths();
  return { opportunity };
}

export async function moveCrmOpportunityStage(
  opportunityId: string,
  stageId: string,
  options?: {
    lostReason?: string | null;
    forceProbability?: number | null;
    /** Optional stage name hint (helps when id is a virtual/admin column id). */
    stageName?: string | null;
  }
) {
  const auth = await requireAnyChildModule(['crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await resolveCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const supabase = await createAdminClient();

  type OppRow = {
    id: string;
    organization_id: string;
    stage_id: string;
    salesperson_id: string | null;
    created_by: string | null;
    expected_revenue: number;
    probability: number;
    probability_manual?: boolean;
  };

  let opportunity: OppRow | null = null;

  {
    let oppQuery = supabase
      .from('crm_opportunities')
      .select(
        'id, organization_id, stage_id, salesperson_id, created_by, expected_revenue, probability, probability_manual'
      )
      .eq('id', opportunityId);
    if (!scope.isGlobalAdminView) {
      oppQuery = oppQuery.eq('organization_id', scope.organizationId);
    }
    const first = await oppQuery.maybeSingle();
    if (first.error && /probability_manual|column/i.test(first.error.message)) {
      let retry = supabase
        .from('crm_opportunities')
        .select(
          'id, organization_id, stage_id, salesperson_id, created_by, expected_revenue, probability'
        )
        .eq('id', opportunityId);
      if (!scope.isGlobalAdminView) {
        retry = retry.eq('organization_id', scope.organizationId!);
      }
      const second = await retry.maybeSingle();
      if (second.data) {
        opportunity = {
          id: String(second.data.id),
          organization_id: String(second.data.organization_id),
          stage_id: String(second.data.stage_id),
          salesperson_id: second.data.salesperson_id
            ? String(second.data.salesperson_id)
            : null,
          created_by: second.data.created_by
            ? String(second.data.created_by)
            : null,
          expected_revenue: Number(second.data.expected_revenue) || 0,
          probability: Number(second.data.probability) || 0,
          probability_manual: false,
        };
      }
    } else if (first.data) {
      opportunity = {
        id: String(first.data.id),
        organization_id: String(first.data.organization_id),
        stage_id: String(first.data.stage_id),
        salesperson_id: first.data.salesperson_id
          ? String(first.data.salesperson_id)
          : null,
        created_by: first.data.created_by ? String(first.data.created_by) : null,
        expected_revenue: Number(first.data.expected_revenue) || 0,
        probability: Number(first.data.probability) || 0,
        probability_manual: Boolean(first.data.probability_manual),
      };
    }
  }

  if (!opportunity) return { error: 'Opportunity not found.' };

  const { resolveCrmVisibilityScope, canAccessCrmOpportunityRow } = await import(
    '@/lib/crm-visibility'
  );
  const visibility = await resolveCrmVisibilityScope(scope.session);
  // Anyone who can see the card on the board can move it between stages.
  if (!canAccessCrmOpportunityRow(visibility, opportunity)) {
    return { error: 'You can only manage opportunities assigned to you.' };
  }

  const { data: oldStage } = await supabase
    .from('crm_pipeline_stages')
    .select('name')
    .eq('id', opportunity.stage_id)
    .maybeSingle();

  type StageRow = {
    id: string;
    name: string;
    is_won: boolean;
    is_lost: boolean;
    default_probability?: number;
  };

  const orgId = String(opportunity.organization_id);
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  async function fetchStageByName(name: string): Promise<StageRow | null> {
    const trimmed = String(name || '').trim();
    if (!trimmed) return null;

    const withProb = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, is_won, is_lost, default_probability')
      .eq('organization_id', orgId)
      .eq('name', trimmed)
      .order('sequence', { ascending: true })
      .limit(1);

    let row = withProb.data?.[0] as Record<string, unknown> | undefined;
    if (withProb.error && /default_probability|column/i.test(withProb.error.message)) {
      const withoutProb = await supabase
        .from('crm_pipeline_stages')
        .select('id, name, is_won, is_lost')
        .eq('organization_id', orgId)
        .eq('name', trimmed)
        .order('sequence', { ascending: true })
        .limit(1);
      row = withoutProb.data?.[0] as Record<string, unknown> | undefined;
    }

    if (!row) return null;
    return {
      id: String(row.id),
      name: String(row.name),
      is_won: Boolean(row.is_won),
      is_lost: Boolean(row.is_lost),
      default_probability:
        row.default_probability != null ? Number(row.default_probability) : undefined,
    };
  }

  async function fetchStageById(id: string): Promise<StageRow | null> {
    const withProb = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, is_won, is_lost, default_probability')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle();

    let row = withProb.data as Record<string, unknown> | null;
    if (withProb.error && /default_probability|column/i.test(withProb.error.message)) {
      const withoutProb = await supabase
        .from('crm_pipeline_stages')
        .select('id, name, is_won, is_lost')
        .eq('id', id)
        .eq('organization_id', orgId)
        .maybeSingle();
      row = withoutProb.data as Record<string, unknown> | null;
    }

    // Cross-org id → resolve by that stage's name within this opportunity's org
    if (!row) {
      const anyOrg = await supabase
        .from('crm_pipeline_stages')
        .select('id, name')
        .eq('id', id)
        .maybeSingle();
      if (anyOrg.data?.name) {
        return fetchStageByName(String(anyOrg.data.name));
      }
      return null;
    }

    return {
      id: String(row.id),
      name: String(row.name),
      is_won: Boolean(row.is_won),
      is_lost: Boolean(row.is_lost),
      default_probability:
        row.default_probability != null ? Number(row.default_probability) : undefined,
    };
  }

  const virtualName = parseAdminVirtualStageName(stageId);
  const hintName = String(options?.stageName || '').trim();
  let newStageRow: StageRow | null = null;

  if (virtualName) {
    newStageRow = await fetchStageByName(virtualName);
  } else if (uuidRe.test(stageId)) {
    newStageRow = await fetchStageById(stageId);
  } else {
    // Bare stage name (or other non-UUID id) — resolve within org
    newStageRow = await fetchStageByName(stageId);
  }

  // Last resort: explicit name hint from the client
  if (!newStageRow && hintName) {
    newStageRow = await fetchStageByName(hintName);
  }

  // Ensure default stages exist, then retry by name once
  if (!newStageRow) {
    await ensureDefaultCrmStages(orgId);
    const retryName = virtualName || hintName || (!uuidRe.test(stageId) ? stageId : '');
    if (retryName) newStageRow = await fetchStageByName(retryName);
  }

  if (!newStageRow) {
    return {
      error: `Could not move to stage "${hintName || virtualName || stageId}". Refresh the pipeline and try again.`,
    };
  }

  const resolvedStageId = newStageRow.id;

  if (newStageRow.is_lost) {
    const reason = String(options?.lostReason || '').trim();
    if (!reason) {
      return {
        error: 'Lost reason is required when marking an opportunity as Lost.',
        needsLostReason: true as const,
      };
    }
  }

  const { probabilityForStageName, computeLeadScore } = await import('@/lib/crm-automation');
  const autoProb = probabilityForStageName(
    newStageRow.name,
    newStageRow.is_won,
    newStageRow.is_lost,
    newStageRow.default_probability
  );

  const forceClosed = newStageRow.is_won || newStageRow.is_lost;
  const keepManual = Boolean(opportunity.probability_manual) && !forceClosed;
  const nextProbability =
    typeof options?.forceProbability === 'number'
      ? Math.min(100, Math.max(0, options.forceProbability))
      : keepManual
        ? Number(opportunity.probability) || autoProb
        : autoProb;

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    stage_id: resolvedStageId,
    probability: nextProbability,
    updated_at: now,
  };

  if (forceClosed) {
    payload.probability_manual = false;
    payload.date_closed = now;
    if (newStageRow.is_lost) {
      payload.lost_reason = String(options?.lostReason || '').trim();
    } else {
      payload.lost_reason = null;
    }
  } else {
    payload.date_closed = null;
    payload.lost_reason = null;
  }

  payload.lead_score = computeLeadScore({
    probability: nextProbability,
    expectedRevenue: Number(opportunity.expected_revenue) || 0,
    isWon: newStageRow.is_won,
    isLost: newStageRow.is_lost,
  });

  let { data, error } = await supabase
    .from('crm_opportunities')
    .update(payload)
    .eq('id', opportunityId)
    .select('id, stage_id, probability, lost_reason, lead_score')
    .single();

  if (error && /lost_reason|lead_score|probability_manual|date_closed|column/i.test(error.message)) {
    const fallback = await supabase
      .from('crm_opportunities')
      .update({
        stage_id: resolvedStageId,
        probability: nextProbability,
        updated_at: now,
      })
      .eq('id', opportunityId)
      .select('id, stage_id, probability')
      .single();
    data = fallback.data as typeof data;
    error = fallback.error;
  }

  if (error || !data) {
    return { error: error?.message || 'Failed to move opportunity.' };
  }

  const scopeUser = scope.session.username;

  // Side effects must never roll back / fail the stage move
  try {
    if (oldStage?.name !== newStageRow.name) {
      await logOpportunityStageChangedAudit(
        opportunityId,
        orgId,
        scopeUser,
        String(oldStage?.name || '—'),
        String(newStageRow.name || '—')
      );

      if (newStageRow.is_lost && options?.lostReason) {
        await logOpportunityUpdatedAudit(opportunityId, orgId, scopeUser, [
          `— → ${options.lostReason} (Lost Reason)`,
        ]);
      }

      const { runStageActivityAutomation, refreshOpportunityLeadScore } = await import(
        '@/app/actions/crm/automation'
      );
      await runStageActivityAutomation({
        organizationId: orgId,
        opportunityId,
        stageId: resolvedStageId,
        assignedTo: opportunity.salesperson_id ? String(opportunity.salesperson_id) : null,
        performedBy: scopeUser,
      });
      await refreshOpportunityLeadScore(opportunityId);
    }

    const { writeCrmAuditLog } = await import('@/lib/crm-visibility');
    await writeCrmAuditLog({
      organizationId: orgId,
      entityId: opportunityId,
      action: 'stage_changed',
      performedBy: scopeUser,
      details: {
        from: oldStage?.name,
        to: newStageRow.name,
        lost_reason: options?.lostReason || null,
        probability: nextProbability,
      },
    });
  } catch {
    // Chatter / automation / audit are best-effort
  }

  // Do not revalidatePath here — it forces a Next.js refresh and makes drag feel jumpy.
  // The Kanban keeps optimistic client state.

  return {
    success: true as const,
    stage_id: String(data.stage_id),
    probability: Number(data.probability) || nextProbability,
    lost_reason: 'lost_reason' in data ? (data.lost_reason as string | null) : null,
  };
}
