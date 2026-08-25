'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import {
  requireAccountingActionAccess,
  sessionHasAccountingAccess,
} from '@/lib/accounting-page-access';
import {
  ACCOUNTING_JOURNAL_TYPES,
  defaultSequencePrefix,
  journalsToCsv,
  normalizeJournalCode,
  normalizeJournalName,
  parseJournalCsv,
  type AccountingJournalType,
} from '@/lib/accounting-journals';

export type AccountingJournalListItem = {
  id: string;
  name: string;
  code: string;
  type: AccountingJournalType;
  organization_id: string | null;
  organization_name: string | null;
  currency: string;
  default_debit_account_id: string | null;
  default_credit_account_id: string | null;
  default_debit_account_code: string | null;
  default_debit_account_name: string | null;
  default_credit_account_code: string | null;
  default_credit_account_name: string | null;
  sequence_prefix: string | null;
  next_number: number;
  is_active: boolean;
  notes: string | null;
  updated_at: string;
};

export type AccountingJournalDetail = AccountingJournalListItem & {
  created_at: string;
  created_by: string | null;
  updated_by: string | null;
};

const VALID_TYPES = ACCOUNTING_JOURNAL_TYPES.map((t) => t.value);

async function resolveJournalScope(opts?: { config?: boolean }) {
  let session: Awaited<ReturnType<typeof getSession>> = null;

  if (opts?.config) {
    const access = await requireAccountingActionAccess({ config: true });
    if ('error' in access && access.error) return { error: access.error };
    session = access.session;
  } else {
    session = await getSession();
    if (!session || !sessionHasAccountingAccess(session)) {
      return { error: 'Unauthorized' as const };
    }
  }

  if (!session) return { error: 'Unauthorized' as const };

  const { requireAdminOrganizationScope, sessionUsesOrganizationScope } = await import(
    '@/lib/admin-organization-context'
  );

  if (!sessionUsesOrganizationScope(session.role)) {
    return {
      session,
      organizationId: null as string | null,
      isGlobalAdminView: false,
    };
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
    return { error: 'Select an organization from the header switcher.' };
  }

  return {
    session: scope.session,
    organizationId: scope.organizationId,
    isGlobalAdminView: false,
  };
}

function mapJournal(
  r: Record<string, unknown>,
  extras?: {
    organization_name?: string | null;
    debit_code?: string | null;
    debit_name?: string | null;
    credit_code?: string | null;
    credit_name?: string | null;
  }
): AccountingJournalListItem {
  return {
    id: String(r.id),
    name: String(r.name || ''),
    code: String(r.code || ''),
    type: String(r.type || 'general') as AccountingJournalType,
    organization_id: r.organization_id ? String(r.organization_id) : null,
    organization_name: extras?.organization_name ?? null,
    currency: String(r.currency || 'PKR').toUpperCase(),
    default_debit_account_id: r.default_debit_account_id
      ? String(r.default_debit_account_id)
      : null,
    default_credit_account_id: r.default_credit_account_id
      ? String(r.default_credit_account_id)
      : null,
    default_debit_account_code: extras?.debit_code ?? null,
    default_debit_account_name: extras?.debit_name ?? null,
    default_credit_account_code: extras?.credit_code ?? null,
    default_credit_account_name: extras?.credit_name ?? null,
    sequence_prefix: r.sequence_prefix ? String(r.sequence_prefix) : null,
    next_number: Number(r.next_number) || 1,
    is_active: r.is_active !== false,
    notes: r.notes ? String(r.notes) : null,
    updated_at: String(r.updated_at || ''),
  };
}

