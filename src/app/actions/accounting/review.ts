'use server';

/**
 * Accounting Review — Journal Items, Journal Audit, Audit Trail.
 * Source of truth: accounting_journal_entries + accounting_journal_entry_lines.
 */

import { createAdminClient } from '@/utils/supabase/server';
import { requireAccountingActionAccess } from '@/lib/accounting-page-access';
import {
  requireAdminOrganizationScope,
  sessionUsesOrganizationScope,
} from '@/lib/admin-organization-context';
import type {
  AccountingJournalEntrySourceType,
  AccountingJournalEntryStatus,
} from '@/app/actions/accounting/journal-entries';
import { buildDeferredReviewReport } from '@/lib/accounting/financial-reporting/deferred-report';
import {
  buildAnnualReport,
  loadFiscalYearsForOrg,
} from '@/lib/accounting/financial-reporting/annual-report';
import type { AnnualReportFiscalYear } from '@/lib/accounting/financial-reporting/annual-report';
import { resolveDatePeriod } from '@/lib/accounting/financial-reporting/periods';

function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export type ReviewGroupBy =
  | 'none'
  | 'journal'
  | 'account'
  | 'partner'
  | 'organization'
  | 'status'
  | 'date_day'
  | 'date_month'
  | 'date_year';

export type ReviewJournalItem = {
  line_id: string;
  journal_entry_id: string;
  entry_number: string;
  entry_date: string;
  journal_id: string;
  journal_code: string | null;
  journal_name: string | null;
  account_id: string;
  account_code: string | null;
  account_name: string | null;
  partner_name: string | null;
  contact_id: string | null;
  label: string;
  debit: number;
  credit: number;
  currency: string;
  organization_id: string;
  organization_name: string | null;
  status: AccountingJournalEntryStatus;
  source_type: AccountingJournalEntrySourceType | string | null;
  source_id: string | null;
  source_number: string | null;
  reference: string;
  is_manual: boolean;
  created_by: string | null;
  created_at: string;
  matching: string | null;
  amount_residual: number | null;
};

export type JournalAuditReportRow = {
  journal_id: string;
  journal_code: string | null;
  journal_name: string;
  documents: number;
  to_review: number;
  total_debit: number;
  total_credit: number;
  balance: number;
};

export type JournalAuditReport = {
  year: number;
  currency: string;
  rows: JournalAuditReportRow[];
  totals: {
    documents: number;
    to_review: number;
    total_debit: number;
    total_credit: number;
    balance: number;
  };
};

export type ReviewJournalItemGroup = {
  key: string;
  label: string;
  count: number;
  total_debit: number;
  total_credit: number;
  balance: number;
  items: ReviewJournalItem[];
};

export type JournalAuditEvent = {
  id: string;
  journal_entry_id: string;
  entry_number: string | null;
  entry_date: string | null;
  source_type: string | null;
  source_id: string | null;
  source_number: string | null;
  organization_id: string | null;
  organization_name: string | null;
  action: string;
  performed_by: string | null;
  previous_status: string | null;
  new_status: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type AuditTrailEntry = {
  id: string;
  source:
    | 'journal_entry_log'
    | 'audit_log'
    | 'reconciliation_log'
    | 'asset_log'
    | 'loan_log';
  performed_at: string;
  performed_by: string | null;
  organization_id: string | null;
  organization_name: string | null;
  module: string;
  record_label: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  previous_value: unknown;
  new_value: unknown;
  description: string;
};

async function resolveReviewScope(requireAudit = false) {
  const gate = await requireAccountingActionAccess(
    requireAudit ? { reports: true } : undefined
  );
  if ('error' in gate) return { error: gate.error };

  const session = gate.session!;
  if (!sessionUsesOrganizationScope(session.role)) {
    return {
      session,
      organizationId: null as string | null,
      isGlobalAdminView: false,
    };
  }

  const orgScope = await requireAdminOrganizationScope();
  if ('error' in orgScope) {
    if (orgScope.status === 403) {
      return {
        session,
        organizationId: null as string | null,
        isGlobalAdminView: false,
        empty: true as const,
      };
    }
    return { error: orgScope.error };
  }

  if (!orgScope.organizationId) {
    return { error: 'Select an organization from the header switcher.' };
  }

  return {
    session: orgScope.session,
    organizationId: orgScope.organizationId,
    isGlobalAdminView: false,
  };
}

type EntryRow = Record<string, unknown>;

async function fetchFilteredEntryIds(opts: {
  organizationId: string | null;
  isGlobalAdminView: boolean;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  journalId?: string;
  contactId?: string;
  search?: string;
  limit?: number;
}): Promise<{ ids: string[]; entryMap: Map<string, EntryRow> }> {
  const supabase = await createAdminClient();
  const limit = opts.limit ?? 8000;

  let q = supabase
    .from('accounting_journal_entries')
    .select(
      'id, entry_number, entry_date, journal_id, reference, partner_name, contact_id, organization_id, status, source_type, source_id, source_number, currency, created_by, created_at, is_manual'
    )
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts.organizationId && !opts.isGlobalAdminView) {
    q = q.eq('organization_id', opts.organizationId);
  }

  const status = String(opts.status || 'all');
  if (status === 'posted' || status === 'draft') {
    q = q.eq('status', status);
  } else if (status === 'all') {
    q = q.neq('status', 'cancelled');
  } else if (status !== 'cancelled') {
    q = q.eq('status', status);
  }

  if (opts.dateFrom) q = q.gte('entry_date', opts.dateFrom);
  if (opts.dateTo) q = q.lte('entry_date', opts.dateTo);
  if (opts.journalId) q = q.eq('journal_id', opts.journalId);
  if (opts.contactId) q = q.eq('contact_id', opts.contactId);

  const search = String(opts.search || '').trim();
  if (search) {
    const like = `%${search.replace(/[%_,]/g, ' ')}%`;
    q = q.or(
      `entry_number.ilike.${like},reference.ilike.${like},partner_name.ilike.${like},source_number.ilike.${like}`
    );
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = data || [];
  const entryMap = new Map(rows.map((r) => [String(r.id), r as EntryRow]));
  return { ids: rows.map((r) => String(r.id)), entryMap };
}

function mapReviewItem(
  line: Record<string, unknown>,
  entry: EntryRow,
  journal?: { code: string | null; name: string | null } | null,
  account?: { code: string | null; name: string | null } | null,
  org?: { name: string | null } | null
): ReviewJournalItem {
  const linePartner = line.partner_name ? String(line.partner_name) : null;
  const entryPartner = entry.partner_name ? String(entry.partner_name) : null;
  return {
    line_id: String(line.id),
    journal_entry_id: String(entry.id),
    entry_number: String(entry.entry_number || ''),
    entry_date: String(entry.entry_date || '').slice(0, 10),
    journal_id: String(entry.journal_id || ''),
    journal_code: journal?.code ?? null,
    journal_name: journal?.name ?? null,
    account_id: String(line.account_id || ''),
    account_code: account?.code ?? null,
    account_name: account?.name ?? null,
    partner_name: linePartner || entryPartner,
    contact_id: line.contact_id
      ? String(line.contact_id)
      : entry.contact_id
        ? String(entry.contact_id)
        : null,
    label: String(line.label || ''),
    debit: round2(Number(line.debit) || 0),
    credit: round2(Number(line.credit) || 0),
    currency: String(entry.currency || 'PKR'),
    organization_id: String(entry.organization_id || ''),
    organization_name: org?.name ?? null,
    status: String(entry.status || 'draft') as AccountingJournalEntryStatus,
    source_type: entry.source_type ? String(entry.source_type) : null,
    source_id: entry.source_id ? String(entry.source_id) : null,
    source_number: entry.source_number ? String(entry.source_number) : null,
    reference: String(entry.reference || ''),
    is_manual: Boolean(entry.is_manual),
    created_by: entry.created_by ? String(entry.created_by) : null,
    created_at: String(entry.created_at || ''),
    matching: line.matching ? String(line.matching) : null,
    amount_residual:
      line.amount_residual !== undefined && line.amount_residual !== null
        ? round2(Number(line.amount_residual))
        : null,
  };
}

function groupKeyForItem(item: ReviewJournalItem, groupBy: ReviewGroupBy): string {
  switch (groupBy) {
    case 'journal':
      return item.journal_id || 'unknown';
    case 'account':
      return item.account_id || 'unknown';
    case 'partner':
      return item.partner_name?.trim() || '(No partner)';
    case 'organization':
      return item.organization_id || 'unknown';
    case 'status':
      return item.status;
    case 'date_day':
      return item.entry_date.slice(0, 10);
    case 'date_month':
      return item.entry_date.slice(0, 7);
    case 'date_year':
      return item.entry_date.slice(0, 4);
    default:
      return 'all';
  }
}

function groupLabelForKey(
  key: string,
  groupBy: ReviewGroupBy,
  sample: ReviewJournalItem
): string {
  switch (groupBy) {
    case 'journal':
      return sample.journal_code
        ? `${sample.journal_code} — ${sample.journal_name || ''}`.trim()
        : sample.journal_name || key;
    case 'account':
      return sample.account_code
        ? `${sample.account_code} ${sample.account_name || ''}`.trim()
        : sample.account_name || key;
    case 'partner':
      return key;
    case 'organization':
      return sample.organization_name || key;
    case 'status':
      return key.charAt(0).toUpperCase() + key.slice(1);
    case 'date_day':
      return key;
    case 'date_month': {
      const [y, m] = key.split('-');
      const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      const mi = Math.max(0, Number(m || 1) - 1);
      return `${months[mi]} ${y}`;
    }
    case 'date_year':
      return key;
    default:
      return key;
  }
}

/** Paginated journal items for Review → Control → Journal Items. */
export async function getAccountingJournalItemsForReview(filters?: {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  journalId?: string;
  accountId?: string;
  contactId?: string;
  groupBy?: ReviewGroupBy;
  page?: number;
  pageSize?: number;
}) {
  try {
    const scope = await resolveReviewScope(false);
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return {
        items: [] as ReviewJournalItem[],
        groups: [] as ReviewJournalItemGroup[],
        total: 0,
        total_debit: 0,
        total_credit: 0,
        page: 1,
        pageSize: 40,
        grouped: false,
        truncated: false,
      };
    }

    const supabase = await createAdminClient();
    const page = Math.max(1, filters?.page || 1);
    const pageSize = Math.min(100, Math.max(1, filters?.pageSize || 40));
    const groupBy = filters?.groupBy || 'none';
    const search = String(filters?.search || '').trim();

    const { ids: entryIds, entryMap } = await fetchFilteredEntryIds({
      organizationId: scope.organizationId ?? null,
      isGlobalAdminView: scope.isGlobalAdminView ?? false,
      status: filters?.status || 'posted',
      dateFrom: filters?.dateFrom,
      dateTo: filters?.dateTo,
      journalId: filters?.journalId,
      contactId: filters?.contactId,
      search: search || undefined,
    });

    if (!entryIds.length) {
      return {
        items: [],
        groups: [],
        total: 0,
        total_debit: 0,
        total_credit: 0,
        page,
        pageSize,
        grouped: groupBy !== 'none',
        truncated: false,
      };
    }

    let lineQ = supabase
      .from('accounting_journal_entry_lines')
      .select(
        'id, journal_entry_id, sequence, account_id, label, partner_name, contact_id, debit, credit, amount_residual, is_reconciled'
      )
      .in('journal_entry_id', entryIds)
      .order('sequence', { ascending: true });

    if (filters?.accountId) {
      lineQ = lineQ.eq('account_id', filters.accountId);
    }

    if (search) {
      const like = `%${search.replace(/[%_,]/g, ' ')}%`;
      lineQ = lineQ.or(`label.ilike.${like},partner_name.ilike.${like}`);
    }

    let rawLines: Record<string, unknown>[] = [];
    const { data: lines, error: lineErr } = await lineQ.limit(12000);
    if (lineErr) {
      if (/amount_residual|is_reconciled|column/i.test(lineErr.message)) {
        let fallbackQ = supabase
          .from('accounting_journal_entry_lines')
          .select(
            'id, journal_entry_id, sequence, account_id, label, partner_name, contact_id, debit, credit'
          )
          .in('journal_entry_id', entryIds)
          .order('sequence', { ascending: true });
        if (filters?.accountId) {
          fallbackQ = fallbackQ.eq('account_id', filters.accountId);
        }
        if (search) {
          const like = `%${search.replace(/[%_,]/g, ' ')}%`;
          fallbackQ = fallbackQ.or(`label.ilike.${like},partner_name.ilike.${like}`);
        }
        const retry = await fallbackQ.limit(12000);
        if (retry.error) return { error: retry.error.message };
        rawLines = (retry.data || []) as Record<string, unknown>[];
      } else {
        return { error: lineErr.message };
      }
    } else {
      rawLines = (lines || []) as Record<string, unknown>[];
    }
    const truncated = rawLines.length >= 12000 || entryIds.length >= 8000;

    const accountIds = [...new Set(rawLines.map((l) => String(l.account_id)))];
    const journalIds = [
      ...new Set(
        entryIds
          .map((id) => entryMap.get(id)?.journal_id)
          .filter(Boolean)
          .map(String)
      ),
    ];
    const orgIds = [
      ...new Set(
        entryIds
          .map((id) => entryMap.get(id)?.organization_id)
          .filter(Boolean)
          .map(String)
      ),
    ];

    const [{ data: accounts }, { data: journals }, { data: orgs }] =
      await Promise.all([
        accountIds.length
          ? supabase
              .from('chart_of_accounts')
              .select('id, code, name')
              .in('id', accountIds)
          : Promise.resolve({ data: [] }),
        journalIds.length
          ? supabase.from('journals').select('id, code, name').in('id', journalIds)
          : Promise.resolve({ data: [] }),
        orgIds.length
          ? supabase.from('organizations').select('id, name').in('id', orgIds)
          : Promise.resolve({ data: [] }),
      ]);

    const aMap = new Map((accounts || []).map((a) => [String(a.id), a]));
    const jMap = new Map((journals || []).map((j) => [String(j.id), j]));
    const oMap = new Map((orgs || []).map((o) => [String(o.id), o]));

    const allItems: ReviewJournalItem[] = [];
    for (const line of rawLines) {
      const entry = entryMap.get(String(line.journal_entry_id));
      if (!entry) continue;
      const debit = round2(Number(line.debit) || 0);
      const credit = round2(Number(line.credit) || 0);
      if (debit <= 0.004 && credit <= 0.004) continue;

      const journal = jMap.get(String(entry.journal_id || ''));
      const account = aMap.get(String(line.account_id || ''));
      const org = oMap.get(String(entry.organization_id || ''));
      const enriched = {
        ...line,
        matching: line.is_reconciled ? 'Reconciled' : null,
      };
      allItems.push(
        mapReviewItem(enriched, entry, journal, account, org)
      );
    }

    // Sort by entry date desc, then sequence
    allItems.sort((a, b) => {
      const d = b.entry_date.localeCompare(a.entry_date);
      if (d !== 0) return d;
      return a.line_id.localeCompare(b.line_id);
    });

    const total_debit = round2(allItems.reduce((s, i) => s + i.debit, 0));
    const total_credit = round2(allItems.reduce((s, i) => s + i.credit, 0));

    if (groupBy !== 'none') {
      const groupMap = new Map<string, ReviewJournalItem[]>();
      for (const item of allItems) {
        const key = groupKeyForItem(item, groupBy);
        const arr = groupMap.get(key) || [];
        arr.push(item);
        groupMap.set(key, arr);
      }

      const groups: ReviewJournalItemGroup[] = [...groupMap.entries()]
        .map(([key, items]) => {
          const td = round2(items.reduce((s, i) => s + i.debit, 0));
          const tc = round2(items.reduce((s, i) => s + i.credit, 0));
          return {
            key,
            label: groupLabelForKey(key, groupBy, items[0]),
            count: items.length,
            total_debit: td,
            total_credit: tc,
            balance: round2(td - tc),
            items,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label));

      const from = (page - 1) * pageSize;
      const pagedGroups = groups.slice(from, from + pageSize);

      return {
        items: [] as ReviewJournalItem[],
        groups: pagedGroups,
        total: groups.length,
        total_debit,
        total_credit,
        page,
        pageSize,
        grouped: true,
        truncated,
      };
    }

    const total = allItems.length;
    const from = (page - 1) * pageSize;
    const pagedItems = allItems.slice(from, from + pageSize);

    return {
      items: pagedItems,
      groups: [] as ReviewJournalItemGroup[],
      total,
      total_debit,
      total_credit,
      page,
      pageSize,
      grouped: false,
      truncated,
    };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to load journal items',
    };
  }
}

