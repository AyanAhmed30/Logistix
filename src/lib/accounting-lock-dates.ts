/**
 * Unified accounting lock-date checks (Odoo-style).
 *
 * Precedence (first match blocks):
 *   organization + posting date
 *   → fiscal (hard) lock
 *   → period lock
 *   → soft lock (Accounting Administrators may bypass)
 *   → domain lock (sale / purchase / tax)
 *   → journal lock
 *   → closed fiscal year
 *   → locked tax period
 *
 * Inclusive rule: dates ON OR BEFORE the lock date are closed.
 * Fail-closed: if locks cannot be evaluated, posting is blocked.
 */

import { createAdminClient } from '@/utils/supabase/server';
import {
  dateOnly,
  evaluateAccountingLockSettings,
  isAccountingDateOnOrBeforeLock,
  lockDomainFromJournalSource,
  type AccountingLockDomain,
  type AccountingLockSettingsInput,
} from '@/lib/accounting-lock-date-math';

export type { AccountingLockDomain };
export { evaluateAccountingLockSettings };

export type AccountingLockCheckOptions = {
  /** When true, soft_lock_date does not block (Odoo advisor exception). */
  allowSoftLockBypass?: boolean;
  journalId?: string | null;
};

export { dateOnly, isAccountingDateOnOrBeforeLock, lockDomainFromJournalSource };

function isOnOrBefore(docDate: string, lockDate: string | null | undefined): boolean {
  return isAccountingDateOnOrBeforeLock(docDate, lockDate);
}

type LockSettingsRow = AccountingLockSettingsInput;

const SETTINGS_COLS =
  'hard_lock_date, period_lock_date, soft_lock_date, sale_lock_date, purchase_lock_date, tax_lock_date';

/**
 * Returns an error message if posting/editing/cancelling is blocked for the date.
 */
export async function getAccountingDocumentLockError(
  organizationId: string | null | undefined,
  documentDate: string | null | undefined,
  domain: AccountingLockDomain = 'general',
  journalIdOrOpts?: string | null | AccountingLockCheckOptions
): Promise<string | null> {
  const orgId = String(organizationId || '').trim();
  const date = dateOnly(documentDate);
  if (!orgId) {
    return 'Posting is not allowed because the document has no organization.';
  }
  if (!date) {
    return 'Posting is not allowed because the accounting date is missing.';
  }

  const opts: AccountingLockCheckOptions =
    journalIdOrOpts && typeof journalIdOrOpts === 'object'
      ? journalIdOrOpts
      : { journalId: (journalIdOrOpts as string | null | undefined) || null };

  try {
    const supabase = await createAdminClient();

    const { data: settings, error: settingsError } = await supabase
      .from('accounting_lock_settings')
      .select(SETTINGS_COLS)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (settingsError) {
      if (/period_lock_date|column/i.test(settingsError.message)) {
        const { data: withoutPeriod, error: retryErr } = await supabase
          .from('accounting_lock_settings')
          .select(
            'hard_lock_date, soft_lock_date, sale_lock_date, purchase_lock_date, tax_lock_date'
          )
          .eq('organization_id', orgId)
          .maybeSingle();
        if (retryErr && /soft_lock/i.test(retryErr.message)) {
          const { data: legacy, error: legacyErr } = await supabase
            .from('accounting_lock_settings')
            .select('hard_lock_date, sale_lock_date, purchase_lock_date, tax_lock_date')
            .eq('organization_id', orgId)
            .maybeSingle();
          if (legacyErr && /accounting_lock_settings|relation/i.test(legacyErr.message)) {
            return evaluatePeriodLocks(supabase, orgId, date, opts.journalId);
          }
          if (legacyErr) {
            return `Unable to verify accounting lock dates (${legacyErr.message}). Posting was blocked for safety.`;
          }
          if (legacy) {
            return evaluateLocks(
              legacy as LockSettingsRow,
              date,
              domain,
              opts,
              supabase,
              orgId
            );
          }
          return evaluatePeriodLocks(supabase, orgId, date, opts.journalId);
        }
        if (retryErr && /accounting_lock_settings|relation/i.test(retryErr.message)) {
          return evaluatePeriodLocks(supabase, orgId, date, opts.journalId);
        }
        if (retryErr) {
          return `Unable to verify accounting lock dates (${retryErr.message}). Posting was blocked for safety.`;
        }
        if (withoutPeriod) {
          return evaluateLocks(
            withoutPeriod as LockSettingsRow,
            date,
            domain,
            opts,
            supabase,
            orgId
          );
        }
        return evaluatePeriodLocks(supabase, orgId, date, opts.journalId);
      }

      if (/soft_lock/i.test(settingsError.message)) {
        const { data: legacy, error: legacyErr } = await supabase
          .from('accounting_lock_settings')
          .select('hard_lock_date, sale_lock_date, purchase_lock_date, tax_lock_date')
          .eq('organization_id', orgId)
          .maybeSingle();
        if (legacyErr && /accounting_lock_settings|relation/i.test(legacyErr.message)) {
          return evaluatePeriodLocks(supabase, orgId, date, opts.journalId);
        }
        if (legacyErr) {
          return `Unable to verify accounting lock dates (${legacyErr.message}). Posting was blocked for safety.`;
        }
        if (legacy) {
          return evaluateLocks(
            legacy as LockSettingsRow,
            date,
            domain,
            opts,
            supabase,
            orgId
          );
        }
        return evaluatePeriodLocks(supabase, orgId, date, opts.journalId);
      }

      if (/accounting_lock_settings|relation/i.test(settingsError.message)) {
        return evaluatePeriodLocks(supabase, orgId, date, opts.journalId);
      }

      return `Unable to verify accounting lock dates (${settingsError.message}). Posting was blocked for safety.`;
    }

    if (settings) {
      return evaluateLocks(
        settings as LockSettingsRow,
        date,
        domain,
        opts,
        supabase,
        orgId
      );
    }

    return evaluatePeriodLocks(supabase, orgId, date, opts.journalId);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error';
    return `Unable to verify accounting lock dates (${detail}). Posting was blocked for safety.`;
  }
}

