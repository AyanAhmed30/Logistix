'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { requireAccountingActionAccess } from '@/lib/accounting-page-access';
import {
  requireAdminOrganizationScope,
  sessionUsesOrganizationScope,
} from '@/lib/admin-organization-context';
import {
  buildBankPaymentSettlementLines,
  buildCreditNoteLines,
  buildCustomerInvoiceLines,
  buildCustomerPaymentLines,
  buildVendorBillLines,
  buildVendorPaymentLines,
  buildVendorRefundLines,
  type AutoPostingLine,
} from '@/lib/accounting-journal-posting';

export type AccountingJournalEntryStatus = 'draft' | 'posted' | 'cancelled';

export type AccountingJournalEntrySourceType =
  | 'manual'
  | 'customer_invoice'
  | 'customer_payment'
  | 'credit_note'
  | 'vendor_bill'
  | 'vendor_payment'
  | 'vendor_refund'
  | 'asset_purchase'
  | 'asset_depreciation'
  | 'asset_disposal'
  | 'loan_disbursement'
  | 'loan_repayment'
  | 'tax_return'
  | 'year_closing'
  | 'year_opening';

export type AccountingJournalEntryLine = {
  id: string;
  sequence: number;
  account_id: string;
  account_code: string | null;
  account_name: string | null;
  label: string;
  partner_name: string | null;
  contact_id: string | null;
  debit: number;
  credit: number;
  analytic_account: string | null;
  tax_label: string | null;
};

export type AccountingJournalEntryListItem = {
  id: string;
  entry_number: string;
  entry_date: string;
  journal_id: string;
  journal_name: string | null;
  journal_code: string | null;
  reference: string;
  partner_name: string | null;
  organization_id: string;
  organization_name: string | null;
  status: AccountingJournalEntryStatus;
  total_debit: number;
  total_credit: number;
  source_type: AccountingJournalEntrySourceType | null;
  source_id: string | null;
  source_number: string | null;
  is_manual: boolean;
  created_by: string | null;
  created_at: string;
};

export type AccountingJournalEntryDetail = AccountingJournalEntryListItem & {
  currency: string;
  contact_id: string | null;
  is_manual: boolean;
  posted_at: string | null;
  updated_by: string | null;
  updated_at: string;
  lines: AccountingJournalEntryLine[];
};