/** Journal entry lifecycle events for Review → Control → Journal Audit. */
export async function getAccountingJournalAuditEvents(filters?: {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}) {
  try {
    const scope = await resolveReviewScope(true);
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { events: [] as JournalAuditEvent[], total: 0, page: 1, pageSize: 40 };
    }

    const supabase = await createAdminClient();
    const page = Math.max(1, filters?.page || 1);
    const pageSize = Math.min(100, Math.max(1, filters?.pageSize || 40));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = supabase
      .from('accounting_journal_entry_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.eq('organization_id', scope.organizationId);
    }

    if (filters?.dateFrom) {
      q = q.gte('created_at', `${filters.dateFrom}T00:00:00`);
    }
    if (filters?.dateTo) {
      q = q.lte('created_at', `${filters.dateTo}T23:59:59`);
    }

    const search = String(filters?.search || '').trim();
    if (search) {
      const like = `%${search.replace(/[%_,]/g, ' ')}%`;
      q = q.or(`action.ilike.${like},performed_by.ilike.${like}`);
    }

    const status = String(filters?.status || '').trim();
    if (status === 'posted' || status === 'draft') {
      q = q.eq('new_status', status);
    }

    const { data, error, count } = await q;
    if (error) {
      if (/accounting_journal_entry_logs|relation/i.test(error.message)) {
        return { events: [], total: 0, page, pageSize };
      }
      return { error: error.message };
    }

    const rows = data || [];
    const entryIds = [
      ...new Set(rows.map((r) => String(r.journal_entry_id)).filter(Boolean)),
    ];

    const [{ data: entries }, { data: orgs }] = await Promise.all([
      entryIds.length
        ? supabase
            .from('accounting_journal_entries')
            .select(
              'id, entry_number, entry_date, source_type, source_id, source_number, organization_id'
            )
            .in('id', entryIds)
        : Promise.resolve({ data: [] }),
      scope.isGlobalAdminView
        ? supabase.from('organizations').select('id, name').limit(500)
        : scope.organizationId
          ? supabase
              .from('organizations')
              .select('id, name')
              .eq('id', scope.organizationId)
          : Promise.resolve({ data: [] }),
    ]);

    const eMap = new Map((entries || []).map((e) => [String(e.id), e]));
    const oMap = new Map((orgs || []).map((o) => [String(o.id), o]));

    const events: JournalAuditEvent[] = rows.map((r) => {
      const entry = eMap.get(String(r.journal_entry_id));
      const org = entry
        ? oMap.get(String(entry.organization_id))
        : r.organization_id
          ? oMap.get(String(r.organization_id))
          : null;
      return {
        id: String(r.id),
        journal_entry_id: String(r.journal_entry_id),
        entry_number: entry ? String(entry.entry_number || '') : null,
        entry_date: entry ? String(entry.entry_date || '').slice(0, 10) : null,
        source_type: entry?.source_type ? String(entry.source_type) : null,
        source_id: entry?.source_id ? String(entry.source_id) : null,
        source_number: entry?.source_number ? String(entry.source_number) : null,
        organization_id: entry
          ? String(entry.organization_id)
          : r.organization_id
            ? String(r.organization_id)
            : null,
        organization_name: org?.name ? String(org.name) : null,
        action: String(r.action || ''),
        performed_by: r.performed_by ? String(r.performed_by) : null,
        previous_status: r.previous_status ? String(r.previous_status) : null,
        new_status: r.new_status ? String(r.new_status) : null,
        details: (r.details || {}) as Record<string, unknown>,
        created_at: String(r.created_at || ''),
      };
    });

    return { events, total: count ?? 0, page, pageSize };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to load journal audit',
    };
  }
}

