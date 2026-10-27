'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/utils/supabase/server';

// =============================================================
// Types
// =============================================================

export type CompanyType = 'person' | 'company';
export type ContactKind = 'contact' | 'invoice' | 'delivery' | 'other';
export type ActivityActionType =
  | 'created'
  | 'updated'
  | 'note'
  | 'message'
  | 'activity'
  | 'tag'
  | 'child_added';

export type ContactTag = {
  id: string;
  name: string;
  color: string;
  created_at: string;
};

export type Contact = {
  id: string;
  parent_id: string | null;
  contact_kind: ContactKind;
  company_type: CompanyType;

  name: string;
  company_name: string | null;
  job_position: string | null;
  title: string | null;
  image_url: string | null;

  email: string | null;
  phone: string | null;
  mobile: string | null;
  website: string | null;

  street: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;

  tax_id: string | null;
  company_ref: string | null;
  industry: string | null;

  salesperson_id: string | null;
  payment_terms: string | null;
  pricelist: string | null;
  delivery_method: string | null;
  customer_rank: number;
  vendor_rank: number;
  sales_payment_method: string | null;
  incoterm: string | null;
  incoterm_location: string | null;
  group_rfq: string | null;
  buyer: string | null;
  purchase_payment_terms: string | null;
  purchase_payment_method: string | null;
  receipt_reminder: boolean;

  receivable_account: string | null;
  payable_account: string | null;
  tax_settings: string | null;
  fiscal_position: string | null;

  notes: string | null;

  /** Lead channel when migrated from legacy Sales Agent leads (Meta / LinkedIn / …). */
  source?: string | null;
  mobile_registered_at?: string | null;
  mobile_user_id?: string | null;
  /** Original `leads.id` when this contact was created/linked by the legacy migration. */
  legacy_lead_id?: string | null;
  /** Permanent 6-digit Lead Number / Customer ID (auto-assigned; never changed). */
  lead_id_formatted?: string | null;

  is_active: boolean;
  organization_id?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ContactWithRelations = Contact & {
  tags: ContactTag[];
  children: Contact[];
};

export type ContactActivityLog = {
  id: string;
  contact_id: string;
  action_type: ActivityActionType;
  body: string | null;
  performed_by: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type ContactUpsertInput = {
  id?: string;
  parent_id?: string | null;
  contact_kind?: ContactKind;
  company_type?: CompanyType;

  name: string;
  company_name?: string | null;
  job_position?: string | null;
  title?: string | null;
  image_url?: string | null;

  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  website?: string | null;

  street?: string | null;
  street2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;

  tax_id?: string | null;
  company_ref?: string | null;
  industry?: string | null;

  salesperson_id?: string | null;
  payment_terms?: string | null;
  pricelist?: string | null;
  delivery_method?: string | null;
  customer_rank?: number;
  vendor_rank?: number;
  sales_payment_method?: string | null;
  incoterm?: string | null;
  incoterm_location?: string | null;
  group_rfq?: string | null;
  buyer?: string | null;
  purchase_payment_terms?: string | null;
  purchase_payment_method?: string | null;
  receipt_reminder?: boolean;

  receivable_account?: string | null;
  payable_account?: string | null;
  tax_settings?: string | null;
  fiscal_position?: string | null;

  notes?: string | null;

  tag_ids?: string[];
};

// =============================================================
// Helpers
// =============================================================

function ensureAuth(session: { role: string; username: string } | null) {
  if (!session) throw new Error('Unauthorized');
  return session;
}

function normalizeText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const v = normalizeText(value);
  return v ? v.toLowerCase() : null;
}

function normalizeKind(value: ContactKind | undefined): ContactKind {
  const allowed: ContactKind[] = ['contact', 'invoice', 'delivery', 'other'];
  if (value && allowed.includes(value)) return value;
  return 'contact';
}

function normalizeCompanyType(value: CompanyType | undefined): CompanyType {
  return value === 'company' ? 'company' : 'person';
}

/** Odoo list: top-level companies + all individuals (including employer-linked). */
const CONTACTS_LIST_OR_FILTER = 'parent_id.is.null,company_type.eq.person';

/** Page size for chunked contact fetches (avoids oversized single responses). */
const CONTACTS_FETCH_PAGE_SIZE = 1000;

function escapePostgrestFilterValue(value: string): string {
  const v = String(value || '');
  if (/[\s,().]/.test(v) || v.includes('"')) {
    return `"${v.replace(/"/g, '\\"')}"`;
  }
  return v;
}

/**
 * Normalize a Contacts search token for Lead/Customer ID + phone matching.
 * Keeps stored values untouched — only the query/comparison is normalized.
 */
function normalizeContactsSearchToken(rawQuery: string): {
  text: string;
  leadIdToken: string | null;
  phoneDigits: string;
  phoneLast10: string | null;
} {
  const text = String(rawQuery || '')
    .trim()
    .replace(/[%_,.()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Strip leading # so "#674810" matches lead_id_formatted "674810"
  const withoutHash = text.replace(/^#+/, '').trim();
  const phoneDigits = String(rawQuery || '').replace(/\D/g, '');
  const leadIdToken = /^\d{3,}$/.test(withoutHash.replace(/\s/g, ''))
    ? withoutHash.replace(/\s/g, '')
    : phoneDigits.length >= 3 && /^\d+$/.test(phoneDigits)
      ? phoneDigits
      : null;
  const phoneLast10 =
    phoneDigits.length >= 10 ? phoneDigits.slice(-10) : phoneDigits.length >= 7 ? phoneDigits : null;
  return { text, leadIdToken, phoneDigits, phoneLast10 };
}

/** PostgREST `.or(...)` for name / phone / Customer ID search (DB-side). */
function buildContactsSearchOrFilter(rawQuery: string): string | null {
  const { text, leadIdToken, phoneDigits, phoneLast10 } = normalizeContactsSearchToken(rawQuery);
  if (!text && !phoneDigits) return null;

  const parts: string[] = [];
  if (text) {
    const escaped = text.replace(/^#+/, '').trim() || text;
    parts.push(`name.ilike.%${escaped}%`);
    parts.push(`company_name.ilike.%${escaped}%`);
    parts.push(`email.ilike.%${escaped}%`);
    parts.push(`phone.ilike.%${escaped}%`);
    parts.push(`mobile.ilike.%${escaped}%`);
    parts.push(`lead_id_formatted.ilike.%${escaped}%`);
  }

  if (leadIdToken) {
    parts.push(`lead_id_formatted.eq.${leadIdToken}`);
    parts.push(`lead_id_formatted.ilike.%${leadIdToken}%`);
  }

  // Phone columns store formatted values (+92 312…). Match by last 10 digits.
  if (phoneLast10) {
    parts.push(`phone.ilike.%${phoneLast10}%`);
    parts.push(`mobile.ilike.%${phoneLast10}%`);
  } else if (phoneDigits.length >= 3) {
    parts.push(`phone.ilike.%${phoneDigits}%`);
    parts.push(`mobile.ilike.%${phoneDigits}%`);
  }

  return parts.length > 0 ? parts.join(',') : null;
}

export type DuplicateContactInfo = {
  id: string;
  name: string;
  lead_id_formatted: string | null;
};

function formatDuplicateContactError(existing: DuplicateContactInfo): string {
  const customerId =
    String(existing.lead_id_formatted || '').trim() || '—';
  const customerName = String(existing.name || '').trim() || '—';
  return [
    'This customer already exists in the system.',
    '',
    `Customer Name: ${customerName}`,
    `Customer ID / Lead Number: ${customerId}`,
    '',
    'Please search for this customer instead of creating a duplicate.',
  ].join('\n');
}

function phonesMatchDigits(a: string | null | undefined, bDigits: string): boolean {
  const dig = String(a || '').replace(/\D/g, '');
  if (!dig || bDigits.length < 10) return false;
  const aTail = dig.length >= 10 ? dig.slice(-10) : dig;
  const bTail = bDigits.slice(-10);
  return aTail === bTail;
}

/**
 * Global (org-scoped) duplicate lookup by normalized phone / mobile.
 * Used before insert so any Sales Agent is blocked from recreating an existing customer.
 */
async function findExistingContactByPhone(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  phoneRaw: string | null | undefined,
  options?: { organizationId?: string | null; excludeContactId?: string | null }
): Promise<DuplicateContactInfo | null> {
  const raw = String(phoneRaw || '').trim();
  if (!raw) return null;

  const { normalizePhoneDigits, normalizePakistaniPhone } = await import(
    '@/lib/pakistan-phone'
  );
  let digits = normalizePhoneDigits(raw);
  const pk = normalizePakistaniPhone(raw);
  if (pk.ok) digits = pk.value;
  if (digits.length < 10) return null;

  const last10 = digits.slice(-10);
  let q = supabase
    .from('contacts')
    .select('id, name, phone, mobile, lead_id_formatted, organization_id')
    .or(`phone.ilike.%${last10}%,mobile.ilike.%${last10}%`)
    .limit(120);

  if (options?.excludeContactId) {
    q = q.neq('id', options.excludeContactId);
  }

  const { data, error } = await q;
  if (error || !data?.length) return null;

  const orgId = options?.organizationId
    ? String(options.organizationId)
    : null;

  for (const row of data) {
    if (orgId) {
      const rowOrg = row.organization_id ? String(row.organization_id) : null;
      if (rowOrg && rowOrg !== orgId) continue;
    }
    if (
      phonesMatchDigits(row.phone as string | null, digits) ||
      phonesMatchDigits(row.mobile as string | null, digits)
    ) {
      return {
        id: String(row.id),
        name: String(row.name || '').trim() || '—',
        lead_id_formatted: row.lead_id_formatted
          ? String(row.lead_id_formatted)
          : null,
      };
    }
  }
  return null;
}

function parseDuplicateContactTriggerError(
  message: string | undefined
): DuplicateContactInfo | null {
  const msg = String(message || '');
  const marker = 'duplicate_contact_phone:';
  const idx = msg.indexOf(marker);
  if (idx < 0) return null;
  const payload = msg.slice(idx + marker.length).trim();
  // id|name|lead_id_formatted
  const [id, name, leadId] = payload.split('|');
  if (!id) return null;
  return {
    id: id.trim(),
    name: (name || '').trim() || '—',
    lead_id_formatted: (leadId || '').trim() || null,
  };
}

function resolveContactDisplayName(
  input: ContactUpsertInput,
  payload: { name: string; phone: string | null; mobile: string | null },
  parentResolved: { parent_id: string | null; company_name: string | null }
): string | null {
  const trimmed = String(payload.name || '').trim();
  if (trimmed) return trimmed;

  const companyType = normalizeCompanyType(input.company_type);
  if (companyType === 'company') return null;

  const phone = payload.phone || payload.mobile;
  const hasEmployer =
    Boolean(parentResolved.parent_id) || Boolean(normalizeText(input.company_name));

  if (hasEmployer && phone) return phone;
  if (hasEmployer && parentResolved.company_name) return parentResolved.company_name;
  if (phone) return phone;

  return null;
}

function revalidateContactsPaths() {
  revalidatePath('/admin/dashboard');
}

/**
 * Active organization for Contacts (Odoo multi-company).
 * Returns empty when Super Admin is in global Admin context — select a company first.
 */
async function resolveContactsOrganizationId(
  session: { role: string } | null
): Promise<
  | { organizationId: string }
  | { empty: true }
  | { error: string }
  | { unscoped: true }
> {
  const {
    requireAdminOrganizationScope,
    sessionUsesOrganizationScope,
  } = await import('@/lib/admin-organization-context');
  const { isSuperAdminInAdminContext } = await import('@/lib/auth/super-admin');
  type SessionRole = import('@/lib/auth/session').SessionRole;

  if (!session || !sessionUsesOrganizationScope(session.role as SessionRole)) {
    return { unscoped: true };
  }

  const scope = await requireAdminOrganizationScope();
  if ('error' in scope) {
    if (scope.status === 403) return { empty: true };
    return { error: scope.error };
  }

  if (!scope.organizationId) {
    if (isSuperAdminInAdminContext(scope.session)) return { empty: true };
    return { empty: true };
  }

  return { organizationId: scope.organizationId };
}

// =============================================================
// Queries
// =============================================================

export type GetContactsOptions = {
  search?: string;
  /** Inclusive UTC ISO lower bound on contacts.created_at */
  createdAtGte?: string | null;
  /** Exclusive UTC ISO upper bound on contacts.created_at */
  createdAtLt?: string | null;
};

type ContactsListScope = {
  organizationId: string | null;
  agentIdForOwnership: string | null;
  createdByFallback: string | null;
};

/**
 * Who may see which contacts in the list (ownership + active organization).
 * Returns `empty` when nothing can be shown (no org and no ownership scope).
 */
async function resolveContactsListScope(
  session: { role: string; username: string }
): Promise<ContactsListScope | { empty: true } | { error: string }> {
  const {
    resolveSalesAccessRole,
    salesRoleSeesAllOrgRecords,
  } = await import('@/lib/sales-roles');
  const { resolveCurrentSalespersonId } = await import(
    '@/app/actions/sales/automation'
  );

  // Contact Module ownership: if the login maps to sales_agents, always scope
  // by salesperson_id so UI totals match the DB ownership query (e.g. muneeba 2071).
  // Sales administrators still see the full org list. Do not OR created_by.
  const { isSuperAdminSession } = await import('@/lib/auth/super-admin');
  const salesRole = resolveSalesAccessRole(session as never);
  const ownsDocumentsOnly = Boolean(salesRole && !salesRoleSeesAllOrgRecords(salesRole));
  const isSalesAdministrator =
    salesRole === 'administrator' || isSuperAdminSession(session as never);

  // Salesperson lookup and organization scope are independent — resolve in parallel.
  const [agentId, org] = await Promise.all([
    isSalesAdministrator ? Promise.resolve(null) : resolveCurrentSalespersonId(),
    resolveContactsOrganizationId(session),
  ]);

  const agentIdForOwnership: string | null = agentId;
  let createdByFallback: string | null = null;
  if (!isSalesAdministrator && !agentIdForOwnership && ownsDocumentsOnly) {
    const username = String(session.username || '').trim();
    if (username) createdByFallback = username;
  }

  if ('error' in org) return { error: org.error };

  // Header "No organizations" → empty unless we can scope by salesperson / created_by.
  if ('empty' in org && !agentIdForOwnership && !createdByFallback) {
    return { empty: true };
  }

  return {
    organizationId: 'unscoped' in org || 'empty' in org ? null : org.organizationId,
    agentIdForOwnership,
    createdByFallback,
  };
}

/** Apply ownership / organization / search / date filters for the Contacts list. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyContactsListFilters<Q extends { eq: any; or: any; gte: any; lt: any }>(
  query: Q,
  scope: ContactsListScope,
  searchOrFilter: string | null,
  dates: { createdAtGte: string | null; createdAtLt: string | null },
  applyOrganizationFilter: (q: Q, organizationId: string | null) => Q
): Q {
  const { organizationId, agentIdForOwnership, createdByFallback } = scope;
  let pageQuery = query;

  // Active search: org-wide DB lookup (name / Customer ID / phone) so agents
  // can locate an existing customer after a duplicate warning. Empty browse
  // stays ownership-scoped for sales agents. Without an org, keep ownership.
  if (searchOrFilter) {
    if (organizationId) {
      pageQuery = applyOrganizationFilter(pageQuery, organizationId);
      pageQuery = pageQuery.or(searchOrFilter);
    } else if (agentIdForOwnership) {
      pageQuery = pageQuery
        .eq('salesperson_id', agentIdForOwnership)
        .or(searchOrFilter);
    } else if (createdByFallback) {
      pageQuery = pageQuery
        .eq('created_by', createdByFallback)
        .or(searchOrFilter);
    } else {
      pageQuery = pageQuery.or(searchOrFilter);
    }
  } else if (agentIdForOwnership) {
    pageQuery = pageQuery.eq('salesperson_id', agentIdForOwnership);
  } else if (createdByFallback) {
    pageQuery = pageQuery.eq('created_by', createdByFallback);
    if (organizationId) {
      pageQuery = applyOrganizationFilter(pageQuery, organizationId);
    }
  } else {
    if (organizationId) {
      pageQuery = applyOrganizationFilter(pageQuery, organizationId);
    }
    pageQuery = pageQuery.or(CONTACTS_LIST_OR_FILTER);
  }

  // Date-range filter on the persisted contacts.created_at column
  // (start inclusive / end exclusive — see contact-date-range helpers).
  if (dates.createdAtGte) {
    pageQuery = pageQuery.gte('created_at', dates.createdAtGte);
  }
  if (dates.createdAtLt) {
    pageQuery = pageQuery.lt('created_at', dates.createdAtLt);
  }

  return pageQuery;
}

/** Attach tag rows to a set of contacts (chunked `in` lookups). */
async function attachContactTags(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  contacts: Contact[]
): Promise<{ contacts: ContactWithRelations[] } | { error: string }> {
  const contactIds = contacts.map((c) => c.id);

  const tagLinks: { contact_id: string; tag_id: string }[] = [];
  const tags: ContactTag[] = [];
  if (contactIds.length > 0) {
    const IN_CHUNK = 120;
    const linkChunks: string[][] = [];
    for (let i = 0; i < contactIds.length; i += IN_CHUNK) {
      linkChunks.push(contactIds.slice(i, i + IN_CHUNK));
    }

    const linkResults = await Promise.all(
      linkChunks.map((chunk) =>
        supabase
          .from('contact_tag_links')
          .select('contact_id, tag_id')
          .in('contact_id', chunk)
      )
    );

    for (const linkRes of linkResults) {
      if (linkRes.error) {
        return {
          error: `Contact tags query failed: ${linkRes.error.message}${
            linkRes.error.details ? ` (${linkRes.error.details})` : ''
          }`,
        };
      }
      if (linkRes.data?.length) tagLinks.push(...linkRes.data);
    }

    const tagIds = Array.from(new Set(tagLinks.map((l) => l.tag_id)));
    if (tagIds.length > 0) {
      const tagChunks: string[][] = [];
      for (let i = 0; i < tagIds.length; i += IN_CHUNK) {
        tagChunks.push(tagIds.slice(i, i + IN_CHUNK));
      }
      const tagResults = await Promise.all(
        tagChunks.map((chunk) =>
          supabase.from('contact_tags').select('*').in('id', chunk)
        )
      );
      for (const tagRes of tagResults) {
        if (tagRes.error) {
          return {
            error: `Tags query failed: ${tagRes.error.message}${
              tagRes.error.details ? ` (${tagRes.error.details})` : ''
            }`,
          };
        }
        if (tagRes.data?.length) tags.push(...(tagRes.data as ContactTag[]));
      }
    }
  }

  const tagMap = new Map<string, ContactTag>();
  for (const t of tags) tagMap.set(t.id, t);

  const tagsByContact = new Map<string, ContactTag[]>();
  for (const link of tagLinks) {
    const tag = tagMap.get(link.tag_id);
    if (!tag) continue;
    const list = tagsByContact.get(link.contact_id) || [];
    list.push(tag);
    tagsByContact.set(link.contact_id, list);
  }

  return {
    contacts: contacts.map((c) => ({
      ...(c as Contact),
      tags: tagsByContact.get(c.id) || [],
      children: [],
    })),
  };
}

export type ContactsTypeFilter = 'all' | 'person' | 'company';
export type ContactsSourceFilter = 'all' | 'mobile_app' | 'manual';

export type GetContactsPageOptions = GetContactsOptions & {
  /** 1-based page number. */
  page?: number;
  pageSize?: number;
  companyType?: ContactsTypeFilter;
  source?: ContactsSourceFilter;
  /** Skip the two source-count queries when the caller already has them. */
  includeSourceCounts?: boolean;
};

export type ContactsSourceCounts = { all: number; mobile: number; manual: number };

const CONTACTS_MAX_PAGE_SIZE = 100;
const CONTACTS_LEAN_SELECT_WITHOUT_MOBILE =
  'id, name, company_name, email, phone, country, company_type, customer_rank, vendor_rank, salesperson_id, created_by, organization_id, legacy_lead_id, source, created_at, updated_at, lead_id_formatted';

/**
 * One page of the Contacts list (server-side pagination).
 * Same access, search and date semantics as `getContacts`, newest first with
 * `id` as a stable tie-breaker; type / source filters and counts run in SQL.
 */
export async function getContactsPage(options: GetContactsPageOptions = {}) {
  try {
    const session = ensureAuth(await getSession());
    const createdAtGte = String(options.createdAtGte || '').trim() || null;
    const createdAtLt = String(options.createdAtLt || '').trim() || null;
    const pageSize = Math.min(
      CONTACTS_MAX_PAGE_SIZE,
      Math.max(1, Math.floor(Number(options.pageSize) || 40))
    );
    const page = Math.max(1, Math.floor(Number(options.page) || 1));
    const companyType: ContactsTypeFilter =
      options.companyType === 'person' || options.companyType === 'company'
        ? options.companyType
        : 'all';
    const source: ContactsSourceFilter =
      options.source === 'mobile_app' || options.source === 'manual' ? options.source : 'all';
    const includeSourceCounts = options.includeSourceCounts !== false;

    const emptyResult = {
      contacts: [] as ContactWithRelations[],
      totalCount: 0,
      page: 1,
      pageSize,
      sourceCounts: { all: 0, mobile: 0, manual: 0 } as ContactsSourceCounts | null,
      createdAtGte,
      createdAtLt,
    };

    const scope = await resolveContactsListScope(session);
    if ('error' in scope) return { error: scope.error };
    if ('empty' in scope) return emptyResult;

    const {
      applyOrganizationFilter,
      isMissingOrganizationColumnError,
    } = await import('@/lib/admin-organization-context');
    const {
      CONTACTS_LIST_SELECT,
      isMissingLeadIdColumnError,
      isValidContactLeadId,
      mergeContactLeadIdsForList,
      assignMissingContactLeadIds,
    } = await import('@/lib/contact-lead-id');

    const supabase = await createAdminClient();
    const searchOrFilter = buildContactsSearchOrFilter(String(options.search || ''));
    const dates = { createdAtGte, createdAtLt };

    type QueryError = { message?: string; code?: string; details?: string; hint?: string };

    // `withMobileColumn` = false for pre-021 DBs (no mobile_registered_at).
    function sourceFilter<Q extends { or: (f: string) => Q; is: (c: string, v: null) => Q; eq: (c: string, v: string) => Q }>(
      query: Q,
      which: 'mobile_app' | 'manual',
      withMobileColumn: boolean
    ): Q {
      if (which === 'mobile_app') {
        return withMobileColumn
          ? query.or('mobile_registered_at.not.is.null,source.eq.mobile_app')
          : query.eq('source', 'mobile_app');
      }
      const manual = query.or('source.is.null,source.neq.mobile_app');
      return withMobileColumn ? manual.is('mobile_registered_at', null) : manual;
    }

    async function runPage(selectCols: string, withMobileColumn: boolean) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = applyContactsListFilters(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase.from('contacts').select(selectCols, { count: 'exact' }) as any,
        scope as ContactsListScope,
        searchOrFilter,
        dates,
        applyOrganizationFilter
      );
      if (companyType !== 'all') q = q.eq('company_type', companyType);
      if (source !== 'all') q = sourceFilter(q, source, withMobileColumn);
      const from = (page - 1) * pageSize;
      q = q
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);
      const res = await q;
      return {
        rows: (res.data || null) as Contact[] | null,
        count: typeof res.count === 'number' ? res.count : null,
        error: (res.error || null) as QueryError | null,
      };
    }

    async function runCount(which: 'all' | 'mobile_app', withMobileColumn: boolean) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = applyContactsListFilters(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase.from('contacts').select('id', { count: 'exact', head: true }) as any,
        scope as ContactsListScope,
        searchOrFilter,
        dates,
        applyOrganizationFilter
      );
      if (which === 'mobile_app') q = sourceFilter(q, 'mobile_app', withMobileColumn);
      const res = await q;
      return {
        count: typeof res.count === 'number' ? res.count : 0,
        error: (res.error || null) as QueryError | null,
      };
    }

    async function runAll(selectCols: string, withMobileColumn: boolean) {
      return Promise.all([
        runPage(selectCols, withMobileColumn),
        includeSourceCounts ? runCount('all', withMobileColumn) : Promise.resolve(null),
        includeSourceCounts ? runCount('mobile_app', withMobileColumn) : Promise.resolve(null),
      ]);
    }

    const isMissingMobileColumns = (error: QueryError | null) =>
      Boolean(
        error &&
          (String(error.message || '').includes('mobile_registered_at') ||
            String(error.message || '').includes('mobile_user_id') ||
            error.code === 'PGRST204' ||
            error.code === '42703')
      );

    let withMobileColumn = true;
    let [pageRes, allCount, mobileCount] = await runAll(
      `${CONTACTS_LIST_SELECT}, lead_id_formatted`,
      withMobileColumn
    );

    if (pageRes.error && isMissingLeadIdColumnError(pageRes.error)) {
      [pageRes, allCount, mobileCount] = await runAll(CONTACTS_LIST_SELECT, withMobileColumn);
    }

    // Pre-021 DBs may lack mobile_registered_at — retry without mobile columns
    if (isMissingMobileColumns(pageRes.error)) {
      withMobileColumn = false;
      [pageRes, allCount, mobileCount] = await runAll(
        CONTACTS_LEAN_SELECT_WITHOUT_MOBILE,
        withMobileColumn
      );
    }

    // Requested page is past the end (e.g. rows were deleted) — report counts only.
    const pastEnd = pageRes.error && pageRes.error.code === 'PGRST103';

    if (pageRes.error && !pastEnd) {
      const error = pageRes.error;
      if (isMissingOrganizationColumnError(error as never)) {
        return {
          error:
            'Contacts organization column is missing. Run add_organization_id_to_core_tables.sql.',
        };
      }
      return {
        error: `Contacts query failed (${error.code || '400'}): ${
          error.message
        }${error.details ? ` — ${error.details}` : ''}${
          error.hint ? ` Hint: ${error.hint}` : ''
        }`,
      };
    }

    const countError = allCount?.error || mobileCount?.error;
    if (countError) {
      return { error: `Contacts count failed: ${countError.message}` };
    }

    let contacts = (pastEnd ? [] : pageRes.rows || []) as Contact[];

    // 1) Read existing Customer IDs (REST/RPC)
    contacts = (await mergeContactLeadIdsForList(supabase, contacts)) as Contact[];

    // 2) Assign permanent IDs only for contacts still missing one (this page only)
    const missing = contacts.filter((c) => !isValidContactLeadId(c.lead_id_formatted));
    if (missing.length) {
      contacts = (await assignMissingContactLeadIds(supabase, contacts)) as Contact[];
    }

    const withTags = await attachContactTags(supabase, contacts);
    if ('error' in withTags) return { error: withTags.error };

    const sourceCounts: ContactsSourceCounts | null =
      allCount && mobileCount
        ? {
            all: allCount.count,
            mobile: mobileCount.count,
            manual: Math.max(0, allCount.count - mobileCount.count),
          }
        : null;

    return {
      contacts: withTags.contacts,
      /** Matching rows for the same search + date + type + source + access filters. */
      totalCount: pageRes.count ?? withTags.contacts.length,
      page,
      pageSize,
      sourceCounts,
      createdAtGte,
      createdAtLt,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load contacts' };
  }
}

export async function getContacts(searchOrOptions?: string | GetContactsOptions) {
  try {
    const session = ensureAuth(await getSession());
    const options: GetContactsOptions =
      typeof searchOrOptions === 'string'
        ? { search: searchOrOptions }
        : searchOrOptions || {};
    const search = options.search;
    const createdAtGte = String(options.createdAtGte || '').trim() || null;
    const createdAtLt = String(options.createdAtLt || '').trim() || null;

    const {
      applyOrganizationFilter,
      isMissingOrganizationColumnError,
    } = await import('@/lib/admin-organization-context');
    const {
      CONTACTS_LIST_SELECT,
      isMissingLeadIdColumnError,
      isValidContactLeadId,
      mergeContactLeadIdsForList,
      assignMissingContactLeadIds,
    } = await import('@/lib/contact-lead-id');

    const scope = await resolveContactsListScope(session);
    if ('error' in scope) return { error: scope.error };
    if ('empty' in scope) return { contacts: [] };
    const { organizationId, agentIdForOwnership, createdByFallback } = scope;

    const supabase = await createAdminClient();
    const searchOrFilter = buildContactsSearchOrFilter(String(search || ''));

    async function fetchAllContactRows(
      selectCols: string
    ): Promise<{ rows: Contact[] | null; error: { message?: string; code?: string; details?: string; hint?: string } | null }> {
      const allRows: Contact[] = [];
      let offset = 0;

      for (;;) {
        let pageQuery = applyContactsListFilters(
          supabase.from('contacts').select(selectCols),
          scope as ContactsListScope,
          searchOrFilter,
          { createdAtGte, createdAtLt },
          applyOrganizationFilter
        );

        pageQuery = pageQuery
          .order('created_at', { ascending: false })
          .range(offset, offset + CONTACTS_FETCH_PAGE_SIZE - 1);

        const pageRes = await pageQuery;
        if (pageRes.error) {
          return { rows: null, error: pageRes.error };
        }

        const batch = (pageRes.data || []) as unknown as Contact[];
        allRows.push(...batch);

        if (batch.length < CONTACTS_FETCH_PAGE_SIZE) break;
        offset += CONTACTS_FETCH_PAGE_SIZE;
        // Safety cap for pathological orgs
        if (offset >= 100_000) break;
      }

      return { rows: allRows, error: null };
    }

    const selectWithLeadId = `${CONTACTS_LIST_SELECT}, lead_id_formatted`;
    let fetched = await fetchAllContactRows(selectWithLeadId);
    let rows = fetched.rows;
    let error = fetched.error;

    if (error && isMissingLeadIdColumnError(error)) {
      fetched = await fetchAllContactRows(CONTACTS_LIST_SELECT);
      rows = fetched.rows;
      error = fetched.error;
    }

    // Pre-021 DBs may lack mobile_registered_at — retry without mobile columns
    if (
      error &&
      (String(error.message || '').includes('mobile_registered_at') ||
        String(error.message || '').includes('mobile_user_id') ||
        error.code === 'PGRST204' ||
        error.code === '42703')
    ) {
      const leanWithoutMobile =
        'id, name, company_name, email, phone, country, company_type, customer_rank, vendor_rank, salesperson_id, created_by, organization_id, legacy_lead_id, source, created_at, updated_at, lead_id_formatted';
      fetched = await fetchAllContactRows(leanWithoutMobile);
      if (!fetched.error && fetched.rows) {
        rows = fetched.rows;
        error = null;
      } else {
        error = fetched.error;
      }
    }

    if (error && isMissingOrganizationColumnError(error)) {
      return {
        error:
          'Contacts organization column is missing. Run add_organization_id_to_core_tables.sql.',
      };
    }

    if (error) {
      return {
        error: `Contacts query failed (${error.code || '400'}): ${
          error.message
        }${error.details ? ` — ${error.details}` : ''}${
          error.hint ? ` Hint: ${error.hint}` : ''
        }`,
      };
    }

    let contacts = (rows || []) as Contact[];

    // Search / manager list: refine to Odoo list shape (companies + persons).
    if (searchOrFilter || (!agentIdForOwnership && !createdByFallback)) {
      contacts = contacts.filter(
        (c) => !c.parent_id || c.company_type === 'person'
      );
    }

    // 1) Read existing Customer IDs (REST/RPC)
    contacts = (await mergeContactLeadIdsForList(supabase, contacts)) as Contact[];

    // 2) Assign permanent IDs only for contacts still missing one (bounded, no lead-table scan)
    const missing = contacts.filter((c) => !isValidContactLeadId(c.lead_id_formatted));
    if (missing.length) {
      contacts = (await assignMissingContactLeadIds(supabase, contacts)) as Contact[];
    }

    // Defense-in-depth: ownership for empty browse; also when searching without org.
    const enforceOwnership =
      Boolean(agentIdForOwnership || createdByFallback) &&
      (!searchOrFilter || !organizationId);
    if (enforceOwnership) {
      const agentId = agentIdForOwnership;
      const username = createdByFallback || String(session.username || '').trim();
      contacts = contacts.filter((c) => {
        if (agentId) return c.salesperson_id === agentId;
        if (!username || !c.created_by) return false;
        return String(c.created_by).trim().toLowerCase() === username.toLowerCase();
      });
    }

    // Deduplicate by id (search merges / chunk edges)
    {
      const seen = new Set<string>();
      contacts = contacts.filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });
    }

    // Sort by actual contact.created_at (newest first). Do not overwrite with
    // linked lead timestamps — that broke new-contact dates and newest-first order.
    // Legacy backfill lives in migration 048 on the DB column itself.
    contacts.sort((a, b) => {
      const diff =
        (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0);
      if (diff !== 0) return diff;
      return String(b.id).localeCompare(String(a.id));
    });

    // Secondary in-memory refine (DB already filtered when searchOrFilter set)
    const rawNeedle = String(search || '').trim();
    if (rawNeedle) {
      const { text, leadIdToken, phoneDigits, phoneLast10 } =
        normalizeContactsSearchToken(rawNeedle);
      const needleLower = text.toLowerCase().replace(/^#+/, '');
      contacts = contacts.filter((c) => {
        const leadId = String(c.lead_id_formatted || '').toLowerCase();
        const phoneDig = String(c.phone || '').replace(/\D/g, '');
        const mobileDig = String(c.mobile || '').replace(/\D/g, '');
        const hay = [
          c.name,
          c.email,
          c.phone,
          c.mobile,
          c.company_name,
          c.country,
          c.lead_id_formatted,
        ]
          .map((v) => String(v || '').toLowerCase())
          .join(' ');

        if (needleLower && hay.includes(needleLower)) return true;
        if (leadIdToken && (leadId === leadIdToken || leadId.includes(leadIdToken))) {
          return true;
        }
        if (phoneLast10) {
          if (phoneDig.endsWith(phoneLast10) || mobileDig.endsWith(phoneLast10)) {
            return true;
          }
          if (phoneDig.includes(phoneLast10) || mobileDig.includes(phoneLast10)) {
            return true;
          }
        }
        if (phoneDigits.length >= 3) {
          if (phoneDig.includes(phoneDigits) || mobileDig.includes(phoneDigits)) {
            return true;
          }
        }
        return false;
      });
    }

    const withTags = await attachContactTags(supabase, contacts);
    if ('error' in withTags) return { error: withTags.error };
    const enriched: ContactWithRelations[] = withTags.contacts;

    return {
      contacts: enriched,
      /** Matching rows for the same search + date + access filters (all pages). */
      totalCount: enriched.length,
      createdAtGte,
      createdAtLt,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load contacts' };
  }
}

export async function getContactById(id: string) {
  try {
    const session = await getSession();
    ensureAuth(session);

    const contactId = String(id || '').trim();
    if (!contactId) return { error: 'Contact id is required.' };

    const org = await resolveContactsOrganizationId(session);
    if ('error' in org) return { error: org.error };
    if ('empty' in org) {
      return { error: 'Select an organization from the header switcher to view contacts.' };
    }

    const supabase = await createAdminClient();
    const { mergeContactLeadIdsFromRpc, CONTACTS_ROW_SELECT } =
      await import('@/lib/contact-lead-id');

    let detailQuery = supabase
      .from('contacts')
      .select(CONTACTS_ROW_SELECT)
      .eq('id', contactId);
    if (!('unscoped' in org)) {
      detailQuery = detailQuery.eq('organization_id', org.organizationId);
    }

    const { data: contact, error } = await detailQuery.maybeSingle();

    if (error || !contact) return { error: error?.message || 'Contact not found.' };

    const [enrichedContact] = await mergeContactLeadIdsFromRpc(supabase, [contact]);
    // Read-only resolve for display. Do not allocate a new Customer ID here —
    // IDs are assigned once at Contact creation and must stay permanent.
    const contactRow = enrichedContact || contact;

    let childrenQuery = supabase
      .from('contacts')
      .select(CONTACTS_ROW_SELECT)
      .eq('parent_id', contactId)
      .order('created_at', { ascending: true });
    if (!('unscoped' in org)) {
      childrenQuery = childrenQuery.eq('organization_id', org.organizationId);
    }
    const { data: children } = await childrenQuery;

    const childRows = (children || []) as Contact[];
    const enrichedChildren = childRows.length
      ? await mergeContactLeadIdsFromRpc(supabase, childRows)
      : childRows;

    const { data: tagLinks } = await supabase
      .from('contact_tag_links')
      .select('tag_id')
      .eq('contact_id', contactId);

    const tagIds = (tagLinks || []).map((l) => l.tag_id);
    let tags: ContactTag[] = [];
    if (tagIds.length > 0) {
      const { data: tagRows } = await supabase
        .from('contact_tags')
        .select('*')
        .in('id', tagIds);
      tags = (tagRows || []) as ContactTag[];
    }

    const enriched: ContactWithRelations = {
      ...(contactRow as Contact),
      tags,
      children: enrichedChildren as Contact[],
    };

    return { contact: enriched };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load contact' };
  }
}

export async function getContactActivity(contactId: string) {
  try {
    const session = await getSession();
    ensureAuth(session);

    const id = String(contactId || '').trim();
    if (!id) return { error: 'Contact id is required.' };

    const org = await resolveContactsOrganizationId(session);
    if ('error' in org) return { error: org.error };
    if ('empty' in org) return { activity: [] as ContactActivityLog[] };

    const supabase = await createAdminClient();

    if (!('unscoped' in org)) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('id', id)
        .eq('organization_id', org.organizationId)
        .maybeSingle();
      if (!contact) return { error: 'Contact not found.' };
    }

    const { data, error } = await supabase
      .from('contact_activity_logs')
      .select('*')
      .eq('contact_id', id)
      .order('created_at', { ascending: false });

    if (error) return { error: error.message };
    return { activity: (data || []) as ContactActivityLog[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load activity' };
  }
}

// =============================================================
// Tags
// =============================================================

export async function getContactTags() {
  try {
    const session = await getSession();
    ensureAuth(session);

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('contact_tags')
      .select('*')
      .order('name', { ascending: true });

    if (error) return { error: error.message };
    return { tags: (data || []) as ContactTag[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load tags' };
  }
}

export async function createContactTag(name: string, color?: string) {
  try {
    const session = await getSession();
    ensureAuth(session);

    const normalized = normalizeText(name);
    if (!normalized) return { error: 'Tag name is required.' };

    const supabase = await createAdminClient();

    const { data: existing } = await supabase
      .from('contact_tags')
      .select('*')
      .ilike('name', normalized)
      .maybeSingle();

    if (existing) return { tag: existing as ContactTag };

    const { data, error } = await supabase
      .from('contact_tags')
      .insert([{ name: normalized, color: color || '#8b5cf6' }])
      .select('*')
      .single();

    if (error || !data) return { error: error?.message || 'Failed to create tag.' };
    return { tag: data as ContactTag };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create tag' };
  }
}

async function replaceTagLinks(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  contactId: string,
  tagIds: string[]
) {
  await supabase.from('contact_tag_links').delete().eq('contact_id', contactId);
  if (tagIds.length === 0) return;
  const rows = tagIds.map((tag_id) => ({ contact_id: contactId, tag_id }));
  await supabase.from('contact_tag_links').insert(rows);
}

// =============================================================
// Mutations
// =============================================================

function buildContactPayload(input: ContactUpsertInput) {
  const companyType = normalizeCompanyType(input.company_type);
  return {
    parent_id: companyType === 'company' ? null : input.parent_id ?? null,
    contact_kind: normalizeKind(input.contact_kind),
    company_type: companyType,

    name: String(input.name || '').trim(),
    company_name: normalizeText(input.company_name),
    job_position: normalizeText(input.job_position),
    title: normalizeText(input.title),
    image_url: normalizeText(input.image_url),

    email: normalizeEmail(input.email),
    phone: normalizeText(input.phone),
    mobile: normalizeText(input.mobile),
    website: normalizeText(input.website),

    street: normalizeText(input.street),
    street2: normalizeText(input.street2),
    city: normalizeText(input.city),
    state: normalizeText(input.state),
    zip: normalizeText(input.zip),
    country: normalizeText(input.country),

    tax_id: normalizeText(input.tax_id),
    company_ref: normalizeText(input.company_ref),
    industry: normalizeText(input.industry),

    salesperson_id: input.salesperson_id || null,
    payment_terms: normalizeText(input.payment_terms),
    pricelist: normalizeText(input.pricelist),
    delivery_method: normalizeText(input.delivery_method),
    customer_rank: Number.isFinite(input.customer_rank) ? Number(input.customer_rank) : 0,
    vendor_rank: Number.isFinite(input.vendor_rank) ? Number(input.vendor_rank) : 0,
    sales_payment_method: normalizeText(input.sales_payment_method),
    incoterm: normalizeText(input.incoterm),
    incoterm_location: normalizeText(input.incoterm_location),
    group_rfq: normalizeText(input.group_rfq),
    buyer: normalizeText(input.buyer),
    purchase_payment_terms: normalizeText(input.purchase_payment_terms),
    purchase_payment_method: normalizeText(input.purchase_payment_method),
    receipt_reminder: Boolean(input.receipt_reminder),

    receivable_account: normalizeText(input.receivable_account),
    payable_account: normalizeText(input.payable_account),
    tax_settings: normalizeText(input.tax_settings),
    fiscal_position: normalizeText(input.fiscal_position),

    notes: normalizeText(input.notes),
  };
}

// =============================================================
// Field-level diff logging (Odoo-style chatter tracking)
// =============================================================

const TRACKED_FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  company_name: 'Company Name Entity',
  company_type: 'Company Type',
  job_position: 'Job Position',
  title: 'Title',
  email: 'Email',
  phone: 'Phone',
  mobile: 'Mobile',
  website: 'Website',
  street: 'Street',
  street2: 'Street 2',
  city: 'City',
  state: 'State',
  zip: 'ZIP',
  country: 'Country',
  tax_id: 'NTN',
  company_ref: 'Reference',
  industry: 'Industry',
  payment_terms: 'Payment Terms',
  pricelist: 'Pricelist',
  sales_payment_method: 'Payment Method',
  incoterm: 'Incoterm',
  incoterm_location: 'Incoterm Location',
  group_rfq: 'Group RFQ',
  buyer: 'Buyer',
  purchase_payment_terms: 'Payment Terms (Purchase)',
  purchase_payment_method: 'Payment Method (Purchase)',
  receipt_reminder: 'Receipt Reminder',
  receivable_account: 'Account Receivable',
  payable_account: 'Account Payable',
  tax_settings: 'Tax Settings',
  fiscal_position: 'Fiscal Position',
  notes: 'Notes',
  parent_id: 'Company (Employer)',
  salesperson_id: 'Salesperson',
  source: 'Source',
};

async function resolveContactParentCompany(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  input: ContactUpsertInput,
  contactId?: string,
  organizationId?: string | null
): Promise<
  | { parent_id: string | null; company_name: string | null }
  | { error: string }
> {
  const companyType = normalizeCompanyType(input.company_type);

  if (companyType === 'company') {
    return { parent_id: null, company_name: normalizeText(input.company_name) };
  }

  const parentId = input.parent_id ? String(input.parent_id).trim() : '';
  if (!parentId) {
    return {
      parent_id: null,
      company_name: normalizeText(input.company_name),
    };
  }

  if (contactId && parentId === contactId) {
    return { error: 'A contact cannot be its own company employer.' };
  }

  let parentQuery = supabase
    .from('contacts')
    .select('id, name, company_type')
    .eq('id', parentId);
  if (organizationId) {
    parentQuery = parentQuery.eq('organization_id', organizationId);
  }
  const { data: parent, error } = await parentQuery.maybeSingle();

  if (error) return { error: error.message };
  if (!parent) return { error: 'Selected company not found in this organization.' };
  if (parent.company_type !== 'company') {
    return { error: 'Company (Employer) must be a Company-type contact.' };
  }

  return {
    parent_id: parent.id as string,
    company_name: String(parent.name || '').trim() || null,
  };
}

export type CompanyContactOption = {
  id: string;
  name: string;
};

/** Company-type contacts for the Individual "Company (Employer)" dropdown (Odoo-style). */
export async function getCompanyContactOptions(options?: {
  excludeContactId?: string;
  includeContactId?: string | null;
}): Promise<{ companies: CompanyContactOption[] } | { error: string }> {
  try {
    const session = await getSession();
    ensureAuth(session);

    const org = await resolveContactsOrganizationId(session);
    if ('error' in org) return { error: org.error };
    if ('empty' in org) return { companies: [] };

    const {
      applyOrganizationFilter,
      isMissingOrganizationColumnError,
    } = await import('@/lib/admin-organization-context');

    const supabase = await createAdminClient();
    const excludeId = String(options?.excludeContactId || '').trim();
    const includeId = String(options?.includeContactId || '').trim();

    let query = supabase
      .from('contacts')
      .select('id, name')
      .eq('company_type', 'company')
      .is('parent_id', null)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (!('unscoped' in org)) {
      query = applyOrganizationFilter(query, org.organizationId);
    }

    const { data, error } = await query;

    if (error && isMissingOrganizationColumnError(error)) {
      return {
        error:
          'Contacts organization column is missing. Run add_organization_id_to_core_tables.sql.',
      };
    }

    if (error) return { error: error.message };

    let companies = (data || [])
      .map((row) => ({ id: String(row.id), name: String(row.name || '').trim() }))
      .filter((row) => row.name.length > 0 && row.id !== excludeId);

    if (includeId && !companies.some((c) => c.id === includeId)) {
      let includedQuery = supabase
        .from('contacts')
        .select('id, name, company_type, organization_id')
        .eq('id', includeId);
      if (!('unscoped' in org)) {
        includedQuery = includedQuery.eq('organization_id', org.organizationId);
      }
      const { data: included } = await includedQuery.maybeSingle();
      if (
        included &&
        included.company_type === 'company' &&
        String(included.name || '').trim()
      ) {
        companies = [
          { id: String(included.id), name: String(included.name).trim() },
          ...companies,
        ];
      }
    }

    return { companies };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load company contacts',
    };
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const s = String(value).trim();
  return s.length > 0 ? s : 'None';
}

function buildInlinedAddress(row: Record<string, unknown>): string {
  const parts = [
    row.name,
    row.street,
    row.street2,
    row.city,
    row.state,
    row.zip,
    row.country,
  ]
    .map((p) => (p === null || p === undefined ? '' : String(p).trim()))
    .filter((p) => p.length > 0);
  return parts.join(', ');
}

function buildDiffLines(
  oldRow: Record<string, unknown> | null,
  newRow: Record<string, unknown>
): string[] {
  const lines: string[] = [];

  for (const [field, label] of Object.entries(TRACKED_FIELD_LABELS)) {
    const oldVal = oldRow ? oldRow[field] : null;
    const newVal = newRow[field];

    const oldStr = formatValue(oldVal);
    const newStr = formatValue(newVal);

    if (oldStr === newStr) continue;
    lines.push(`${oldStr} → ${newStr} (${label})`);
  }

  // Virtual: Inlined Complete Address
  const oldAddr = oldRow ? buildInlinedAddress(oldRow) : '';
  const newAddr = buildInlinedAddress(newRow);
  if ((oldAddr || newAddr) && oldAddr !== newAddr) {
    lines.push(
      `${oldAddr || 'None'} → ${newAddr || 'None'} (Inlined Complete Address)`
    );
  }

  return lines;
}

export async function createContact(input: ContactUpsertInput) {
  try {
    const {
      allocateContactLeadIdFormatted,
      assignMissingContactLeadIds,
      ensureContactLeadIdsForContacts,
      isContactLeadIdColumnAvailable,
      isDuplicateContactLeadIdError,
      isMissingLeadIdColumnError,
      isValidContactLeadId,
      MAX_INSERT_RETRIES,
    } = await import('@/lib/contact-lead-id');

    const session = await getSession();
    const s = ensureAuth(session);

    const org = await resolveContactsOrganizationId(session);
    if ('error' in org) return { error: org.error };
    if ('empty' in org) {
      return {
        error: 'Select an organization from the header switcher before creating a contact.',
      };
    }

    const payload = buildContactPayload(input);

    const supabase = await createAdminClient();
    const organizationId = 'unscoped' in org ? null : org.organizationId;

    // Default ownership to the logged-in sales agent when the form omits salesperson.
    if (!payload.salesperson_id) {
      try {
        const { resolveCurrentSalespersonId } = await import(
          '@/app/actions/sales/automation'
        );
        const agentId = await resolveCurrentSalespersonId();
        if (agentId) payload.salesperson_id = agentId;
      } catch {
        // best-effort
      }
    }

    // Global duplicate prevention (any Sales Agent, same organization).
    const phoneForDup = payload.phone || payload.mobile;
    const existingByPhone = await findExistingContactByPhone(
      supabase,
      phoneForDup,
      { organizationId }
    );
    if (existingByPhone) {
      return {
        error: formatDuplicateContactError(existingByPhone),
        duplicate: existingByPhone,
      };
    }

    const parentResolved = await resolveContactParentCompany(
      supabase,
      input,
      undefined,
      organizationId
    );
    if ('error' in parentResolved) return { error: parentResolved.error };
    payload.parent_id = parentResolved.parent_id;
    payload.company_name = parentResolved.company_name;

    const displayName = resolveContactDisplayName(input, payload, parentResolved);
    if (!displayName) {
      return {
        error:
          'Name is required. For individuals linked to a company, enter a phone number.',
      };
    }
    payload.name = displayName;

    const nowIso = new Date().toISOString();
    const insertRow: Record<string, unknown> = {
      ...payload,
      created_by: s.username,
      // Explicit creation timestamp (UTC) — list displays Asia/Karachi via formatter.
      created_at: nowIso,
      updated_at: nowIso,
    };
    if (organizationId) {
      insertRow.organization_id = organizationId;
    }

    let leadIdColumnAvailable = await isContactLeadIdColumnAvailable(supabase);
    let pendingLeadId = await allocateContactLeadIdFormatted(supabase);
    if (leadIdColumnAvailable) {
      insertRow.lead_id_formatted = pendingLeadId;
    }

    let data: Contact | null = null;
    let lastError: { message?: string } | null = null;

    for (let attempt = 0; attempt < MAX_INSERT_RETRIES; attempt++) {
      const { data: row, error } = await supabase
        .from('contacts')
        .insert([insertRow])
        .select('*')
        .single();

      if (!error && row) {
        data = row as Contact;
        break;
      }

      lastError = error;
      if (isMissingLeadIdColumnError(error)) {
        delete insertRow.lead_id_formatted;
        leadIdColumnAvailable = false;
        if (!pendingLeadId) {
          pendingLeadId = await allocateContactLeadIdFormatted(supabase);
        }
        continue;
      }
      if (isDuplicateContactLeadIdError(error) && leadIdColumnAvailable) {
        pendingLeadId = await allocateContactLeadIdFormatted(supabase);
        insertRow.lead_id_formatted = pendingLeadId;
        continue;
      }
      const triggerDup = parseDuplicateContactTriggerError(error?.message);
      if (triggerDup) {
        return {
          error: formatDuplicateContactError(triggerDup),
          duplicate: triggerDup,
        };
      }
      return { error: error?.message || 'Failed to create contact.' };
    }

    if (!data) {
      return {
        error:
          lastError?.message ||
          'Failed to assign a unique Customer ID. Please try again.',
      };
    }

    if (!leadIdColumnAvailable) {
      await supabase.rpc('set_contact_lead_id', {
        p_contact_id: data.id,
        p_lead_id: pendingLeadId,
      });
    }

    const [enrichedContact] = await ensureContactLeadIdsForContacts(supabase, [data]);
    if (enrichedContact) data = enrichedContact as Contact;

    const [withAssignedId] = await assignMissingContactLeadIds(supabase, [data]);
    if (withAssignedId) data = withAssignedId as Contact;

    if (!isValidContactLeadId(data.lead_id_formatted) && pendingLeadId) {
      data = { ...data, lead_id_formatted: pendingLeadId };
    }

    const tagIds = (input.tag_ids || []).filter(Boolean);
    if (tagIds.length > 0) await replaceTagLinks(supabase, data.id, tagIds);

    // Log the creation as a header line + per-field diffs
    const diffLines = buildDiffLines(null, data as Record<string, unknown>);
    const body =
      diffLines.length > 0 ? `Contact created\n${diffLines.join('\n')}` : 'Contact created';

    await supabase.from('contact_activity_logs').insert([
      {
        contact_id: data.id,
        action_type: 'created',
        body,
        performed_by: s.username,
        metadata: { diff: diffLines },
      },
    ]);

    // Odoo-style: create one CRM Opportunity in My Pipeline → New immediately
    // so the card is visible as soon as the contact save returns.
    // Skip child/related contacts (parent_id set) and org-less rows.
    const autoOrgId = data.organization_id
      ? String(data.organization_id)
      : !('unscoped' in org)
        ? String(org.organizationId)
        : '';
    const isChildContact = Boolean(data.parent_id);
    if (autoOrgId && !isChildContact) {
      try {
        const { ensureAutoOpportunityForNewContact } = await import(
          '@/app/actions/crm/opportunities'
        );
        const autoResult = await ensureAutoOpportunityForNewContact({
          contactId: String(data.id),
          contactName: String(data.name || ''),
          organizationId: autoOrgId,
          email: data.email ? String(data.email) : null,
          phone: data.phone ? String(data.phone) : null,
          mobile: data.mobile ? String(data.mobile) : null,
          website: data.website ? String(data.website) : null,
          salespersonId: data.salesperson_id ? String(data.salesperson_id) : null,
          createdBy: s.username,
          customerLeadId: data.lead_id_formatted
            ? String(data.lead_id_formatted)
            : null,
        });
        if (autoResult?.error) {
          console.error(
            '[createContact] auto pipeline opportunity failed:',
            autoResult.error
          );
        }
      } catch (autoErr) {
        // Never block Contact create if pipeline auto-create fails.
        console.error('[createContact] auto pipeline opportunity error:', autoErr);
      }
    }

    return { contact: data as Contact };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create contact' };
  }
}

export async function updateContact(input: ContactUpsertInput) {
  try {
    const session = await getSession();
    const s = ensureAuth(session);

    const id = String(input.id || '').trim();
    if (!id) return { error: 'Contact id is required.' };

    const org = await resolveContactsOrganizationId(session);
    if ('error' in org) return { error: org.error };
    if ('empty' in org) {
      return {
        error: 'Select an organization from the header switcher before editing a contact.',
      };
    }

    const payload = buildContactPayload(input);

    const supabase = await createAdminClient();

    // Fetch existing row first so we can build a field-level diff
    let existingQuery = supabase.from('contacts').select('*').eq('id', id);
    if (!('unscoped' in org)) {
      existingQuery = existingQuery.eq('organization_id', org.organizationId);
    }
    const { data: existing, error: existingErr } = await existingQuery.maybeSingle();

    if (existingErr || !existing) {
      return { error: existingErr?.message || 'Contact not found.' };
    }

    const organizationId = 'unscoped' in org ? null : org.organizationId;
    const phoneForDup = payload.phone || payload.mobile;
    const existingByPhone = await findExistingContactByPhone(
      supabase,
      phoneForDup,
      { organizationId, excludeContactId: id }
    );
    if (existingByPhone) {
      return {
        error: formatDuplicateContactError(existingByPhone),
        duplicate: existingByPhone,
      };
    }

    const parentResolved = await resolveContactParentCompany(
      supabase,
      input,
      id,
      organizationId
    );
    if ('error' in parentResolved) return { error: parentResolved.error };
    payload.parent_id = parentResolved.parent_id;
    payload.company_name = parentResolved.company_name;

    const displayName = resolveContactDisplayName(input, payload, parentResolved);
    if (!displayName) {
      return {
        error:
          'Name is required. For individuals linked to a company, enter a phone number.',
      };
    }
    payload.name = displayName;

    const prevAgent = (existing as Contact).salesperson_id ?? null;
    const nextAgentFromPayload =
      payload.salesperson_id !== undefined
        ? ((payload.salesperson_id as string | null) ?? null)
        : prevAgent;

    // Transfer Contact + CRM ownership BEFORE the row update so the RPC
    // still sees the previous salesperson_id (avoids no-op / missed opp moves).
    let omitSalespersonFromUpdate = false;
    if (prevAgent !== nextAgentFromPayload && nextAgentFromPayload) {
      const { error: transferError } = await supabase.rpc(
        'transfer_contact_to_sales_agent',
        {
          p_contact_id: id,
          p_to_agent_id: nextAgentFromPayload,
          p_changed_by: s.username,
        }
      );
      if (transferError) {
        return {
          error:
            transferError.message ||
            'Failed to sync CRM ownership on salesperson change. Apply migration 028.',
        };
      }
      // Transfer already set salesperson_id / created_by
      omitSalespersonFromUpdate = true;
    }

    const updateBody = omitSalespersonFromUpdate
      ? (() => {
          const { salesperson_id: _ignored, ...rest } = payload;
          void _ignored;
          return { ...rest, updated_at: new Date().toISOString() };
        })()
      : { ...payload, updated_at: new Date().toISOString() };

    let updateQuery = supabase
      .from('contacts')
      .update(updateBody)
      .eq('id', id);
    if (organizationId) {
      updateQuery = updateQuery.eq('organization_id', organizationId);
    }
    const { data, error } = await updateQuery.select('*').single();
    if (error) {
      const triggerDup = parseDuplicateContactTriggerError(error.message);
      if (triggerDup) {
        return {
          error: formatDuplicateContactError(triggerDup),
          duplicate: triggerDup,
        };
      }
    }

    if (error || !data) return { error: error?.message || 'Failed to update contact.' };

    if (input.tag_ids !== undefined) {
      await replaceTagLinks(supabase, id, input.tag_ids || []);
    }

    const nextAgent = (data as Contact).salesperson_id ?? null;
    if (prevAgent !== nextAgent && !nextAgentFromPayload) {
      // Cleared salesperson — record history only (no target agent to transfer to)
      await supabase.from('contact_sales_assignments').insert([
        {
          contact_id: id,
          sales_agent_id: nextAgent,
          previous_sales_agent_id: prevAgent,
          assignment_type: 'manual',
          changed_by: s.username,
          reason: 'admin_reassignment',
        },
      ]);
    }

    // Log only the fields that actually changed
    const diffLines = buildDiffLines(
      existing as Record<string, unknown>,
      data as Record<string, unknown>
    );

    if (diffLines.length > 0) {
      await supabase.from('contact_activity_logs').insert([
        {
          contact_id: id,
          action_type: 'updated',
          body: diffLines.join('\n'),
          performed_by: s.username,
          metadata: { diff: diffLines },
        },
      ]);
    }

    return { contact: data as Contact };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update contact' };
  }
}

export async function deleteContact(id: string) {
  try {
    const session = await getSession();
    ensureAuth(session);

    const contactId = String(id || '').trim();
    if (!contactId) return { error: 'Contact id is required.' };

    const org = await resolveContactsOrganizationId(session);
    if ('error' in org) return { error: org.error };
    if ('empty' in org) {
      return {
        error: 'Select an organization from the header switcher before deleting a contact.',
      };
    }

    const supabase = await createAdminClient();
    let deleteQuery = supabase.from('contacts').delete().eq('id', contactId);
    if (!('unscoped' in org)) {
      deleteQuery = deleteQuery.eq('organization_id', org.organizationId);
    }
    const { error } = await deleteQuery;
    if (error) return { error: error.message };

    revalidateContactsPaths();
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to delete contact' };
  }
}

// =============================================================
// Child contacts (related)
// =============================================================

export type ChildContactInput = {
  parent_id: string;
  contact_kind: ContactKind;
  name: string;
  email?: string | null;
  phone?: string | null;
  job_position?: string | null;
  notes?: string | null;
};

export async function createChildContact(input: ChildContactInput) {
  try {
    const session = await getSession();
    const s = ensureAuth(session);

    const org = await resolveContactsOrganizationId(session);
    if ('error' in org) return { error: org.error };
    if ('empty' in org) {
      return {
        error: 'Select an organization from the header switcher before creating a contact.',
      };
    }

    const parentId = String(input.parent_id || '').trim();
    const name = String(input.name || '').trim();
    if (!parentId) return { error: 'Parent contact id is required.' };
    if (!name) return { error: 'Name is required.' };

    const supabase = await createAdminClient();

    let parentQuery = supabase
      .from('contacts')
      .select('id, organization_id')
      .eq('id', parentId);
    if (!('unscoped' in org)) {
      parentQuery = parentQuery.eq('organization_id', org.organizationId);
    }
    const { data: parent, error: parentErr } = await parentQuery.maybeSingle();
    if (parentErr || !parent) {
      return { error: parentErr?.message || 'Parent contact not found in this organization.' };
    }

    const organizationId =
      (!('unscoped' in org) ? org.organizationId : null) ||
      (parent.organization_id as string | null) ||
      null;

    const { data, error } = await supabase
      .from('contacts')
      .insert([
        {
          parent_id: parentId,
          contact_kind: normalizeKind(input.contact_kind),
          company_type: 'person',
          name,
          email: normalizeEmail(input.email),
          phone: normalizeText(input.phone),
          job_position: normalizeText(input.job_position),
          notes: normalizeText(input.notes),
          organization_id: organizationId,
          created_by: s.username,
          updated_at: new Date().toISOString(),
        },
      ])
      .select('*')
      .single();

    if (error || !data) return { error: error?.message || 'Failed to create related contact.' };

    await supabase.from('contact_activity_logs').insert([
      {
        contact_id: parentId,
        action_type: 'child_added',
        body: `Added related ${input.contact_kind} contact: ${name}`,
        performed_by: s.username,
      },
    ]);

    revalidateContactsPaths();
    return { contact: data as Contact };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create related contact' };
  }
}

export async function deleteChildContact(id: string) {
  try {
    const session = await getSession();
    ensureAuth(session);

    const contactId = String(id || '').trim();
    if (!contactId) return { error: 'Contact id is required.' };

    const org = await resolveContactsOrganizationId(session);
    if ('error' in org) return { error: org.error };
    if ('empty' in org) {
      return {
        error: 'Select an organization from the header switcher before deleting a contact.',
      };
    }

    const supabase = await createAdminClient();
    let deleteQuery = supabase.from('contacts').delete().eq('id', contactId);
    if (!('unscoped' in org)) {
      deleteQuery = deleteQuery.eq('organization_id', org.organizationId);
    }
    const { error } = await deleteQuery;
    if (error) return { error: error.message };

    revalidateContactsPaths();
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to delete related contact' };
  }
}

// =============================================================
// Activity / Chatter
// =============================================================

export async function logContactActivity(
  contactId: string,
  action_type: ActivityActionType,
  body: string
) {
  try {
    const session = await getSession();
    const s = ensureAuth(session);

    const id = String(contactId || '').trim();
    const text = String(body || '').trim();
    if (!id) return { error: 'Contact id is required.' };
    if (!text) return { error: 'Message cannot be empty.' };

    const org = await resolveContactsOrganizationId(session);
    if ('error' in org) return { error: org.error };
    if ('empty' in org) {
      return {
        error: 'Select an organization from the header switcher.',
      };
    }

    const supabase = await createAdminClient();

    if (!('unscoped' in org)) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('id', id)
        .eq('organization_id', org.organizationId)
        .maybeSingle();
      if (!contact) return { error: 'Contact not found.' };
    }

    const { data, error } = await supabase
      .from('contact_activity_logs')
      .insert([
        {
          contact_id: id,
          action_type,
          body: text,
          performed_by: s.username,
        },
      ])
      .select('*')
      .single();

    if (error || !data) return { error: error?.message || 'Failed to record activity.' };

    return { activity: data as ContactActivityLog };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to record activity' };
  }
}

// =============================================================
// Salespersons (for Sales & Purchase tab dropdown)
// =============================================================

export type SalespersonOption = {
  id: string;
  name: string;
  email: string | null;
};

export async function getSalespersonOptions() {
  try {
    const session = await getSession();
    ensureAuth(session);

    const supabase = await createAdminClient();
    const [{ data, error }, agent] = await Promise.all([
      supabase.from('sales_agents').select('id, name, email').order('name', { ascending: true }),
      import('@/lib/legacy-user-bridge').then(({ resolveSalesAgentForSession }) =>
        resolveSalesAgentForSession(supabase, session!)
      ),
    ]);

    if (error) return { error: error.message };
    const salespersons = (data || []) as SalespersonOption[];
    const currentSalespersonId = agent?.id ? String(agent.id) : null;
    return { salespersons, currentSalespersonId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load salespersons' };
  }
}

// =============================================================
// Customer picker helpers (used by the Quotation module)
// =============================================================

export type CustomerSearchResult = {
  id: string;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  company_type: CompanyType;
  customer_rank: number;
  vendor_rank: number;
  lead_id_formatted?: string | null;
  salesperson_id?: string | null;
};

/**
 * Search contacts for customer/contact pickers (quotations, CRM opportunities).
 * Server-filtered with a small limit — avoids loading the full contacts table.
 * Matches Customer Name and Customer ID (lead_id_formatted).
 */
export async function searchCustomerContacts(
  query: string,
  options?: { scope?: 'customer' | 'all' | 'vendor' }
): Promise<{ contacts: CustomerSearchResult[] } | { error: string }> {
  try {
    const session = ensureAuth(await getSession());

    const org = await resolveContactsOrganizationId(session);
    if ('error' in org) return { error: org.error };
    if ('empty' in org) return { contacts: [] };

    const { applyOrganizationFilter } = await import('@/lib/admin-organization-context');
    const {
      mergeContactLeadIdsForPicker,
      CONTACTS_PICKER_SELECT,
      isContactLeadIdColumnAvailable,
      findContactIdsByCustomerId,
      looksLikeCustomerIdQuery,
      customerIdSearchTokens,
    } = await import('@/lib/contact-lead-id');

    const supabase = await createAdminClient();
    const needle = String(query || '').trim();
    const limit = needle ? 40 : 50;
    const idTokens = customerIdSearchTokens(needle);
    const idQuery = looksLikeCustomerIdQuery(needle);

    // Dedicated Customer ID lookup (works even when name/email filters miss).
    const idMatchedIds =
      needle && idTokens.length
        ? await findContactIdsByCustomerId(supabase, needle, limit)
        : [];

    let q = supabase
      .from('contacts')
      .select(CONTACTS_PICKER_SELECT)
      .or(CONTACTS_LIST_OR_FILTER)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!('unscoped' in org)) {
      q = applyOrganizationFilter(q, org.organizationId);
    }

    if (needle && !idQuery) {
      const escaped = needle.replace(/[%_,.()]/g, ' ').replace(/^#+/, '').trim();
      const phoneDigits = needle.replace(/\D/g, '');
      const phoneLast10 =
        phoneDigits.length >= 10 ? phoneDigits.slice(-10) : phoneDigits.length >= 7 ? phoneDigits : '';
      const orParts = [
        `name.ilike.%${escaped}%`,
        `company_name.ilike.%${escaped}%`,
        `email.ilike.%${escaped}%`,
        `phone.ilike.%${escaped}%`,
        `mobile.ilike.%${escaped}%`,
      ];
      if (phoneLast10) {
        orParts.push(`phone.ilike.%${phoneLast10}%`);
        orParts.push(`mobile.ilike.%${phoneLast10}%`);
      } else if (phoneDigits.length >= 3) {
        orParts.push(`phone.ilike.%${phoneDigits}%`);
        orParts.push(`mobile.ilike.%${phoneDigits}%`);
      }
      const columnOk = await isContactLeadIdColumnAvailable(supabase);
      if (columnOk && idTokens.length) {
        for (const token of idTokens) {
          orParts.push(`lead_id_formatted.ilike.%${token}%`);
        }
      }
      q = q.or(orParts.join(','));
    } else if (needle && idQuery && idMatchedIds.length) {
      q = q.in('id', idMatchedIds);
    } else if (needle && idQuery) {
      const escaped = needle.replace(/[%_,.()]/g, ' ').trim();
      const orParts = [
        `name.ilike.%${escaped}%`,
        `company_name.ilike.%${escaped}%`,
      ];
      const columnOk = await isContactLeadIdColumnAvailable(supabase);
      if (columnOk) {
        for (const token of idTokens) {
          orParts.push(`lead_id_formatted.eq.${token}`);
          orParts.push(`lead_id_formatted.ilike.%${token}%`);
        }
      }
      q = q.or(orParts.join(','));
    }

    const { data, error } = await q;
    if (error) return { error: error.message };

    let rows = (data || []) as Array<
      CustomerSearchResult & {
        created_at?: string;
        salesperson_id?: string | null;
        created_by?: string | null;
        lead_id_formatted?: string | null;
      }
    >;

    // Merge any ID hits that the text query missed (e.g. schema-cache gaps).
    if (idMatchedIds.length) {
      const have = new Set(rows.map((r) => r.id));
      const missing = idMatchedIds.filter((id) => !have.has(id));
      if (missing.length) {
        let idQ = supabase
          .from('contacts')
          .select(CONTACTS_PICKER_SELECT)
          .in('id', missing)
          .or(CONTACTS_LIST_OR_FILTER);
        if (!('unscoped' in org)) {
          idQ = applyOrganizationFilter(idQ, org.organizationId);
        }
        const { data: extra } = await idQ;
        if (extra?.length) {
          rows = [...rows, ...(extra as typeof rows)];
        }
      }
    }

    // Empty browse: own-documents agents see only their contacts.
    // Active search: org-wide so existing customers can be located (duplicate UX).
    if (!needle) {
      try {
        const {
          resolveSalesAccessRole,
          salesRoleSeesAllOrgRecords,
        } = await import('@/lib/sales-roles');
        const role = resolveSalesAccessRole(session as never);
        if (role && !salesRoleSeesAllOrgRecords(role)) {
          const { resolveCurrentSalespersonId } = await import(
            '@/app/actions/sales/automation'
          );
          const agentId = await resolveCurrentSalespersonId();
          const username = String(session.username || '').trim();
          rows = rows.filter((c) => {
            if (agentId && c.salesperson_id === agentId) return true;
            if (
              username &&
              c.created_by &&
              String(c.created_by).trim().toLowerCase() === username.toLowerCase()
            ) {
              return true;
            }
            return false;
          });
        }
      } catch {
        // ownership filter is best-effort
      }
    }

    rows = await mergeContactLeadIdsForPicker(supabase, rows);

    if (options?.scope === 'vendor') {
      rows = rows.filter((row) => Number(row.vendor_rank) > 0);
    } else if (options?.scope !== 'all') {
      rows = rows.filter(
        (row) => !(Number(row.vendor_rank) > 0 && Number(row.customer_rank) === 0)
      );
    }

    const needleLower = needle.toLowerCase();
    const idTokenSet = new Set(idTokens.map((t) => t.toLowerCase()));
    const digitsNeedle = needle.replace(/\D/g, '').toLowerCase();
    if (needleLower) {
      rows = rows.filter((c) => {
        const leadId = String(c.lead_id_formatted || '').toLowerCase();
        if (idTokenSet.size && [...idTokenSet].some((t) => leadId.includes(t))) {
          return true;
        }
        const hay = [
          c.name,
          c.company_name,
          c.phone,
          c.email,
          c.city,
          c.country,
          c.lead_id_formatted,
        ]
          .map((v) => String(v || '').toLowerCase())
          .join(' ');
        return (
          hay.includes(needleLower) ||
          (digitsNeedle.length >= 3 && hay.includes(digitsNeedle))
        );
      });
    }

    // Relevance: exact Customer ID → ID prefix → name prefix → recent
    if (needleLower) {
      rows.sort((a, b) => {
        const aId = String(a.lead_id_formatted || '').toLowerCase();
        const bId = String(b.lead_id_formatted || '').toLowerCase();
        const aExact = idTokenSet.has(aId) || aId === needleLower ? 1 : 0;
        const bExact = idTokenSet.has(bId) || bId === needleLower ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        const aIdPrefix = [...idTokenSet].some((t) => aId.startsWith(t)) ? 1 : 0;
        const bIdPrefix = [...idTokenSet].some((t) => bId.startsWith(t)) ? 1 : 0;
        if (aIdPrefix !== bIdPrefix) return bIdPrefix - aIdPrefix;
        const aName = String(a.name || '').toLowerCase();
        const bName = String(b.name || '').toLowerCase();
        const aPrefix = aName.startsWith(needleLower) ? 1 : 0;
        const bPrefix = bName.startsWith(needleLower) ? 1 : 0;
        if (aPrefix !== bPrefix) return bPrefix - aPrefix;
        const aCreated = a.created_at ? Date.parse(a.created_at) : 0;
        const bCreated = b.created_at ? Date.parse(b.created_at) : 0;
        return bCreated - aCreated;
      });
    }

    return {
      contacts: rows.slice(0, limit).map((row) => ({
        id: row.id,
        name: row.name,
        company_name: row.company_name,
        email: row.email,
        phone: row.phone,
        city: row.city,
        country: row.country,
        company_type: row.company_type,
        customer_rank: row.customer_rank,
        vendor_rank: row.vendor_rank,
        lead_id_formatted: row.lead_id_formatted ?? null,
        salesperson_id: row.salesperson_id ?? null,
      })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to search contacts' };
  }
}

export type ContactAutofillData = {
  id: string;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  lead_id_formatted: string | null;
  street: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  payment_terms: string | null;
  pricelist: string | null;
  salesperson_id: string | null;
  salesperson_name: string | null;
  customer_rank: number;
  vendor_rank: number;
  /** True when the contact is flagged as a vendor but not as a customer. */
  vendor_only: boolean;
  /** One-line composed address, useful for tooltips / preview. */
  full_address: string;
};

export async function getContactAutofillData(
  contactId: string
): Promise<{ data: ContactAutofillData } | { error: string }> {
  try {
    const session = await getSession();
    ensureAuth(session);
    if (!contactId) return { error: 'Contact id is required' };

    const org = await resolveContactsOrganizationId(session);
    if ('error' in org) return { error: org.error };
    if ('empty' in org) {
      return { error: 'Select an organization from the header switcher.' };
    }

    const supabase = await createAdminClient();
    let contactQuery = supabase
      .from('contacts')
      .select(
        'id, name, company_name, email, phone, mobile, street, street2, city, state, zip, country, payment_terms, pricelist, salesperson_id, customer_rank, vendor_rank'
      )
      .eq('id', contactId);
    if (!('unscoped' in org)) {
      contactQuery = contactQuery.eq('organization_id', org.organizationId);
    }
    const { data, error } = await contactQuery.maybeSingle();

    if (error || !data) return { error: error?.message || 'Contact not found' };

    let salesperson_name: string | null = null;
    if (data.salesperson_id) {
      const { data: sp } = await supabase
        .from('sales_agents')
        .select('name')
        .eq('id', data.salesperson_id)
        .single();
      salesperson_name = (sp?.name as string | undefined) || null;
    }

    const addrParts = [
      data.street,
      data.street2,
      data.city,
      data.state,
      data.zip,
      data.country,
    ]
      .map((p) => (p === null || p === undefined ? '' : String(p).trim()))
      .filter((p) => p.length > 0);

    const vendor_only =
      Number(data.vendor_rank) > 0 && Number(data.customer_rank) === 0;

    const { resolveContactCustomerId } = await import('@/lib/contact-lead-id');
    const leadIdFormatted = await resolveContactCustomerId(supabase, contactId);

    return {
      data: {
        id: data.id as string,
        name: (data.name as string) || '',
        company_name: (data.company_name as string | null) ?? null,
        email: (data.email as string | null) ?? null,
        phone: (data.phone as string | null) ?? null,
        mobile: (data.mobile as string | null) ?? null,
        lead_id_formatted: leadIdFormatted,
        street: (data.street as string | null) ?? null,
        street2: (data.street2 as string | null) ?? null,
        city: (data.city as string | null) ?? null,
        state: (data.state as string | null) ?? null,
        zip: (data.zip as string | null) ?? null,
        country: (data.country as string | null) ?? null,
        payment_terms: (data.payment_terms as string | null) ?? null,
        pricelist: (data.pricelist as string | null) ?? null,
        salesperson_id: (data.salesperson_id as string | null) ?? null,
        salesperson_name,
        customer_rank: Number(data.customer_rank) || 0,
        vendor_rank: Number(data.vendor_rank) || 0,
        vendor_only,
        full_address: addrParts.join(', '),
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load contact' };
  }
}

/**
 * Quickly create a minimal contact from inside another module (e.g. the
 * quotation customer picker). Only name is required; email / phone are
 * optional. Returns the same `Contact` shape as `createContact`.
 */
export async function createQuickContact(input: {
  name: string;
  email?: string | null;
  phone?: string | null;
  company_name?: string | null;
}) {
  return createContact({
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    company_name: input.company_name ?? null,
    company_type: input.company_name ? 'company' : 'person',
    customer_rank: 1,
  });
}