export type AccountingJournalEntryLog = {
  id: string;
  action: string;
  performed_by: string | null;
  previous_status: string | null;
  new_status: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type JournalEntryLineInput = {
  id?: string;
  account_id: string;
  label?: string;
  partner_name?: string | null;
  contact_id?: string | null;
  debit: number;
  credit: number;
  analytic_account?: string | null;
  tax_label?: string | null;
};

function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

async function resolveScope() {
  const access = await requireAccountingActionAccess();
  if ('error' in access && access.error) return { error: access.error };

  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

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

async function allocateEntryNumber(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  organizationId: string
) {
  const { data: seq } = await supabase
    .from('accounting_journal_entry_sequences')
    .select('prefix, next_number')
    .eq('organization_id', organizationId)
    .maybeSingle();

  let prefix = 'JE';
  let next = 1;
  if (seq) {
    prefix = String(seq.prefix || 'JE');
    next = Number(seq.next_number) || 1;
    await supabase
      .from('accounting_journal_entry_sequences')
      .update({ next_number: next + 1, updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId);
  } else {
    await supabase.from('accounting_journal_entry_sequences').insert([
      {
        organization_id: organizationId,
        prefix: 'JE',
        next_number: 2,
      },
    ]);
  }

  return `${prefix}${String(next).padStart(5, '0')}`;
}

async function logEntry(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  args: {
    journalEntryId: string;
    organizationId: string | null;
    action: string;
    performedBy: string;
    previousStatus?: string | null;
    newStatus?: string | null;
    details?: Record<string, unknown>;
  }
) {
  await supabase.from('accounting_journal_entry_logs').insert([
    {
      journal_entry_id: args.journalEntryId,
      organization_id: args.organizationId,
      action: args.action,
      performed_by: args.performedBy,
      previous_status: args.previousStatus ?? null,
      new_status: args.newStatus ?? null,
      details: args.details || {},
    },
  ]);
}

function validateLines(lines: JournalEntryLineInput[]) {
  const cleaned = lines
    .map((l) => ({
      ...l,
      debit: round2(l.debit),
      credit: round2(l.credit),
      label: String(l.label || '').trim(),
    }))
    .filter((l) => l.debit > 0 || l.credit > 0);

  if (cleaned.length < 2) {
    return { error: 'Add at least two journal lines' };
  }

  let debit = 0;
  let credit = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const line = cleaned[i];
    if (!line.account_id) {
      return { error: `Line ${i + 1}: Account is required` };
    }
    if (line.debit > 0 && line.credit > 0) {
      return { error: `Line ${i + 1}: Debit and Credit cannot both have values` };
    }
    debit += line.debit;
    credit += line.credit;
  }
  debit = round2(debit);
  credit = round2(credit);
  if (debit !== credit || debit <= 0) {
    return {
      error: `Entry is unbalanced. Debit ${debit.toFixed(2)} ≠ Credit ${credit.toFixed(2)}`,
    };
  }
  return { lines: cleaned, totalDebit: debit, totalCredit: credit };
}

async function mapDetail(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  row: Record<string, unknown>
): Promise<AccountingJournalEntryDetail> {
  const id = String(row.id);
  const [{ data: lines }, { data: journal }, { data: org }] = await Promise.all([
    supabase
      .from('accounting_journal_entry_lines')
      .select('*')
      .eq('journal_entry_id', id)
      .order('sequence', { ascending: true }),
    supabase
      .from('journals')
      .select('id, name, code')
      .eq('id', row.journal_id)
      .maybeSingle(),
    supabase
      .from('organizations')
      .select('id, name')
      .eq('id', row.organization_id)
      .maybeSingle(),
  ]);

  const accountIds = [...new Set((lines || []).map((l) => String(l.account_id)))];
  const { data: accounts } = accountIds.length
    ? await supabase
        .from('chart_of_accounts')
        .select('id, code, name')
        .in('id', accountIds)
    : { data: [] as { id: string; code: string; name: string }[] };

  const accountMap = new Map(
    (accounts || []).map((a) => [String(a.id), a] as const)
  );

  return {
    id,
    entry_number: String(row.entry_number),
    entry_date: String(row.entry_date),
    journal_id: String(row.journal_id),
    journal_name: journal?.name ? String(journal.name) : null,
    journal_code: journal?.code ? String(journal.code) : null,
    reference: String(row.reference || ''),
    partner_name: row.partner_name ? String(row.partner_name) : null,
    contact_id: row.contact_id ? String(row.contact_id) : null,
    organization_id: String(row.organization_id),
    organization_name: org?.name ? String(org.name) : null,
    status: String(row.status) as AccountingJournalEntryStatus,
    total_debit: Number(row.total_debit) || 0,
    total_credit: Number(row.total_credit) || 0,
    source_type: (row.source_type as AccountingJournalEntrySourceType) || null,
    source_id: row.source_id ? String(row.source_id) : null,
    source_number: row.source_number ? String(row.source_number) : null,
    currency: String(row.currency || 'PKR'),
    is_manual: Boolean(row.is_manual),
    posted_at: row.posted_at ? String(row.posted_at) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    updated_by: row.updated_by ? String(row.updated_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    lines: (lines || []).map((l) => {
      const acc = accountMap.get(String(l.account_id));
      return {
        id: String(l.id),
        sequence: Number(l.sequence) || 10,
        account_id: String(l.account_id),
        account_code: acc?.code ? String(acc.code) : null,
        account_name: acc?.name ? String(acc.name) : null,
        label: String(l.label || ''),
        partner_name: l.partner_name ? String(l.partner_name) : null,
        contact_id: l.contact_id ? String(l.contact_id) : null,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        analytic_account: l.analytic_account ? String(l.analytic_account) : null,
        tax_label: l.tax_label ? String(l.tax_label) : null,
      };
    }),
  };
}

/**
 * Active journals for JE / asset / loan pickers.
 * Shared (organization_id null) + current org. Archived excluded.
 */
export async function getAccountingJournals() {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    const supabase = await createAdminClient();
    let q = supabase
      .from('journals')
      .select('id, name, code, type, currency')
      .eq('is_active', true)
      .order('code', { ascending: true });

    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.or(
        `organization_id.eq.${scope.organizationId},organization_id.is.null`
      );
    }

    const { data, error } = await q;
    if (error) {
      if (/organization_id|currency|column/i.test(error.message)) {
        const legacy = await supabase
          .from('journals')
          .select('id, name, code, type')
          .eq('is_active', true)
          .order('code', { ascending: true });
        if (legacy.error) return { error: legacy.error.message };
        return { journals: legacy.data || [] };
      }
      return { error: error.message };
    }
    return { journals: data || [] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load journals' };
  }
}

/**
 * Active postable accounts for JE / asset / loan / tax pickers.
 * Shared (organization_id null) + current org. Archived excluded.
 */
export async function getAccountingChartAccounts(
  search?: string,
  opts?: {
    /** Coarse CoA types: income, expense, asset, liability, equity */
    types?: string[];
    /** Fine-grained account_type values when available */
    accountTypes?: string[];
    limit?: number;
  }
) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    const supabase = await createAdminClient();
    const limit = Math.min(200, Math.max(20, opts?.limit || 80));
    let q = supabase
      .from('chart_of_accounts')
      .select('id, code, name, type, account_type, allow_reconciliation')
      .eq('is_active', true)
      .neq('type', 'view')
      .order('code', { ascending: true })
      .limit(limit);

    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.or(
        `organization_id.eq.${scope.organizationId},organization_id.is.null`
      );
    }

    if (opts?.types?.length) {
      q = q.in('type', opts.types);
    }
    if (opts?.accountTypes?.length) {
      q = q.in('account_type', opts.accountTypes);
    }

    const needle = String(search || '').trim();
    if (needle) {
      q = q.or(`code.ilike.%${needle}%,name.ilike.%${needle}%`);
    }
    const { data, error } = await q;
    if (error) {
      // Pre-migration fallback (no organization_id / account_type columns)
      if (/account_type|organization_id|column/i.test(error.message)) {
        let legacy = supabase
          .from('chart_of_accounts')
          .select('id, code, name, type')
          .eq('is_active', true)
          .neq('type', 'view')
          .order('code', { ascending: true })
          .limit(limit);
        if (opts?.types?.length) legacy = legacy.in('type', opts.types);
        if (needle) {
          legacy = legacy.or(`code.ilike.%${needle}%,name.ilike.%${needle}%`);
        }
        const legacyRes = await legacy;
        if (legacyRes.error) return { error: legacyRes.error.message };
        return { accounts: legacyRes.data || [] };
      }
      return { error: error.message };
    }
    return { accounts: data || [] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load accounts' };
  }
}