function describeAuditAction(
  action: string,
  previous: unknown,
  next: unknown
): string {
  if (previous != null && next != null && previous !== next) {
    return `${action}: ${JSON.stringify(previous)} → ${JSON.stringify(next)}`;
  }
  return action;
}

/** Unified accounting audit history for Review → Logs → Audit Trail. */
export async function getAccountingReviewAuditTrail(filters?: {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  module?: string;
  page?: number;
  pageSize?: number;
}) {
  try {
    const scope = await resolveReviewScope(true);
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { entries: [] as AuditTrailEntry[], total: 0, page: 1, pageSize: 40 };
    }

    const supabase = await createAdminClient();
    const page = Math.max(1, filters?.page || 1);
    const pageSize = Math.min(50, Math.max(10, filters?.pageSize || 40));
    const fetchLimit = Math.min(500, page * pageSize + pageSize);

    const orgFilter = scope.organizationId && !scope.isGlobalAdminView;

    let jeLogQ = supabase
      .from('accounting_journal_entry_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(fetchLimit);
    if (orgFilter) jeLogQ = jeLogQ.eq('organization_id', scope.organizationId);
    if (filters?.dateFrom) {
      jeLogQ = jeLogQ.gte('created_at', `${filters.dateFrom}T00:00:00`);
    }
    if (filters?.dateTo) {
      jeLogQ = jeLogQ.lte('created_at', `${filters.dateTo}T23:59:59`);
    }

    let auditQ = supabase
      .from('accounting_audit_logs')
      .select('*')
      .order('performed_at', { ascending: false })
      .limit(fetchLimit);
    if (orgFilter) auditQ = auditQ.eq('organization_id', scope.organizationId);
    if (filters?.dateFrom) {
      auditQ = auditQ.gte('performed_at', `${filters.dateFrom}T00:00:00`);
    }
    if (filters?.dateTo) {
      auditQ = auditQ.lte('performed_at', `${filters.dateTo}T23:59:59`);
    }

    const moduleFilter = String(filters?.module || '').trim();
    if (moduleFilter && moduleFilter !== 'all') {
      if (moduleFilter === 'journal_entry') {
        auditQ = auditQ.eq('entity_type', 'journal_entry');
      } else {
        auditQ = auditQ.eq('entity_type', moduleFilter);
      }
    }

    const search = String(filters?.search || '').trim();
    if (search) {
      const like = `%${search.replace(/[%_,]/g, ' ')}%`;
      jeLogQ = jeLogQ.or(`action.ilike.${like},performed_by.ilike.${like}`);
      auditQ = auditQ.or(
        `action.ilike.${like},performed_by.ilike.${like},entity_type.ilike.${like}`
      );
    }

    const [{ data: jeLogs, error: jeErr }, { data: auditLogs, error: auditErr }] =
      await Promise.all([jeLogQ, auditQ]);

    if (jeErr && !/relation|does not exist/i.test(jeErr.message)) {
      return { error: jeErr.message };
    }
    if (auditErr && !/relation|does not exist/i.test(auditErr.message)) {
      return { error: auditErr.message };
    }

    const skipAssetLoan =
      moduleFilter &&
      moduleFilter !== 'all' &&
      moduleFilter !== 'asset' &&
      moduleFilter !== 'loan';

    let assetLogs: Record<string, unknown>[] = [];
    let loanLogs: Record<string, unknown>[] = [];
    if (!skipAssetLoan && (!moduleFilter || moduleFilter === 'all' || moduleFilter === 'asset' || moduleFilter === 'loan')) {
      let assetQ = supabase
        .from('accounting_asset_logs')
        .select('*')
        .order('performed_at', { ascending: false })
        .limit(fetchLimit);
      let loanQ = supabase
        .from('accounting_loan_logs')
        .select('*')
        .order('performed_at', { ascending: false })
        .limit(fetchLimit);
      if (orgFilter) {
        assetQ = assetQ.eq('organization_id', scope.organizationId);
        loanQ = loanQ.eq('organization_id', scope.organizationId);
      }
      if (filters?.dateFrom) {
        assetQ = assetQ.gte('performed_at', `${filters.dateFrom}T00:00:00`);
        loanQ = loanQ.gte('performed_at', `${filters.dateFrom}T00:00:00`);
      }
      if (filters?.dateTo) {
        assetQ = assetQ.lte('performed_at', `${filters.dateTo}T23:59:59`);
        loanQ = loanQ.lte('performed_at', `${filters.dateTo}T23:59:59`);
      }
      if (search) {
        const like = `%${search.replace(/[%_,]/g, ' ')}%`;
        assetQ = assetQ.or(`action.ilike.${like},performed_by.ilike.${like}`);
        loanQ = loanQ.or(`action.ilike.${like},performed_by.ilike.${like}`);
      }
      if (!moduleFilter || moduleFilter === 'all' || moduleFilter === 'asset') {
        const { data, error } = await assetQ;
        if (error && !/relation|does not exist/i.test(error.message)) {
          return { error: error.message };
        }
        assetLogs = (data || []) as Record<string, unknown>[];
      }
      if (!moduleFilter || moduleFilter === 'all' || moduleFilter === 'loan') {
        const { data, error } = await loanQ;
        if (error && !/relation|does not exist/i.test(error.message)) {
          return { error: error.message };
        }
        loanLogs = (data || []) as Record<string, unknown>[];
      }
    }

    const entryIds = [
      ...new Set(
        (jeLogs || [])
          .map((r) => String(r.journal_entry_id))
          .filter(Boolean)
      ),
    ];
    const { data: jeEntries } = entryIds.length
      ? await supabase
          .from('accounting_journal_entries')
          .select('id, entry_number, source_number')
          .in('id', entryIds)
      : { data: [] };
    const eMap = new Map((jeEntries || []).map((e) => [String(e.id), e]));

    const orgIds = new Set<string>();
    for (const r of jeLogs || []) {
      if (r.organization_id) orgIds.add(String(r.organization_id));
    }
    for (const r of auditLogs || []) {
      if (r.organization_id) orgIds.add(String(r.organization_id));
    }
    for (const r of assetLogs) {
      if (r.organization_id) orgIds.add(String(r.organization_id));
    }
    for (const r of loanLogs) {
      if (r.organization_id) orgIds.add(String(r.organization_id));
    }
    const { data: orgs } = orgIds.size
      ? await supabase
          .from('organizations')
          .select('id, name')
          .in('id', [...orgIds])
      : { data: [] };
    const oMap = new Map((orgs || []).map((o) => [String(o.id), o]));

    const assetIds = [
      ...new Set(assetLogs.map((r) => String(r.asset_id || '')).filter(Boolean)),
    ];
    const loanIds = [
      ...new Set(loanLogs.map((r) => String(r.loan_id || '')).filter(Boolean)),
    ];
    const [{ data: assetRows }, { data: loanRows }] = await Promise.all([
      assetIds.length
        ? supabase
            .from('accounting_assets')
            .select('id, asset_number, name')
            .in('id', assetIds)
        : Promise.resolve({ data: [] as { id: string; asset_number?: string; name?: string }[] }),
      loanIds.length
        ? supabase
            .from('accounting_loans')
            .select('id, loan_number, name')
            .in('id', loanIds)
        : Promise.resolve({ data: [] as { id: string; loan_number?: string; name?: string }[] }),
    ]);
    const assetMap = new Map((assetRows || []).map((a) => [String(a.id), a]));
    const loanMap = new Map((loanRows || []).map((l) => [String(l.id), l]));

    const merged: AuditTrailEntry[] = [];

    for (const r of jeLogs || []) {
      const entry = eMap.get(String(r.journal_entry_id));
      const orgId = r.organization_id ? String(r.organization_id) : null;
      const org = orgId ? oMap.get(orgId) : null;
      const entryLabel = entry
        ? String(entry.source_number || entry.entry_number || r.journal_entry_id)
        : String(r.journal_entry_id);
      merged.push({
        id: `jel:${r.id}`,
        source: 'journal_entry_log',
        performed_at: String(r.created_at || ''),
        performed_by: r.performed_by ? String(r.performed_by) : null,
        organization_id: orgId,
        organization_name: org?.name ? String(org.name) : null,
        module: 'Journal Entry',
        record_label: entryLabel,
        entity_type: 'journal_entry',
        entity_id: String(r.journal_entry_id),
        action: String(r.action || ''),
        previous_value: r.previous_status,
        new_value: r.new_status,
        description: describeAuditAction(
          String(r.action || ''),
          r.previous_status,
          r.new_status
        ),
      });
    }

    for (const r of auditLogs || []) {
      const orgId = r.organization_id ? String(r.organization_id) : null;
      const org = orgId ? oMap.get(orgId) : null;
      merged.push({
        id: `aud:${r.id}`,
        source: 'audit_log',
        performed_at: String(r.performed_at || ''),
        performed_by: r.performed_by ? String(r.performed_by) : null,
        organization_id: orgId,
        organization_name: org?.name ? String(org.name) : null,
        module: String(r.entity_type || 'Accounting'),
        record_label: r.entity_id ? String(r.entity_id).slice(0, 8) : '—',
        entity_type: String(r.entity_type || ''),
        entity_id: r.entity_id ? String(r.entity_id) : null,
        action: String(r.action || ''),
        previous_value: r.previous_value,
        new_value: r.new_value,
        description: describeAuditAction(
          String(r.action || ''),
          r.previous_value,
          r.new_value
        ),
      });
    }

    for (const r of assetLogs) {
      const orgId = r.organization_id ? String(r.organization_id) : null;
      const org = orgId ? oMap.get(orgId) : null;
      const asset = assetMap.get(String(r.asset_id || ''));
      merged.push({
        id: `asset:${r.id}`,
        source: 'asset_log',
        performed_at: String(r.performed_at || ''),
        performed_by: r.performed_by ? String(r.performed_by) : null,
        organization_id: orgId,
        organization_name: org?.name ? String(org.name) : null,
        module: 'Assets',
        record_label: asset
          ? String(asset.asset_number || asset.name || r.asset_id)
          : String(r.asset_id || '—'),
        entity_type: 'asset',
        entity_id: r.asset_id ? String(r.asset_id) : null,
        action: String(r.action || ''),
        previous_value: r.previous_status,
        new_value: r.new_status,
        description: describeAuditAction(
          String(r.action || ''),
          r.previous_status,
          r.new_status
        ),
      });
    }

    for (const r of loanLogs) {
      const orgId = r.organization_id ? String(r.organization_id) : null;
      const org = orgId ? oMap.get(orgId) : null;
      const loan = loanMap.get(String(r.loan_id || ''));
      merged.push({
        id: `loan:${r.id}`,
        source: 'loan_log',
        performed_at: String(r.performed_at || ''),
        performed_by: r.performed_by ? String(r.performed_by) : null,
        organization_id: orgId,
        organization_name: org?.name ? String(org.name) : null,
        module: 'Loans',
        record_label: loan
          ? String(loan.loan_number || loan.name || r.loan_id)
          : String(r.loan_id || '—'),
        entity_type: 'loan',
        entity_id: r.loan_id ? String(r.loan_id) : null,
        action: String(r.action || ''),
        previous_value: r.previous_status,
        new_value: r.new_status,
        description: describeAuditAction(
          String(r.action || ''),
          r.previous_status,
          r.new_status
        ),
      });
    }

    merged.sort(
      (a, b) =>
        new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime()
    );

    const total = merged.length;
    const from = (page - 1) * pageSize;
    const pagedEntries = merged.slice(from, from + pageSize);

    return { entries: pagedEntries, total, page, pageSize };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to load audit trail',
    };
  }
}

