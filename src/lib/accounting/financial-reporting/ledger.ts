/**
 * Posted ledger loader — single source for financial statement + ledger aggregation.
 * Reads accounting_journal_entries (status=posted) + lines + CoA (+ journals).
 */

import { createAdminClient } from '@/utils/supabase/server';
import type { CoaAccountType, CoaClassification } from '@/lib/accounting-chart-of-accounts';
import {
  round2,
  signedBalance,
  type AccountBalance,
  type AccountMeta,
  type LedgerFact,
} from '@/lib/accounting/financial-reporting/types';

export type LedgerQuery = {
  organizationId: string | null;
  /** Inclusive lower bound on entry_date */
  dateFrom?: string | null;
  /** Inclusive upper bound on entry_date */
  dateTo?: string | null;
  /** Restrict to these account IDs */
  accountIds?: string[] | null;
  /** Restrict to partner contact */
  contactId?: string | null;
  /** When true and organizationId set, also include shared CoA (null org). */
  includeSharedAccounts?: boolean;
};

function toNum(v: unknown) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function asUnknownRows(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data) ? (data as unknown as Record<string, unknown>[]) : [];
}

function mapFact(
  row: Record<string, unknown>,
  entry: Record<string, unknown>,
  journal?: { code: string | null; name: string | null } | null
): LedgerFact {
  const lineContact = row.contact_id ? String(row.contact_id) : null;
  const entryContact = entry.contact_id ? String(entry.contact_id) : null;
  const linePartner = row.partner_name ? String(row.partner_name) : null;
  const entryPartner = entry.partner_name ? String(entry.partner_name) : null;
  return {
    line_id: String(row.id || `${entry.id}-${row.account_id}`),
    entry_id: String(entry.id || row.journal_entry_id),
    entry_date: String(entry.entry_date || '').slice(0, 10),
    entry_number: entry.entry_number ? String(entry.entry_number) : null,
    reference:
      entry.reference
        ? String(entry.reference)
        : entry.source_number
          ? String(entry.source_number)
          : entry.entry_number
            ? String(entry.entry_number)
            : null,
    organization_id: String(entry.organization_id || ''),
    account_id: String(row.account_id || ''),
    debit: toNum(row.debit),
    credit: toNum(row.credit),
    label: row.label ? String(row.label) : null,
    source_type: entry.source_type ? String(entry.source_type) : null,
    source_id: entry.source_id ? String(entry.source_id) : null,
    source_number: entry.source_number ? String(entry.source_number) : null,
    tax_label: row.tax_label ? String(row.tax_label) : null,
    journal_id: entry.journal_id ? String(entry.journal_id) : null,
    journal_code: journal?.code || null,
    journal_name: journal?.name || null,
    contact_id: lineContact || entryContact,
    partner_name: linePartner || entryPartner,
    amount_residual:
      row.amount_residual !== undefined && row.amount_residual !== null
        ? toNum(row.amount_residual)
        : null,
    is_reconciled:
      typeof row.is_reconciled === 'boolean' ? row.is_reconciled : null,
  };
}

function mapCoaRow(r: Record<string, unknown>): AccountMeta {
  return {
    id: String(r.id),
    code: String(r.code || ''),
    name: String(r.name || ''),
    type: String(r.type || 'expense') as CoaClassification,
    account_type: (r.account_type
      ? String(r.account_type)
      : null) as CoaAccountType | null,
    parent_id: r.parent_id ? String(r.parent_id) : null,
    organization_id: r.organization_id ? String(r.organization_id) : null,
  };
}

export async function loadChartAccounts(
  organizationId: string | null,
  opts?: { includeInactive?: boolean }
): Promise<AccountMeta[]> {
  const supabase = await createAdminClient();
  const SELECT_FULL =
    'id, code, name, type, account_type, parent_id, organization_id, is_active';
  const SELECT_LEGACY = 'id, code, name, type, parent_id, is_active';
  let select = SELECT_FULL;
  const rows: Record<string, unknown>[] = [];
  let from = 0;

  for (;;) {
    let q = supabase
      .from('chart_of_accounts')
      .select(select)
      .neq('type', 'view')
      .order('id', { ascending: true })
      .range(from, from + LEDGER_PAGE_SIZE - 1);

    if (opts?.includeInactive === false) {
      q = q.eq('is_active', true);
    }
    if (organizationId) {
      q = q.or(`organization_id.eq.${organizationId},organization_id.is.null`);
    }

    const { data, error } = await q;
    if (error) {
      if (from === 0 && /account_type|organization_id|column/i.test(error.message)) {
        select = SELECT_LEGACY;
        continue;
      }
      throw new Error(error.message);
    }
    const batch = asUnknownRows(data);
    rows.push(...batch);
    if (batch.length < LEDGER_PAGE_SIZE) break;
    from += LEDGER_PAGE_SIZE;
    if (from > 500_000) break;
  }

  return rows.map(mapCoaRow);
}