export async function getAccountingJournalEntries(filters?: {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  /** When set, restrict by source_type. Default: customer invoices only. */
  sourceTypes?: AccountingJournalEntrySourceType[] | 'all';
}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const page = Math.max(1, filters?.page || 1);
    const pageSize = Math.min(100, Math.max(1, filters?.pageSize || 40));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = await createAdminClient();
    let q = supabase
      .from('accounting_journal_entries')
      .select(
        'id, entry_number, entry_date, journal_id, reference, partner_name, organization_id, status, total_debit, total_credit, source_type, source_id, source_number, is_manual, created_by, created_at',
        { count: 'exact' }
      )
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.eq('organization_id', scope.organizationId);
    }

    // List shows invoice (+ credit note) journal entries. Number = source doc.
    const sourceTypes =
      filters?.sourceTypes === 'all'
        ? null
        : filters?.sourceTypes?.length
          ? filters.sourceTypes
          : ([
              'customer_invoice',
              'credit_note',
            ] as AccountingJournalEntrySourceType[]);
    if (sourceTypes) {
      q = q.in('source_type', sourceTypes);
    }

    const status = String(filters?.status || '').trim();
    if (status && status !== 'all') {
      q = q.eq('status', status);
    } else {
      // Active list: hide cancelled (Reset to Draft removes them from here).
      q = q.neq('status', 'cancelled');
    }

    const search = String(filters?.search || '').trim();
    if (search) {
      const like = `%${search.replace(/[%_,]/g, ' ')}%`;
      q = q.or(
        `source_number.ilike.${like},reference.ilike.${like},partner_name.ilike.${like},entry_number.ilike.${like}`
      );
    }

    const { data, error, count } = await q;
    if (error) return { error: error.message };

    const rows = data || [];
    const journalIds = [...new Set(rows.map((r) => String(r.journal_id)))];
    const orgIds = [...new Set(rows.map((r) => String(r.organization_id)))];

    const [{ data: journals }, { data: orgs }] = await Promise.all([
      journalIds.length
        ? supabase.from('journals').select('id, name, code').in('id', journalIds)
        : Promise.resolve({ data: [] as { id: string; name: string; code: string }[] }),
      orgIds.length
        ? supabase.from('organizations').select('id, name').in('id', orgIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    const jMap = new Map((journals || []).map((j) => [String(j.id), j]));
    const oMap = new Map((orgs || []).map((o) => [String(o.id), o]));

    const entries: AccountingJournalEntryListItem[] = rows.map((r) => {
      const j = jMap.get(String(r.journal_id));
      const o = oMap.get(String(r.organization_id));
      return {
        id: String(r.id),
        entry_number: String(r.entry_number),
        entry_date: String(r.entry_date),
        journal_id: String(r.journal_id),
        journal_name: j?.name ? String(j.name) : null,
        journal_code: j?.code ? String(j.code) : null,
        reference: String(r.reference || ''),
        partner_name: r.partner_name ? String(r.partner_name) : null,
        organization_id: String(r.organization_id),
        organization_name: o?.name ? String(o.name) : null,
        status: String(r.status) as AccountingJournalEntryStatus,
        total_debit: Number(r.total_debit) || 0,
        total_credit: Number(r.total_credit) || 0,
        source_type: (r.source_type as AccountingJournalEntrySourceType) || null,
        source_id: r.source_id ? String(r.source_id) : null,
        source_number: r.source_number ? String(r.source_number) : null,
        is_manual: Boolean(r.is_manual),
        created_by: r.created_by ? String(r.created_by) : null,
        created_at: String(r.created_at),
      };
    });

    return { entries, total: count || 0, page, pageSize };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load journal entries',
    };
  }
}

export async function getAccountingJournalEntryDetail(id: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from('accounting_journal_entries')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !row) return { error: error?.message || 'Journal entry not found' };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      String(row.organization_id) !== scope.organizationId
    ) {
      return { error: 'Journal entry not in the selected organization' };
    }

    return { entry: await mapDetail(supabase, row as Record<string, unknown>) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load journal entry',
    };
  }
}

export async function getAccountingJournalEntryLogs(journalEntryId: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('accounting_journal_entry_logs')
      .select('*')
      .eq('journal_entry_id', journalEntryId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return { error: error.message };
    const logs: AccountingJournalEntryLog[] = (data || []).map((l) => ({
      id: String(l.id),
      action: String(l.action),
      performed_by: l.performed_by ? String(l.performed_by) : null,
      previous_status: l.previous_status ? String(l.previous_status) : null,
      new_status: l.new_status ? String(l.new_status) : null,
      details: (l.details || {}) as Record<string, unknown>,
      created_at: String(l.created_at),
    }));
    return { logs };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load activity' };
  }
}

export async function createManualAccountingJournalEntry(input?: {
  journal_id?: string;
  entry_date?: string;
  reference?: string;
}) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.organizationId) {
      return { error: 'Select an organization to create a journal entry' };
    }

    const supabase = await createAdminClient();
    let journalId = input?.journal_id;
    if (!journalId) {
      const { data: gen } = await supabase
        .from('journals')
        .select('id')
        .eq('type', 'general')
        .eq('is_active', true)
        .eq('organization_id', scope.organizationId)
        .limit(1)
        .maybeSingle();
      journalId = gen?.id;
    }
    if (!journalId) {
      const { data: anyOrg } = await supabase
        .from('journals')
        .select('id')
        .eq('is_active', true)
        .eq('organization_id', scope.organizationId)
        .limit(1)
        .maybeSingle();
      journalId = anyOrg?.id;
    }
    if (!journalId) {
      const { data: anyJ } = await supabase
        .from('journals')
        .select('id')
        .eq('type', 'general')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      journalId = anyJ?.id;
    }
    if (!journalId) return { error: 'No active journal found. Seed journals first.' };

    const entryNumber = await allocateEntryNumber(supabase, scope.organizationId);
    const { data: row, error } = await supabase
      .from('accounting_journal_entries')
      .insert([
        {
          organization_id: scope.organizationId,
          entry_number: entryNumber,
          journal_id: journalId,
          entry_date: input?.entry_date || new Date().toISOString().slice(0, 10),
          reference: input?.reference || '',
          status: 'draft',
          source_type: 'manual',
          is_manual: true,
          created_by: scope.session!.username,
          updated_by: scope.session!.username,
        },
      ])
      .select('*')
      .single();

    if (error || !row) return { error: error?.message || 'Failed to create entry' };

    await logEntry(supabase, {
      journalEntryId: String(row.id),
      organizationId: scope.organizationId,
      action: 'created',
      performedBy: scope.session!.username,
      newStatus: 'draft',
      details: { kind: 'manual' },
    });

    return { entry: await mapDetail(supabase, row as Record<string, unknown>) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create journal entry',
    };
  }
}

