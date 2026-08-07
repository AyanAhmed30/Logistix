'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { requireAccountingActionAccess } from '@/lib/accounting-page-access';
import {
  accountingCanManageConfig,
  accountingCanManageLockDates,
} from '@/lib/accounting-roles';
import type { AutoPostingLine } from '@/lib/accounting-journal-posting';

export type AccountingLockSettings = {
  organization_id: string;
  hard_lock_date: string | null;
  soft_lock_date: string | null;
  sale_lock_date: string | null;
  purchase_lock_date: string | null;
  tax_lock_date: string | null;
  updated_by: string | null;
  updated_at: string | null;
};

export type AccountingJournalLock = {
  id: string;
  journal_id: string;
  journal_name: string | null;
  journal_code: string | null;
  lock_date: string;
  updated_by: string | null;
};

export type AccountingFiscalYear = {
  id: string;
  name: string;
  date_from: string;
  date_to: string;
  status: 'open' | 'closing' | 'closed';
  closing_journal_entry_id: string | null;
  opening_balance_journal_entry_id: string | null;
  retained_earnings_account_id: string | null;
  closed_at: string | null;
  closed_by: string | null;
  notes: string | null;
};

export type AccountingLockLog = {
  id: string;
  action: string;
  performed_by: string | null;
  performed_at: string;
  details: Record<string, unknown>;
};

export type AccountingLockDatesOverview = {
  settings: AccountingLockSettings | null;
  journalLocks: AccountingJournalLock[];
  fiscalYears: AccountingFiscalYear[];
  taxPeriodsLocked: number;
  logs: AccountingLockLog[];
  journals: { id: string; name: string; code: string }[];
  accounts: { id: string; code: string; name: string; type: string }[];
};

function emptyDate(v: string | null | undefined): string | null {
  const s = String(v || '').slice(0, 10);
  return s || null;
}

type LockDatesScope =
  | { error: string }
  | {
      session: { username: string; role: string };
      organizationId: string | null;
      level: import('@/lib/accounting-roles').AccountingAccessLevel;
      empty?: boolean;
      isGlobalAdminView?: boolean;
    };

async function resolveOrgScope(): Promise<LockDatesScope> {
  const access = await requireAccountingActionAccess({ lockDates: true });
  if ('error' in access && access.error) {
    return { error: String(access.error) };
  }

  const { requireAdminOrganizationScope, sessionUsesOrganizationScope } = await import(
    '@/lib/admin-organization-context'
  );
  const session = access.session!;
  const level = access.level!;

  if (!sessionUsesOrganizationScope(session.role)) {
    return { session, organizationId: null, level };
  }

  const scope = await requireAdminOrganizationScope();
  if ('error' in scope) {
    if (scope.status === 403) {
      return { session, organizationId: null, level, empty: true };
    }
    return { error: String(scope.error) };
  }

  const { isSuperAdminInAdminContext } = await import('@/lib/auth/super-admin');
  if (!scope.organizationId && isSuperAdminInAdminContext(scope.session)) {
    return {
      session: scope.session,
      organizationId: null,
      level,
      isGlobalAdminView: true,
    };
  }

  if (!scope.organizationId) {
    return { error: 'Select an organization from the header switcher.' };
  }

  return {
    session: scope.session,
    organizationId: scope.organizationId,
    level,
  };
}

async function appendLog(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  opts: {
    organizationId?: string | null;
    fiscalYearId?: string | null;
    action: string;
    performedBy: string;
    details?: Record<string, unknown>;
  }
) {
  try {
    await supabase.from('accounting_lock_logs').insert([
      {
        organization_id: opts.organizationId || null,
        fiscal_year_id: opts.fiscalYearId || null,
        action: opts.action,
        performed_by: opts.performedBy,
        details: opts.details || {},
      },
    ]);
  } catch {
    /* best-effort */
  }
}