async function enrichJournals(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  rows: Record<string, unknown>[]
) {
  const accountIds = [
    ...new Set(
      rows
        .flatMap((r) => [
          r.default_debit_account_id ? String(r.default_debit_account_id) : '',
          r.default_credit_account_id ? String(r.default_credit_account_id) : '',
        ])
        .filter(Boolean)
    ),
  ];
  const orgIds = [
    ...new Set(rows.map((r) => String(r.organization_id || '')).filter(Boolean)),
  ];

  const [{ data: accounts }, { data: orgs }] = await Promise.all([
    accountIds.length
      ? supabase
          .from('chart_of_accounts')
          .select('id, code, name')
          .in('id', accountIds)
      : Promise.resolve({ data: [] as { id: string; code: string; name: string }[] }),
    orgIds.length
      ? supabase.from('organizations').select('id, name').in('id', orgIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const aMap = new Map(
    (accounts || []).map((a) => [
      String(a.id),
      { code: String(a.code), name: String(a.name) },
    ])
  );
  const oMap = new Map((orgs || []).map((o) => [String(o.id), String(o.name || '')]));

  return rows.map((r) => {
    const debit = r.default_debit_account_id
      ? aMap.get(String(r.default_debit_account_id))
      : null;
    const credit = r.default_credit_account_id
      ? aMap.get(String(r.default_credit_account_id))
      : null;
    return mapJournal(r, {
      organization_name: r.organization_id
        ? oMap.get(String(r.organization_id)) || null
        : 'Shared',
      debit_code: debit?.code ?? null,
      debit_name: debit?.name ?? null,
      credit_code: credit?.code ?? null,
      credit_name: credit?.name ?? null,
    });
  });
}

/** Ensure the five Odoo default shared journals exist. Safe to call repeatedly. */
export async function ensureDefaultAccountingJournals() {
  try {
    const scope = await resolveJournalScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const defaults: Array<{
      name: string;
      code: string;
      type: AccountingJournalType;
      debitCode: string | null;
      creditCode: string | null;
      prefix: string;
    }> = [
      {
        name: 'Sales Journal',
        code: 'SJ',
        type: 'sales',
        debitCode: '1300',
        creditCode: '4100',
        prefix: 'SJ',
      },
      {
        name: 'Purchase Journal',
        code: 'PJ',
        type: 'purchase',
        debitCode: '5100',
        creditCode: '2100',
        prefix: 'PJ',
      },
      {
        name: 'Bank Journal',
        code: 'BNK',
        type: 'bank',
        debitCode: '1200',
        creditCode: '1200',
        prefix: 'BNK',
      },
      {
        name: 'Cash Journal',
        code: 'CSH',
        type: 'cash',
        debitCode: '1100',
        creditCode: '1100',
        prefix: 'CSH',
      },
      {
        name: 'Miscellaneous Journal',
        code: 'GEN',
        type: 'general',
        debitCode: null,
        creditCode: null,
        prefix: 'MISC',
      },
    ];

    let created = 0;
    for (const d of defaults) {
      const { data: existing } = await supabase
        .from('journals')
        .select('id')
        .eq('code', d.code)
        .is('organization_id', null)
        .maybeSingle();
      if (existing?.id) continue;

      let debitId: string | null = null;
      let creditId: string | null = null;
      if (d.debitCode) {
        const { data: acc } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('code', d.debitCode)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        debitId = acc?.id ? String(acc.id) : null;
      }
      if (d.creditCode) {
        const { data: acc } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('code', d.creditCode)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        creditId = acc?.id ? String(acc.id) : null;
      }

      const { error } = await supabase.from('journals').insert([
        {
          name: d.name,
          code: d.code,
          type: d.type,
          default_debit_account_id: debitId,
          default_credit_account_id: creditId,
          organization_id: null,
          currency: 'PKR',
          sequence_prefix: d.prefix,
          next_number: 1,
          is_active: true,
          created_by: scope.session?.username || null,
          updated_by: scope.session?.username || null,
        },
      ]);
      if (!error) created += 1;
    }

    return { created };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to ensure default journals',
    };
  }
}

export async function getAccountingConfigJournals(opts?: {
  search?: string;
  type?: string;
  status?: 'all' | 'active' | 'archived';
  page?: number;
  pageSize?: number;
}) {
  try {
    const scope = await resolveJournalScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { journals: [] as AccountingJournalListItem[], total: 0, page: 1, pageSize: 40 };
    }

    const page = Math.max(1, opts?.page || 1);
    const pageSize = Math.min(200, Math.max(1, opts?.pageSize || 40));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = await createAdminClient();
    let q = supabase
      .from('journals')
      .select('*', { count: 'exact' })
      .order('code', { ascending: true })
      .range(from, to);

    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.or(
        `organization_id.eq.${scope.organizationId},organization_id.is.null`
      );
    }

    const status = opts?.status || 'active';
    if (status === 'active') q = q.eq('is_active', true);
    if (status === 'archived') q = q.eq('is_active', false);

    const type = String(opts?.type || '').trim();
    if (type && type !== 'all') q = q.eq('type', type);

    const search = String(opts?.search || '').trim();
    if (search) {
      q = q.or(`code.ilike.%${search}%,name.ilike.%${search}%`);
    }

    const { data, error, count } = await q;
    if (error) {
      if (/organization_id|currency|sequence_prefix|column/i.test(error.message)) {
        return {
          journals: [] as AccountingJournalListItem[],
          total: 0,
          page,
          pageSize,
          migrationRequired: true as const,
        };
      }
      return { error: error.message };
    }

    const journals = await enrichJournals(
      supabase,
      (data || []) as Record<string, unknown>[]
    );
    return { journals, total: count || 0, page, pageSize };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load journals',
    };
  }
}