async function loadJournalMap(
  journalIds: string[]
): Promise<Map<string, { code: string | null; name: string | null }>> {
  const map = new Map<string, { code: string | null; name: string | null }>();
  if (!journalIds.length) return map;
  const supabase = await createAdminClient();
  for (let i = 0; i < journalIds.length; i += 200) {
    const chunk = journalIds.slice(i, i + 200);
    const { data } = await supabase
      .from('journals')
      .select('id, code, name')
      .in('id', chunk);
    for (const j of data || []) {
      map.set(String(j.id), {
        code: j.code ? String(j.code) : null,
        name: j.name ? String(j.name) : null,
      });
    }
  }
  return map;
}

const JOIN_SELECT_FULL = `
      id,
      account_id,
      debit,
      credit,
      label,
      partner_name,
      contact_id,
      amount_residual,
      is_reconciled,
      tax_label,
      journal_entry_id,
      accounting_journal_entries!inner (
        id,
        entry_date,
        entry_number,
        reference,
        organization_id,
        status,
        source_type,
        source_id,
        source_number,
        journal_id,
        partner_name,
        contact_id
      )
    `;

const JOIN_SELECT_MIN = `
      id,
      account_id,
      debit,
      credit,
      label,
      partner_name,
      contact_id,
      journal_entry_id,
      accounting_journal_entries!inner (
        id,
        entry_date,
        entry_number,
        reference,
        organization_id,
        status,
        source_type,
        source_number,
        journal_id,
        partner_name,
        contact_id
      )
    `;

function applyPostedLineFilters(q: {
  eq: (col: string, val: string) => typeof q;
  gte: (col: string, val: string) => typeof q;
  lte: (col: string, val: string) => typeof q;
  in: (col: string, val: string[]) => typeof q;
  or: (expr: string) => typeof q;
}, query: LedgerQuery) {
  let next = q.eq('accounting_journal_entries.status', 'posted');
  if (query.organizationId) {
    next = next.eq(
      'accounting_journal_entries.organization_id',
      query.organizationId
    );
  }
  if (query.dateFrom) {
    next = next.gte('accounting_journal_entries.entry_date', query.dateFrom);
  }
  if (query.dateTo) {
    next = next.lte('accounting_journal_entries.entry_date', query.dateTo);
  }
  if (query.accountIds?.length) {
    next = next.in('account_id', query.accountIds);
  }
  if (query.contactId) {
    next = next.or(
      `contact_id.eq.${query.contactId},accounting_journal_entries.contact_id.eq.${query.contactId}`
    );
  }
  return next;
}

function factsFromJoinedRows(
  rows: Record<string, unknown>[],
  journals: Map<string, { code: string | null; name: string | null }>
): LedgerFact[] {
  const facts: LedgerFact[] = [];
  for (const row of rows) {
    const entryRaw = row.accounting_journal_entries;
    const entry = Array.isArray(entryRaw) ? entryRaw[0] : entryRaw;
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const jid = e.journal_id ? String(e.journal_id) : null;
    facts.push(mapFact(row, e, jid ? journals.get(jid) : null));
  }
  return facts;
}

/**
 * Load posted journal item facts for an organization and optional date window.
 * Pages past the PostgREST 1000-row default so reports cannot silently drop items.
 */
