'use server';

/**
 * Lead Distribution: Super Admin uploads leads (Excel/CSV), reviews them and
 * assigns them to Sales Agents of the selected company.
 *
 * Uploaded leads wait in lead_distribution_leads (migration 056). Assigning a
 * lead creates (or reuses) its contact owned by the agent and a CRM opportunity
 * in that company's "New" stage, the same records Contacts → New creates, so
 * the lead appears in the agent's existing pipeline. The agent gets one bell
 * notification per assignment.
 */

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { isSuperAdminSession } from '@/lib/auth/super-admin';
import { actionError } from '@/lib/user-facing-error';
import { applyOrganizationFilter } from '@/lib/admin-organization-context';
import {
  LEAD_IMPORT_MAX_ROWS,
  checkLeadRows,
  phoneKey,
  type LeadImportRow,
  type LeadRowIssue,
} from '@/lib/lead-import';

type Supabase = Awaited<ReturnType<typeof createAdminClient>>;

const TABLE = 'lead_distribution_leads';
const PAGE_SIZE = 50;
const ASSIGN_LIMIT = 500;
const CONTACT_SOURCE = 'Lead import';
const SETUP_REQUIRED = { setupRequired: true as const };

export type LeadStatusFilter = 'unassigned' | 'assigned' | 'all';

export type DistributedLead = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  companyName: string | null;
  country: string | null;
  city: string | null;
  status: 'unassigned' | 'assigned';
  agentId: string | null;
  agentName: string | null;
  assignedAt: string | null;
  createdAt: string;
  fileName: string | null;
  inquiriesSent: number;
};

export type AgentLeadSummary = {
  id: string;
  name: string;
  active: boolean;
  assignedLeads: number;
  inquiriesSent: number;
};

export type LeadDistributionOverview = {
  leads: DistributedLead[];
  total: number;
  page: number;
  pageSize: number;
  counts: { unassigned: number; assigned: number };
  agents: AgentLeadSummary[];
};

function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === 'PGRST205' || error.code === '42P01' || String(error.message || '').includes(TABLE);
}

async function requireAccess(): Promise<
  { supabase: Supabase; organizationId: string; username: string } | { error: string }
> {
  const session = await getSession();
  if (!session || !isSuperAdminSession(session)) return { error: 'Access Denied' };
  const organizationId = session.organizationId ? String(session.organizationId) : '';
  if (!organizationId) return { error: 'Select a company in the header to distribute its leads.' };
  return { supabase: await createAdminClient(), organizationId, username: session.username };
}

type AgentRow = { id: string; name: string; username: string | null; appUserId: string | null; active: boolean };

/** Sales agents of the company: members of it, or agents who already own contacts there. */
async function companyAgents(supabase: Supabase, organizationId: string): Promise<AgentRow[]> {
  const [agents, members, owners] = await Promise.all([
    supabase.from('sales_agents').select('id, name, username, app_user_id, is_active').order('name'),
    supabase.from('user_organizations').select('user_id').eq('organization_id', organizationId),
    supabase
      .from('contacts')
      .select('salesperson_id')
      .eq('organization_id', organizationId)
      .not('salesperson_id', 'is', null)
      .limit(20000),
  ]);
  const memberIds = new Set((members.data || []).map((m) => String(m.user_id)));
  const ownerIds = new Set((owners.data || []).map((c) => String(c.salesperson_id)));
  return (agents.data || [])
    .map((a) => ({
      id: String(a.id),
      name: String(a.name || a.username || 'Unnamed'),
      username: a.username ? String(a.username) : null,
      appUserId: a.app_user_id ? String(a.app_user_id) : null,
      active: a.is_active !== false,
    }))
    .filter((a) => (a.appUserId && memberIds.has(a.appUserId)) || ownerIds.has(a.id));
}

// ---------------------------------------------------------------------------
// Overview: list + per-agent summary
// ---------------------------------------------------------------------------

type AssignedRow = { id: string; contact_id: string | null; assigned_sales_agent_id: string | null; assigned_at: string | null };

/**
 * Inquiries sent (the All Inquiries rule: sent to Operations) for each assigned
 * lead's contact, counting only those sent after the lead was assigned.
 */
async function inquiriesSentByLead(
  supabase: Supabase,
  organizationId: string,
  assigned: AssignedRow[]
): Promise<Map<string, number>> {
  const byContact = new Map<string, AssignedRow[]>();
  for (const row of assigned) {
    if (!row.contact_id) continue;
    const list = byContact.get(row.contact_id) ?? [];
    list.push(row);
    byContact.set(row.contact_id, list);
  }
  const contactIds = [...byContact.keys()];
  const result = new Map<string, number>();
  for (let i = 0; i < contactIds.length; i += 200) {
    const chunk = contactIds.slice(i, i + 200);
    const query = applyOrganizationFilter(
      supabase
        .from('lead_inquiries')
        .select('sent_at, created_at, leads!inner(contact_id)')
        .eq('sent_to_accounting', true)
        .or('is_current_version.is.null,is_current_version.eq.true')
        .in('leads.contact_id', chunk),
      organizationId
    );
    const { data } = await query;
    for (const inquiry of (data || []) as Array<{ sent_at: string | null; created_at: string; leads: unknown }>) {
      const lead = Array.isArray(inquiry.leads) ? inquiry.leads[0] : inquiry.leads;
      const contactId = (lead as { contact_id?: string } | null)?.contact_id;
      if (!contactId) continue;
      const sentAt = String(inquiry.sent_at || inquiry.created_at);
      for (const row of byContact.get(contactId) ?? []) {
        if (row.assigned_at && sentAt >= row.assigned_at) result.set(row.id, (result.get(row.id) ?? 0) + 1);
      }
    }
  }
  return result;
}