export async function getAccountingConfigJournalDetail(journalId: string) {
  try {
    const scope = await resolveJournalScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from('journals')
      .select('*')
      .eq('id', journalId)
      .maybeSingle();
    if (error || !row) return { error: error?.message || 'Journal not found' };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      row.organization_id &&
      String(row.organization_id) !== scope.organizationId
    ) {
      return { error: 'Journal not in the selected organization' };
    }

    const [enriched] = await enrichJournals(supabase, [
      row as Record<string, unknown>,
    ]);
    const detail: AccountingJournalDetail = {
      ...enriched,
      created_at: String(row.created_at || ''),
      created_by: row.created_by ? String(row.created_by) : null,
      updated_by: row.updated_by ? String(row.updated_by) : null,
    };
    return { journal: detail };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load journal',
    };
  }
}

async function assertUniqueJournalCode(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  code: string,
  organizationId: string | null,
  excludeId?: string
) {
  let q = supabase.from('journals').select('id').eq('code', code).limit(1);
  if (organizationId) q = q.eq('organization_id', organizationId);
  else q = q.is('organization_id', null);
  if (excludeId) q = q.neq('id', excludeId);
  const { data } = await q.maybeSingle();
  if (data?.id) return 'Journal code must be unique within the organization';
  return null;
}

async function loadAccount(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  accountId: string | null
) {
  if (!accountId) return null;
  const { data } = await supabase
    .from('chart_of_accounts')
    .select('id, code, name, type, is_active')
    .eq('id', accountId)
    .maybeSingle();
  return data;
}

function validateAccountForType(
  account: { type: string; is_active: boolean } | null,
  journalType: AccountingJournalType,
  side: 'debit' | 'credit'
) {
  if (!account) return null;
  if (!account.is_active) return `Default ${side} account must be active`;
  if (account.type === 'view') return `Default ${side} account cannot be a view account`;
  if ((journalType === 'bank' || journalType === 'cash') && account.type !== 'asset') {
    return `${journalType === 'bank' ? 'Bank' : 'Cash'} journals must use asset accounts`;
  }
  if (journalType === 'sales' && side === 'credit' && account.type !== 'income') {
    return 'Sales journals should use an income account as the default credit account';
  }
  if (
    journalType === 'purchase' &&
    side === 'debit' &&
    account.type !== 'expense' &&
    account.type !== 'asset'
  ) {
    return 'Purchase journals should use an expense or asset account as the default debit account';
  }
  return null;
}