export async function updateAccountingJournalEntry(
  id: string,
  payload: {
    journal_id?: string;
    entry_date?: string;
    reference?: string;
    partner_name?: string | null;
    contact_id?: string | null;
    currency?: string;
    lines?: JournalEntryLineInput[];
  }
) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    const supabase = await createAdminClient();
    const { data: existing, error: loadError } = await supabase
      .from('accounting_journal_entries')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (loadError || !existing) {
      return { error: loadError?.message || 'Journal entry not found' };
    }
    if (String(existing.status) !== 'draft') {
      return { error: 'Only draft journal entries can be edited' };
    }
    const { getAccountingDocumentLockError } = await import('@/lib/accounting-lock-dates');
    const jeDate =
      payload.entry_date !== undefined ? payload.entry_date : existing.entry_date;
    const jeLockErr = await getAccountingDocumentLockError(
      existing.organization_id ? String(existing.organization_id) : null,
      jeDate ? String(jeDate) : null,
      'general',
      payload.journal_id !== undefined
        ? payload.journal_id
        : existing.journal_id
          ? String(existing.journal_id)
          : null
    );
    if (jeLockErr) return { error: jeLockErr };

    if (!existing.is_manual && existing.source_type && existing.source_type !== 'manual') {
      // Allow label tweaks only via full replace for draft auto entries before post — still draft editable
    }

    let totalDebit = Number(existing.total_debit) || 0;
    let totalCredit = Number(existing.total_credit) || 0;

    if (payload.lines) {
      const validated = validateLines(payload.lines);
      if ('error' in validated && validated.error) return { error: validated.error };
      totalDebit = validated.totalDebit!;
      totalCredit = validated.totalCredit!;

      await supabase
        .from('accounting_journal_entry_lines')
        .delete()
        .eq('journal_entry_id', id);

      await supabase.from('accounting_journal_entry_lines').insert(
        validated.lines!.map((l, idx) => ({
          journal_entry_id: id,
          sequence: (idx + 1) * 10,
          account_id: l.account_id,
          label: l.label || '',
          partner_name: l.partner_name || null,
          contact_id: l.contact_id || null,
          debit: l.debit,
          credit: l.credit,
          analytic_account: l.analytic_account || null,
          tax_label: l.tax_label || null,
        }))
      );
    }

    const { data: row, error } = await supabase
      .from('accounting_journal_entries')
      .update({
        journal_id: payload.journal_id ?? existing.journal_id,
        entry_date: payload.entry_date ?? existing.entry_date,
        reference: payload.reference ?? existing.reference,
        partner_name:
          payload.partner_name !== undefined
            ? payload.partner_name
            : existing.partner_name,
        contact_id:
          payload.contact_id !== undefined ? payload.contact_id : existing.contact_id,
        currency: payload.currency ?? existing.currency,
        total_debit: totalDebit,
        total_credit: totalCredit,
        updated_by: scope.session!.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !row) return { error: error?.message || 'Failed to update entry' };

    await logEntry(supabase, {
      journalEntryId: id,
      organizationId: String(existing.organization_id),
      action: 'updated',
      performedBy: scope.session!.username,
      previousStatus: 'draft',
      newStatus: 'draft',
    });

    return { entry: await mapDetail(supabase, row as Record<string, unknown>) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to update journal entry',
    };
  }
}

export async function postAccountingJournalEntry(id: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    const supabase = await createAdminClient();
    const detailRes = await getAccountingJournalEntryDetail(id);
    if ('error' in detailRes && detailRes.error) return { error: detailRes.error };
    const entry = detailRes.entry!;
    if (entry.status !== 'draft') {
      return { error: 'Only draft journal entries can be posted' };
    }
    const { getAccountingDocumentLockError } = await import('@/lib/accounting-lock-dates');
    const postJeLock = await getAccountingDocumentLockError(
      entry.organization_id ? String(entry.organization_id) : null,
      entry.entry_date ? String(entry.entry_date) : null,
      'general',
      entry.journal_id ? String(entry.journal_id) : null
    );
    if (postJeLock) return { error: postJeLock };

    const validated = validateLines(
      entry.lines.map((l) => ({
        account_id: l.account_id,
        label: l.label,
        partner_name: l.partner_name,
        contact_id: l.contact_id,
        debit: l.debit,
        credit: l.credit,
      }))
    );
    if ('error' in validated && validated.error) return { error: validated.error };

    const { data: row, error } = await supabase
      .from('accounting_journal_entries')
      .update({
        status: 'posted',
        total_debit: validated.totalDebit,
        total_credit: validated.totalCredit,
        posted_at: new Date().toISOString(),
        updated_by: scope.session!.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !row) return { error: error?.message || 'Failed to post entry' };

    await logEntry(supabase, {
      journalEntryId: id,
      organizationId: entry.organization_id,
      action: 'posted',
      performedBy: scope.session!.username,
      previousStatus: 'draft',
      newStatus: 'posted',
    });

    return { entry: await mapDetail(supabase, row as Record<string, unknown>) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to post journal entry',
    };
  }
}

export async function cancelAccountingJournalEntry(id: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    const supabase = await createAdminClient();
    const { data: existing } = await supabase
      .from('accounting_journal_entries')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!existing) return { error: 'Journal entry not found' };
    if (String(existing.status) === 'cancelled') {
      return { error: 'Entry is already cancelled' };
    }
    if (String(existing.status) === 'posted') {
      if (!existing.is_manual && existing.source_type && existing.source_type !== 'manual') {
        return {
          error:
            'Posted automatic journal entries cannot be cancelled. Cancel or reverse the source document so a reversing entry is created.',
        };
      }
      return {
        error:
          'Posted journal entries cannot be cancelled. Create a reversing journal entry so ledgers stay auditable.',
      };
    }

    const { getAccountingDocumentLockError } = await import(
      '@/lib/accounting-lock-dates'
    );
    const cancelLock = await getAccountingDocumentLockError(
      existing.organization_id ? String(existing.organization_id) : scope.organizationId,
      existing.entry_date ? String(existing.entry_date) : null,
      'general',
      existing.journal_id ? String(existing.journal_id) : null
    );
    if (cancelLock) return { error: cancelLock };

    const { data: row, error } = await supabase
      .from('accounting_journal_entries')
      .update({
        status: 'cancelled',
        updated_by: scope.session!.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !row) return { error: error?.message || 'Failed to cancel' };

    await logEntry(supabase, {
      journalEntryId: id,
      organizationId: String(existing.organization_id),
      action: 'cancelled',
      performedBy: scope.session!.username,
      previousStatus: String(existing.status),
      newStatus: 'cancelled',
    });

    return { entry: await mapDetail(supabase, row as Record<string, unknown>) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to cancel journal entry',
    };
  }
}