export async function getAccountingLockDatesOverview() {
  try {
    const scope = await resolveOrgScope();
    if ('error' in scope) return { error: scope.error };
    if (scope.empty) {
      return {
        overview: {
          settings: null,
          journalLocks: [],
          fiscalYears: [],
          taxPeriodsLocked: 0,
          logs: [],
          journals: [],
          accounts: [],
        } satisfies AccountingLockDatesOverview,
      };
    }
    if (!scope.organizationId) {
      return {
        overview: {
          settings: null,
          journalLocks: [],
          fiscalYears: [],
          taxPeriodsLocked: 0,
          logs: [],
          journals: [],
          accounts: [],
        } satisfies AccountingLockDatesOverview,
        migrationRequired: false as const,
      };
    }

    const orgId = scope.organizationId;
    const supabase = await createAdminClient();

    const [
      settingsRes,
      jLocksRes,
      yearsRes,
      taxRes,
      logsRes,
      journalsRes,
      accountsRes,
    ] = await Promise.all([
      supabase.from('accounting_lock_settings').select('*').eq('organization_id', orgId).maybeSingle(),
      supabase.from('accounting_journal_locks').select('*').eq('organization_id', orgId),
      supabase
        .from('accounting_fiscal_years')
        .select('*')
        .eq('organization_id', orgId)
        .order('date_from', { ascending: false }),
      supabase
        .from('accounting_tax_periods')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('is_locked', true),
      supabase
        .from('accounting_lock_logs')
        .select('*')
        .eq('organization_id', orgId)
        .order('performed_at', { ascending: false })
        .limit(40),
      supabase.from('journals').select('id, name, code').order('code', { ascending: true }),
      supabase
        .from('chart_of_accounts')
        .select('id, code, name, type')
        .eq('is_active', true)
        .order('code', { ascending: true }),
    ]);

    if (settingsRes.error && /accounting_lock_settings|relation/i.test(settingsRes.error.message)) {
      return {
        overview: {
          settings: null,
          journalLocks: [],
          fiscalYears: [],
          taxPeriodsLocked: 0,
          logs: [],
          journals: [],
          accounts: [],
        } satisfies AccountingLockDatesOverview,
        migrationRequired: true as const,
      };
    }

    const journals = (journalsRes.data || []).map((j) => ({
      id: String(j.id),
      name: String(j.name || ''),
      code: String(j.code || ''),
    }));
    const jMap = new Map(journals.map((j) => [j.id, j]));

    const settings: AccountingLockSettings | null = settingsRes.data
      ? {
          organization_id: orgId,
          hard_lock_date: settingsRes.data.hard_lock_date
            ? String(settingsRes.data.hard_lock_date).slice(0, 10)
            : null,
          soft_lock_date: (settingsRes.data as { soft_lock_date?: string | null })
            .soft_lock_date
            ? String(
                (settingsRes.data as { soft_lock_date?: string | null }).soft_lock_date
              ).slice(0, 10)
            : null,
          sale_lock_date: settingsRes.data.sale_lock_date
            ? String(settingsRes.data.sale_lock_date).slice(0, 10)
            : null,
          purchase_lock_date: settingsRes.data.purchase_lock_date
            ? String(settingsRes.data.purchase_lock_date).slice(0, 10)
            : null,
          tax_lock_date: settingsRes.data.tax_lock_date
            ? String(settingsRes.data.tax_lock_date).slice(0, 10)
            : null,
          updated_by: settingsRes.data.updated_by
            ? String(settingsRes.data.updated_by)
            : null,
          updated_at: settingsRes.data.updated_at
            ? String(settingsRes.data.updated_at)
            : null,
        }
      : null;

    const journalLocks: AccountingJournalLock[] = (jLocksRes.data || []).map((r) => {
      const j = jMap.get(String(r.journal_id));
      return {
        id: String(r.id),
        journal_id: String(r.journal_id),
        journal_name: j?.name || null,
        journal_code: j?.code || null,
        lock_date: String(r.lock_date).slice(0, 10),
        updated_by: r.updated_by ? String(r.updated_by) : null,
      };
    });

    const fiscalYears: AccountingFiscalYear[] = (yearsRes.data || []).map((y) => ({
      id: String(y.id),
      name: String(y.name),
      date_from: String(y.date_from).slice(0, 10),
      date_to: String(y.date_to).slice(0, 10),
      status: String(y.status) as AccountingFiscalYear['status'],
      closing_journal_entry_id: y.closing_journal_entry_id
        ? String(y.closing_journal_entry_id)
        : null,
      opening_balance_journal_entry_id: (
        y as { opening_balance_journal_entry_id?: string | null }
      ).opening_balance_journal_entry_id
        ? String(
            (y as { opening_balance_journal_entry_id?: string | null })
              .opening_balance_journal_entry_id
          )
        : null,
      retained_earnings_account_id: y.retained_earnings_account_id
        ? String(y.retained_earnings_account_id)
        : null,
      closed_at: y.closed_at ? String(y.closed_at) : null,
      closed_by: y.closed_by ? String(y.closed_by) : null,
      notes: y.notes ? String(y.notes) : null,
    }));

    const logs: AccountingLockLog[] = (logsRes.data || []).map((l) => ({
      id: String(l.id),
      action: String(l.action),
      performed_by: l.performed_by ? String(l.performed_by) : null,
      performed_at: String(l.performed_at || ''),
      details: (l.details || {}) as Record<string, unknown>,
    }));

    return {
      overview: {
        settings,
        journalLocks,
        fiscalYears,
        taxPeriodsLocked: taxRes.count || 0,
        logs,
        journals,
        accounts: (accountsRes.data || []).map((a) => ({
          id: String(a.id),
          code: String(a.code || ''),
          name: String(a.name || ''),
          type: String(a.type || ''),
        })),
      } satisfies AccountingLockDatesOverview,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load lock dates',
    };
  }
}