/** Journal Audit report — Odoo-style summary grouped by journal. */
export async function getAccountingJournalAuditReport(filters?: {
  year?: number;
  postedOnly?: boolean;
}) {
  try {
    const scope = await resolveReviewScope(true);
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return {
        report: {
          year: filters?.year || new Date().getFullYear(),
          currency: 'PKR',
          rows: [],
          totals: {
            documents: 0,
            to_review: 0,
            total_debit: 0,
            total_credit: 0,
            balance: 0,
          },
        } satisfies JournalAuditReport,
      };
    }

    const supabase = await createAdminClient();
    const year = filters?.year || new Date().getFullYear();
    const dateFrom = `${year}-01-01`;
    const dateTo = `${year}-12-31`;
    const postedOnly = filters?.postedOnly !== false;

    let q = supabase
      .from('accounting_journal_entries')
      .select(
        'id, journal_id, status, total_debit, total_credit, entry_date, organization_id'
      )
      .gte('entry_date', dateFrom)
      .lte('entry_date', dateTo)
      .neq('status', 'cancelled');

    if (postedOnly) q = q.eq('status', 'posted');
    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.eq('organization_id', scope.organizationId);
    }

    const { data: entries, error } = await q.limit(10000);
    if (error) return { error: error.message };

    const journalIds = [
      ...new Set((entries || []).map((e) => String(e.journal_id)).filter(Boolean)),
    ];
    const { data: journals } = journalIds.length
      ? await supabase.from('journals').select('id, code, name').in('id', journalIds)
      : { data: [] };

    const jMap = new Map((journals || []).map((j) => [String(j.id), j]));
    const byJournal = new Map<string, JournalAuditReportRow>();

    for (const e of entries || []) {
      const jid = String(e.journal_id || 'unknown');
      const j = jMap.get(jid);
      const cur =
        byJournal.get(jid) ||
        ({
          journal_id: jid,
          journal_code: j?.code ? String(j.code) : null,
          journal_name: j?.name ? String(j.name) : 'Unknown Journal',
          documents: 0,
          to_review: 0,
          total_debit: 0,
          total_credit: 0,
          balance: 0,
        } satisfies JournalAuditReportRow);

      cur.documents += 1;
      if (String(e.status) === 'draft') cur.to_review += 1;
      cur.total_debit = round2(cur.total_debit + (Number(e.total_debit) || 0));
      cur.total_credit = round2(cur.total_credit + (Number(e.total_credit) || 0));
      cur.balance = round2(cur.total_debit - cur.total_credit);
      byJournal.set(jid, cur);
    }

    const rows = [...byJournal.values()].sort((a, b) =>
      (a.journal_code || a.journal_name).localeCompare(
        b.journal_code || b.journal_name
      )
    );

    const totals = rows.reduce(
      (acc, r) => ({
        documents: acc.documents + r.documents,
        to_review: acc.to_review + r.to_review,
        total_debit: round2(acc.total_debit + r.total_debit),
        total_credit: round2(acc.total_credit + r.total_credit),
        balance: round2(acc.balance + r.balance),
      }),
      {
        documents: 0,
        to_review: 0,
        total_debit: 0,
        total_credit: 0,
        balance: 0,
      }
    );

    return {
      report: {
        year,
        currency: 'PKR',
        rows,
        totals,
      } satisfies JournalAuditReport,
    };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to build journal audit report',
    };
  }
}

/** Filter options for Review journal items (journals + accounts). */
export async function getAccountingReviewFilterOptions() {
  try {
    const scope = await resolveReviewScope(false);
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { journals: [], accounts: [] };
    }

    const supabase = await createAdminClient();
    let journalQ = supabase
      .from('journals')
      .select('id, code, name, type')
      .eq('is_active', true)
      .order('code', { ascending: true });
    let accountQ = supabase
      .from('chart_of_accounts')
      .select('id, code, name, type')
      .eq('is_active', true)
      .order('code', { ascending: true });

    if (scope.organizationId && !scope.isGlobalAdminView) {
      journalQ = journalQ.or(
        `organization_id.eq.${scope.organizationId},organization_id.is.null`
      );
      accountQ = accountQ.or(
        `organization_id.eq.${scope.organizationId},organization_id.is.null`
      );
    }

    const [{ data: journals }, { data: accounts }] = await Promise.all([
      journalQ.limit(200),
      accountQ.limit(500),
    ]);

    return {
      journals: (journals || []).map((j) => ({
        id: String(j.id),
        code: String(j.code || ''),
        name: String(j.name || ''),
      })),
      accounts: (accounts || []).map((a) => ({
        id: String(a.id),
        code: String(a.code || ''),
        name: String(a.name || ''),
      })),
    };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to load filter options',
    };
  }
}

// ---------------------------------------------------------------------------
// Phase 2 — Loans Analysis, Invoices To Be Issued, Working Files
// ---------------------------------------------------------------------------

export type ReviewLoanGroupBy =
  | 'none'
  | 'status'
  | 'organization'
  | 'currency'
  | 'date_year';

export type ReviewLoanAnalysisItem = {
  id: string;
  loan_number: string;
  name: string;
  lender_name: string | null;
  organization_id: string;
  organization_name: string | null;
  currency: string;
  start_date: string;
  end_date: string | null;
  principal_amount: number;
  principal_paid: number;
  total_interest: number;
  interest_paid: number;
  remaining_principal: number;
  remaining_interest: number;
  remaining_balance: number;
  next_installment_date: string | null;
  status: string;
  disbursement_journal_entry_id: string | null;
};

export type ReviewLoanAnalysisTotals = {
  principal: number;
  principal_paid: number;
  interest: number;
  interest_paid: number;
  payment: number;
  outstanding: number;
};

export type ReviewInvoiceToIssueLine = {
  line_id: string;
  quotation_id: string;
  order_reference: string;
  customer_name: string;
  description: string;
  salesperson_name: string | null;
  quantity: number;
  qty_delivered: number;
  qty_invoiced: number;
  unit_price: number;
  amount: number;
  order_date: string;
  organization_id: string | null;
  organization_name: string | null;
  invoice_status: string;
};

export type ReviewInvoicedNotDeliveredLine = {
  line_id: string;
  invoice_id: string;
  invoice_number: string;
  sales_order_id: string | null;
  order_reference: string | null;
  customer_name: string;
  description: string;
  qty_invoiced: number;
  qty_delivered: number;
  qty_not_delivered: number;
  unit_price: number;
  amount: number;
  invoice_date: string;
  journal_entry_id: string | null;
};

export type ReviewWorkingFileDetail = {
  id: string;
  file_number: string;
  name: string;
  return_type: string;
  date_from: string;
  date_to: string;
  cycles: string[];
  status: string;
  organization_id: string;
  organization_name: string | null;
  created_by: string | null;
  created_at: string;
};

export type ReviewWorkingFileItem = {
  id: string;
  file_name: string;
  document_type: string;
  return_type: string;
  related_record_label: string;
  related_module: string;
  related_record_href: string;
  organization_id: string;
  organization_name: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  status: string;
  period_from: string;
  period_to: string;
  cycles: string[];
};

export type ReviewDepreciationLine = {
  id: string;
  asset_id: string;
  asset_number: string;
  asset_name: string;
  sequence: number;
  period_label: string;
  depreciation_date: string;
  amount: number;
  remaining_value: number;
  status: string;
  journal_entry_id: string | null;
  organization_id: string;
  organization_name: string | null;
};

export type ReviewDepreciationTotals = {
  amount: number;
  posted_amount: number;
  draft_amount: number;
  posted_count: number;
  draft_count: number;
};