export async function loadPostedLedgerFacts(
  query: LedgerQuery
): Promise<LedgerFact[]> {
  const supabase = await createAdminClient();
  const rows: Record<string, unknown>[] = [];
  let select = JOIN_SELECT_FULL;
  let from = 0;

  for (;;) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = applyPostedLineFilters(
      supabase.from('accounting_journal_entry_lines').select(select) as never,
      query
    );
    const { data, error } = await q
      .order('id', { ascending: true })
      .range(from, from + LEDGER_PAGE_SIZE - 1);
    if (error) {
      if (from === 0 && select === JOIN_SELECT_FULL) {
        select = JOIN_SELECT_MIN;
        continue;
      }
      if (from === 0) return loadPostedLedgerFactsTwoStep(query);
      throw new Error(error.message);
    }
    const batch = asUnknownRows(data);
    rows.push(...batch);
    if (batch.length < LEDGER_PAGE_SIZE) break;
    from += LEDGER_PAGE_SIZE;
    if (from > 500_000) break;
  }

  const journalIds = [
    ...new Set(
      rows
        .map((row) => {
          const entryRaw = row.accounting_journal_entries;
          const entry = Array.isArray(entryRaw) ? entryRaw[0] : entryRaw;
          if (!entry || typeof entry !== 'object') return null;
          const jid = (entry as Record<string, unknown>).journal_id;
          return jid ? String(jid) : null;
        })
        .filter(Boolean) as string[]
    ),
  ];
  const journals = await loadJournalMap(journalIds);
  return factsFromJoinedRows(rows, journals);
}

const ENTRY_SELECT_FULL =
  'id, entry_date, entry_number, reference, organization_id, source_type, source_id, source_number, journal_id, partner_name, contact_id';
const ENTRY_SELECT_MIN =
  'id, entry_date, entry_number, reference, organization_id, source_type, source_number, journal_id, partner_name, contact_id';
const LINE_SELECT_FULL =
  'id, journal_entry_id, account_id, debit, credit, label, partner_name, contact_id, amount_residual, is_reconciled, tax_label';
const LINE_SELECT_MIN =
  'id, journal_entry_id, account_id, debit, credit, label, partner_name, contact_id';

async function loadPostedLedgerFactsTwoStep(
  query: LedgerQuery
): Promise<LedgerFact[]> {
  const supabase = await createAdminClient();
  const entries: Record<string, unknown>[] = [];
  let entrySelect = ENTRY_SELECT_FULL;
  let from = 0;
  for (;;) {
    let eq = supabase
      .from('accounting_journal_entries')
      .select(entrySelect)
      .eq('status', 'posted')
      .order('id', { ascending: true })
      .range(from, from + LEDGER_PAGE_SIZE - 1);

    if (query.organizationId) {
      eq = eq.eq('organization_id', query.organizationId);
    }
    if (query.dateFrom) eq = eq.gte('entry_date', query.dateFrom);
    if (query.dateTo) eq = eq.lte('entry_date', query.dateTo);
    if (query.contactId) eq = eq.eq('contact_id', query.contactId);

    const { data, error } = await eq;
    if (error) {
      if (from === 0 && /source_id|column/i.test(error.message)) {
        entrySelect = ENTRY_SELECT_MIN;
        continue;
      }
      throw new Error(error.message);
    }
    const batch = data || [];
    entries.push(...asUnknownRows(batch));
    if (batch.length < LEDGER_PAGE_SIZE) break;
    from += LEDGER_PAGE_SIZE;
    if (from > 500_000) break;
  }
  if (!entries.length) return [];

  const journalIds = [
    ...new Set(
      entries
        .map((e) => (e.journal_id ? String(e.journal_id) : null))
        .filter(Boolean) as string[]
    ),
  ];
  const journals = await loadJournalMap(journalIds);

  const entryMap = new Map(
    entries.map((e) => [
      String(e.id),
      {
        id: String(e.id),
        entry_date: String(e.entry_date || '').slice(0, 10),
        entry_number: e.entry_number ? String(e.entry_number) : null,
        reference: e.reference ? String(e.reference) : null,
        organization_id: String(e.organization_id || ''),
        source_type: e.source_type ? String(e.source_type) : null,
        source_id: e.source_id ? String(e.source_id) : null,
        source_number: e.source_number ? String(e.source_number) : null,
        journal_id: e.journal_id ? String(e.journal_id) : null,
        partner_name: e.partner_name ? String(e.partner_name) : null,
        contact_id: e.contact_id ? String(e.contact_id) : null,
      },
    ])
  );
  const ids = [...entryMap.keys()];
  const facts: LedgerFact[] = [];

  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    let lineSelect = LINE_SELECT_FULL;
    let lineFrom = 0;
    for (;;) {
      let lq = supabase
        .from('accounting_journal_entry_lines')
        .select(lineSelect)
        .in('journal_entry_id', chunk)
        .order('id', { ascending: true })
        .range(lineFrom, lineFrom + LEDGER_PAGE_SIZE - 1);
      if (query.accountIds?.length) {
        lq = lq.in('account_id', query.accountIds);
      }
      const { data: lines, error: lErr } = await lq;
      if (lErr) {
        if (lineFrom === 0 && lineSelect === LINE_SELECT_FULL) {
          lineSelect = LINE_SELECT_MIN;
          continue;
        }
        throw new Error(lErr.message);
      }
      const batch = asUnknownRows(lines);
      for (const line of batch) {
        const e = entryMap.get(String(line.journal_entry_id));
        if (!e) continue;
        if (query.contactId) {
          const cid = line.contact_id || e.contact_id;
          if (cid !== query.contactId) continue;
        }
        const j = e.journal_id ? journals.get(String(e.journal_id)) : null;
        facts.push(mapFact(line, e as Record<string, unknown>, j));
      }
      if (batch.length < LEDGER_PAGE_SIZE) break;
      lineFrom += LEDGER_PAGE_SIZE;
      if (lineFrom > 500_000) break;
    }
  }
  return facts;
}