export async function resetAccountingJournalEntryToDraft(id: string) {
  try {
    const scope = await resolveScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    const supabase = await createAdminClient();
    const { data: existing } = await supabase
      .from('accounting_journal_entries')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!existing) return { error: 'Journal entry not found' };
    if (String(existing.status) === 'posted') {
      return {
        error:
          'Posted journal entries cannot be reset to draft. Create a reversing journal entry so ledgers stay auditable.',
      };
    }
    if (!existing.is_manual && existing.source_type && existing.source_type !== 'manual') {
      return {
        error:
          'Automatically generated journal entries cannot be reset to draft. Cancel the source document instead.',
      };
    }
    if (String(existing.status) !== 'cancelled') {
      return { error: 'Only cancelled draft-reset is allowed for manual entries' };
    }

    const { getAccountingDocumentLockError } = await import(
      '@/lib/accounting-lock-dates'
    );
    const resetJeLock = await getAccountingDocumentLockError(
      existing.organization_id ? String(existing.organization_id) : scope.organizationId,
      existing.entry_date ? String(existing.entry_date) : null,
      'general',
      existing.journal_id ? String(existing.journal_id) : null
    );
    if (resetJeLock) return { error: resetJeLock };

    const { data: row, error } = await supabase
      .from('accounting_journal_entries')
      .update({
        status: 'draft',
        posted_at: null,
        updated_by: scope.session!.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !row) return { error: error?.message || 'Failed to reset' };

    await logEntry(supabase, {
      journalEntryId: id,
      organizationId: String(existing.organization_id),
      action: 'reset_to_draft',
      performedBy: scope.session!.username,
      previousStatus: String(existing.status),
      newStatus: 'draft',
    });

    return { entry: await mapDetail(supabase, row as Record<string, unknown>) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to reset journal entry',
    };
  }
}

