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

export async function getContacts(search?: string) {
  try {
    const session = ensureAuth(await getSession());

    const org = await resolveContactsOrganizationId(session);
    if ('error' in org) return { error: org.error };
    if ('empty' in org) return { contacts: [] };

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

    // Lean list select + Customer ID in one round-trip when PostgREST exposes the column.
    const selectWithLeadId = `${CONTACTS_LIST_SELECT}, lead_id_formatted`;
    let query = supabase
      .from('contacts')
      .select(selectWithLeadId)
      .or(CONTACTS_LIST_OR_FILTER);

    if (!('unscoped' in org)) {
      query = applyOrganizationFilter(query, org.organizationId);
    }

    query = query.order('created_at', { ascending: false }).limit(500);

    const primary = await query;
    let rows: Contact[] | null = null;
    let error = primary.error;

    if (!error && primary.data) {
      rows = primary.data as unknown as Contact[];
    } else if (error && isMissingLeadIdColumnError(error)) {
      let fallbackQuery = supabase
        .from('contacts')
        .select(CONTACTS_LIST_SELECT)
        .or(CONTACTS_LIST_OR_FILTER);
      if (!('unscoped' in org)) {
        fallbackQuery = applyOrganizationFilter(fallbackQuery, org.organizationId);
      }
      fallbackQuery = fallbackQuery.order('created_at', { ascending: false }).limit(500);
      const retry = await fallbackQuery;
      rows = (retry.data || null) as unknown as Contact[] | null;
      error = retry.error;
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

    // 1) Read existing Customer IDs (REST/RPC)
    contacts = (await mergeContactLeadIdsForList(supabase, contacts)) as Contact[];

    // 2) Assign permanent IDs only for contacts still missing one (bounded, no lead-table scan)
    const missing = contacts.filter((c) => !isValidContactLeadId(c.lead_id_formatted));
    if (missing.length) {
      contacts = (await assignMissingContactLeadIds(supabase, contacts)) as Contact[];
    }

    // Odoo Own Documents — filter in memory (avoids PostgREST .or() Bad Request)
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
        contacts = contacts.filter((c) => {
          if (agentId && c.salesperson_id === agentId) return true;
          if (username && c.created_by === username) return true;
          return false;
        });
      }
    } catch {
      // ownership filter is best-effort
    }

    // Search in memory
    const needle = String(search || '').trim().toLowerCase();
    if (needle) {
      contacts = contacts.filter((c) => {
        const hay = [
          c.name,
          c.email,
          c.phone,
          c.company_name,
          c.country,
          c.lead_id_formatted,
        ]
          .map((v) => String(v || '').toLowerCase())
          .join(' ');
        return hay.includes(needle);
      });
    }

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

    const enriched: ContactWithRelations[] = contacts.map((c) => ({
      ...(c as Contact),
      tags: tagsByContact.get(c.id) || [],
      children: [],
    }));

    return { contacts: enriched };
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

    const parentResolved = await resolveContactParentCompany(
      supabase,
      input,
      undefined,
      'unscoped' in org ? null : org.organizationId
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

    const insertRow: Record<string, unknown> = {
      ...payload,
      created_by: s.username,
      updated_at: new Date().toISOString(),
    };
    if (!('unscoped' in org)) {
      insertRow.organization_id = org.organizationId;
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

    const parentResolved = await resolveContactParentCompany(
      supabase,
      input,
      id,
      'unscoped' in org ? null : org.organizationId
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

    let updateQuery = supabase
      .from('contacts')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!('unscoped' in org)) {
      updateQuery = updateQuery.eq('organization_id', org.organizationId);
    }
    const { data, error } = await updateQuery.select('*').single();

    if (error || !data) return { error: error?.message || 'Failed to update contact.' };

    if (input.tag_ids !== undefined) {
      await replaceTagLinks(supabase, id, input.tag_ids || []);
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
    const { mergeContactLeadIdsForPicker, CONTACTS_PICKER_SELECT } = await import(
      '@/lib/contact-lead-id'
    );

    const supabase = await createAdminClient();
    const needle = String(query || '').trim();
    const limit = needle ? 40 : 50;

    let q = supabase
      .from('contacts')
      .select(CONTACTS_PICKER_SELECT)
      .or(CONTACTS_LIST_OR_FILTER)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!('unscoped' in org)) {
      q = applyOrganizationFilter(q, org.organizationId);
    }

    if (needle) {
      const escaped = needle.replace(/[%_,.()]/g, ' ').trim();
      const phoneDigits = needle.replace(/\D/g, '');
      const orParts = [
        `name.ilike.%${escaped}%`,
        `company_name.ilike.%${escaped}%`,
        `email.ilike.%${escaped}%`,
        `phone.ilike.%${escaped}%`,
      ];
      if (phoneDigits.length >= 3) {
        orParts.push(`phone.ilike.%${phoneDigits}%`);
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
          if (username && c.created_by === username) return true;
          return false;
        });
      }
    } catch {
      // ownership filter is best-effort
    }

    rows = await mergeContactLeadIdsForPicker(supabase, rows);

    // Customer ID search when column is not exposed via REST
    if (/^\d{6}$/.test(needle) && !rows.some((r) => r.lead_id_formatted === needle)) {
      const { mergeContactLeadIdsFromRpc } = await import('@/lib/contact-lead-id');
      rows = await mergeContactLeadIdsFromRpc(supabase, rows);
      rows = rows.filter((c) => String(c.lead_id_formatted || '').includes(needle));
    }

    if (options?.scope === 'vendor') {
      rows = rows.filter((row) => Number(row.vendor_rank) > 0);
    } else if (options?.scope !== 'all') {
      rows = rows.filter(
        (row) => !(Number(row.vendor_rank) > 0 && Number(row.customer_rank) === 0)
      );
    }

    const needleLower = needle.toLowerCase();
    if (needleLower) {
      rows = rows.filter((c) => {
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
        return hay.includes(needleLower);
      });
    }

    return {
      contacts: rows.map((row) => ({
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
