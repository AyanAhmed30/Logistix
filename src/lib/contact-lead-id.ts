import { createAdminClient } from '@/utils/supabase/server';

const MAX_INSERT_RETRIES = 12;
const RPC_ID_CHUNK = 120;

export function randomContactLeadIdFormatted(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}

export function isDuplicateContactLeadIdError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  const message = error.message || '';
  return (
    error.code === '23505' &&
    (message.includes('lead_id_formatted') ||
      message.includes('contacts_lead_id_formatted_key'))
  );
}

export function isMissingLeadIdColumnError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  const message = (error.message || '').toLowerCase();
  return (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    (message.includes('lead_id_formatted') &&
      (message.includes('schema cache') ||
        message.includes('does not exist') ||
        message.includes('could not find')))
  );
}

/** PostgREST/Postgres select list for contacts — excludes lead_id_formatted (loaded via RPC). */
export const CONTACTS_ROW_SELECT =
  'id, parent_id, contact_kind, company_type, name, company_name, job_position, title, image_url, email, phone, mobile, website, street, street2, city, state, zip, country, tax_id, company_ref, industry, salesperson_id, payment_terms, pricelist, delivery_method, customer_rank, vendor_rank, sales_payment_method, incoterm, incoterm_location, group_rfq, buyer, purchase_payment_terms, purchase_payment_method, receipt_reminder, receivable_account, payable_account, tax_settings, fiscal_position, notes, source, legacy_lead_id, is_active, organization_id, created_by, created_at, updated_at';

export const CONTACTS_PICKER_SELECT =
  'id, name, company_name, email, phone, city, country, company_type, customer_rank, vendor_rank, created_at, salesperson_id, created_by, legacy_lead_id';

function normalizePhoneDigits(value: string | null | undefined): string {
  return String(value || '').replace(/\D/g, '');
}

export function isValidContactLeadId(value: string | null | undefined): boolean {
  const trimmed = String(value || '').trim();
  return /^\d{6}$/.test(trimmed);
}

function isValidLeadId(value: string | null | undefined): boolean {
  return isValidContactLeadId(value);
}

type ContactLeadRow = {
  id: string;
  lead_id_formatted?: string | null;
  legacy_lead_id?: string | null;
  phone?: string | null;
};

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminClient>>;

export async function isContactLeadIdColumnAvailable(
  supabase: SupabaseAdmin
): Promise<boolean> {
  const { error } = await supabase.from('contacts').select('lead_id_formatted').limit(1);
  if (!error) return true;
  return !isMissingLeadIdColumnError(error);
}

type ContactLeadLookupMeta = {
  id: string;
  legacy_lead_id?: string | null;
  phone?: string | null;
  mobile?: string | null;
  lead_id_formatted?: string | null;
};

function applyLeadIdToMap(
  map: Map<string, string>,
  contactId: string | null | undefined,
  leadId: string | null | undefined
): void {
  const id = String(contactId || '').trim();
  if (!id || map.has(id)) return;
  if (isValidLeadId(leadId)) map.set(id, String(leadId).trim());
}

/** Read Customer IDs via RPC when PostgREST schema cache omits the column. */
export async function fetchContactLeadIdsViaRpc(
  supabase: SupabaseAdmin,
  contactIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!contactIds.length) return map;

  for (let i = 0; i < contactIds.length; i += RPC_ID_CHUNK) {
    const chunk = contactIds.slice(i, i + RPC_ID_CHUNK);
    const { data, error } = await supabase.rpc('get_contact_lead_ids', {
      p_ids: chunk,
    });
    if (error) continue;

    for (const row of (data || []) as Array<{
      id: string;
      lead_id_formatted: string | null;
    }>) {
      applyLeadIdToMap(map, row.id, row.lead_id_formatted);
    }
  }

  return map;
}