export async function duplicateAccountingJournalEntry(id: string) {
  try {
    const detailRes = await getAccountingJournalEntryDetail(id);
    if ('error' in detailRes && detailRes.error) return { error: detailRes.error };
    const source = detailRes.entry!;
    const created = await createManualAccountingJournalEntry({
      journal_id: source.journal_id,
      entry_date: source.entry_date,
      reference: source.reference ? `Copy of ${source.reference}` : `Copy of ${source.entry_number}`,
    });
    if ('error' in created && created.error) return { error: created.error };
    return updateAccountingJournalEntry(created.entry!.id, {
      partner_name: source.partner_name,
      contact_id: source.contact_id,
      currency: source.currency,
      lines: source.lines.map((l) => ({
        account_id: l.account_id,
        label: l.label,
        partner_name: l.partner_name,
        contact_id: l.contact_id,
        debit: l.debit,
        credit: l.credit,
        analytic_account: l.analytic_account,
        tax_label: l.tax_label,
      })),
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to duplicate journal entry',
    };
  }
}

export async function getJournalEntryIdForSource(
  sourceType: AccountingJournalEntrySourceType,
  sourceId: string
) {
  try {
    const supabase = await createAdminClient();
    const { data } = await supabase
      .from('accounting_journal_entries')
      .select('id')
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
      .neq('status', 'cancelled')
      .maybeSingle();
    return { journalEntryId: data?.id ? String(data.id) : null };
  } catch {
    return { journalEntryId: null };
  }
}

/** Internal: create + post automatic JE (idempotent by source). */
export async function createAndPostAutomaticJournalEntry(args: {
  organizationId: string;
  journalId: string;
  entryDate: string;
  reference: string;
  partnerName?: string | null;
  contactId?: string | null;
  sourceType: AccountingJournalEntrySourceType;
  sourceId: string;
  sourceNumber?: string | null;
  lines: AutoPostingLine[];
  performedBy: string;
  /** When omitted, derived from sourceType so sale locks do not block purchase JEs. */
  lockDomain?: import('@/lib/accounting-lock-dates').AccountingLockDomain;
}) {
  const supabase = await createAdminClient();

  const { data: existing } = await supabase
    .from('accounting_journal_entries')
    .select('id')
    .eq('organization_id', args.organizationId)
    .eq('source_type', args.sourceType)
    .eq('source_id', args.sourceId)
    .neq('status', 'cancelled')
    .maybeSingle();
  if (existing?.id) {
    return { journalEntryId: String(existing.id), alreadyExists: true as const };
  }

  const { getAccountingDocumentLockError, lockDomainFromJournalSource } = await import('@/lib/accounting-lock-dates');
  const autoLockErr = await getAccountingDocumentLockError(
    args.organizationId,
    args.entryDate,
    args.lockDomain || lockDomainFromJournalSource(args.sourceType),
    args.journalId
  );
  if (autoLockErr) return { error: autoLockErr };

  const validated = validateLines(
    args.lines.map((l) => ({
      account_id: l.account_id,
      label: l.label,
      partner_name: l.partner_name,
      contact_id: l.contact_id,
      debit: l.debit,
      credit: l.credit,
    }))
  );
  if ('error' in validated && validated.error) {
    return { error: validated.error };
  }

  const entryNumber = await allocateEntryNumber(supabase, args.organizationId);
  const { data: row, error } = await supabase
    .from('accounting_journal_entries')
    .insert([
      {
        organization_id: args.organizationId,
        entry_number: entryNumber,
        journal_id: args.journalId,
        entry_date: args.entryDate,
        reference: args.reference,
        partner_name: args.partnerName || null,
        contact_id: args.contactId || null,
        status: 'posted',
        total_debit: validated.totalDebit,
        total_credit: validated.totalCredit,
        source_type: args.sourceType,
        source_id: args.sourceId,
        source_number: args.sourceNumber || null,
        is_manual: false,
        posted_at: new Date().toISOString(),
        created_by: args.performedBy,
        updated_by: args.performedBy,
      },
    ])
    .select('*')
    .single();

  if (error || !row) {
    // Unique race — fetch existing
    if (error?.code === '23505') {
      const { data: again } = await supabase
        .from('accounting_journal_entries')
        .select('id')
        .eq('source_type', args.sourceType)
        .eq('source_id', args.sourceId)
        .maybeSingle();
      if (again?.id) {
        return { journalEntryId: String(again.id), alreadyExists: true as const };
      }
    }
    if (
      args.sourceType === 'vendor_refund' &&
      error &&
      /source_type|check constraint/i.test(error.message)
    ) {
      return {
        error:
          'Vendor refund journal entries are not enabled yet. Run supabase/migrations/fix_accounting_vendor_refund_journal_entries.sql in the SQL editor, then post the refund again.',
      };
    }
    return { error: error?.message || 'Failed to create automatic journal entry' };
  }

  const lineRows = validated.lines!.map((l, idx) => {
    const amount = Math.max(Number(l.debit) || 0, Number(l.credit) || 0);
    const src = args.lines[idx];
    return {
      journal_entry_id: row.id,
      sequence: (idx + 1) * 10,
      account_id: l.account_id,
      label: l.label || '',
      partner_name: l.partner_name || null,
      contact_id: l.contact_id || null,
      debit: l.debit,
      credit: l.credit,
      tax_label: src?.tax_label || null,
      amount_residual: amount,
      is_reconciled: amount <= 0.004,
    };
  });

  let { error: lineErr } = await supabase
    .from('accounting_journal_entry_lines')
    .insert(lineRows);
  if (lineErr && /tax_label|column/i.test(lineErr.message)) {
    const withoutTax = lineRows.map(({ tax_label: _t, ...rest }) => {
      void _t;
      return rest;
    });
    const retryTax = await supabase
      .from('accounting_journal_entry_lines')
      .insert(withoutTax);
    lineErr = retryTax.error;
  }
  if (lineErr && /amount_residual|is_reconciled|column/i.test(lineErr.message)) {
    const legacy = lineRows.map((row) => {
      const { amount_residual: _a, is_reconciled: _i, tax_label: _t, ...rest } =
        row;
      void _a;
      void _i;
      void _t;
      return rest;
    });
    const retry = await supabase
      .from('accounting_journal_entry_lines')
      .insert(legacy);
    lineErr = retry.error;
  }
  if (lineErr) {
    await supabase.from('accounting_journal_entries').delete().eq('id', row.id);
    return { error: lineErr.message };
  }

  await logEntry(supabase, {
    journalEntryId: String(row.id),
    organizationId: args.organizationId,
    action: 'created',
    performedBy: args.performedBy,
    newStatus: 'posted',
    details: {
      kind: 'automatic',
      source_type: args.sourceType,
      source_id: args.sourceId,
    },
  });
  await logEntry(supabase, {
    journalEntryId: String(row.id),
    organizationId: args.organizationId,
    action: 'posted',
    performedBy: args.performedBy,
    previousStatus: 'draft',
    newStatus: 'posted',
    details: { automatic: true },
  });

  return { journalEntryId: String(row.id), alreadyExists: false as const };
}

export async function postJournalEntryForCustomerInvoice(invoiceId: string) {
  try {
    const supabase = await createAdminClient();
    const { data: inv, error } = await supabase
      .from('accounting_customer_invoices')
      .select('*')
      .eq('id', invoiceId)
      .maybeSingle();
    if (error || !inv) return { error: error?.message || 'Invoice not found' };
    if (String(inv.status) !== 'posted' && String(inv.status) !== 'paid') {
      return { error: 'Invoice must be posted before creating a journal entry' };
    }

    // Stale link after Reset to Draft / cancelled JE → recreate.
    if (inv.journal_entry_id) {
      const { data: linked } = await supabase
        .from('accounting_journal_entries')
        .select('id, status')
        .eq('id', inv.journal_entry_id)
        .maybeSingle();
      if (linked && String(linked.status) !== 'cancelled') {
        return {
          journalEntryId: String(linked.id),
          alreadyExists: true as const,
        };
      }
      await supabase
        .from('accounting_customer_invoices')
        .update({
          journal_entry_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId);
    }

    const built = await buildCustomerInvoiceLines({
      untaxed: Number(inv.untaxed_amount) || 0,
      tax: Number(inv.tax_amount) || 0,
      total: Number(inv.total_amount) || 0,
      partnerName: String(inv.customer_name || 'Customer'),
      contactId: inv.contact_id ? String(inv.contact_id) : null,
      invoiceNumber: String(inv.invoice_number),
      organizationId: String(inv.organization_id),
      invoiceId,
    });

    const res = await createAndPostAutomaticJournalEntry({
      organizationId: String(inv.organization_id),
      journalId: built.journalId,
      entryDate: String(inv.invoice_date).slice(0, 10),
      reference: String(inv.invoice_number),
      partnerName: String(inv.customer_name || ''),
      contactId: inv.contact_id ? String(inv.contact_id) : null,
      sourceType: 'customer_invoice',
      sourceId: invoiceId,
      sourceNumber: String(inv.invoice_number),
      lines: built.lines,
      performedBy: String(inv.updated_by || inv.created_by || 'system'),
    });

    if ('journalEntryId' in res && res.journalEntryId) {
      await supabase
        .from('accounting_customer_invoices')
        .update({
          journal_entry_id: res.journalEntryId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId);
    }
    return res;
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to create invoice journal entry',
    };
  }
}

export async function postJournalEntryForCustomerPayment(paymentId: string) {
  try {
    const supabase = await createAdminClient();
    const { data: pay, error } = await supabase
      .from('accounting_invoice_payments')
      .select('*')
      .eq('id', paymentId)
      .maybeSingle();
    if (error || !pay) return { error: error?.message || 'Payment not found' };
    if (pay.journal_entry_id) {
      return { journalEntryId: String(pay.journal_entry_id), alreadyExists: true as const };
    }

    const { data: inv } = await supabase
      .from('accounting_customer_invoices')
      .select('id, organization_id, customer_name, contact_id, invoice_number')
      .eq('id', pay.invoice_id)
      .maybeSingle();
    if (!inv) return { error: 'Related invoice not found' };

    const journalKind =
      String(pay.journal) === 'cash' || String(pay.payment_method) === 'cash'
        ? ('cash' as const)
        : ('bank' as const);

    const built = await buildCustomerPaymentLines({
      amount: Number(pay.amount) || 0,
      partnerName: String(inv.customer_name || 'Customer'),
      contactId: inv.contact_id ? String(inv.contact_id) : null,
      paymentNumber: pay.payment_number ? String(pay.payment_number) : undefined,
      journalKind,
      organizationId: String(inv.organization_id),
    });

    const res = await createAndPostAutomaticJournalEntry({
      organizationId: String(inv.organization_id),
      journalId: built.journalId,
      entryDate: String(pay.payment_date).slice(0, 10),
      reference: String(pay.reference || pay.payment_number || inv.invoice_number),
      partnerName: String(inv.customer_name || ''),
      contactId: inv.contact_id ? String(inv.contact_id) : null,
      sourceType: 'customer_payment',
      sourceId: paymentId,
      sourceNumber: pay.payment_number ? String(pay.payment_number) : null,
      lines: built.lines,
      performedBy: String(pay.created_by || 'system'),
    });

    if ('journalEntryId' in res && res.journalEntryId) {
      await supabase
        .from('accounting_invoice_payments')
        .update({ journal_entry_id: res.journalEntryId })
        .eq('id', paymentId);
    }
    return res;
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to create payment journal entry',
    };
  }
}

/** Dr Outstanding Receipts / Cr AR when a bank payment is matched to an invoice. */
export async function postJournalEntryForBankPaymentSettlement(opts: {
  paymentId: string;
  reconciliationId: string;
  amount: number;
  performedBy: string;
}) {
  try {
    const supabase = await createAdminClient();
    const { data: pay, error } = await supabase
      .from('accounting_invoice_payments')
      .select('*')
      .eq('id', opts.paymentId)
      .maybeSingle();
    if (error || !pay) return { error: error?.message || 'Payment not found' };

    const journalKind =
      String(pay.journal) === 'cash' || String(pay.payment_method) === 'cash'
        ? ('cash' as const)
        : ('bank' as const);
    if (journalKind !== 'bank') {
      return { skipped: true as const };
    }

    const { data: inv } = await supabase
      .from('accounting_customer_invoices')
      .select('id, organization_id, customer_name, contact_id, invoice_number')
      .eq('id', pay.invoice_id)
      .maybeSingle();
    if (!inv) return { error: 'Related invoice not found' };

    const built = await buildBankPaymentSettlementLines({
      amount: opts.amount,
      partnerName: String(inv.customer_name || 'Customer'),
      contactId: inv.contact_id ? String(inv.contact_id) : null,
      paymentNumber: pay.payment_number ? String(pay.payment_number) : undefined,
      organizationId: String(inv.organization_id),
    });

    return createAndPostAutomaticJournalEntry({
      organizationId: String(inv.organization_id),
      journalId: built.journalId,
      entryDate: String(pay.payment_date).slice(0, 10),
      reference: String(
        pay.reference || pay.payment_number || inv.invoice_number || opts.reconciliationId
      ),
      partnerName: String(inv.customer_name || ''),
      contactId: inv.contact_id ? String(inv.contact_id) : null,
      sourceType: 'manual',
      sourceId: opts.reconciliationId,
      sourceNumber: pay.payment_number ? String(pay.payment_number) : null,
      lines: built.lines,
      performedBy: opts.performedBy,
    });
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : 'Failed to create bank settlement journal entry',
    };
  }
}