/** Depreciation Schedule — posted/draft board from accounting_asset_depreciations. */
export async function getAccountingDepreciationScheduleForReview(opts?: {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}) {
  try {
    const scope = await resolveReviewScope(false);
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return {
        lines: [] as ReviewDepreciationLine[],
        total: 0,
        page: 1,
        pageSize: 40,
        totals: {
          amount: 0,
          posted_amount: 0,
          draft_amount: 0,
          posted_count: 0,
          draft_count: 0,
        } satisfies ReviewDepreciationTotals,
      };
    }

    const page = Math.max(1, opts?.page || 1);
    const pageSize = Math.min(100, Math.max(1, opts?.pageSize || 40));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = await createAdminClient();
    let q = supabase
      .from('accounting_asset_depreciations')
      .select('*', { count: 'exact' })
      .order('depreciation_date', { ascending: false })
      .order('sequence', { ascending: true })
      .range(from, to);

    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.eq('organization_id', scope.organizationId);
    }

    const status = (opts?.status || 'all').toLowerCase();
    if (status && status !== 'all') {
      q = q.eq('status', status);
    } else {
      q = q.neq('status', 'cancelled');
    }

    if (opts?.dateFrom) q = q.gte('depreciation_date', opts.dateFrom);
    if (opts?.dateTo) q = q.lte('depreciation_date', opts.dateTo);

    const { data, error, count } = await q;
    if (error) {
      if (/accounting_asset_depreciations|relation/i.test(error.message)) {
        return {
          lines: [] as ReviewDepreciationLine[],
          total: 0,
          page,
          pageSize,
          totals: {
            amount: 0,
            posted_amount: 0,
            draft_amount: 0,
            posted_count: 0,
            draft_count: 0,
          },
          migrationRequired: true as const,
        };
      }
      return { error: error.message };
    }

    const rows = data || [];
    const assetIds = [...new Set(rows.map((r) => String(r.asset_id)).filter(Boolean))];
    const { data: assets } = assetIds.length
      ? await supabase
          .from('accounting_assets')
          .select('id, asset_number, name, organization_id')
          .in('id', assetIds)
      : { data: [] as { id: string; asset_number?: string; name?: string; organization_id?: string }[] };
    const aMap = new Map((assets || []).map((a) => [String(a.id), a]));

    const orgIds = [
      ...new Set(
        [
          ...rows.map((r) => String(r.organization_id || '')),
          ...(assets || []).map((a) => String(a.organization_id || '')),
        ].filter(Boolean)
      ),
    ];
    const { data: orgs } = orgIds.length
      ? await supabase.from('organizations').select('id, name').in('id', orgIds)
      : { data: [] as { id: string; name: string }[] };
    const oMap = new Map((orgs || []).map((o) => [String(o.id), String(o.name || '')]));

    const search = String(opts?.search || '').trim().toLowerCase();
    let lines: ReviewDepreciationLine[] = rows.map((r) => {
      const asset = aMap.get(String(r.asset_id));
      const orgId = String(r.organization_id || asset?.organization_id || '');
      return {
        id: String(r.id),
        asset_id: String(r.asset_id),
        asset_number: asset?.asset_number ? String(asset.asset_number) : '—',
        asset_name: asset?.name ? String(asset.name) : '—',
        sequence: Number(r.sequence) || 0,
        period_label: String(r.period_label || ''),
        depreciation_date: String(r.depreciation_date || '').slice(0, 10),
        amount: Number(r.amount) || 0,
        remaining_value: Number(r.remaining_value) || 0,
        status: String(r.status || 'draft'),
        journal_entry_id: r.journal_entry_id ? String(r.journal_entry_id) : null,
        organization_id: orgId,
        organization_name: oMap.get(orgId) || null,
      };
    });

    if (search) {
      lines = lines.filter(
        (l) =>
          l.asset_number.toLowerCase().includes(search) ||
          l.asset_name.toLowerCase().includes(search) ||
          l.period_label.toLowerCase().includes(search)
      );
    }

    let totalsQ = supabase
      .from('accounting_asset_depreciations')
      .select('amount, status');
    if (scope.organizationId && !scope.isGlobalAdminView) {
      totalsQ = totalsQ.eq('organization_id', scope.organizationId);
    }
    if (status && status !== 'all') {
      totalsQ = totalsQ.eq('status', status);
    } else {
      totalsQ = totalsQ.neq('status', 'cancelled');
    }
    const { data: totalRows } = await totalsQ;
    const all = totalRows || [];
    const posted = all.filter((r) => String(r.status) === 'posted');
    const draft = all.filter((r) => String(r.status) === 'draft');
    const totals: ReviewDepreciationTotals = {
      amount: round2(all.reduce((s, r) => s + (Number(r.amount) || 0), 0)),
      posted_amount: round2(posted.reduce((s, r) => s + (Number(r.amount) || 0), 0)),
      draft_amount: round2(draft.reduce((s, r) => s + (Number(r.amount) || 0), 0)),
      posted_count: posted.length,
      draft_count: draft.length,
    };

    return {
      lines,
      total: search ? lines.length : count || 0,
      page,
      pageSize,
      totals,
    };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : 'Failed to load depreciation schedule',
    };
  }
}

/** Loans Analysis — accounting overview from existing loan records. */
export async function getAccountingLoansAnalysisForReview(opts?: {
  search?: string;
  status?: string;
  currency?: string;
  overdue?: boolean;
  dateFrom?: string;
  dateTo?: string;
  groupBy?: ReviewLoanGroupBy;
  page?: number;
  pageSize?: number;
}) {
  try {
    const scope = await resolveReviewScope(false);
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return {
        loans: [] as ReviewLoanAnalysisItem[],
        total: 0,
        page: 1,
        pageSize: 40,
        totals: {
          principal: 0,
          principal_paid: 0,
          interest: 0,
          interest_paid: 0,
          payment: 0,
          outstanding: 0,
        } satisfies ReviewLoanAnalysisTotals,
      };
    }

    const page = Math.max(1, opts?.page || 1);
    const pageSize = Math.min(100, Math.max(1, opts?.pageSize || 40));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = await createAdminClient();
    let q = supabase
      .from('accounting_loans')
      .select('*', { count: 'exact' })
      .order('start_date', { ascending: false })
      .range(from, to);

    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.eq('organization_id', scope.organizationId);
    }

    const status = (opts?.status || 'all').toLowerCase();
    if (status && status !== 'all') {
      q = q.eq('status', status);
    } else {
      q = q.not('status', 'in', '("cancelled")');
    }

    const currency = String(opts?.currency || '').trim();
    if (currency && currency !== 'all') {
      q = q.eq('currency', currency);
    }

    if (opts?.dateFrom) {
      q = q.gte('start_date', opts.dateFrom);
    }
    if (opts?.dateTo) {
      q = q.lte('start_date', opts.dateTo);
    }

    if (opts?.overdue) {
      const today = new Date().toISOString().slice(0, 10);
      q = q
        .lt('next_installment_date', today)
        .gt('remaining_balance', 0)
        .in('status', ['active', 'partially_paid']);
    }

    const search = String(opts?.search || '').trim();
    if (search) {
      q = q.or(
        `loan_number.ilike.%${search}%,name.ilike.%${search}%,lender_name.ilike.%${search}%,reference_number.ilike.%${search}%`
      );
    }

    const { data, error, count } = await q;
    if (error) {
      if (/accounting_loans|relation/i.test(error.message)) {
        return {
          loans: [] as ReviewLoanAnalysisItem[],
          total: 0,
          page,
          pageSize,
          totals: {
            principal: 0,
            principal_paid: 0,
            interest: 0,
            interest_paid: 0,
            payment: 0,
            outstanding: 0,
          },
          migrationRequired: true as const,
        };
      }
      return { error: error.message };
    }

    const rows = data || [];
    const orgIds = [...new Set(rows.map((r) => String(r.organization_id)))];
    const { data: orgs } = orgIds.length
      ? await supabase.from('organizations').select('id, name').in('id', orgIds)
      : { data: [] as { id: string; name: string }[] };
    const oMap = new Map((orgs || []).map((o) => [String(o.id), String(o.name || '')]));

    const loans: ReviewLoanAnalysisItem[] = rows.map((r) => ({
      id: String(r.id),
      loan_number: String(r.loan_number),
      name: String(r.name || ''),
      lender_name: r.lender_name ? String(r.lender_name) : null,
      organization_id: String(r.organization_id),
      organization_name: oMap.get(String(r.organization_id)) || null,
      currency: String(r.currency || 'PKR'),
      start_date: String(r.start_date || '').slice(0, 10),
      end_date: r.end_date ? String(r.end_date).slice(0, 10) : null,
      principal_amount: Number(r.principal_amount) || 0,
      principal_paid: Number(r.principal_paid) || 0,
      total_interest: Number(r.total_interest) || 0,
      interest_paid: Number(r.interest_paid) || 0,
      remaining_principal: Number(r.remaining_principal) || 0,
      remaining_interest: Number(r.remaining_interest) || 0,
      remaining_balance: Number(r.remaining_balance) || 0,
      next_installment_date: r.next_installment_date
        ? String(r.next_installment_date).slice(0, 10)
        : null,
      status: String(r.status),
      disbursement_journal_entry_id: r.disbursement_journal_entry_id
        ? String(r.disbursement_journal_entry_id)
        : null,
    }));

    let totalsQ = supabase
      .from('accounting_loans')
      .select(
        'principal_amount, principal_paid, total_interest, interest_paid, remaining_balance'
      );

    if (scope.organizationId && !scope.isGlobalAdminView) {
      totalsQ = totalsQ.eq('organization_id', scope.organizationId);
    }
    if (status && status !== 'all') {
      totalsQ = totalsQ.eq('status', status);
    } else {
      totalsQ = totalsQ.not('status', 'in', '("cancelled")');
    }
    if (currency && currency !== 'all') totalsQ = totalsQ.eq('currency', currency);
    if (opts?.dateFrom) totalsQ = totalsQ.gte('start_date', opts.dateFrom);
    if (opts?.dateTo) totalsQ = totalsQ.lte('start_date', opts.dateTo);
    if (opts?.overdue) {
      const today = new Date().toISOString().slice(0, 10);
      totalsQ = totalsQ
        .lt('next_installment_date', today)
        .gt('remaining_balance', 0)
        .in('status', ['active', 'partially_paid']);
    }
    if (search) {
      totalsQ = totalsQ.or(
        `loan_number.ilike.%${search}%,name.ilike.%${search}%,lender_name.ilike.%${search}%,reference_number.ilike.%${search}%`
      );
    }

    const { data: totalRows } = await totalsQ.limit(5000);
    const totals = (totalRows || []).reduce(
      (acc, r) => ({
        principal: round2(acc.principal + (Number(r.principal_amount) || 0)),
        principal_paid: round2(acc.principal_paid + (Number(r.principal_paid) || 0)),
        interest: round2(acc.interest + (Number(r.total_interest) || 0)),
        interest_paid: round2(acc.interest_paid + (Number(r.interest_paid) || 0)),
        payment: round2(
          acc.payment +
            (Number(r.principal_paid) || 0) +
            (Number(r.interest_paid) || 0)
        ),
        outstanding: round2(acc.outstanding + (Number(r.remaining_balance) || 0)),
      }),
      {
        principal: 0,
        principal_paid: 0,
        interest: 0,
        interest_paid: 0,
        payment: 0,
        outstanding: 0,
      } satisfies ReviewLoanAnalysisTotals
    );

    return { loans, total: count || 0, page, pageSize, totals };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load loans analysis',
    };
  }
}