export async function createAccountingConfigJournal(payload: {
  name: string;
  code: string;
  type: AccountingJournalType;
  currency?: string;
  default_debit_account_id?: string | null;
  default_credit_account_id?: string | null;
  sequence_prefix?: string | null;
  notes?: string | null;
  orgSpecific?: boolean;
}) {
  try {
    const scope = await resolveJournalScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const name = normalizeJournalName(payload.name);
    const code = normalizeJournalCode(payload.code);
    const type = payload.type;
    if (!name) return { error: 'Journal name is required' };
    if (!code) return { error: 'Journal code is required' };
    if (!VALID_TYPES.includes(type)) return { error: 'Invalid journal type' };

    const currency = String(payload.currency || 'PKR')
      .trim()
      .toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return { error: 'Currency must be a 3-letter code' };

    const organizationId =
      payload.orgSpecific && scope.organizationId ? scope.organizationId : null;
    if (payload.orgSpecific && !scope.organizationId) {
      return {
        error: 'Select an organization to create an organization-specific journal',
      };
    }

    const supabase = await createAdminClient();
    const uniqueErr = await assertUniqueJournalCode(supabase, code, organizationId);
    if (uniqueErr) return { error: uniqueErr };

    const debitId = payload.default_debit_account_id || null;
    const creditId = payload.default_credit_account_id || null;
    const debit = await loadAccount(supabase, debitId);
    const credit = await loadAccount(supabase, creditId);
    if (debitId && !debit) return { error: 'Default debit account not found' };
    if (creditId && !credit) return { error: 'Default credit account not found' };

    const debitErr = validateAccountForType(debit, type, 'debit');
    if (debitErr) return { error: debitErr };
    const creditErr = validateAccountForType(credit, type, 'credit');
    if (creditErr) return { error: creditErr };

    const sequencePrefix =
      normalizeJournalCode(payload.sequence_prefix || '') ||
      defaultSequencePrefix(code, type);

    let currencyId: string | null = null;
    {
      const { data: cur } = await supabase
        .from('currencies')
        .select('id')
        .eq('code', currency)
        .maybeSingle();
      currencyId = cur?.id ? String(cur.id) : null;
    }

    const insertRow: Record<string, unknown> = {
      name,
      code,
      type,
      currency,
      organization_id: organizationId,
      default_debit_account_id: debitId,
      default_credit_account_id: creditId,
      sequence_prefix: sequencePrefix,
      next_number: 1,
      notes: payload.notes || null,
      is_active: true,
      created_by: scope.session.username,
      updated_by: scope.session.username,
      updated_at: new Date().toISOString(),
    };
    if (currencyId) insertRow.currency_id = currencyId;

    let { data, error } = await supabase
      .from('journals')
      .insert([insertRow])
      .select('id')
      .single();

    if (error && /currency_id|column/i.test(error.message)) {
      delete insertRow.currency_id;
      const retry = await supabase
        .from('journals')
        .insert([insertRow])
        .select('id')
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      if (/organization_id|currency|sequence_prefix|column/i.test(error.message)) {
        return {
          error: 'Run enhance_accounting_journals_foundation.sql in Supabase first.',
        };
      }
      if (/unique|duplicate/i.test(error.message)) {
        return { error: 'Journal code must be unique within the organization' };
      }
      return { error: error.message };
    }

    return { journalId: String(data!.id) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create journal',
    };
  }
}