export async function getLeadDistributionOverview(options: {
  status?: LeadStatusFilter;
  agentId?: string | null;
  search?: string;
  page?: number;
}): Promise<LeadDistributionOverview | typeof SETUP_REQUIRED | { error: string }> {
  try {
    const ctx = await requireAccess();
    if ('error' in ctx) return ctx;
    const { supabase, organizationId } = ctx;
    const page = Math.max(1, Math.floor(Number(options.page) || 1));
    const status = options.status ?? 'unassigned';

    let listQuery = supabase
      .from(TABLE)
      .select(
        'id, name, phone, email, company_name, country, city, status, assigned_sales_agent_id, assigned_at, contact_id, created_at, file_name',
        { count: 'exact' }
      )
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .order('row_number', { ascending: true })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (status !== 'all') listQuery = listQuery.eq('status', status);
    if (options.agentId) listQuery = listQuery.eq('assigned_sales_agent_id', options.agentId);
    const needle = String(options.search || '').replace(/[%_,.()"\\]/g, ' ').trim();
    if (needle) {
      const like = `%${needle}%`;
      listQuery = listQuery.or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like},company_name.ilike.${like},city.ilike.${like}`);
    }

    const countQuery = (which: 'unassigned' | 'assigned') =>
      supabase.from(TABLE).select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', which);

    const [list, unassigned, assignedCount, assignedRows, agents] = await Promise.all([
      listQuery,
      countQuery('unassigned'),
      countQuery('assigned'),
      supabase
        .from(TABLE)
        .select('id, contact_id, assigned_sales_agent_id, assigned_at')
        .eq('organization_id', organizationId)
        .eq('status', 'assigned')
        .limit(20000),
      companyAgents(supabase, organizationId),
    ]);
    if (isMissingTable(list.error)) return SETUP_REQUIRED;
    if (list.error) return { error: actionError(list.error, 'Unable to load leads') };

    const assigned = (assignedRows.data || []) as AssignedRow[];
    const sentByLead = await inquiriesSentByLead(supabase, organizationId, assigned);

    // Per-agent summary: every company agent, plus anyone holding assigned leads.
    const names = new Map(agents.map((a) => [a.id, a]));
    const summary = new Map<string, AgentLeadSummary>();
    for (const agent of agents) {
      summary.set(agent.id, { id: agent.id, name: agent.name, active: agent.active, assignedLeads: 0, inquiriesSent: 0 });
    }
    const missing = [...new Set(assigned.map((r) => r.assigned_sales_agent_id).filter((id): id is string => Boolean(id) && !names.has(String(id))))];
    if (missing.length) {
      const { data } = await supabase.from('sales_agents').select('id, name, username, is_active').in('id', missing);
      for (const a of data || []) {
        summary.set(String(a.id), { id: String(a.id), name: String(a.name || a.username || 'Unnamed'), active: a.is_active !== false, assignedLeads: 0, inquiriesSent: 0 });
      }
    }
    for (const row of assigned) {
      const entry = row.assigned_sales_agent_id ? summary.get(String(row.assigned_sales_agent_id)) : undefined;
      if (!entry) continue;
      entry.assignedLeads += 1;
      entry.inquiriesSent += sentByLead.get(row.id) ?? 0;
    }

    const leads: DistributedLead[] = (list.data || []).map((r) => {
      const agentId = r.assigned_sales_agent_id ? String(r.assigned_sales_agent_id) : null;
      return {
        id: String(r.id),
        name: String(r.name || ''),
        phone: r.phone ? String(r.phone) : null,
        email: r.email ? String(r.email) : null,
        companyName: r.company_name ? String(r.company_name) : null,
        country: r.country ? String(r.country) : null,
        city: r.city ? String(r.city) : null,
        status: r.status === 'assigned' ? 'assigned' : 'unassigned',
        agentId,
        agentName: agentId ? summary.get(agentId)?.name ?? null : null,
        assignedAt: r.assigned_at ? String(r.assigned_at) : null,
        createdAt: String(r.created_at),
        fileName: r.file_name ? String(r.file_name) : null,
        inquiriesSent: sentByLead.get(String(r.id)) ?? 0,
      };
    });

    return {
      leads,
      total: list.count ?? leads.length,
      page,
      pageSize: PAGE_SIZE,
      counts: { unassigned: unassigned.count ?? 0, assigned: assignedCount.count ?? 0 },
      agents: [...summary.values()].sort((a, b) => b.assignedLeads - a.assignedLeads || a.name.localeCompare(b.name)),
    };
  } catch (err) {
    return { error: actionError(err, 'Unable to load leads') };
  }
}

// ---------------------------------------------------------------------------
// Import: check rows, then save them
// ---------------------------------------------------------------------------

type ExistingIndex = {
  phones: Map<string, string>;
  emails: Map<string, string>;
};

/** Phones and emails already in this company's contacts and uploaded leads. */
async function existingIndex(supabase: Supabase, organizationId: string): Promise<ExistingIndex | typeof SETUP_REQUIRED> {
  const [contacts, staged] = await Promise.all([
    supabase.from('contacts').select('name, phone, mobile, email').eq('organization_id', organizationId).limit(50000),
    supabase.from(TABLE).select('name, phone_key, email').eq('organization_id', organizationId).limit(50000),
  ]);
  if (isMissingTable(staged.error)) return SETUP_REQUIRED;
  const phones = new Map<string, string>();
  const emails = new Map<string, string>();
  for (const c of contacts.data || []) {
    for (const raw of [c.phone, c.mobile]) {
      const key = phoneKey(raw);
      if (key && !phones.has(key)) phones.set(key, `Already a contact (${c.name || 'unnamed'})`);
    }
    if (c.email) emails.set(String(c.email).toLowerCase(), `Already a contact (${c.name || 'unnamed'})`);
  }
  for (const s of staged.data || []) {
    if (s.phone_key && !phones.has(String(s.phone_key))) phones.set(String(s.phone_key), 'Already uploaded');
    if (s.email && !emails.has(String(s.email).toLowerCase())) emails.set(String(s.email).toLowerCase(), 'Already uploaded');
  }
  return { phones, emails };
}

function sanitizeRows(rows: LeadImportRow[]): LeadImportRow[] {
  const text = (v: unknown, max = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  return (Array.isArray(rows) ? rows : []).slice(0, LEAD_IMPORT_MAX_ROWS).map((r) => ({
    rowNumber: Math.floor(Number(r?.rowNumber) || 0),
    name: text(r?.name, 200),
    phone: text(r?.phone, 40),
    email: text(r?.email, 200).toLowerCase(),
    companyName: text(r?.companyName),
    country: text(r?.country, 100),
    city: text(r?.city, 100),
    extra: Object.fromEntries(
      Object.entries(r?.extra && typeof r.extra === 'object' ? r.extra : {})
        .slice(0, 30)
        .map(([k, v]) => [text(k, 80), text(v, 500)])
        .filter(([k, v]) => k && v)
    ),
  }));
}

/** Every problem per row: invalid, repeated in the file, or already in the system. */
function allIssues(rows: LeadImportRow[], index: ExistingIndex): Map<number, LeadRowIssue> {
  const issues = checkLeadRows(rows);
  for (const row of rows) {
    if (issues.has(row.rowNumber)) continue;
    const key = phoneKey(row.phone);
    const existing = (key && index.phones.get(key)) || (row.email && index.emails.get(row.email.toLowerCase()));
    if (existing) issues.set(row.rowNumber, { kind: 'duplicate', reason: existing });
  }
  return issues;
}

export type LeadRowCheck = { rowNumber: number; issue: LeadRowIssue | null };

/** Preview: what would be imported, and why the other rows would not. */
export async function checkLeadImport(
  rows: LeadImportRow[]
): Promise<{ results: LeadRowCheck[] } | typeof SETUP_REQUIRED | { error: string }> {
  try {
    const ctx = await requireAccess();
    if ('error' in ctx) return ctx;
    const clean = sanitizeRows(rows);
    const index = await existingIndex(ctx.supabase, ctx.organizationId);
    if ('setupRequired' in index) return index;
    const issues = allIssues(clean, index);
    return { results: clean.map((r) => ({ rowNumber: r.rowNumber, issue: issues.get(r.rowNumber) ?? null })) };
  } catch (err) {
    return { error: actionError(err, 'Unable to check the file') };
  }
}

/** Saves the valid, new rows. Rows are checked again here; the client is not trusted. */
export async function importLeads(
  rows: LeadImportRow[],
  fileName: string
): Promise<{ imported: number; skipped: number } | typeof SETUP_REQUIRED | { error: string }> {
  try {
    const ctx = await requireAccess();
    if ('error' in ctx) return ctx;
    const { supabase, organizationId, username } = ctx;
    const clean = sanitizeRows(rows);
    const index = await existingIndex(supabase, organizationId);
    if ('setupRequired' in index) return index;
    const issues = allIssues(clean, index);
    const valid = clean.filter((r) => !issues.has(r.rowNumber));

    const batchId = crypto.randomUUID();
    const now = new Date().toISOString();
    const records = valid.map((r) => ({
      organization_id: organizationId,
      batch_id: batchId,
      file_name: String(fileName || '').slice(0, 200) || null,
      row_number: r.rowNumber,
      name: r.name,
      phone: r.phone || null,
      phone_key: phoneKey(r.phone) || null,
      email: r.email || null,
      company_name: r.companyName || null,
      country: r.country || null,
      city: r.city || null,
      extra: r.extra,
      status: 'unassigned',
      imported_by: username,
      created_at: now,
      updated_at: now,
    }));

    let imported = 0;
    for (let i = 0; i < records.length; i += 500) {
      const chunk = records.slice(i, i + 500);
      const { error } = await supabase.from(TABLE).insert(chunk);
      if (!error) {
        imported += chunk.length;
        continue;
      }
      if (isMissingTable(error)) return SETUP_REQUIRED;
      if (error.code !== '23505') return { error: actionError(error, 'Unable to save the leads') };
      // Someone uploaded the same phone meanwhile: save the rest one by one.
      for (const record of chunk) {
        const single = await supabase.from(TABLE).insert(record);
        if (!single.error) imported += 1;
      }
    }
    return { imported, skipped: clean.length - imported };
  } catch (err) {
    return { error: actionError(err, 'Unable to save the leads') };
  }
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

/** Active sales agents of the company, for the Assign dialog. */
export async function getAssignableAgents(): Promise<{ agents: Array<{ id: string; name: string }> } | { error: string }> {
  try {
    const ctx = await requireAccess();
    if ('error' in ctx) return ctx;
    const agents = await companyAgents(ctx.supabase, ctx.organizationId);
    return { agents: agents.filter((a) => a.active).map(({ id, name }) => ({ id, name })) };
  } catch (err) {
    return { error: actionError(err, 'Unable to load sales agents') };
  }
}

type StagedLead = {
  id: string;
  name: string;
  phone: string | null;
  phone_key: string | null;
  email: string | null;
  company_name: string | null;
  country: string | null;
  city: string | null;
  extra: Record<string, string> | null;
};

type ContactMatch = { id: string; name: string; salespersonId: string | null };

function extraNotes(extra: Record<string, string> | null): string | null {
  const lines = Object.entries(extra || {}).map(([k, v]) => `${k}: ${v}`);
  return lines.length ? `Imported lead details\n${lines.join('\n')}` : null;
}

/** Creates one contact owned by the agent, with a Customer ID, like Contacts → New. */
async function createLeadContact(
  supabase: Supabase,
  lead: StagedLead,
  input: { organizationId: string; agentId: string; username: string; leadIdColumn: boolean }
): Promise<{ id: string; name: string } | { error: string; duplicate?: boolean }> {
  const { allocateContactLeadIdFormatted, isDuplicateContactLeadIdError, MAX_INSERT_RETRIES } = await import('@/lib/contact-lead-id');
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    parent_id: null,
    contact_kind: 'contact',
    company_type: 'person',
    name: lead.name,
    company_name: lead.company_name,
    email: lead.email,
    phone: lead.phone,
    country: lead.country,
    city: lead.city,
    notes: extraNotes(lead.extra),
    salesperson_id: input.agentId,
    customer_rank: 0,
    vendor_rank: 0,
    source: CONTACT_SOURCE,
    organization_id: input.organizationId,
    created_by: input.username,
    created_at: now,
    updated_at: now,
  };
  for (let attempt = 0; attempt < MAX_INSERT_RETRIES; attempt++) {
    if (input.leadIdColumn) row.lead_id_formatted = await allocateContactLeadIdFormatted(supabase);
    const { data, error } = await supabase.from('contacts').insert([row]).select('id, name').single();
    if (!error && data) return { id: String(data.id), name: String(data.name || lead.name) };
    if (input.leadIdColumn && isDuplicateContactLeadIdError(error)) continue;
    // The database refuses a second contact with the same phone.
    const duplicate = /duplicate|already exists/i.test(String(error?.message || ''));
    return { error: duplicate ? 'A contact with this phone already exists' : 'Contact could not be created', duplicate };
  }
  return { error: 'Customer ID could not be allocated' };
}

/**
 * Assigns unassigned leads to one active sales agent of the company: reuses or
 * creates each contact, creates its opportunity in "New", marks the lead
 * assigned and notifies the agent once.
 */
export async function assignLeads(
  leadIds: string[],
  agentId: string
): Promise<
  | { assigned: number; skipped: Array<{ name: string; reason: string }>; agentName: string }
  | typeof SETUP_REQUIRED
  | { error: string }
> {
  try {
    const ctx = await requireAccess();
    if ('error' in ctx) return ctx;
    const { supabase, organizationId, username } = ctx;
    const ids = [...new Set((Array.isArray(leadIds) ? leadIds : []).map(String))].slice(0, ASSIGN_LIMIT);
    if (!ids.length) return { error: 'Select at least one lead.' };

    const agent = (await companyAgents(supabase, organizationId)).find((a) => a.id === String(agentId) && a.active);
    if (!agent) return { error: 'Choose an active sales agent of this company.' };

    const { data: leadRows, error: leadsError } = await supabase
      .from(TABLE)
      .select('id, name, phone, phone_key, email, company_name, country, city, extra')
      .eq('organization_id', organizationId)
      .eq('status', 'unassigned')
      .in('id', ids);
    if (isMissingTable(leadsError)) return SETUP_REQUIRED;
    if (leadsError) return { error: actionError(leadsError, 'Unable to load the selected leads') };
    const leads = (leadRows || []) as StagedLead[];
    const skipped: Array<{ name: string; reason: string }> = [];
    if (leads.length < ids.length) skipped.push({ name: `${ids.length - leads.length} lead(s)`, reason: 'Already assigned or removed' });
    if (!leads.length) return { assigned: 0, skipped, agentName: agent.name };

    // Contacts that already exist in this company, by phone and email.
    const { data: contactRows } = await supabase
      .from('contacts')
      .select('id, name, phone, mobile, email, salesperson_id, parent_id')
      .eq('organization_id', organizationId)
      .limit(50000);
    const byPhone = new Map<string, ContactMatch>();
    const byEmail = new Map<string, ContactMatch>();
    for (const c of contactRows || []) {
      const match = { id: String(c.id), name: String(c.name || ''), salespersonId: c.salesperson_id ? String(c.salesperson_id) : null };
      for (const raw of [c.phone, c.mobile]) {
        const key = phoneKey(raw);
        if (key && !byPhone.has(key)) byPhone.set(key, match);
      }
      if (c.email) byEmail.set(String(c.email).toLowerCase(), match);
    }

    const { resolveCrmPipelineStageForOrg } = await import('@/app/actions/crm/stages');
    const stage = await resolveCrmPipelineStageForOrg(organizationId, { stageNameHint: 'New' });
    if (!stage) return { error: 'This company has no CRM pipeline stages.' };
    const { isContactLeadIdColumnAvailable } = await import('@/lib/contact-lead-id');
    const leadIdColumn = await isContactLeadIdColumnAvailable(supabase);

    // 1. Contacts: reuse a matching one, or create one owned by the agent.
    const contactFor = new Map<string, { id: string; name: string }>();
    const reusedUnowned: string[] = [];
    const toCreate: StagedLead[] = [];
    for (const lead of leads) {
      const match = (lead.phone_key && byPhone.get(lead.phone_key)) || (lead.email && byEmail.get(lead.email.toLowerCase())) || null;
      if (!match) {
        toCreate.push(lead);
        continue;
      }
      if (match.salespersonId && match.salespersonId !== agent.id) {
        skipped.push({ name: lead.name, reason: `Already a contact of another sales agent (${match.name})` });
        continue;
      }
      if (!match.salespersonId) reusedUnowned.push(match.id);
      contactFor.set(lead.id, { id: match.id, name: match.name || lead.name });
    }
    if (reusedUnowned.length) {
      await supabase
        .from('contacts')
        .update({ salesperson_id: agent.id, updated_at: new Date().toISOString() })
        .in('id', reusedUnowned)
        .is('salesperson_id', null);
    }
    for (let i = 0; i < toCreate.length; i += 8) {
      const batch = toCreate.slice(i, i + 8);
      const created = await Promise.all(
        batch.map((lead) => createLeadContact(supabase, lead, { organizationId, agentId: agent.id, username, leadIdColumn }))
      );
      batch.forEach((lead, k) => {
        const result = created[k];
        if ('error' in result) skipped.push({ name: lead.name, reason: result.error });
        else contactFor.set(lead.id, result);
      });
    }

    const createdContactIds = toCreate.map((l) => contactFor.get(l.id)?.id).filter((id): id is string => Boolean(id));
    if (createdContactIds.length) {
      const { ensureContactLeadIdsForContacts } = await import('@/lib/contact-lead-id');
      await ensureContactLeadIdsForContacts(supabase, createdContactIds.map((id) => ({ id, lead_id_formatted: null }))).catch(
        () => undefined
      );
      await supabase.from('contact_activity_logs').insert(
        createdContactIds.map((id) => ({
          contact_id: id,
          action_type: 'created',
          body: `Contact created from Lead Distribution and assigned to ${agent.name}`,
          performed_by: username,
          metadata: { source: 'lead_distribution' },
        }))
      );
    }

    // 2. Opportunities in "New": reuse the contact's auto opportunity, or create one.
    const { CRM_AUTO_OPPORTUNITY_SOURCE, buildAutoOpportunityName } = await import('@/lib/crm-pipeline-utils');
    const { probabilityForStageName, computeLeadScore } = await import('@/lib/crm-automation');
    const contactIds = [...new Set([...contactFor.values()].map((c) => c.id))];
    const existingOpp = new Map<string, { id: string; salespersonId: string | null }>();
    for (let i = 0; i < contactIds.length; i += 200) {
      const { data } = await supabase
        .from('crm_opportunities')
        .select('id, contact_id, salesperson_id')
        .eq('organization_id', organizationId)
        .eq('source', CRM_AUTO_OPPORTUNITY_SOURCE)
        .in('contact_id', contactIds.slice(i, i + 200));
      for (const o of data || []) {
        existingOpp.set(String(o.contact_id), { id: String(o.id), salespersonId: o.salesperson_id ? String(o.salesperson_id) : null });
      }
    }
    const unownedOpps = [...existingOpp.values()].filter((o) => !o.salespersonId).map((o) => o.id);
    if (unownedOpps.length) {
      await supabase.from('crm_opportunities').update({ salesperson_id: agent.id }).in('id', unownedOpps).is('salesperson_id', null);
    }

    const probability = probabilityForStageName(
      String(stage.name || 'New'),
      Boolean(stage.is_won),
      Boolean(stage.is_lost),
      stage.default_probability
    );
    const leadScore = computeLeadScore({
      probability,
      expectedRevenue: 0,
      isWon: Boolean(stage.is_won),
      isLost: Boolean(stage.is_lost),
      activitiesTotal: 0,
      activitiesDone: 0,
    });
    const now = new Date().toISOString();
    const newOpps = [...contactFor.entries()]
      .filter(([, contact]) => !existingOpp.has(contact.id))
      .map(([leadId, contact]) => {
        const lead = leads.find((l) => l.id === leadId)!;
        return {
          organization_id: organizationId,
          stage_id: stage.id,
          name: buildAutoOpportunityName(contact.name || lead.name),
          contact_id: contact.id,
          contact_person_id: null,
          expected_revenue: 0,
          probability,
          probability_manual: false,
          lead_score: leadScore,
          priority: 0,
          salesperson_id: agent.id,
          sales_team: null,
          tags: [] as string[],
          campaign: null,
          medium: null,
          source: CRM_AUTO_OPPORTUNITY_SOURCE,
          email: lead.email,
          phone: lead.phone,
          mobile: null,
          website: null,
          expected_closing_date: null,
          internal_notes: null,
          created_by: username,
          updated_at: now,
        };
      });
    // Several leads can share one contact; create its opportunity once.
    const uniqueOpps = [...new Map(newOpps.map((o) => [o.contact_id, o])).values()];
    for (let i = 0; i < uniqueOpps.length; i += 200) {
      const { data, error } = await supabase
        .from('crm_opportunities')
        .insert(uniqueOpps.slice(i, i + 200))
        .select('id, contact_id');
      if (error) return { error: actionError(error, 'Unable to add the leads to the pipeline') };
      for (const o of data || []) existingOpp.set(String(o.contact_id), { id: String(o.id), salespersonId: agent.id });
    }

    // 3. Mark the leads assigned.
    const done = [...contactFor.entries()];
    for (let i = 0; i < done.length; i += 10) {
      await Promise.all(
        done.slice(i, i + 10).map(([leadId, contact]) =>
          supabase
            .from(TABLE)
            .update({
              status: 'assigned',
              assigned_sales_agent_id: agent.id,
              assigned_at: now,
              assigned_by: username,
              contact_id: contact.id,
              opportunity_id: existingOpp.get(contact.id)?.id ?? null,
              updated_at: now,
            })
            .eq('id', leadId)
            .eq('status', 'unassigned')
        )
      );
    }

    // 4. One notification for the agent.
    if (done.length) {
      let recipient = agent.username;
      if (agent.appUserId) {
        const { data: user } = await supabase.from('app_users').select('username').eq('id', agent.appUserId).maybeSingle();
        if (user?.username) recipient = String(user.username);
      }
      if (recipient) {
        const count = done.length;
        const { error } = await supabase.from('inquiry_lifecycle_notifications').insert({
          lead_id: null,
          sender_role: 'admin',
          sender_username: username,
          recipient_role: 'sales_agent',
          recipient_username: recipient,
          event_type: 'leads_assigned',
          title: 'New Leads Assigned',
          message: `Admin assigned ${count} new lead${count === 1 ? '' : 's'} to you. They are in the New column of your pipeline.`,
          href: '/crm/pipeline',
          payload: { count, organizationId },
        });
        if (error) console.error('[lead-distribution] notification not saved', error.code, error.message);
      }
    }

    return { assigned: done.length, skipped, agentName: agent.name };
  } catch (err) {
    return { error: actionError(err, 'Unable to assign the leads') };
  }
}

// ---------------------------------------------------------------------------
// Distribution Tracking: what happened to assigned leads afterwards
// ---------------------------------------------------------------------------

/** Current inquiry status, as stored in lead_inquiries.approval_status. */
export type TrackedInquiryStatus = 'sent' | 'sent_to_admin' | 'calculated_by_admin' | 'approved' | 'rejected' | 'other';

export type TrackedInquiry = {
  id: string;
  reference: string | null;
  status: TrackedInquiryStatus;
  createdAt: string;
  /** First time Sales (or the customer) sent it to Operations. */
  sentToOperationsAt: string | null;
  /** Latest time Operations sent its calculation to Admin. */
  sentToAdminAt: string | null;
  calculatedByAdminAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  updatedAt: string | null;
  /** Latest recorded workflow event. */
  lastEventAt: string | null;
  /** Every recorded time of this inquiry (creation, sending, each status change). */
  activityTimes: string[];
};

export type TrackedLead = {
  id: string;
  /** Contact created or reused for this lead at assignment. */
  contactId: string | null;
  name: string;
  phone: string | null;
  agentId: string;
  agentName: string;
  assignedAt: string | null;
  /** Assigned inside the selected date window (always true without one). */
  assignedInWindow: boolean;
  assignmentStatus: 'assigned' | 'unassigned';
  inquiries: TrackedInquiry[];
  lastActivityAt: string | null;
};

export type StatusCounts = {
  inquiries: number;
  sent: number;
  sentToAdmin: number;
  calculated: number;
  approved: number;
  rejected: number;
  pending: number;
};

export type TrackingAgentRow = StatusCounts & {
  id: string;
  name: string;
  assignedLeads: number;
  leadsWithInquiries: number;
};

export type DistributionTracking = {
  cards: StatusCounts & { assignedLeads: number; agents: number };
  agents: TrackingAgentRow[];
  agentOptions: Array<{ id: string; name: string }>;
  leads: TrackedLead[];
  /** True when more leads matched than are listed. */
  truncated: boolean;
};

export type TrackingStatusFilter = 'all' | 'pending' | 'none' | Exclude<TrackedInquiryStatus, 'other'>;

export type TrackingFilters = {
  agentId?: string | null;
  status?: TrackingStatusFilter;
  /**
   * Date window (ISO; from inclusive, to exclusive). A lead counts when it was
   * assigned in the window; an inquiry counts when it was created, sent or
   * changed status in the window. No window = all records.
   */
  dateFrom?: string | null;
  dateTo?: string | null;
  /**
   * With a date window: list only leads assigned in it and keep all of their
   * inquiries (used by the Activity Logs day view). Off by default.
   */
  assignedOnly?: boolean;
  /** Lead name, phone or inquiry number. */
  search?: string;
};

const PENDING_STATUSES_SET = new Set<TrackedInquiryStatus>(['sent', 'sent_to_admin', 'calculated_by_admin']);
const TRACKING_LIST_LIMIT = 1000;

function emptyCounts(): StatusCounts {
  return { inquiries: 0, sent: 0, sentToAdmin: 0, calculated: 0, approved: 0, rejected: 0, pending: 0 };
}

function addInquiry(counts: StatusCounts, status: TrackedInquiryStatus) {
  counts.inquiries += 1;
  if (status === 'sent') counts.sent += 1;
  else if (status === 'sent_to_admin') counts.sentToAdmin += 1;
  else if (status === 'calculated_by_admin') counts.calculated += 1;
  else if (status === 'approved') counts.approved += 1;
  else if (status === 'rejected') counts.rejected += 1;
  if (PENDING_STATUSES_SET.has(status)) counts.pending += 1;
}

const latest = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

function toStatus(value: unknown): TrackedInquiryStatus {
  const v = String(value || '');
  return v === 'sent' || v === 'sent_to_admin' || v === 'calculated_by_admin' || v === 'approved' || v === 'rejected'
    ? v
    : 'other';
}

type TrackingLeadRow = {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  assigned_sales_agent_id: string | null;
  assigned_at: string | null;
  contact_id: string | null;
};

type TrackingInquiryRow = {
  id: string;
  inquiry_reference: string | null;
  approval_status: string | null;
  created_at: string;
  sent_at: string | null;
  updated_at: string | null;
  leads: unknown;
};

/**
 * Assigned leads with every inquiry sent from them after the assignment, the
 * inquiry's current status and the real time of each workflow step (from
 * inquiry_workflow_events; null = the step never happened). Read only.
 */
export async function getDistributionTracking(
  filters: TrackingFilters = {}
): Promise<DistributionTracking | typeof SETUP_REQUIRED | { error: string }> {
  try {
    const ctx = await requireAccess();
    if ('error' in ctx) return ctx;
    const { supabase, organizationId } = ctx;

    let leadQuery = supabase
      .from(TABLE)
      .select('id, name, phone, status, assigned_sales_agent_id, assigned_at, contact_id')
      .eq('organization_id', organizationId)
      .eq('status', 'assigned')
      .order('assigned_at', { ascending: false })
      .limit(20000);
    if (filters.agentId) leadQuery = leadQuery.eq('assigned_sales_agent_id', filters.agentId);

    const [leadRes, agents] = await Promise.all([leadQuery, companyAgents(supabase, organizationId)]);
    if (isMissingTable(leadRes.error)) return SETUP_REQUIRED;
    if (leadRes.error) return { error: actionError(leadRes.error, 'Unable to load tracking') };
    const rows = (leadRes.data || []) as TrackingLeadRow[];

    // Agent names, including agents no longer linked to the company.
    const agentNames = new Map(agents.map((a) => [a.id, a.name]));
    const unknownAgents = [
      ...new Set(
        rows
          .map((r) => r.assigned_sales_agent_id)
          .filter((id): id is string => Boolean(id) && !agentNames.has(String(id)))
      ),
    ];
    if (unknownAgents.length) {
      const { data } = await supabase.from('sales_agents').select('id, name, username').in('id', unknownAgents);
      for (const a of data || []) agentNames.set(String(a.id), String(a.name || a.username || 'Unnamed'));
    }

    // Inquiries sent from these leads' contacts (All Inquiries rule), current versions only.
    const byContact = new Map<string, TrackingLeadRow[]>();
    for (const row of rows) {
      if (!row.contact_id) continue;
      const list = byContact.get(row.contact_id) ?? [];
      list.push(row);
      byContact.set(row.contact_id, list);
    }
    const contactIds = [...byContact.keys()];
    const inquiryRows: TrackingInquiryRow[] = [];
    for (let i = 0; i < contactIds.length; i += 200) {
      const { data, error } = await applyOrganizationFilter(
        supabase
          .from('lead_inquiries')
          .select('id, inquiry_reference, approval_status, created_at, sent_at, updated_at, leads!inner(contact_id)')
          .eq('sent_to_accounting', true)
          .or('is_current_version.is.null,is_current_version.eq.true')
          .in('leads.contact_id', contactIds.slice(i, i + 200)),
        organizationId
      );
      if (error) return { error: actionError(error, 'Unable to load inquiries') };
      inquiryRows.push(...((data || []) as TrackingInquiryRow[]));
    }

    // Real workflow times per inquiry.
    const events = new Map<string, Array<{ type: string; at: string }>>();
    const inquiryIds = inquiryRows.map((r) => String(r.id));
    for (let i = 0; i < inquiryIds.length; i += 200) {
      const { data } = await supabase
        .from('inquiry_workflow_events')
        .select('inquiry_id, event_type, occurred_at')
        .in('inquiry_id', inquiryIds.slice(i, i + 200));
      for (const e of data || []) {
        const list = events.get(String(e.inquiry_id)) ?? [];
        list.push({ type: String(e.event_type), at: String(e.occurred_at) });
        events.set(String(e.inquiry_id), list);
      }
    }
    const timesOf = (list: Array<{ type: string; at: string }>, types: string[]) =>
      list.filter((e) => types.includes(e.type)).map((e) => e.at).sort();

    const inquiriesByLead = new Map<string, TrackedInquiry[]>();
    for (const inquiry of inquiryRows) {
      const lead = Array.isArray(inquiry.leads) ? inquiry.leads[0] : inquiry.leads;
      const contactId = (lead as { contact_id?: string } | null)?.contact_id;
      if (!contactId) continue;
      const list = events.get(String(inquiry.id)) ?? [];
      const tracked: TrackedInquiry = {
        id: String(inquiry.id),
        reference: inquiry.inquiry_reference ? String(inquiry.inquiry_reference) : null,
        status: toStatus(inquiry.approval_status),
        createdAt: String(inquiry.created_at),
        sentToOperationsAt:
          timesOf(list, ['submitted', 'resubmitted'])[0] ?? (inquiry.sent_at ? String(inquiry.sent_at) : null),
        sentToAdminAt: timesOf(list, ['operations_submitted']).at(-1) ?? null,
        calculatedByAdminAt: timesOf(list, ['admin_calculated']).at(-1) ?? null,
        approvedAt: timesOf(list, ['approved']).at(-1) ?? null,
        rejectedAt: timesOf(list, ['rejected']).at(-1) ?? null,
        updatedAt: inquiry.updated_at ? String(inquiry.updated_at) : null,
        lastEventAt: list.map((e) => e.at).sort().at(-1) ?? null,
        activityTimes: [
          String(inquiry.created_at),
          ...(inquiry.sent_at ? [String(inquiry.sent_at)] : []),
          ...list.map((e) => e.at),
        ],
      };
      const sentAt = String(inquiry.sent_at || inquiry.created_at);
      // Only inquiries sent after the lead was assigned belong to the distribution.
      for (const row of byContact.get(contactId) ?? []) {
        if (!row.assigned_at || sentAt < row.assigned_at) continue;
        const listForLead = inquiriesByLead.get(row.id) ?? [];
        listForLead.push(tracked);
        inquiriesByLead.set(row.id, listForLead);
      }
    }

    // Inquiry-level filters, then lead-level ones.
    const needle = String(filters.search || '').trim().toLowerCase();
    const needleDigits = needle.replace(/\D/g, '');
    const status = filters.status ?? 'all';
    const from = filters.dateFrom || null;
    const to = filters.dateTo || null;
    const assignedOnly = Boolean(filters.assignedOnly);
    const dateOn = Boolean(from || to) && !assignedOnly;
    const inWindow = (iso: string | null | undefined) =>
      Boolean(iso) && (!from || (iso as string) >= from) && (!to || (iso as string) < to);
    const inquiryMatches = (q: TrackedInquiry) => {
      if (status === 'pending' && !PENDING_STATUSES_SET.has(q.status)) return false;
      if (status !== 'all' && status !== 'pending' && status !== 'none' && q.status !== status) return false;
      if (dateOn && !q.activityTimes.some(inWindow)) return false;
      return true;
    };
    const inquiryFilterOn = status !== 'all' && status !== 'none';

    const leads: TrackedLead[] = [];
    for (const row of rows) {
      const all = (inquiriesByLead.get(row.id) ?? []).sort((a, b) =>
        (b.sentToOperationsAt ?? b.createdAt).localeCompare(a.sentToOperationsAt ?? a.createdAt)
      );
      if (status === 'none' && all.length) continue;
      if (assignedOnly && (from || to) && !inWindow(row.assigned_at)) continue;
      let inquiries = all.filter(inquiryMatches);
      if (inquiryFilterOn && inquiries.length === 0) continue;
      // With a date, a lead shows when it was assigned then or has inquiry activity then.
      const assignedInWindow = !dateOn || inWindow(row.assigned_at);
      if (dateOn && !assignedInWindow && inquiries.length === 0) continue;
      if (needle) {
        const byLead =
          String(row.name || '').toLowerCase().includes(needle) ||
          (needleDigits.length >= 3 && String(row.phone || '').replace(/\D/g, '').includes(needleDigits));
        const byInquiry = inquiries.filter((q) => String(q.reference || '').toLowerCase().includes(needle));
        if (!byLead && byInquiry.length === 0) continue;
        if (!byLead) inquiries = byInquiry;
      }
      const agentId = String(row.assigned_sales_agent_id || '');
      leads.push({
        id: row.id,
        contactId: row.contact_id,
        name: String(row.name || ''),
        phone: row.phone,
        agentId,
        agentName: agentNames.get(agentId) ?? 'Unknown agent',
        assignedAt: row.assigned_at,
        assignedInWindow,
        assignmentStatus: row.status === 'assigned' ? 'assigned' : 'unassigned',
        inquiries,
        lastActivityAt: inquiries.reduce<string | null>(
          (acc, q) => latest(latest(acc, q.lastEventAt), q.updatedAt),
          row.assigned_at
        ),
      });
    }

    // Cards and the agent table count exactly what the filters left.
    const cards = { ...emptyCounts(), assignedLeads: leads.filter((l) => l.assignedInWindow).length, agents: 0 };
    const byAgent = new Map<string, TrackingAgentRow>();
    for (const lead of leads) {
      const entry = byAgent.get(lead.agentId) ?? {
        ...emptyCounts(),
        id: lead.agentId,
        name: lead.agentName,
        assignedLeads: 0,
        leadsWithInquiries: 0,
      };
      if (lead.assignedInWindow) entry.assignedLeads += 1;
      if (lead.inquiries.length) entry.leadsWithInquiries += 1;
      for (const q of lead.inquiries) {
        addInquiry(entry, q.status);
        addInquiry(cards, q.status);
      }
      byAgent.set(lead.agentId, entry);
    }
    cards.agents = byAgent.size;

    const options = new Map<string, string>(agents.map((a) => [a.id, a.name]));
    for (const a of byAgent.values()) options.set(a.id, a.name);

    return {
      cards,
      agents: [...byAgent.values()].sort((a, b) => b.assignedLeads - a.assignedLeads || a.name.localeCompare(b.name)),
      agentOptions: [...options.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      leads: leads.slice(0, TRACKING_LIST_LIMIT),
      truncated: leads.length > TRACKING_LIST_LIMIT,
    };
  } catch (err) {
    return { error: actionError(err, 'Unable to load tracking') };
  }
}

export type TimelineEntry = { at: string; label: string; actor: string | null };

const TIMELINE_LABELS: Record<string, string> = {
  submitted: 'Sent to Operations',
  resubmitted: 'Sent to Operations again',
  operations_submitted: 'Operations sent the calculation to Admin',
  admin_calculated: 'Calculated by Admin',
  admin_review_opened: 'Opened by Admin',
  approved: 'Approved by Admin',
  rejected: 'Rejected by Admin',
  flagged: 'Flagged',
};

/** Status history of one inquiry from a lead distributed in this company. */
export async function getTrackedInquiryTimeline(
  inquiryId: string
): Promise<{ entries: TimelineEntry[] } | { error: string }> {
  try {
    const ctx = await requireAccess();
    if ('error' in ctx) return ctx;
    const { supabase, organizationId } = ctx;

    const { data: inquiry } = await applyOrganizationFilter(
      supabase
        .from('lead_inquiries')
        .select('id, created_at, created_by, leads!inner(contact_id)')
        .eq('id', String(inquiryId)),
      organizationId
    ).maybeSingle();
    const row = inquiry as { created_at?: string; created_by?: string | null; leads?: unknown } | null;
    const lead = row ? (Array.isArray(row.leads) ? row.leads[0] : row.leads) : null;
    const contactId = (lead as { contact_id?: string } | null)?.contact_id;
    if (!row || !contactId) return { error: 'Access Denied' };

    // Only inquiries of leads distributed in this company.
    const { count } = await supabase
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('contact_id', contactId);
    if (!count) return { error: 'Access Denied' };

    const { data: events } = await supabase
      .from('inquiry_workflow_events')
      .select('event_type, occurred_at, actor')
      .eq('inquiry_id', String(inquiryId))
      .order('occurred_at', { ascending: true });

    const entries: TimelineEntry[] = [
      { at: String(row.created_at), label: 'Inquiry created', actor: row.created_by ? String(row.created_by) : null },
      ...(events || []).map((e) => ({
        at: String(e.occurred_at),
        label: TIMELINE_LABELS[String(e.event_type)] ?? String(e.event_type).replace(/_/g, ' '),
        actor: e.actor ? String(e.actor) : null,
      })),
    ].sort((a, b) => a.at.localeCompare(b.at));
    return { entries };
  } catch (err) {
    return { error: actionError(err, 'Unable to load the status history') };
  }
}