async function fetchContactLeadIdsViaRest(
  supabase: SupabaseAdmin,
  contactIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!contactIds.length) return map;

  let restUnavailable = false;
  for (let i = 0; i < contactIds.length; i += RPC_ID_CHUNK) {
    if (restUnavailable) break;
    const chunk = contactIds.slice(i, i + RPC_ID_CHUNK);
    const { data, error } = await supabase
      .from('contacts')
      .select('id, lead_id_formatted')
      .in('id', chunk);
    if (error) {
      if (isMissingLeadIdColumnError(error)) restUnavailable = true;
      continue;
    }
    for (const row of data || []) {
      applyLeadIdToMap(map, row.id, row.lead_id_formatted);
    }
  }

  return map;
}

async function fetchContactLeadIdsFromLinkedLeads(
  supabase: SupabaseAdmin,
  contactIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!contactIds.length) return map;

  for (let i = 0; i < contactIds.length; i += RPC_ID_CHUNK) {
    const chunk = contactIds.slice(i, i + RPC_ID_CHUNK);
    const { data, error } = await supabase
      .from('leads')
      .select('contact_id, lead_id_formatted, created_at')
      .in('contact_id', chunk)
      .not('lead_id_formatted', 'is', null)
      .order('created_at', { ascending: true });
    if (error) continue;

    for (const row of data || []) {
      applyLeadIdToMap(map, row.contact_id, row.lead_id_formatted);
    }
  }

  return map;
}