export async function postJournalEntryForVendorPayment(paymentId: string) {
  try {
    const supabase = await createAdminClient();
    const { data: pay, error } = await supabase
      .from('accounting_vendor_payments')
      .select('*')
      .eq('id', paymentId)
      .maybeSingle();
    if (error || !pay) return { error: error?.message || 'Payment not found' };
    if ((pay as { journal_entry_id?: string | null }).journal_entry_id) {
      return {
        journalEntryId: String(
          (pay as { journal_entry_id?: string }).journal_entry_id
        ),
        alreadyExists: true as const,
      };
    }

    const { data: bill } = await supabase
      .from('accounting_vendor_bills')
      .select('id, organization_id, vendor_name, contact_id, bill_number')
      .eq('id', pay.bill_id)
      .maybeSingle();
    if (!bill) return { error: 'Related bill not found' };

    const journalKind =
      String(pay.payment_method) === 'cash'
        ? ('cash' as const)
        : ('bank' as const);

    const built = await buildVendorPaymentLines({
      amount: Number(pay.amount) || 0,
      partnerName: String(bill.vendor_name || 'Vendor'),
      contactId: bill.contact_id ? String(bill.contact_id) : null,
      paymentReference: pay.reference ? String(pay.reference) : undefined,
      journalKind,
      organizationId: String(bill.organization_id),
    });

    const res = await createAndPostAutomaticJournalEntry({
      organizationId: String(bill.organization_id),
      journalId: built.journalId,
      entryDate: String(pay.payment_date).slice(0, 10),
      reference: String(pay.reference || bill.bill_number || ''),
      partnerName: String(bill.vendor_name || ''),
      contactId: bill.contact_id ? String(bill.contact_id) : null,
      sourceType: 'vendor_payment',
      sourceId: paymentId,
      sourceNumber: pay.reference ? String(pay.reference) : null,
      lines: built.lines,
      performedBy: String(pay.created_by || pay.paid_by || 'system'),
    });

    if ('journalEntryId' in res && res.journalEntryId) {
      await supabase
        .from('accounting_vendor_payments')
        .update({ journal_entry_id: res.journalEntryId })
        .eq('id', paymentId);
    }
    return res;
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : 'Failed to create vendor payment journal entry',
    };
  }
}