export async function updateAccountingLockSettings(payload: {
  hard_lock_date?: string | null;
  soft_lock_date?: string | null;
  sale_lock_date?: string | null;
  purchase_lock_date?: string | null;
  tax_lock_date?: string | null;
}) {
  try {
    const scope = await resolveOrgScope();
    if ('error' in scope) return { error: scope.error };
    if (!scope.session || !scope.organizationId) {
      return { error: 'Select an organization to update lock dates' };
    }

    // Hard lock changes require Accounting Administrator
    if (
      payload.hard_lock_date !== undefined &&
      !accountingCanManageConfig(scope.level)
    ) {
      return {
        error: 'Changing the fiscal (hard) lock date requires Accounting Administrator',
      };
    }

    if (!accountingCanManageLockDates(scope.level)) {
      return { error: 'Lock dates require Accountant access' };
    }

    const supabase = await createAdminClient();
    const row: Record<string, unknown> = {
      organization_id: scope.organizationId,
      updated_by: scope.session.username,
      updated_at: new Date().toISOString(),
    };
    if (payload.hard_lock_date !== undefined) {
      row.hard_lock_date = emptyDate(payload.hard_lock_date);
    }
    if (payload.soft_lock_date !== undefined) {
      row.soft_lock_date = emptyDate(payload.soft_lock_date);
    }
    if (payload.sale_lock_date !== undefined) {
      row.sale_lock_date = emptyDate(payload.sale_lock_date);
    }
    if (payload.purchase_lock_date !== undefined) {
      row.purchase_lock_date = emptyDate(payload.purchase_lock_date);
    }
    if (payload.tax_lock_date !== undefined) {
      row.tax_lock_date = emptyDate(payload.tax_lock_date);
    }

    // Upsert: load existing then merge
    const { data: existing } = await supabase
      .from('accounting_lock_settings')
      .select('*')
      .eq('organization_id', scope.organizationId)
      .maybeSingle();

    const merged: Record<string, unknown> = {
      organization_id: scope.organizationId,
      hard_lock_date:
        row.hard_lock_date !== undefined
          ? row.hard_lock_date
          : existing?.hard_lock_date
            ? String(existing.hard_lock_date).slice(0, 10)
            : null,
      soft_lock_date:
        row.soft_lock_date !== undefined
          ? row.soft_lock_date
          : (existing as { soft_lock_date?: string | null } | null)?.soft_lock_date
            ? String(
                (existing as { soft_lock_date?: string | null }).soft_lock_date
              ).slice(0, 10)
            : null,
      sale_lock_date:
        row.sale_lock_date !== undefined
          ? row.sale_lock_date
          : existing?.sale_lock_date
            ? String(existing.sale_lock_date).slice(0, 10)
            : null,
      purchase_lock_date:
        row.purchase_lock_date !== undefined
          ? row.purchase_lock_date
          : existing?.purchase_lock_date
            ? String(existing.purchase_lock_date).slice(0, 10)
            : null,
      tax_lock_date:
        row.tax_lock_date !== undefined
          ? row.tax_lock_date
          : existing?.tax_lock_date
            ? String(existing.tax_lock_date).slice(0, 10)
            : null,
      updated_by: scope.session.username,
      updated_at: new Date().toISOString(),
    };

    let { error } = await supabase
      .from('accounting_lock_settings')
      .upsert([merged], { onConflict: 'organization_id' });

    if (error && /soft_lock_date|column/i.test(error.message)) {
      delete merged.soft_lock_date;
      const retry = await supabase
        .from('accounting_lock_settings')
        .upsert([merged], { onConflict: 'organization_id' });
      error = retry.error;
    }

    if (error) {
      if (/accounting_lock_settings|relation/i.test(error.message)) {
        return {
          error:
            'Run create_accounting_lock_dates_module.sql (and enhance_accounting_lock_dates_foundation.sql) in Supabase first.',
        };
      }
      return { error: error.message };
    }

    await appendLog(supabase, {
      organizationId: scope.organizationId,
      action: 'lock_dates_updated',
      performedBy: scope.session.username,
      details: merged,
    });

    return getAccountingLockDatesOverview();
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to update lock dates',
    };
  }
}