/** Invoices To Be Issued — invoiceable sales order lines for Accounting Review. */
export async function getAccountingInvoicesToBeIssuedForReview(opts?: {
  search?: string;
  invoiceStatus?: 'to_invoice' | 'no' | 'invoiced' | 'all';
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
  asOf?: string;
  page?: number;
  pageSize?: number;
}) {
  try {
    const scope = await resolveReviewScope(false);
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { lines: [] as ReviewInvoiceToIssueLine[], total: 0, page: 1, pageSize: 40 };
    }

    const page = Math.max(1, opts?.page || 1);
    const pageSize = Math.min(100, Math.max(1, opts?.pageSize || 40));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const asOf = opts?.asOf || new Date().toISOString().slice(0, 10);
    let dateFrom = opts?.dateFrom;
    const dateTo = opts?.dateTo || asOf;
    if (!dateFrom) {
      const d = new Date(asOf);
      d.setDate(d.getDate() - 365);
      dateFrom = d.toISOString().slice(0, 10);
    }

    const supabase = await createAdminClient();
    const invStatus = opts?.invoiceStatus || 'to_invoice';

    let orderQ = supabase
      .from('quotations')
      .select(
        'id, quotation_number, customer_name, quotation_date, invoice_status, organization_id, salesperson_id, created_by',
        { count: 'exact' }
      )
      .eq('status', 'sales_order');

    if (scope.organizationId && !scope.isGlobalAdminView) {
      orderQ = orderQ.eq('organization_id', scope.organizationId);
    }
    if (invStatus !== 'all') {
      orderQ = orderQ.eq('invoice_status', invStatus);
    } else {
      orderQ = orderQ.in('invoice_status', ['to_invoice', 'no', 'invoiced']);
    }
    if (opts?.customerId) orderQ = orderQ.eq('contact_id', opts.customerId);
    if (dateFrom) orderQ = orderQ.gte('quotation_date', dateFrom);
    if (dateTo) orderQ = orderQ.lte('quotation_date', dateTo);

    const search = String(opts?.search || '').trim();
    if (search) {
      const like = `%${search}%`;
      orderQ = orderQ.or(
        `quotation_number.ilike.${like},customer_name.ilike.${like},created_by.ilike.${like}`
      );
    }

    const { data: orders, error: orderErr, count } = await orderQ
      .order('quotation_date', { ascending: false, nullsFirst: false })
      .range(from, to);

    if (orderErr) {
      if (/invoice_status|column/i.test(orderErr.message)) {
        return {
          error:
            'Run sales_to_invoice_phase.sql migration to enable Invoices To Be Issued.',
        };
      }
      return { error: orderErr.message };
    }

    const orderRows = orders || [];
    if (!orderRows.length) {
      return { lines: [], total: count || 0, page, pageSize };
    }

    const orderMap = new Map(
      orderRows.map((o) => [String(o.id), o as Record<string, unknown>])
    );
    const orderIds = orderRows.map((o) => String(o.id));

    const salespersonIds = [
      ...new Set(
        orderRows
          .map((o) => (o.salesperson_id ? String(o.salesperson_id) : ''))
          .filter(Boolean)
      ),
    ];
    const orgIds = [
      ...new Set(
        orderRows
          .map((o) => (o.organization_id ? String(o.organization_id) : ''))
          .filter(Boolean)
      ),
    ];

    const [linesRes, salesRes, orgsRes] = await Promise.all([
      supabase
        .from('quotation_lines')
        .select('*')
        .in('quotation_id', orderIds)
        .order('sequence', { ascending: true }),
      salespersonIds.length
        ? supabase.from('sales_agents').select('id, name').in('id', salespersonIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      orgIds.length
        ? supabase.from('organizations').select('id, organization_name').in('id', orgIds)
        : Promise.resolve({ data: [] as { id: string; organization_name: string }[] }),
    ]);

    if (linesRes.error) return { error: linesRes.error.message };

    const salesMap = new Map(
      (salesRes.data || []).map((s) => [String(s.id), String(s.name || '')])
    );
    const orgMap = new Map(
      (orgsRes.data || []).map((o) => [String(o.id), String(o.organization_name || '')])
    );

    const flatLines: ReviewInvoiceToIssueLine[] = [];
    for (const line of linesRes.data || []) {
      const order = orderMap.get(String(line.quotation_id));
      if (!order) continue;

      const spId = order.salesperson_id ? String(order.salesperson_id) : null;
      const orgId = order.organization_id ? String(order.organization_id) : null;
      const invSt = String(order.invoice_status || 'no');
      const qty = Number(line.quantity) || 0;
      const qtyInvoiced = invSt === 'invoiced' ? qty : 0;

      flatLines.push({
        line_id: String(line.id),
        quotation_id: String(line.quotation_id),
        order_reference: String(order.quotation_number || ''),
        customer_name: String(order.customer_name || '—'),
        description: String(line.description || line.product_name || '—'),
        salesperson_name: spId
          ? salesMap.get(spId) || null
          : order.created_by
            ? String(order.created_by)
            : null,
        quantity: qty,
        qty_delivered: Number(line.qty_delivered) || 0,
        qty_invoiced: qtyInvoiced,
        unit_price: Number(line.unit_price) || 0,
        amount: Number(line.line_total) || 0,
        order_date: String(order.quotation_date || '').slice(0, 10),
        organization_id: orgId,
        organization_name: orgId ? orgMap.get(orgId) || null : null,
        invoice_status: invSt,
      });
    }

    return { lines: flatLines, total: count || 0, page, pageSize };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to load invoices to be issued',
    };
  }
}

async function finishInvoicedNotDelivered(
  invoiceRows: Record<string, unknown>[],
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  invoicedNotDeliveredQty: (qtyInvoiced: number, qtyDelivered: number) => number,
  page: number,
  pageSize: number
) {
  if (!invoiceRows.length) {
    return { lines: [] as ReviewInvoicedNotDeliveredLine[], total: 0, page, pageSize };
  }

  const invoiceIds = invoiceRows.map((r) => String(r.id));
  const orderIds = [
    ...new Set(
      invoiceRows
        .map((r) => (r.sales_order_id ? String(r.sales_order_id) : ''))
        .filter(Boolean)
    ),
  ];

  const [linesRes, soLinesRes] = await Promise.all([
    supabase
      .from('accounting_customer_invoice_lines')
      .select(
        'id, invoice_id, product_name, description, quantity, unit_price, line_total, sales_order_line_id'
      )
      .in('invoice_id', invoiceIds),
    orderIds.length
      ? supabase
          .from('quotation_lines')
          .select('id, qty_delivered')
          .in('quotation_id', orderIds)
      : Promise.resolve({ data: [] as { id: string; qty_delivered?: number }[] }),
  ]);

  if (linesRes.error) {
    if (/sales_order_line_id/i.test(linesRes.error.message)) {
      return { lines: [] as ReviewInvoicedNotDeliveredLine[], total: 0, page, pageSize };
    }
    return { error: linesRes.error.message };
  }

  const deliveredMap = new Map(
    (soLinesRes.data || []).map((l) => [
      String(l.id),
      Number(l.qty_delivered) || 0,
    ])
  );
  const invoiceMap = new Map(
    invoiceRows.map((r) => [String(r.id), r])
  );

  type Acc = {
    soLineId: string;
    qtyInvoiced: number;
    qtyDelivered: number;
    unitPrice: number;
    description: string;
    invoiceId: string;
  };
  const bySoLine = new Map<string, Acc>();
  for (const line of linesRes.data || []) {
    const soLineId = line.sales_order_line_id
      ? String(line.sales_order_line_id)
      : '';
    if (!soLineId || !deliveredMap.has(soLineId)) continue;
    const prev = bySoLine.get(soLineId);
    const qty = Number(line.quantity) || 0;
    if (prev) {
      prev.qtyInvoiced = round2(prev.qtyInvoiced + qty);
      prev.invoiceId = String(line.invoice_id);
    } else {
      bySoLine.set(soLineId, {
        soLineId,
        qtyInvoiced: qty,
        qtyDelivered: deliveredMap.get(soLineId) || 0,
        unitPrice: Number(line.unit_price) || 0,
        description: String(line.description || line.product_name || '—'),
        invoiceId: String(line.invoice_id),
      });
    }
  }

  const all: ReviewInvoicedNotDeliveredLine[] = [];
  for (const acc of bySoLine.values()) {
    const gap = invoicedNotDeliveredQty(acc.qtyInvoiced, acc.qtyDelivered);
    if (!gap) continue;
    const inv = invoiceMap.get(acc.invoiceId);
    if (!inv) continue;
    all.push({
      line_id: acc.soLineId,
      invoice_id: acc.invoiceId,
      invoice_number: String(inv.invoice_number || ''),
      sales_order_id: inv.sales_order_id ? String(inv.sales_order_id) : null,
      order_reference: inv.sales_order_number
        ? String(inv.sales_order_number)
        : null,
      customer_name: String(inv.customer_name || '—'),
      description: acc.description,
      qty_invoiced: acc.qtyInvoiced,
      qty_delivered: acc.qtyDelivered,
      qty_not_delivered: gap,
      unit_price: acc.unitPrice,
      amount: round2(gap * acc.unitPrice),
      invoice_date: String(inv.invoice_date || '').slice(0, 10),
      journal_entry_id: inv.journal_entry_id
        ? String(inv.journal_entry_id)
        : null,
    });
  }

  const total = all.length;
  const from = (page - 1) * pageSize;
  const lines = all.slice(from, from + pageSize);
  return { lines, total, page, pageSize };
}