export async function readLatestLoggedPeriodLock(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  orgId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('accounting_lock_logs')
    .select('details')
    .eq('organization_id', orgId)
    .eq('action', 'lock_dates_updated')
    .order('performed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const next = (data.details as { next?: { period_lock_date?: string | null } } | null)
    ?.next?.period_lock_date;
  return dateOnly(next) || null;
}

async function evaluateLocks(
  settings: LockSettingsRow,
  date: string,
  domain: AccountingLockDomain,
  opts: AccountingLockCheckOptions,
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  orgId: string
): Promise<string | null> {
  let softBypass = opts.allowSoftLockBypass;
  if (softBypass === undefined) {
    try {
      const { getSession } = await import('@/lib/auth/session');
      const { accountingCanManageConfig, getAccountingAccessLevel } = await import(
        '@/lib/accounting-roles'
      );
      const session = await getSession();
      softBypass = session
        ? accountingCanManageConfig(
            getAccountingAccessLevel(session.permissions)
          )
        : false;
    } catch {
      softBypass = false;
    }
  }

  let periodLock = settings.period_lock_date;
  if (periodLock === undefined) {
    periodLock = await readLatestLoggedPeriodLock(supabase, orgId);
  }

  const settingsError = evaluateAccountingLockSettings({
    date,
    domain,
    settings: { ...settings, period_lock_date: periodLock ?? null },
    allowSoftLockBypass: softBypass,
  });
  if (settingsError) return settingsError;

  return evaluatePeriodLocks(supabase, orgId, date, opts.journalId);
}

async function evaluatePeriodLocks(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  orgId: string,
  date: string,
  journalId?: string | null
): Promise<string | null> {
  if (journalId) {
    const { data: jLock, error: jErr } = await supabase
      .from('accounting_journal_locks')
      .select('lock_date')
      .eq('organization_id', orgId)
      .eq('journal_id', journalId)
      .maybeSingle();
    if (jErr && !/accounting_journal_locks|relation/i.test(jErr.message)) {
      return `Unable to verify journal lock (${jErr.message}). Posting was blocked for safety.`;
    }
    if (jLock && isOnOrBefore(date, jLock.lock_date)) {
      return `This journal is locked for posting on or before ${dateOnly(String(jLock.lock_date))}.`;
    }
  }

  const { data: closedYear, error: yearError } = await supabase
    .from('accounting_fiscal_years')
    .select('id, name, date_from, date_to')
    .eq('organization_id', orgId)
    .eq('status', 'closed')
    .lte('date_from', date)
    .gte('date_to', date)
    .limit(1)
    .maybeSingle();

  if (yearError) {
    if (!/accounting_fiscal_years|relation/i.test(yearError.message)) {
      return `Unable to verify fiscal year lock (${yearError.message}). Posting was blocked for safety.`;
    }
  } else if (closedYear?.id) {
    return `Posting is not allowed because this accounting period is locked (fiscal year "${closedYear.name}" is closed).`;
  }

  const { data: taxPeriod, error: taxError } = await supabase
    .from('accounting_tax_periods')
    .select('id, name, date_from, date_to')
    .eq('organization_id', orgId)
    .eq('is_locked', true)
    .lte('date_from', date)
    .gte('date_to', date)
    .limit(1)
    .maybeSingle();

  if (taxError) {
    if (!/accounting_tax_periods|relation/i.test(taxError.message)) {
      return `Unable to verify tax period lock (${taxError.message}). Posting was blocked for safety.`;
    }
  } else if (taxPeriod?.id) {
    const name = String(
      taxPeriod.name || `${taxPeriod.date_from} – ${taxPeriod.date_to}`
    );
    return `Posting is not allowed because tax period "${name}" is locked.`;
  }

  return null;
}

/** @deprecated Prefer getAccountingDocumentLockError — kept for call-site compatibility */
export async function getTaxPeriodLockError(
  organizationId: string | null | undefined,
  documentDate: string | null | undefined
): Promise<string | null> {
  return getAccountingDocumentLockError(organizationId, documentDate, 'general');
}