export async function postJournalEntryForCreditNote(
  creditNoteId: string,
  opts?: { journalId?: string | null }
) {
  try {
    const supabase = await createAdminClient();
    const { data: cn, error } = await supabase
      .from('accounting_credit_notes')
      .select('*')
      .eq('id', creditNoteId)
      .maybeSingle();
    if (error || !cn) return { error: error?.message || 'Credit note not found' };
    if (String(cn.status) !== 'posted') {
      return { error: 'Credit note must be posted before creating a journal entry' };
    }

    if (cn.journal_entry_id) {
      const { data: linked } = await supabase
        .from('accounting_journal_entries')
        .select('id, status')
        .eq('id', cn.journal_entry_id)
        .maybeSingle();
      if (linked && String(linked.status) !== 'cancelled') {
        return {
          journalEntryId: String(linked.id),
          alreadyExists: true as const,
        };
      }
      await supabase
        .from('accounting_credit_notes')
        .update({
          journal_entry_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', creditNoteId);
    }

    const built = await buildCreditNoteLines({
      untaxed: Number(cn.untaxed_amount) || 0,
      tax: Number(cn.tax_amount) || 0,
      total: Number(cn.total_amount) || 0,
      partnerName: String(cn.customer_name || 'Customer'),
      contactId: cn.contact_id ? String(cn.contact_id) : null,
      creditNoteNumber: String(cn.credit_note_number),
      organizationId: String(cn.organization_id),
      creditNoteId,
    });

    const res = await createAndPostAutomaticJournalEntry({
      organizationId: String(cn.organization_id),
      journalId: opts?.journalId || built.journalId,
      entryDate: String(cn.credit_note_date || cn.created_at).slice(0, 10),
      reference: String(cn.credit_note_number),
      partnerName: String(cn.customer_name || ''),
      contactId: cn.contact_id ? String(cn.contact_id) : null,
      sourceType: 'credit_note',
      sourceId: creditNoteId,
      sourceNumber: String(cn.credit_note_number),
      lines: built.lines,
      performedBy: String(cn.updated_by || cn.created_by || 'system'),
    });

    if ('journalEntryId' in res && res.journalEntryId) {
      await supabase
        .from('accounting_credit_notes')
        .update({
          journal_entry_id: res.journalEntryId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', creditNoteId);
    }
    return res;
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : 'Failed to create credit note journal entry',
    };
  }
}

export async function postJournalEntryForVendorBill(billId: string) {
  try {
    const supabase = await createAdminClient();
    const { data: bill, error } = await supabase
      .from('accounting_vendor_bills')
      .select('*')
      .eq('id', billId)
      .maybeSingle();
    if (error || !bill) return { error: error?.message || 'Vendor bill not found' };
    if (String(bill.status) !== 'posted' && String(bill.status) !== 'paid') {
      return { error: 'Bill must be posted before creating a journal entry' };
    }
    if (bill.journal_entry_id) {
      return { journalEntryId: String(bill.journal_entry_id), alreadyExists: true as const };
    }

    const built = await buildVendorBillLines({
      total: Number(bill.total_amount) || 0,
      untaxed: Number(bill.untaxed_amount) || 0,
      tax: Number(bill.tax_amount) || 0,
      partnerName: String(bill.vendor_name || 'Vendor'),
      contactId: bill.contact_id ? String(bill.contact_id) : null,
      billNumber: String(bill.bill_number),
      organizationId: String(bill.organization_id),
      billId,
    });

    const res = await createAndPostAutomaticJournalEntry({
      organizationId: String(bill.organization_id),
      journalId: built.journalId,
      entryDate: String(bill.bill_date || bill.created_at).slice(0, 10),
      reference: String(bill.bill_number),
      partnerName: String(bill.vendor_name || ''),
      contactId: bill.contact_id ? String(bill.contact_id) : null,
      sourceType: 'vendor_bill',
      sourceId: billId,
      sourceNumber: String(bill.bill_number),
      lines: built.lines,
      performedBy: String(bill.updated_by || bill.created_by || 'system'),
    });

    if ('journalEntryId' in res && res.journalEntryId) {
      await supabase
        .from('accounting_vendor_bills')
        .update({
          journal_entry_id: res.journalEntryId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', billId);
    }
    return res;
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create bill journal entry',
    };
  }
}

export async function postJournalEntryForVendorRefund(refundId: string) {
  try {
    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from('accounting_vendor_refunds')
      .select('*')
      .eq('id', refundId)
      .maybeSingle();
    if (error || !row) return { error: error?.message || 'Vendor refund not found' };
    if (String(row.status) !== 'posted') {
      return { error: 'Vendor refund must be posted before creating a journal entry' };
    }

    if (row.journal_entry_id) {
      const { data: linked } = await supabase
        .from('accounting_journal_entries')
        .select('id, status')
        .eq('id', row.journal_entry_id)
        .maybeSingle();
      if (linked && String(linked.status) !== 'cancelled') {
        return {
          journalEntryId: String(linked.id),
          alreadyExists: true as const,
        };
      }
      await supabase
        .from('accounting_vendor_refunds')
        .update({
          journal_entry_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', refundId);
    }

    const built = await buildVendorRefundLines({
      total: Number(row.total_amount) || 0,
      untaxed: Number(row.untaxed_amount) || 0,
      tax: Number(row.tax_amount) || 0,
      partnerName: String(row.vendor_name || 'Vendor'),
      contactId: row.contact_id ? String(row.contact_id) : null,
      refundNumber: String(row.refund_number),
      organizationId: String(row.organization_id),
      refundId,
    });

    const res = await createAndPostAutomaticJournalEntry({
      organizationId: String(row.organization_id),
      journalId: built.journalId,
      entryDate: String(row.refund_date || row.created_at).slice(0, 10),
      reference: String(row.refund_number),
      partnerName: String(row.vendor_name || ''),
      contactId: row.contact_id ? String(row.contact_id) : null,
      sourceType: 'vendor_refund',
      sourceId: refundId,
      sourceNumber: String(row.refund_number),
      lines: built.lines,
      performedBy: String(row.updated_by || row.created_by || 'system'),
    });

    if ('journalEntryId' in res && res.journalEntryId) {
      const linked = await supabase
        .from('accounting_vendor_refunds')
        .update({
          journal_entry_id: res.journalEntryId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', refundId);
      if (linked.error && /journal_entry_id|column/i.test(linked.error.message)) {
        // Column missing until SQL migration — JE still exists via source_type.
      }
    }
    return res;
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : 'Failed to create vendor refund journal entry',
    };
  }
}