/** Invoiced Not Delivered — posted invoice lines whose SO qty_delivered is behind. */
export async function getAccountingInvoicedNotDeliveredForReview(opts?: {
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  try {
    const { invoicedNotDeliveredQty } = await import(
      '@/lib/accounting/invoiced-not-delivered'
    );
    const scope = await resolveReviewScope(false);
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return {
        lines: [] as ReviewInvoicedNotDeliveredLine[],
        total: 0,
        page: 1,
        pageSize: 40,
      };
    }

    const page = Math.max(1, opts?.page || 1);
    const pageSize = Math.min(100, Math.max(1, opts?.pageSize || 40));
    const supabase = await createAdminClient();

    let invQ = supabase
      .from('accounting_customer_invoices')
      .select(
        'id, invoice_number, customer_name, invoice_date, sales_order_id, sales_order_number, journal_entry_id, organization_id, status'
      )
      .in('status', ['posted', 'paid'])
      .not('sales_order_id', 'is', null)
      .order('invoice_date', { ascending: false })
      .limit(2000);

    if (scope.organizationId && !scope.isGlobalAdminView) {
      invQ = invQ.eq('organization_id', scope.organizationId);
    }
    const search = String(opts?.search || '').trim();
    if (search) {
      const like = `%${search}%`;
      invQ = invQ.or(
        `invoice_number.ilike.${like},customer_name.ilike.${like},sales_order_number.ilike.${like}`
      );
    }

    const { data: invoices, error: invErr } = await invQ;
    if (invErr) {
      if (/journal_entry_id/i.test(invErr.message)) {
        let retry = supabase
          .from('accounting_customer_invoices')
          .select(
            'id, invoice_number, customer_name, invoice_date, sales_order_id, sales_order_number, organization_id, status'
          )
          .in('status', ['posted', 'paid'])
          .not('sales_order_id', 'is', null)
          .order('invoice_date', { ascending: false })
          .limit(2000);
        if (scope.organizationId && !scope.isGlobalAdminView) {
          retry = retry.eq('organization_id', scope.organizationId);
        }
        if (search) {
          const like = `%${search}%`;
          retry = retry.or(
            `invoice_number.ilike.${like},customer_name.ilike.${like},sales_order_number.ilike.${like}`
          );
        }
        const retryRes = await retry;
        if (retryRes.error) return { error: retryRes.error.message };
        return finishInvoicedNotDelivered(
          (retryRes.data || []) as Record<string, unknown>[],
          supabase,
          invoicedNotDeliveredQty,
          page,
          pageSize
        );
      }
      return { error: invErr.message };
    }
    return finishInvoicedNotDelivered(
      (invoices || []) as Record<string, unknown>[],
      supabase,
      invoicedNotDeliveredQty,
      page,
      pageSize
    );
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : 'Failed to load invoiced not delivered',
    };
  }
}

/** Working Files — audit working files + linked tax returns. */
export async function getAccountingWorkingFilesForReview(opts?: {
  search?: string;
  status?: 'ongoing' | 'all' | string;
  documentType?: 'all' | 'audit' | 'annual_report' | 'tax_return';
  page?: number;
  pageSize?: number;
}) {
  try {
    const scope = await resolveReviewScope(false);
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { files: [] as ReviewWorkingFileItem[], total: 0, page: 1, pageSize: 40 };
    }

    const page = Math.max(1, opts?.page || 1);
    const pageSize = Math.min(100, Math.max(1, opts?.pageSize || 40));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const docType = (opts?.documentType || 'all').toLowerCase();

    const supabase = await createAdminClient();
    const merged: ReviewWorkingFileItem[] = [];

    if (docType === 'all' || docType === 'audit' || docType === 'annual_report') {
      let q = supabase
        .from('accounting_working_files')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (scope.organizationId && !scope.isGlobalAdminView) {
        q = q.eq('organization_id', scope.organizationId);
      }
      if (docType === 'audit') q = q.eq('return_type', 'audit');
      if (docType === 'annual_report') q = q.eq('return_type', 'annual_report');

      const statusFilter = (opts?.status || 'ongoing').toLowerCase();
      if (statusFilter === 'ongoing') {
        q = q.in('status', ['draft', 'ongoing', 'paused']);
      } else if (statusFilter !== 'all') {
        q = q.eq('status', statusFilter);
      }

      const search = String(opts?.search || '').trim();
      if (search) {
        q = q.or(`file_number.ilike.%${search}%,name.ilike.%${search}%`);
      }

      const { data, error } = await q;
      if (error && !/accounting_working_files|relation/i.test(error.message)) {
        return { error: error.message };
      }

      const rows = data || [];
      const orgIds = [...new Set(rows.map((r) => String(r.organization_id)))];
      const { data: orgs } = orgIds.length
        ? await supabase.from('organizations').select('id, name').in('id', orgIds)
        : { data: [] as { id: string; name: string }[] };
      const oMap = new Map((orgs || []).map((o) => [String(o.id), String(o.name || '')]));

      for (const r of rows) {
        let cycles: string[] = [];
        const cyclesRaw = r.cycles;
        if (Array.isArray(cyclesRaw)) cycles = cyclesRaw.map(String);
        const rt = String(r.return_type || 'audit');
        merged.push({
          id: String(r.id),
          file_name: String(r.name || r.file_number),
          document_type:
            rt === 'annual_report' ? 'Annual Report' : 'Audit',
          return_type: rt,
          related_record_label: String(r.file_number),
          related_module: 'Review',
          related_record_href: `/accounting/review/working-files/${r.id}`,
          organization_id: String(r.organization_id),
          organization_name: oMap.get(String(r.organization_id)) || null,
          uploaded_by: r.created_by ? String(r.created_by) : null,
          uploaded_at: String(r.created_at || r.updated_at || ''),
          status: String(r.status),
          period_from: String(r.date_from || '').slice(0, 10),
          period_to: String(r.date_to || '').slice(0, 10),
          cycles,
        });
      }
    }

    if (docType === 'all' || docType === 'tax_return') {
      let tq = supabase
        .from('accounting_tax_returns')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (scope.organizationId && !scope.isGlobalAdminView) {
        tq = tq.eq('organization_id', scope.organizationId);
      }

      const statusFilter = (opts?.status || 'ongoing').toLowerCase();
      if (statusFilter === 'ongoing') {
        tq = tq.in('status', ['draft', 'generated', 'confirmed']);
      } else if (statusFilter !== 'all') {
        tq = tq.eq('status', statusFilter);
      }

      const search = String(opts?.search || '').trim();
      if (search) {
        tq = tq.or(`return_number.ilike.%${search}%,name.ilike.%${search}%`);
      }

      const { data: taxRows } = await tq;
      const rows = taxRows || [];
      const orgIds = [...new Set(rows.map((r) => String(r.organization_id)))];
      const { data: orgs } = orgIds.length
        ? await supabase.from('organizations').select('id, name').in('id', orgIds)
        : { data: [] as { id: string; name: string }[] };
      const oMap = new Map((orgs || []).map((o) => [String(o.id), String(o.name || '')]));

      for (const r of rows) {
        merged.push({
          id: `tax-${r.id}`,
          file_name: String(r.name || r.return_number),
          document_type: 'Tax Return',
          return_type: 'tax_return',
          related_record_label: String(r.return_number),
          related_module: 'Tax Returns',
          related_record_href: `/accounting/tax-returns/${r.id}`,
          organization_id: String(r.organization_id),
          organization_name: oMap.get(String(r.organization_id)) || null,
          uploaded_by: r.created_by ? String(r.created_by) : null,
          uploaded_at: String(r.created_at || r.updated_at || ''),
          status: String(r.status),
          period_from: String(r.date_from || '').slice(0, 10),
          period_to: String(r.date_to || '').slice(0, 10),
          cycles: [],
        });
      }
    }

    merged.sort(
      (a, b) =>
        new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
    );

    const total = merged.length;
    const pageFiles = merged.slice(from, to + 1);

    if (!merged.length && docType !== 'tax_return') {
      const probe = await supabase.from('accounting_working_files').select('id').limit(1);
      if (probe.error && /accounting_working_files|relation/i.test(probe.error.message)) {
        return {
          files: [] as ReviewWorkingFileItem[],
          total: 0,
          page,
          pageSize,
          migrationRequired: true as const,
        };
      }
    }

    return { files: pageFiles, total, page, pageSize };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load working files',
    };
  }
}