export async function updateAccountingConfigJournal(
  journalId: string,
  payload: {
    name?: string;
    code?: string;
    type?: AccountingJournalType;
    currency?: string;
    default_debit_account_id?: string | null;
    default_credit_account_id?: string | null;
    sequence_prefix?: string | null;
    notes?: string | null;
    is_active?: boolean;
  }
) {
  try {
    const scope = await resolveJournalScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const supabase = await createAdminClient();
    const { data: existing } = await supabase
      .from('journals')
      .select('*')
      .eq('id', journalId)
      .maybeSingle();
    if (!existing) return { error: 'Journal not found' };

    if (
      scope.organizationId &&
      !scope.isGlobalAdminView &&
      existing.organization_id &&
      String(existing.organization_id) !== scope.organizationId
    ) {
      return { error: 'Journal not in the selected organization' };
    }

    const patch: Record<string, unknown> = {
      updated_by: scope.session.username,
      updated_at: new Date().toISOString(),
    };

    if (payload.name !== undefined) {
      const name = normalizeJournalName(payload.name);
      if (!name) return { error: 'Journal name is required' };
      patch.name = name;
    }

    if (payload.code !== undefined) {
      const code = normalizeJournalCode(payload.code);
      if (!code) return { error: 'Journal code is required' };
      const orgId = existing.organization_id
        ? String(existing.organization_id)
        : null;
      const uniqueErr = await assertUniqueJournalCode(
        supabase,
        code,
        orgId,
        journalId
      );
      if (uniqueErr) return { error: uniqueErr };
      patch.code = code;
    }

    const nextType = (payload.type || String(existing.type)) as AccountingJournalType;
    if (payload.type !== undefined) {
      if (!VALID_TYPES.includes(payload.type)) return { error: 'Invalid journal type' };
      patch.type = payload.type;
    }

    if (payload.currency !== undefined) {
      const currency = String(payload.currency).trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) return { error: 'Currency must be a 3-letter code' };
      patch.currency = currency;
      const { data: cur } = await supabase
        .from('currencies')
        .select('id')
        .eq('code', currency)
        .maybeSingle();
      if (cur?.id) patch.currency_id = String(cur.id);
    }

    const debitId =
      payload.default_debit_account_id !== undefined
        ? payload.default_debit_account_id || null
        : existing.default_debit_account_id
          ? String(existing.default_debit_account_id)
          : null;
    const creditId =
      payload.default_credit_account_id !== undefined
        ? payload.default_credit_account_id || null
        : existing.default_credit_account_id
          ? String(existing.default_credit_account_id)
          : null;

    if (
      payload.default_debit_account_id !== undefined ||
      payload.default_credit_account_id !== undefined ||
      payload.type !== undefined
    ) {
      const debit = await loadAccount(supabase, debitId);
      const credit = await loadAccount(supabase, creditId);
      if (debitId && !debit) return { error: 'Default debit account not found' };
      if (creditId && !credit) return { error: 'Default credit account not found' };
      const debitErr = validateAccountForType(debit, nextType, 'debit');
      if (debitErr) return { error: debitErr };
      const creditErr = validateAccountForType(credit, nextType, 'credit');
      if (creditErr) return { error: creditErr };
      if (payload.default_debit_account_id !== undefined) {
        patch.default_debit_account_id = debitId;
      }
      if (payload.default_credit_account_id !== undefined) {
        patch.default_credit_account_id = creditId;
      }
    }

    if (payload.sequence_prefix !== undefined) {
      patch.sequence_prefix =
        normalizeJournalCode(payload.sequence_prefix || '') ||
        defaultSequencePrefix(
          String(patch.code || existing.code),
          nextType
        );
    }

    if (payload.notes !== undefined) patch.notes = payload.notes || null;
    if (payload.is_active !== undefined) patch.is_active = payload.is_active;

    const { error } = await supabase.from('journals').update(patch).eq('id', journalId);
    if (error) {
      if (/unique|duplicate/i.test(error.message)) {
        return { error: 'Journal code must be unique within the organization' };
      }
      return { error: error.message };
    }

    return getAccountingConfigJournalDetail(journalId);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to update journal',
    };
  }
}

export async function archiveAccountingConfigJournal(journalId: string) {
  return updateAccountingConfigJournal(journalId, { is_active: false });
}

export async function restoreAccountingConfigJournal(journalId: string) {
  return updateAccountingConfigJournal(journalId, { is_active: true });
}

/**
 * Allocate next document number for a journal within an organization.
 * Reusable by invoices/payments/etc. Format: PREFIX00001
 */