export async function upsertAccountingJournalLock(opts: {
  journalId: string;
  lockDate: string;
}) {
  try {
    const scope = await resolveOrgScope();
    if ('error' in scope) return { error: scope.error };
    if (!scope.session || !scope.organizationId) {
      return { error: 'Select an organization' };
    }

    const lockDate = emptyDate(opts.lockDate);
    if (!lockDate) return { error: 'Lock date is required' };
    if (!opts.journalId) return { error: 'Journal is required' };

    const supabase = await createAdminClient();
    const { error } = await supabase.from('accounting_journal_locks').upsert(
      [
        {
          organization_id: scope.organizationId,
          journal_id: opts.journalId,
          lock_date: lockDate,
          updated_by: scope.session.username,
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: 'organization_id,journal_id' }
    );
    if (error) return { error: error.message };

    await appendLog(supabase, {
      organizationId: scope.organizationId,
      action: 'journal_lock_updated',
      performedBy: scope.session.username,
      details: { journal_id: opts.journalId, lock_date: lockDate },
    });

    return getAccountingLockDatesOverview();
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to set journal lock',
    };
  }
}

export async function removeAccountingJournalLock(journalLockId: string) {
  try {
    const scope = await resolveOrgScope();
    if ('error' in scope) return { error: scope.error };
    if (!scope.session || !scope.organizationId) {
      return { error: 'Select an organization' };
    }

    const supabase = await createAdminClient();
    const { error } = await supabase
      .from('accounting_journal_locks')
      .delete()
      .eq('id', journalLockId)
      .eq('organization_id', scope.organizationId);
    if (error) return { error: error.message };

    await appendLog(supabase, {
      organizationId: scope.organizationId,
      action: 'journal_lock_removed',
      performedBy: scope.session.username,
      details: { id: journalLockId },
    });

    return getAccountingLockDatesOverview();
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to remove journal lock',
    };
  }
}

export async function createAccountingFiscalYear(opts: {
  name: string;
  dateFrom: string;
  dateTo: string;
  retainedEarningsAccountId?: string | null;
}) {
  try {
    const scope = await resolveOrgScope();
    if ('error' in scope) return { error: scope.error };
    if (!scope.session || !scope.organizationId) {
      return { error: 'Select an organization' };
    }

    const dateFrom = emptyDate(opts.dateFrom);
    const dateTo = emptyDate(opts.dateTo);
    if (!dateFrom || !dateTo) return { error: 'Fiscal year dates are required' };
    if (dateTo < dateFrom) return { error: 'End date must be on or after start date' };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('accounting_fiscal_years')
      .insert([
        {
          organization_id: scope.organizationId,
          name: String(opts.name || '').trim() || `${dateFrom} – ${dateTo}`,
          date_from: dateFrom,
          date_to: dateTo,
          status: 'open',
          retained_earnings_account_id: opts.retainedEarningsAccountId || null,
          created_by: scope.session.username,
          updated_by: scope.session.username,
        },
      ])
      .select('id')
      .single();

    if (error) return { error: error.message };

    await appendLog(supabase, {
      organizationId: scope.organizationId,
      fiscalYearId: String(data.id),
      action: 'fiscal_year_created',
      performedBy: scope.session.username,
      details: { date_from: dateFrom, date_to: dateTo },
    });

    const overview = await getAccountingLockDatesOverview();
    if ('error' in overview && overview.error) return overview;
    return { fiscalYearId: String(data.id), ...overview };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to create fiscal year',
    };
  }
}