export function aggregateAccountBalances(
  facts: LedgerFact[],
  accounts: AccountMeta[]
): AccountBalance[] {
  const meta = new Map(accounts.map((a) => [a.id, a]));
  const totals = new Map<string, { debit: number; credit: number }>();

  for (const f of facts) {
    if (!f.account_id) {
      const cur = totals.get('__unmapped__') || { debit: 0, credit: 0 };
      cur.debit += f.debit;
      cur.credit += f.credit;
      totals.set('__unmapped__', cur);
      continue;
    }
    const cur = totals.get(f.account_id) || { debit: 0, credit: 0 };
    cur.debit += f.debit;
    cur.credit += f.credit;
    totals.set(f.account_id, cur);
  }

  const result: AccountBalance[] = [];
  for (const [accountId, t] of totals) {
    const a = meta.get(accountId);
    if (a?.type === 'view') continue;
    const debit = round2(t.debit);
    const credit = round2(t.credit);
    result.push({
      account_id: accountId,
      code: a?.code || 'UNMAPPED',
      name: a?.name || `Unmapped account (${accountId.slice(0, 8)})`,
      type: a?.type || 'asset',
      account_type: a?.account_type || null,
      debit,
      credit,
      balance: signedBalance(a?.type || 'asset', debit, credit),
    });
  }

  return result.sort((a, b) => a.code.localeCompare(b.code));
}

/** PostgREST default cap is 1000 — page until exhausted. */
export const LEDGER_PAGE_SIZE = 1000;

/** Split posted facts already loaded through dateTo into opening / period / closing. */
export function splitFactsByPeriod(
  facts: LedgerFact[],
  dateFrom: string,
  dateTo: string
) {
  const from = String(dateFrom || '').slice(0, 10);
  const to = String(dateTo || '').slice(0, 10);
  const opening: LedgerFact[] = [];
  const period: LedgerFact[] = [];
  const closing: LedgerFact[] = [];
  for (const f of facts) {
    const d = String(f.entry_date || '').slice(0, 10);
    if (!d || (to && d > to)) continue;
    closing.push(f);
    if (from && d < from) opening.push(f);
    else if (!to || d <= to) period.push(f);
  }
  return { opening, period, closing };
}

/** Day before YYYY-MM-DD, or null. */
export function dayBefore(isoDate: string): string | null {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function startOfCalendarYear(isoDate: string): string {
  const y = Number(String(isoDate).slice(0, 4));
  if (!Number.isFinite(y)) return `${new Date().getUTCFullYear()}-01-01`;
  return `${y}-01-01`;
}

/** Raw debit−credit signed amount (Odoo TB / GL display convention). */
export function rawDebitCreditBalance(debit: number, credit: number) {
  return round2(debit - credit);
}