export async function allocateAccountingJournalSequence(args: {
  journalId: string;
  organizationId: string;
}) {
  try {
    const supabase = await createAdminClient();
    const { data: journal } = await supabase
      .from('journals')
      .select('id, code, sequence_prefix, is_active')
      .eq('id', args.journalId)
      .maybeSingle();
    if (!journal?.id) return { error: 'Journal not found' };
    if (!journal.is_active) return { error: 'Journal is archived' };

    const prefix =
      String(journal.sequence_prefix || journal.code || 'DOC').toUpperCase();

    const { data: existing } = await supabase
      .from('accounting_journal_sequences')
      .select('id, next_number, prefix')
      .eq('journal_id', args.journalId)
      .eq('organization_id', args.organizationId)
      .maybeSingle();

    if (!existing?.id) {
      const { data: created, error } = await supabase
        .from('accounting_journal_sequences')
        .insert([
          {
            journal_id: args.journalId,
            organization_id: args.organizationId,
            prefix,
            next_number: 2,
          },
        ])
        .select('next_number, prefix')
        .single();
      if (error) {
        if (/accounting_journal_sequences|does not exist|column/i.test(error.message)) {
          // Fallback: bump journals.next_number (shared counter)
          const { data: j } = await supabase
            .from('journals')
            .select('next_number, sequence_prefix, code')
            .eq('id', args.journalId)
            .maybeSingle();
          const n = Number(j?.next_number) || 1;
          await supabase
            .from('journals')
            .update({ next_number: n + 1, updated_at: new Date().toISOString() })
            .eq('id', args.journalId);
          const p = String(j?.sequence_prefix || j?.code || prefix).toUpperCase();
          return { number: `${p}${String(n).padStart(5, '0')}` };
        }
        return { error: error.message };
      }
      return {
        number: `${String(created.prefix || prefix).toUpperCase()}${String(1).padStart(5, '0')}`,
      };
    }

    const n = Number(existing.next_number) || 1;
    const { error: updErr } = await supabase
      .from('accounting_journal_sequences')
      .update({ next_number: n + 1, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (updErr) return { error: updErr.message };

    return {
      number: `${String(existing.prefix || prefix).toUpperCase()}${String(n).padStart(5, '0')}`,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to allocate sequence',
    };
  }
}

export async function exportAccountingConfigJournalsCsv() {
  try {
    const res = await getAccountingConfigJournals({
      status: 'all',
      page: 1,
      pageSize: 5000,
    });
    if ('error' in res && res.error) return { error: res.error };
    const csv = journalsToCsv(
      (res.journals || []).map((j) => ({
        code: j.code,
        name: j.name,
        type: j.type,
        currency: j.currency,
        default_debit_account_code: j.default_debit_account_code,
        default_credit_account_code: j.default_credit_account_code,
        sequence_prefix: j.sequence_prefix,
        is_active: j.is_active,
        notes: j.notes,
      }))
    );
    return { csv };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to export journals',
    };
  }
}

export async function importAccountingConfigJournalsCsv(csvText: string) {
  try {
    const scope = await resolveJournalScope({ config: true });
    if ('error' in scope && scope.error) return { error: scope.error };
    if (!scope.session) return { error: 'Unauthorized' };

    const rows = parseJournalCsv(csvText);
    if (!rows.length) return { error: 'No rows found in CSV' };

    const supabase = await createAdminClient();
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const code = normalizeJournalCode(row.code);
      const name = normalizeJournalName(row.name);
      const type = String(row.type || '').toLowerCase() as AccountingJournalType;
      if (!code || !name) {
        errors.push('Skipped row: missing code/name');
        continue;
      }
      if (!VALID_TYPES.includes(type)) {
        errors.push(`${code}: invalid type`);
        continue;
      }

      let debitId: string | null = null;
      let creditId: string | null = null;
      if (row.default_debit_account_code) {
        const { data: acc } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('code', normalizeJournalCode(row.default_debit_account_code))
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        debitId = acc?.id ? String(acc.id) : null;
      }
      if (row.default_credit_account_code) {
        const { data: acc } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('code', normalizeJournalCode(row.default_credit_account_code))
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        creditId = acc?.id ? String(acc.id) : null;
      }

      const { data: existing } = await supabase
        .from('journals')
        .select('id')
        .eq('code', code)
        .is('organization_id', null)
        .maybeSingle();

      const sequencePrefix =
        normalizeJournalCode(row.sequence_prefix) ||
        defaultSequencePrefix(code, type);

      if (existing?.id) {
        const { error } = await supabase
          .from('journals')
          .update({
            name,
            type,
            currency: row.currency || 'PKR',
            default_debit_account_id: debitId,
            default_credit_account_id: creditId,
            sequence_prefix: sequencePrefix,
            is_active: row.is_active,
            notes: row.notes || null,
            updated_by: scope.session.username,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (error) errors.push(`${code}: ${error.message}`);
        else updated += 1;
      } else {
        const { error } = await supabase.from('journals').insert([
          {
            name,
            code,
            type,
            currency: row.currency || 'PKR',
            organization_id: null,
            default_debit_account_id: debitId,
            default_credit_account_id: creditId,
            sequence_prefix: sequencePrefix,
            next_number: 1,
            is_active: row.is_active,
            notes: row.notes || null,
            created_by: scope.session.username,
            updated_by: scope.session.username,
          },
        ]);
        if (error) errors.push(`${code}: ${error.message}`);
        else created += 1;
      }
    }

    return { created, updated, errors };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to import journals',
    };
  }
}