/** Year-end closing: P&amp;L → retained earnings JE + close year + set hard lock. */
export async function closeAccountingFiscalYear(
  fiscalYearId: string,
  opts?: { retainedEarningsAccountId?: string | null }
) {
  try {
    const scope = await resolveOrgScope();
    if ('error' in scope) return { error: scope.error };
    if (!scope.session || !scope.organizationId) {
      return { error: 'Select an organization' };
    }
    if (!accountingCanManageConfig(scope.level)) {
      return { error: 'Year-end closing requires Accounting Administrator' };
    }

    const supabase = await createAdminClient();
    const { data: year } = await supabase
      .from('accounting_fiscal_years')
      .select('*')
      .eq('id', fiscalYearId)
      .eq('organization_id', scope.organizationId)
      .maybeSingle();
    if (!year) return { error: 'Fiscal year not found' };
    if (String(year.status) === 'closed') {
      return { error: 'Fiscal year is already closed' };
    }

    await supabase
      .from('accounting_fiscal_years')
      .update({
        status: 'closing',
        updated_by: scope.session.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', fiscalYearId);

    // Aggregate P&L from posted JE lines in the fiscal year
    const { data: entries } = await supabase
      .from('accounting_journal_entries')
      .select('id')
      .eq('organization_id', scope.organizationId)
      .eq('status', 'posted')
      .gte('entry_date', String(year.date_from).slice(0, 10))
      .lte('entry_date', String(year.date_to).slice(0, 10));

    const entryIds = (entries || []).map((e) => String(e.id));
    let incomeNet = 0;
    let expenseNet = 0;
    const byAccount = new Map<
      string,
      { account_id: string; type: string; debit: number; credit: number }
    >();

    if (entryIds.length) {
      const { data: lines } = await supabase
        .from('accounting_journal_entry_lines')
        .select('account_id, debit, credit')
        .in('journal_entry_id', entryIds);

      const accountIds = [
        ...new Set((lines || []).map((l) => String(l.account_id)).filter(Boolean)),
      ];
      const { data: accounts } = accountIds.length
        ? await supabase
            .from('chart_of_accounts')
            .select('id, type, code, name')
            .in('id', accountIds)
        : { data: [] as { id: string; type: string; code: string; name: string }[] };

      const typeMap = new Map(
        (accounts || []).map((a) => [String(a.id), String(a.type || '')])
      );

      for (const line of lines || []) {
        const accountId = String(line.account_id);
        const type = typeMap.get(accountId) || '';
        if (type !== 'income' && type !== 'expense') continue;
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        const cur = byAccount.get(accountId) || {
          account_id: accountId,
          type,
          debit: 0,
          credit: 0,
        };
        cur.debit += debit;
        cur.credit += credit;
        byAccount.set(accountId, cur);
        if (type === 'income') {
          incomeNet += credit - debit;
        } else {
          expenseNet += debit - credit;
        }
      }
    }

    const netIncome = Math.round((incomeNet - expenseNet) * 100) / 100;

    let retainedId =
      opts?.retainedEarningsAccountId ||
      (year.retained_earnings_account_id
        ? String(year.retained_earnings_account_id)
        : null);

    if (!retainedId) {
      const { data: equity } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('type', 'equity')
        .eq('is_active', true)
        .or('code.eq.3000,code.eq.3100,name.ilike.%retained%')
        .order('code', { ascending: true })
        .limit(1)
        .maybeSingle();
      retainedId = equity?.id ? String(equity.id) : null;
    }

    let closingJeId: string | null = year.closing_journal_entry_id
      ? String(year.closing_journal_entry_id)
      : null;

    if (retainedId && Math.abs(netIncome) > 0.004) {
      try {
        const { getJournalIdByType } = await import('@/lib/accounting-journal-posting');
        const { createAndPostAutomaticJournalEntry } = await import(
          '@/app/actions/accounting/journal-entries'
        );
        const journal = await getJournalIdByType('general', scope.organizationId);
        const lines: AutoPostingLine[] = [];
        const label = `Year closing ${year.name}`;

        // Close income (debit income balances) and expense (credit expense balances)
        for (const row of byAccount.values()) {
          const net =
            row.type === 'income'
              ? Math.round((row.credit - row.debit) * 100) / 100
              : Math.round((row.debit - row.credit) * 100) / 100;
          if (Math.abs(net) < 0.005) continue;
          if (row.type === 'income') {
            lines.push({
              account_id: row.account_id,
              label,
              debit: net > 0 ? net : 0,
              credit: net < 0 ? Math.abs(net) : 0,
            });
          } else {
            lines.push({
              account_id: row.account_id,
              label,
              debit: net < 0 ? Math.abs(net) : 0,
              credit: net > 0 ? net : 0,
            });
          }
        }

        // Balancing to retained earnings
        if (netIncome > 0) {
          lines.push({
            account_id: retainedId,
            label: `${label} — net income`,
            debit: 0,
            credit: netIncome,
          });
        } else {
          lines.push({
            account_id: retainedId,
            label: `${label} — net loss`,
            debit: Math.abs(netIncome),
            credit: 0,
          });
        }

        const je = await createAndPostAutomaticJournalEntry({
          organizationId: scope.organizationId,
          journalId: String(journal.id),
          entryDate: String(year.date_to).slice(0, 10),
          reference: `YC-${year.name}`,
          sourceType: 'year_closing' as never,
          sourceId: fiscalYearId,
          sourceNumber: String(year.name),
          lines,
          performedBy: scope.session.username,
        });
        if ('journalEntryId' in je && je.journalEntryId) {
          closingJeId = je.journalEntryId ?? null;
        }
        if ('error' in je && je.error) {
          // Still allow closing if JE fails? Prefer fail closed for integrity
          await supabase
            .from('accounting_fiscal_years')
            .update({ status: 'open', updated_at: new Date().toISOString() })
            .eq('id', fiscalYearId);
          return { error: je.error };
        }
      } catch (err) {
        await supabase
          .from('accounting_fiscal_years')
          .update({ status: 'open', updated_at: new Date().toISOString() })
          .eq('id', fiscalYearId);
        return {
          error: err instanceof Error ? err.message : 'Closing journal entry failed',
        };
      }
    }

    const yearEnd = String(year.date_to).slice(0, 10);

    await supabase
      .from('accounting_fiscal_years')
      .update({
        status: 'closed',
        closing_journal_entry_id: closingJeId,
        retained_earnings_account_id: retainedId,
        closed_at: new Date().toISOString(),
        closed_by: scope.session.username,
        updated_by: scope.session.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', fiscalYearId);

    // Set fiscal hard lock to year end (preserve other lock dates)
    const { data: existingLocks } = await supabase
      .from('accounting_lock_settings')
      .select('*')
      .eq('organization_id', scope.organizationId)
      .maybeSingle();

    await supabase.from('accounting_lock_settings').upsert(
      [
        {
          organization_id: scope.organizationId,
          hard_lock_date: yearEnd,
          soft_lock_date: (existingLocks as { soft_lock_date?: string | null } | null)
            ?.soft_lock_date
            ? String(
                (existingLocks as { soft_lock_date?: string | null }).soft_lock_date
              ).slice(0, 10)
            : null,
          sale_lock_date: existingLocks?.sale_lock_date
            ? String(existingLocks.sale_lock_date).slice(0, 10)
            : null,
          purchase_lock_date: existingLocks?.purchase_lock_date
            ? String(existingLocks.purchase_lock_date).slice(0, 10)
            : null,
          tax_lock_date: existingLocks?.tax_lock_date
            ? String(existingLocks.tax_lock_date).slice(0, 10)
            : null,
          updated_by: scope.session.username,
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: 'organization_id' }
    );

    // Also lock matching tax period if exists
    await supabase
      .from('accounting_tax_periods')
      .update({
        is_locked: true,
        locked_at: new Date().toISOString(),
        locked_by: scope.session.username,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', scope.organizationId)
      .eq('date_from', String(year.date_from).slice(0, 10))
      .eq('date_to', yearEnd);

    await appendLog(supabase, {
      organizationId: scope.organizationId,
      fiscalYearId,
      action: 'fiscal_year_closed',
      performedBy: scope.session.username,
      details: {
        net_income: netIncome,
        closing_journal_entry_id: closingJeId,
        hard_lock_date: yearEnd,
      },
    });

    return getAccountingLockDatesOverview();
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to close fiscal year',
    };
  }
}

export async function reopenAccountingFiscalYear(fiscalYearId: string) {
  try {
    const scope = await resolveOrgScope();
    if ('error' in scope) return { error: scope.error };
    if (!scope.session || !scope.organizationId) {
      return { error: 'Select an organization' };
    }
    if (!accountingCanManageConfig(scope.level)) {
      return { error: 'Re-opening a fiscal year requires Accounting Administrator' };
    }

    const supabase = await createAdminClient();
    const { data: year } = await supabase
      .from('accounting_fiscal_years')
      .select('*')
      .eq('id', fiscalYearId)
      .eq('organization_id', scope.organizationId)
      .maybeSingle();
    if (!year) return { error: 'Fiscal year not found' };
    if (String(year.status) !== 'closed') {
      return { error: 'Only closed fiscal years can be re-opened' };
    }

    const yearEnd = String(year.date_to).slice(0, 10);
    const closingJeId = year.closing_journal_entry_id
      ? String(year.closing_journal_entry_id)
      : null;

    // Reverse closing JE (cancel) so P&L can be restated
    if (closingJeId) {
      const { data: je } = await supabase
        .from('accounting_journal_entries')
        .select('id, status')
        .eq('id', closingJeId)
        .maybeSingle();
      if (je && String(je.status) !== 'cancelled') {
        await supabase
          .from('accounting_journal_entries')
          .update({
            status: 'cancelled',
            updated_by: scope.session.username,
            updated_at: new Date().toISOString(),
          })
          .eq('id', closingJeId);
        try {
          await supabase.from('accounting_journal_entry_logs').insert([
            {
              journal_entry_id: closingJeId,
              organization_id: scope.organizationId,
              action: 'cancelled',
              performed_by: scope.session.username,
              previous_status: String(je.status),
              new_status: 'cancelled',
              details: {
                reason: 'fiscal_year_reopened',
                fiscal_year_id: fiscalYearId,
              },
            },
          ]);
        } catch {
          /* best-effort */
        }
      }
    }

    await supabase
      .from('accounting_fiscal_years')
      .update({
        status: 'open',
        closing_journal_entry_id: null,
        closed_at: null,
        closed_by: null,
        updated_by: scope.session.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', fiscalYearId);

    // Clear hard lock if it was set to this year-end by the close process
    const { data: locks } = await supabase
      .from('accounting_lock_settings')
      .select('hard_lock_date, soft_lock_date, sale_lock_date, purchase_lock_date, tax_lock_date')
      .eq('organization_id', scope.organizationId)
      .maybeSingle();

    if (
      locks?.hard_lock_date &&
      String(locks.hard_lock_date).slice(0, 10) === yearEnd
    ) {
      await supabase.from('accounting_lock_settings').upsert(
        [
          {
            organization_id: scope.organizationId,
            hard_lock_date: null,
            soft_lock_date: (locks as { soft_lock_date?: string | null }).soft_lock_date
              ? String((locks as { soft_lock_date?: string | null }).soft_lock_date).slice(
                  0,
                  10
                )
              : null,
            sale_lock_date: locks.sale_lock_date
              ? String(locks.sale_lock_date).slice(0, 10)
              : null,
            purchase_lock_date: locks.purchase_lock_date
              ? String(locks.purchase_lock_date).slice(0, 10)
              : null,
            tax_lock_date: locks.tax_lock_date
              ? String(locks.tax_lock_date).slice(0, 10)
              : null,
            updated_by: scope.session.username,
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: 'organization_id' }
      );
    }

    // Unlock matching tax period
    await supabase
      .from('accounting_tax_periods')
      .update({
        is_locked: false,
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', scope.organizationId)
      .eq('date_from', String(year.date_from).slice(0, 10))
      .eq('date_to', yearEnd);

    await appendLog(supabase, {
      organizationId: scope.organizationId,
      fiscalYearId,
      action: 'fiscal_year_reopened',
      performedBy: scope.session.username,
      details: {
        cancelled_closing_journal_entry_id: closingJeId,
        cleared_hard_lock: yearEnd,
      },
    });

    return getAccountingLockDatesOverview();
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to re-open fiscal year',
    };
  }
}

/**
 * Create opening balance JE for the next fiscal year from closed year BS balances.
 * Carry-forward: assets / liabilities / equity (incl. retained earnings).
 */
export async function generateOpeningBalances(opts: {
  closedFiscalYearId: string;
  nextFiscalYearId: string;
}) {
  try {
    const scope = await resolveOrgScope();
    if ('error' in scope) return { error: scope.error };
    if (!scope.session || !scope.organizationId) {
      return { error: 'Select an organization' };
    }
    if (!accountingCanManageConfig(scope.level)) {
      return { error: 'Opening balances require Accounting Administrator' };
    }

    const supabase = await createAdminClient();
    const { data: closedYear } = await supabase
      .from('accounting_fiscal_years')
      .select('*')
      .eq('id', opts.closedFiscalYearId)
      .eq('organization_id', scope.organizationId)
      .maybeSingle();
    if (!closedYear || String(closedYear.status) !== 'closed') {
      return { error: 'Source fiscal year must be closed' };
    }

    const { data: nextYear } = await supabase
      .from('accounting_fiscal_years')
      .select('*')
      .eq('id', opts.nextFiscalYearId)
      .eq('organization_id', scope.organizationId)
      .maybeSingle();
    if (!nextYear) return { error: 'Next fiscal year not found' };
    if (
      (nextYear as { opening_balance_journal_entry_id?: string | null })
        .opening_balance_journal_entry_id
    ) {
      return { error: 'Opening balances already generated for this fiscal year' };
    }

    const yearEnd = String(closedYear.date_to).slice(0, 10);
    const openDate = String(nextYear.date_from).slice(0, 10);

    const { data: entries } = await supabase
      .from('accounting_journal_entries')
      .select('id')
      .eq('organization_id', scope.organizationId)
      .eq('status', 'posted')
      .lte('entry_date', yearEnd);

    const entryIds = (entries || []).map((e) => String(e.id));
    const balances = new Map<string, number>();

    if (entryIds.length) {
      const { data: lines } = await supabase
        .from('accounting_journal_entry_lines')
        .select('account_id, debit, credit')
        .in('journal_entry_id', entryIds);

      const accountIds = [
        ...new Set((lines || []).map((l) => String(l.account_id)).filter(Boolean)),
      ];
      const { data: accounts } = accountIds.length
        ? await supabase
            .from('chart_of_accounts')
            .select('id, type')
            .in('id', accountIds)
        : { data: [] as { id: string; type: string }[] };
      const typeMap = new Map(
        (accounts || []).map((a) => [String(a.id), String(a.type || '')])
      );

      for (const line of lines || []) {
        const id = String(line.account_id);
        const type = typeMap.get(id) || '';
        if (type !== 'asset' && type !== 'liability' && type !== 'equity') continue;
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        // Net debit balance (assets positive debit; liabilities/equity typically credit)
        const net = balances.get(id) || 0;
        balances.set(id, Math.round((net + debit - credit) * 100) / 100);
      }
    }

    const lines: AutoPostingLine[] = [];
    let debitTotal = 0;
    let creditTotal = 0;
    for (const [accountId, net] of balances.entries()) {
      if (Math.abs(net) < 0.005) continue;
      if (net > 0) {
        lines.push({
          account_id: accountId,
          label: `Opening balance ${nextYear.name}`,
          debit: net,
          credit: 0,
        });
        debitTotal += net;
      } else {
        lines.push({
          account_id: accountId,
          label: `Opening balance ${nextYear.name}`,
          debit: 0,
          credit: Math.abs(net),
        });
        creditTotal += Math.abs(net);
      }
    }

    if (!lines.length) {
      return { error: 'No balance-sheet balances to carry forward' };
    }

    const imbalance = Math.round((debitTotal - creditTotal) * 100) / 100;
    if (Math.abs(imbalance) > 0.004) {
      // Plug to retained earnings
      let retainedId = closedYear.retained_earnings_account_id
        ? String(closedYear.retained_earnings_account_id)
        : null;
      if (!retainedId) {
        const { data: equity } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('type', 'equity')
          .eq('is_active', true)
          .or('code.eq.3000,code.eq.3100,name.ilike.%retained%')
          .limit(1)
          .maybeSingle();
        retainedId = equity?.id ? String(equity.id) : null;
      }
      if (!retainedId) {
        return {
          error: `Opening balances do not balance (diff ${imbalance}). Set a Retained Earnings account.`,
        };
      }
      if (imbalance > 0) {
        lines.push({
          account_id: retainedId,
          label: 'Opening balance plug',
          debit: 0,
          credit: imbalance,
        });
      } else {
        lines.push({
          account_id: retainedId,
          label: 'Opening balance plug',
          debit: Math.abs(imbalance),
          credit: 0,
        });
      }
    }

    const { getJournalIdByType } = await import('@/lib/accounting-journal-posting');
    const { createAndPostAutomaticJournalEntry } = await import(
      '@/app/actions/accounting/journal-entries'
    );
    const journal = await getJournalIdByType('general', scope.organizationId);
    const je = await createAndPostAutomaticJournalEntry({
      organizationId: scope.organizationId,
      journalId: String(journal.id),
      entryDate: openDate,
      reference: `OB-${nextYear.name}`,
      sourceType: 'year_opening' as never,
      sourceId: opts.nextFiscalYearId,
      sourceNumber: String(nextYear.name),
      lines,
      performedBy: scope.session.username,
    });

    if ('error' in je && je.error) return { error: je.error };
    const openingJeId =
      'journalEntryId' in je && je.journalEntryId ? String(je.journalEntryId) : null;

    await supabase
      .from('accounting_fiscal_years')
      .update({
        opening_balance_journal_entry_id: openingJeId,
        previous_fiscal_year_id: opts.closedFiscalYearId,
        updated_by: scope.session.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', opts.nextFiscalYearId);

    await appendLog(supabase, {
      organizationId: scope.organizationId,
      fiscalYearId: opts.nextFiscalYearId,
      action: 'opening_balances_generated',
      performedBy: scope.session.username,
      details: {
        from_fiscal_year_id: opts.closedFiscalYearId,
        opening_balance_journal_entry_id: openingJeId,
        line_count: lines.length,
      },
    });

    return {
      journalEntryId: openingJeId,
      ...(await getAccountingLockDatesOverview()),
    };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to generate opening balances',
    };
  }
}