async function fetchContactLeadIdsFromLegacyLeads(
  supabase: SupabaseAdmin,
  contacts: ContactLeadLookupMeta[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const byLegacyLead = new Map<string, string[]>();

  for (const contact of contacts) {
    const legacyLeadId = String(contact.legacy_lead_id || '').trim();
    if (!legacyLeadId) continue;
    const bucket = byLegacyLead.get(legacyLeadId) || [];
    bucket.push(contact.id);
    byLegacyLead.set(legacyLeadId, bucket);
  }

  const legacyLeadIds = [...byLegacyLead.keys()];
  if (!legacyLeadIds.length) return map;

  for (let i = 0; i < legacyLeadIds.length; i += RPC_ID_CHUNK) {
    const chunk = legacyLeadIds.slice(i, i + RPC_ID_CHUNK);
    const { data, error } = await supabase
      .from('leads')
      .select('id, lead_id_formatted')
      .in('id', chunk)
      .not('lead_id_formatted', 'is', null);
    if (error) continue;

    for (const row of data || []) {
      const contactIds = byLegacyLead.get(String(row.id)) || [];
      for (const contactId of contactIds) {
        applyLeadIdToMap(map, contactId, row.lead_id_formatted);
      }
    }
  }

  return map;
}

/**
 * Resolve contact Customer IDs using REST, RPC, linked leads, and legacy lead rows.
 * Works even when PostgREST cannot expose contacts.lead_id_formatted.
 */
export async function fetchContactLeadIds(
  supabase: SupabaseAdmin,
  contacts: ContactLeadLookupMeta[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!contacts.length) return map;

  const contactIds = contacts.map((contact) => contact.id);
  const missing = () => contactIds.filter((id) => !map.has(id));

  for (const [id, leadId] of await fetchContactLeadIdsViaRest(supabase, contactIds)) {
    map.set(id, leadId);
  }

  const afterRest = missing();
  if (afterRest.length) {
    for (const [id, leadId] of await fetchContactLeadIdsViaRpc(supabase, afterRest)) {
      map.set(id, leadId);
    }
  }

  const afterRpc = missing();
  if (afterRpc.length) {
    for (const [id, leadId] of await fetchContactLeadIdsFromLinkedLeads(
      supabase,
      afterRpc
    )) {
      map.set(id, leadId);
    }
  }

  const afterLinked = missing();
  if (afterLinked.length) {
    const stillMissing = new Set(afterLinked);
    const meta = contacts.filter((contact) => stillMissing.has(contact.id));
    for (const [id, leadId] of await fetchContactLeadIdsFromLegacyLeads(
      supabase,
      meta
    )) {
      map.set(id, leadId);
    }
  }

  return map;
}

export async function mergeContactLeadIdsFromRpc<T extends ContactLeadRow>(
  supabase: SupabaseAdmin,
  contacts: T[]
): Promise<T[]> {
  if (!contacts.length) return contacts;

  const leadMap = await fetchContactLeadIds(supabase, contacts);
  if (!leadMap.size) return contacts;

  return contacts.map((contact) => {
    const resolved = leadMap.get(contact.id);
    if (resolved) return { ...contact, lead_id_formatted: resolved };
    return contact;
  });
}

async function persistContactLeadIdViaRpc(
  supabase: SupabaseAdmin,
  contactId: string,
  leadId: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc('set_contact_lead_id', {
    p_contact_id: contactId,
    p_lead_id: leadId,
  });
  if (error) return null;
  return isValidLeadId(data) ? String(data).trim() : null;
}

async function persistContactLeadId(
  supabase: SupabaseAdmin,
  contactId: string,
  leadId: string
): Promise<{ ok: true } | { ok: false; columnMissing: boolean }> {
  const { error } = await supabase
    .from('contacts')
    .update({ lead_id_formatted: leadId })
    .eq('id', contactId)
    .or('lead_id_formatted.is.null,lead_id_formatted.eq.');

  if (!error) return { ok: true };
  if (isMissingLeadIdColumnError(error)) {
    const storedId = await persistContactLeadIdViaRpc(supabase, contactId, leadId);
    return storedId ? { ok: true } : { ok: false, columnMissing: true };
  }
  return { ok: false, columnMissing: false };
}

async function allocateAndPersistContactLeadId(
  supabase: SupabaseAdmin,
  contactId: string
): Promise<{ leadId: string; columnMissing: boolean } | null> {
  for (let attempt = 0; attempt < MAX_INSERT_RETRIES; attempt++) {
    const leadId = await allocateContactLeadIdFormatted(supabase);
    const result = await persistContactLeadId(supabase, contactId, leadId);
    if (result.ok) return { leadId, columnMissing: false };

    if (result.columnMissing) {
      const storedId = await persistContactLeadIdViaRpc(supabase, contactId, leadId);
      if (storedId) return { leadId: storedId, columnMissing: false };
      return { leadId, columnMissing: true };
    }

    const { error } = await supabase
      .from('contacts')
      .update({ lead_id_formatted: leadId })
      .eq('id', contactId);

    if (!error) return { leadId, columnMissing: false };
    if (isMissingLeadIdColumnError(error)) {
      const storedId = await persistContactLeadIdViaRpc(supabase, contactId, leadId);
      if (storedId) return { leadId: storedId, columnMissing: false };
      return { leadId, columnMissing: true };
    }
    if (!isDuplicateContactLeadIdError(error)) return null;
  }
  return null;
}

/**
 * Assigns missing Customer IDs (from legacy leads or new allocation) and returns
 * contacts with lead_id_formatted populated for display.
 */
export async function ensureContactLeadIdsForContacts(
  supabase: SupabaseAdmin,
  contacts: ContactLeadRow[]
): Promise<ContactLeadRow[]> {
  if (!contacts.length) return contacts;

  let merged = await mergeContactLeadIdsFromRpc(supabase, contacts);
  const needs = merged.filter((c) => !isValidLeadId(c.lead_id_formatted));
  if (!needs.length) return merged;

  const updates: Record<string, string> = {};
  const columnAvailable = await isContactLeadIdColumnAvailable(supabase);

  const legacyIds = [
    ...new Set(needs.map((c) => c.legacy_lead_id).filter(Boolean)),
  ] as string[];
  const leadIdByLeadUuid = new Map<string, string>();

  if (legacyIds.length) {
    const { data: leads } = await supabase
      .from('leads')
      .select('id, lead_id_formatted')
      .in('id', legacyIds);
    for (const lead of leads || []) {
      if (isValidLeadId(lead.lead_id_formatted)) {
        leadIdByLeadUuid.set(lead.id, String(lead.lead_id_formatted).trim());
      }
    }
  }

  const phoneNeeds = needs.filter(
    (c) => !c.legacy_lead_id || !leadIdByLeadUuid.has(c.legacy_lead_id)
  );
  const leadIdByPhone = new Map<string, string>();

  if (phoneNeeds.length) {
    const { data: leadsByPhone } = await supabase
      .from('leads')
      .select('lead_id_formatted, number, number_normalized')
      .not('lead_id_formatted', 'is', null)
      .limit(10000);

    for (const lead of leadsByPhone || []) {
      if (!isValidLeadId(lead.lead_id_formatted)) continue;
      const leadId = String(lead.lead_id_formatted).trim();
      const normalized = normalizePhoneDigits(lead.number_normalized || lead.number);
      if (normalized && !leadIdByPhone.has(normalized)) {
        leadIdByPhone.set(normalized, leadId);
      }
    }
  }

  for (const contact of needs) {
    let candidate: string | null = null;

    if (contact.legacy_lead_id && leadIdByLeadUuid.has(contact.legacy_lead_id)) {
      candidate = leadIdByLeadUuid.get(contact.legacy_lead_id)!;
    } else {
      const phone = normalizePhoneDigits(contact.phone);
      if (phone && leadIdByPhone.has(phone)) {
        candidate = leadIdByPhone.get(phone)!;
      }
    }

    if (candidate) {
      const result = await persistContactLeadId(supabase, contact.id, candidate);
      if (result.ok) {
        updates[contact.id] = candidate;
        continue;
      }
      if (result.columnMissing) {
        updates[contact.id] = candidate;
        continue;
      }

      const { error } = await supabase
        .from('contacts')
        .update({ lead_id_formatted: candidate })
        .eq('id', contact.id);

      if (!error) {
        updates[contact.id] = candidate;
        continue;
      }
      if (isMissingLeadIdColumnError(error)) {
        updates[contact.id] = candidate;
        continue;
      }
      if (!isDuplicateContactLeadIdError(error)) continue;
    }

    if (!columnAvailable) {
      const allocated = await allocateAndPersistContactLeadId(supabase, contact.id);
      if (allocated) updates[contact.id] = allocated.leadId;
      continue;
    }

    const allocated = await allocateAndPersistContactLeadId(supabase, contact.id);
    if (allocated) updates[contact.id] = allocated.leadId;
  }

  return merged.map((contact) => {
    const assigned = updates[contact.id];
    if (assigned) return { ...contact, lead_id_formatted: assigned };
    return contact;
  });
}

/** Assign fresh Customer IDs to contacts that still have none after read fallbacks. */
export async function assignMissingContactLeadIds<T extends ContactLeadRow>(
  supabase: SupabaseAdmin,
  contacts: T[]
): Promise<T[]> {
  const needs = contacts.filter((contact) => !isValidLeadId(contact.lead_id_formatted));
  if (!needs.length) return contacts;

  const updates: Record<string, string> = {};
  for (const contact of needs) {
    const allocated = await allocateAndPersistContactLeadId(supabase, contact.id);
    if (allocated?.leadId) updates[contact.id] = allocated.leadId;
  }

  if (!Object.keys(updates).length) return contacts;

  return contacts.map((contact) => {
    const assigned = updates[contact.id];
    return assigned ? { ...contact, lead_id_formatted: assigned } : contact;
  });
}

/** Race-safe allocation via DB sequence; falls back to random when migration is not applied yet. */
export async function allocateContactLeadIdFormatted(
  supabase?: SupabaseAdmin
): Promise<string> {
  const client = supabase ?? (await createAdminClient());
  const { data, error } = await client.rpc('allocate_contact_lead_id_formatted');

  if (!error && data != null && String(data).trim()) {
    return String(data).trim();
  }

  return randomContactLeadIdFormatted();
}

export { MAX_INSERT_RETRIES };

/** Copy contact Customer ID onto bridge leads missing lead_id_formatted. */
export async function enrichLeadRowsWithContactCustomerIds(
  supabase: SupabaseAdmin,
  leadRows: Array<{
    id: string;
    lead_id_formatted?: string | null;
    contact_id?: string | null;
    number?: string | null;
  }>
): Promise<void> {
  const needsSync = leadRows.filter((row) => !isValidLeadId(row.lead_id_formatted));
  if (!needsSync.length) return;

  const withContact = needsSync.filter((row) => row.contact_id);
  if (withContact.length) {
    const contactIds = [
      ...new Set(withContact.map((row) => String(row.contact_id)).filter(Boolean)),
    ];

    const { data: contactRows } = await supabase
      .from('contacts')
      .select('id, legacy_lead_id, phone, mobile')
      .in('id', contactIds);

    let contactMeta =
      contactRows && contactRows.length
        ? (contactRows as ContactLeadLookupMeta[])
        : contactIds.map((id) => ({ id }));

    let customerIdMap = await fetchContactLeadIds(supabase, contactMeta);
    const missingContacts = contactMeta.filter((contact) => !customerIdMap.has(contact.id));
    if (missingContacts.length) {
      const assigned = await assignMissingContactLeadIds(
        supabase,
        missingContacts as ContactLeadRow[]
      );
      contactMeta = assigned;
      customerIdMap = await fetchContactLeadIds(supabase, contactMeta);
      for (const contact of assigned) {
        if (isValidLeadId(contact.lead_id_formatted)) {
          customerIdMap.set(contact.id, String(contact.lead_id_formatted).trim());
        }
      }
    }

    for (const lead of withContact) {
      const customerId = customerIdMap.get(String(lead.contact_id));
      if (!customerId) continue;
      lead.lead_id_formatted = customerId;
      void supabase
        .from('leads')
        .update({ lead_id_formatted: customerId })
        .eq('id', lead.id)
        .or('lead_id_formatted.is.null,lead_id_formatted.eq.');
    }
  }

  const phoneNeeds = leadRows.filter(
    (row) => !isValidLeadId(row.lead_id_formatted) && row.number
  );
  if (phoneNeeds.length) {
    const { data: leadsByPhone } = await supabase
      .from('leads')
      .select('lead_id_formatted, number, number_normalized')
      .not('lead_id_formatted', 'is', null)
      .limit(10000);

    const leadIdByPhone = new Map<string, string>();
    for (const row of leadsByPhone || []) {
      if (!isValidLeadId(row.lead_id_formatted)) continue;
      const normalized = normalizePhoneDigits(row.number_normalized || row.number);
      if (normalized && !leadIdByPhone.has(normalized)) {
        leadIdByPhone.set(normalized, String(row.lead_id_formatted).trim());
      }
    }

    for (const lead of phoneNeeds) {
      const normalized = normalizePhoneDigits(lead.number);
      const matched = normalized ? leadIdByPhone.get(normalized) : null;
      if (!matched) continue;
      lead.lead_id_formatted = matched;
      void supabase
        .from('leads')
        .update({ lead_id_formatted: matched })
        .eq('id', lead.id)
        .or('lead_id_formatted.is.null,lead_id_formatted.eq.');
    }
  }

  const allocateNeeds = leadRows.filter((row) => !isValidLeadId(row.lead_id_formatted));
  for (const lead of allocateNeeds) {
    for (let attempt = 0; attempt < MAX_INSERT_RETRIES; attempt++) {
      const candidate = randomContactLeadIdFormatted();
      const { error } = await supabase
        .from('leads')
        .update({ lead_id_formatted: candidate })
        .eq('id', lead.id)
        .or('lead_id_formatted.is.null,lead_id_formatted.eq.');
      if (!error) {
        lead.lead_id_formatted = candidate;
        break;
      }
      if (!isDuplicateContactLeadIdError(error)) break;
    }
  }
}

/** Resolve a contact's permanent Customer ID (REST/RPC/leads fallbacks). */
export async function resolveContactCustomerId(
  supabase: SupabaseAdmin,
  contactId: string
): Promise<string | null> {
  const id = String(contactId || '').trim();
  if (!id) return null;

  const { data: contact } = await supabase
    .from('contacts')
    .select('id, legacy_lead_id, phone, mobile')
    .eq('id', id)
    .maybeSingle();

  const map = await fetchContactLeadIds(
    supabase,
    contact ? [contact as ContactLeadLookupMeta] : [{ id }]
  );
  return map.get(id) || null;
}
