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

  is_active: boolean;
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

function revalidateContactsPaths() {
  revalidatePath('/admin/dashboard');
}

// =============================================================
// Queries
// =============================================================

export async function getContacts(search?: string) {
  try {
    const session = await getSession();
    ensureAuth(session);

    const supabase = await createAdminClient();

    let query = supabase
      .from('contacts')
      .select('*')
      .is('parent_id', null)
      .order('created_at', { ascending: false });

    const needle = String(search || '').trim();
    if (needle) {
      const like = `%${needle}%`;
      query = query.or(
        `name.ilike.${like},email.ilike.${like},phone.ilike.${like},company_name.ilike.${like},country.ilike.${like}`
      );
    }

    const { data: contacts, error } = await query;
    if (error) return { error: error.message };

    const contactIds = (contacts || []).map((c) => c.id);

    let tagLinks: { contact_id: string; tag_id: string }[] = [];
    let tags: ContactTag[] = [];
    if (contactIds.length > 0) {
      const { data: linkRows, error: linkErr } = await supabase
        .from('contact_tag_links')
        .select('contact_id, tag_id')
        .in('contact_id', contactIds);
      if (linkErr) return { error: linkErr.message };
      tagLinks = linkRows || [];

      const tagIds = Array.from(new Set(tagLinks.map((l) => l.tag_id)));
      if (tagIds.length > 0) {
        const { data: tagRows, error: tagErr } = await supabase
          .from('contact_tags')
          .select('*')
          .in('id', tagIds);
        if (tagErr) return { error: tagErr.message };
        tags = (tagRows || []) as ContactTag[];
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

    const enriched: ContactWithRelations[] = (contacts || []).map((c) => ({
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

    const supabase = await createAdminClient();

    const { data: contact, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single();

    if (error || !contact) return { error: error?.message || 'Contact not found.' };

    const { data: children } = await supabase
      .from('contacts')
      .select('*')
      .eq('parent_id', contactId)
      .order('created_at', { ascending: true });

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
      ...(contact as Contact),
      tags,
      children: (children || []) as Contact[],
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

    const supabase = await createAdminClient();
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
  return {
    parent_id: input.parent_id ?? null,
    contact_kind: normalizeKind(input.contact_kind),
    company_type: normalizeCompanyType(input.company_type),

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
};

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
    const session = await getSession();
    const s = ensureAuth(session);

    const payload = buildContactPayload(input);
    if (!payload.name) return { error: 'Name is required.' };

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('contacts')
      .insert([{ ...payload, created_by: s.username, updated_at: new Date().toISOString() }])
      .select('*')
      .single();

    if (error || !data) return { error: error?.message || 'Failed to create contact.' };

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

    revalidateContactsPaths();
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

    const payload = buildContactPayload(input);
    if (!payload.name) return { error: 'Name is required.' };

    const supabase = await createAdminClient();

    // Fetch existing row first so we can build a field-level diff
    const { data: existing, error: existingErr } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', id)
      .single();

    if (existingErr || !existing) {
      return { error: existingErr?.message || 'Contact not found.' };
    }

    const { data, error } = await supabase
      .from('contacts')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

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

    revalidateContactsPaths();
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

    const supabase = await createAdminClient();
    const { error } = await supabase.from('contacts').delete().eq('id', contactId);
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

    const parentId = String(input.parent_id || '').trim();
    const name = String(input.name || '').trim();
    if (!parentId) return { error: 'Parent contact id is required.' };
    if (!name) return { error: 'Name is required.' };

    const supabase = await createAdminClient();

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

    const supabase = await createAdminClient();
    const { error } = await supabase.from('contacts').delete().eq('id', contactId);
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

    const supabase = await createAdminClient();
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
    const { data, error } = await supabase
      .from('sales_agents')
      .select('id, name, email')
      .order('name', { ascending: true });

    if (error) return { error: error.message };
    return { salespersons: (data || []) as SalespersonOption[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load salespersons' };
  }
}