async function allocateWorkingFileNumber(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  organizationId: string
): Promise<string> {
  const { data: seq } = await supabase
    .from('accounting_working_file_sequences')
    .select('prefix, next_number')
    .eq('organization_id', organizationId)
    .maybeSingle();

  const prefix = String(seq?.prefix || 'WF');
  const next = Number(seq?.next_number) || 1;
  const fileNumber = `${prefix}/${String(next).padStart(4, '0')}`;

  if (seq) {
    await supabase
      .from('accounting_working_file_sequences')
      .update({ next_number: next + 1, updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId);
  } else {
    await supabase.from('accounting_working_file_sequences').insert([
      {
        organization_id: organizationId,
        prefix: 'WF',
        next_number: next + 1,
      },
    ]);
  }

  return fileNumber;
}

/** Create audit working file from Review → Working Files → New dialog. */
export async function createAccountingWorkingFile(opts: {
  returnType: 'audit';
  dateFrom: string;
  dateTo: string;
  cycles: string[];
}) {
  try {
    const scope = await resolveReviewScope(false);
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.organizationId) {
      return { error: 'Select an organization to create a working file.' };
    }

    const cycles = (opts.cycles || []).map(String).filter(Boolean);
    if (!cycles.length) {
      return { error: 'Select at least one audit cycle.' };
    }

    const dateFrom = String(opts.dateFrom || '').slice(0, 10);
    const dateTo = String(opts.dateTo || '').slice(0, 10);
    if (!dateFrom || !dateTo || dateFrom > dateTo) {
      return { error: 'Invalid audit date range.' };
    }

    const supabase = await createAdminClient();
    const fileNumber = await allocateWorkingFileNumber(
      supabase,
      scope.organizationId
    );
    const year = dateFrom.slice(0, 4);
    const name = `${year} Audit — ${fileNumber}`;

    const { data, error } = await supabase
      .from('accounting_working_files')
      .insert([
        {
          organization_id: scope.organizationId,
          file_number: fileNumber,
          name,
          return_type: opts.returnType || 'audit',
          date_from: dateFrom,
          date_to: dateTo,
          cycles,
          status: 'ongoing',
          created_by: scope.session?.username ?? null,
          updated_by: scope.session?.username ?? null,
        },
      ])
      .select('id')
      .single();

    if (error) {
      if (/accounting_working_files|relation/i.test(error.message)) {
        return {
          error: 'Run create_accounting_working_files.sql migration in Supabase first.',
        };
      }
      return { error: error.message };
    }

    return { fileId: String(data.id) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create working file',
    };
  }
}

/** Working file detail for Review drill-down. */
export async function getAccountingWorkingFileDetail(fileId: string) {
  try {
    const scope = await resolveReviewScope(false);
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from('accounting_working_files')
      .select('*')
      .eq('id', fileId)
      .maybeSingle();

    if (error) {
      if (/accounting_working_files|relation/i.test(error.message)) {
        return { error: 'Run create_accounting_working_files.sql migration first.' };
      }
      return { error: error.message };
    }
    if (!row) return { error: 'Working file not found.' };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      String(row.organization_id) !== scope.organizationId
    ) {
      return { error: 'Working file not in the selected organization.' };
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', row.organization_id)
      .maybeSingle();

    const cyclesRaw = row.cycles;
    const cycles = Array.isArray(cyclesRaw)
      ? cyclesRaw.map(String)
      : [];

    return {
      file: {
        id: String(row.id),
        file_number: String(row.file_number),
        name: String(row.name || ''),
        return_type: String(row.return_type || 'audit'),
        date_from: String(row.date_from || '').slice(0, 10),
        date_to: String(row.date_to || '').slice(0, 10),
        cycles,
        status: String(row.status),
        organization_id: String(row.organization_id),
        organization_name: org?.name ? String(org.name) : null,
        created_by: row.created_by ? String(row.created_by) : null,
        created_at: String(row.created_at || ''),
      } satisfies ReviewWorkingFileDetail,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load working file',
    };
  }
}

// ---------------------------------------------------------------------------
// Phase 3 — Deferred Revenues, Deferred Expenses, Annual Report
// ---------------------------------------------------------------------------

function monthBoundsFromIsoMonth(monthIso: string) {
  const [y, m] = monthIso.split('-').map(Number);
  if (!y || !m) {
    const p = resolveDatePeriod('this_month');
    return { dateFrom: p.dateFrom, dateTo: p.dateTo };
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    dateFrom: `${y}-${String(m).padStart(2, '0')}-01`,
    dateTo: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** Deferred Revenue Review report — real schedules + JE activity on deferral accounts. */
export async function getAccountingDeferredRevenuesForReview(opts?: {
  month?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  try {
    const scope = await resolveReviewScope(false);
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { error: 'Select an organization to view deferred revenues.' };
    }

    let dateFrom = opts?.dateFrom;
    let dateTo = opts?.dateTo;
    if (opts?.month) {
      const b = monthBoundsFromIsoMonth(opts.month);
      dateFrom = b.dateFrom;
      dateTo = b.dateTo;
    }
    if (!dateFrom || !dateTo) {
      const p = resolveDatePeriod('this_month');
      dateFrom = p.dateFrom;
      dateTo = p.dateTo;
    }

    const report = await buildDeferredReviewReport({
      organizationId: scope.organizationId ?? null,
      kind: 'deferred_revenue',
      dateFrom,
      dateTo,
    });
    return { report };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to load deferred revenues',
    };
  }
}

/** Deferred Expense Review report — real schedules + JE activity on prepayment accounts. */
export async function getAccountingDeferredExpensesForReview(opts?: {
  month?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  try {
    const scope = await resolveReviewScope(false);
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { error: 'Select an organization to view deferred expenses.' };
    }

    let dateFrom = opts?.dateFrom;
    let dateTo = opts?.dateTo;
    if (opts?.month) {
      const b = monthBoundsFromIsoMonth(opts.month);
      dateFrom = b.dateFrom;
      dateTo = b.dateTo;
    }
    if (!dateFrom || !dateTo) {
      const p = resolveDatePeriod('this_month');
      dateFrom = p.dateFrom;
      dateTo = p.dateTo;
    }

    const report = await buildDeferredReviewReport({
      organizationId: scope.organizationId ?? null,
      kind: 'deferred_expense',
      dateFrom,
      dateTo,
    });
    return { report };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to load deferred expenses',
    };
  }
}

/** Annual Report — P&L + Balance Sheet + Cash Flow from posted journal entries. */
export async function getAccountingAnnualReportForReview(opts?: {
  fiscalYearId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  try {
    const scope = await resolveReviewScope(true);
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { error: 'Select an organization to generate the annual report.' };
    }
    if (!scope.organizationId) {
      return { error: 'Select an organization to generate the annual report.' };
    }

    let fiscalYear: AnnualReportFiscalYear | null = null;
    let dateFrom = opts?.dateFrom;
    let dateTo = opts?.dateTo;

    const fiscalYears = await loadFiscalYearsForOrg(scope.organizationId);

    if (opts?.fiscalYearId) {
      fiscalYear = fiscalYears.find((y) => y.id === opts.fiscalYearId) ?? null;
      if (fiscalYear) {
        dateFrom = fiscalYear.date_from;
        dateTo = fiscalYear.date_to;
      }
    }

    if (!dateFrom || !dateTo) {
      if (fiscalYears.length) {
        fiscalYear = fiscalYears[0];
        dateFrom = fiscalYear.date_from;
        dateTo = fiscalYear.date_to;
      } else {
        const y = new Date().getFullYear();
        dateFrom = `${y}-01-01`;
        dateTo = `${y}-12-31`;
      }
    }

    const report = await buildAnnualReport({
      organizationId: scope.organizationId,
      dateFrom,
      dateTo,
      fiscalYear,
    });

    return { report, fiscalYears };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to build annual report',
    };
  }
}

/** Create annual report working file container. */
export async function createAccountingAnnualReportWorkingFile(opts: {
  dateFrom: string;
  dateTo: string;
  name?: string;
}) {
  try {
    const scope = await resolveReviewScope(true);
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.organizationId) {
      return { error: 'Select an organization to create an annual report.' };
    }

    const dateFrom = String(opts.dateFrom || '').slice(0, 10);
    const dateTo = String(opts.dateTo || '').slice(0, 10);
    if (!dateFrom || !dateTo || dateFrom > dateTo) {
      return { error: 'Invalid report period.' };
    }

    const supabase = await createAdminClient();
    const fileNumber = await allocateWorkingFileNumber(
      supabase,
      scope.organizationId
    );
    const name =
      opts.name ||
      `Annual Report ${dateFrom.slice(0, 4)} (${fileNumber})`;

    const { data, error } = await supabase
      .from('accounting_working_files')
      .insert([
        {
          organization_id: scope.organizationId,
          file_number: fileNumber,
          name,
          return_type: 'annual_report',
          date_from: dateFrom,
          date_to: dateTo,
          cycles: [],
          status: 'ongoing',
          created_by: scope.session?.username ?? null,
          updated_by: scope.session?.username ?? null,
        },
      ])
      .select('id')
      .single();

    if (error && /return_type|check constraint/i.test(error.message)) {
      const retry = await supabase
        .from('accounting_working_files')
        .insert([
          {
            organization_id: scope.organizationId,
            file_number: fileNumber,
            name,
            return_type: 'audit',
            date_from: dateFrom,
            date_to: dateTo,
            cycles: ['annual_report'],
            status: 'ongoing',
            created_by: scope.session?.username ?? null,
            updated_by: scope.session?.username ?? null,
          },
        ])
        .select('id')
        .single();
      if (!retry.error && retry.data) {
        return { fileId: String(retry.data.id) };
      }
    }

    if (error) {
      if (/schema cache|does not exist|relation/i.test(error.message)) {
        return {
          error:
            'Working Files table is missing. Run create_accounting_working_files.sql in the Supabase SQL editor, then click New again.',
        };
      }
      return { error: error.message };
    }

    return { fileId: String(data.id) };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to create annual report file',
    };
  }
}
