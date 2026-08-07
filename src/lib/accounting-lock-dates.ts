/**
 * Unified accounting lock-date checks (Odoo-style).
 * Layers: hard lock → soft lock → domain lock (sale/purchase/tax) →
 * journal lock → closed fiscal year → tax period lock.
 *
 * Soft lock: blocks non-administrators; Accounting Admins may bypass
 * when allowSoftLockBypass is true (default for admin callers).
 */

import { createAdminClient } from '@/utils/supabase/server';

export type AccountingLockDomain = 'sale' | 'purchase' | 'tax' | 'general';

export type AccountingLockCheckOptions = {
  /** When true, soft_lock_date does not block (Odoo advisor exception). */
  allowSoftLockBypass?: boolean;
  journalId?: string | null;
};

function dateOnly(v: string | null | undefined): string {
  return String(v || '').slice(0, 10);
}

function isOnOrBefore(docDate: string, lockDate: string | null | undefined): boolean {
  const lock = dateOnly(lockDate);
  if (!lock) return false;
  return docDate <= lock;
}

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
  if (!orgId || !date) return null;

  const opts: AccountingLockCheckOptions =
    journalIdOrOpts && typeof journalIdOrOpts === 'object'
      ? journalIdOrOpts
      : { journalId: (journalIdOrOpts as string | null | undefined) || null };

  try {
    const supabase = await createAdminClient();

    // 1) Org lock settings
    const { data: settings, error: settingsError } = await supabase
      .from('accounting_lock_settings')
      .select(
        'hard_lock_date, soft_lock_date, sale_lock_date, purchase_lock_date, tax_lock_date'
      )
      .eq('organization_id', orgId)
      .maybeSingle();

    if (settingsError) {
      if (!/accounting_lock_settings|relation|soft_lock/i.test(settingsError.message)) {
        console.warn('[lock-dates]', settingsError.message);
      }
      // Retry without soft_lock_date if column missing
      if (/soft_lock/i.test(settingsError.message)) {
        const { data: legacy } = await supabase
          .from('accounting_lock_settings')
          .select('hard_lock_date, sale_lock_date, purchase_lock_date, tax_lock_date')
          .eq('organization_id', orgId)
          .maybeSingle();
        if (legacy) {
          return evaluateLocks(legacy as Record<string, unknown>, date, domain, opts, supabase, orgId);
        }
      }
    } else if (settings) {
      return evaluateLocks(
        settings as Record<string, unknown>,
        date,
        domain,
        opts,
        supabase,
        orgId
      );
    }

    return await evaluatePeriodLocks(supabase, orgId, date, opts.journalId);
  } catch {
    return null;
  }
}

async function evaluateLocks(
  settings: Record<string, unknown>,
  date: string,
  domain: AccountingLockDomain,
  opts: AccountingLockCheckOptions,
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  orgId: string
): Promise<string | null> {
  if (isOnOrBefore(date, settings.hard_lock_date as string | null)) {
    return `Fiscal lock date is set to ${String(settings.hard_lock_date).slice(0, 10)}. Documents on or before this date cannot be modified.`;
  }

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

  if (!softBypass && isOnOrBefore(date, settings.soft_lock_date as string | null)) {
    return `Soft lock date is ${String(settings.soft_lock_date).slice(0, 10)}. Only Accounting Administrators can modify documents on or before this date.`;
  }

  if (
    (domain === 'sale' || domain === 'general') &&
    isOnOrBefore(date, settings.sale_lock_date as string | null)
  ) {
    return `Sales lock date is ${String(settings.sale_lock_date).slice(0, 10)}. Sales documents on or before this date are locked.`;
  }
  if (
    (domain === 'purchase' || domain === 'general') &&
    isOnOrBefore(date, settings.purchase_lock_date as string | null)
  ) {
    return `Purchase lock date is ${String(settings.purchase_lock_date).slice(0, 10)}. Purchase documents on or before this date are locked.`;
  }
  // Tax lock also protects sale/purchase docs that feed tax reports (Odoo-aligned)
  if (
    (domain === 'tax' ||
      domain === 'general' ||
      domain === 'sale' ||
      domain === 'purchase') &&
    isOnOrBefore(date, settings.tax_lock_date as string | null)
  ) {
    return `Tax lock date is ${String(settings.tax_lock_date).slice(0, 10)}. Tax-related entries on or before this date are locked.`;
  }

  return evaluatePeriodLocks(supabase, orgId, date, opts.journalId);
}

async function evaluatePeriodLocks(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  orgId: string,
  date: string,
  journalId?: string | null
): Promise<string | null> {
  if (journalId) {
    const { data: jLock } = await supabase
      .from('accounting_journal_locks')
      .select('lock_date')
      .eq('organization_id', orgId)
      .eq('journal_id', journalId)
      .maybeSingle();
    if (jLock && isOnOrBefore(date, jLock.lock_date)) {
      return `This journal is locked through ${String(jLock.lock_date).slice(0, 10)}.`;
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
      console.warn('[lock-dates] fiscal year:', yearError.message);
    }
  } else if (closedYear?.id) {
    return `Fiscal year "${closedYear.name}" is closed. Re-open it to modify documents in this period.`;
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
      console.warn('[lock-dates] tax period:', taxError.message);
    }
  } else if (taxPeriod?.id) {
    const name = String(
      taxPeriod.name || `${taxPeriod.date_from} – ${taxPeriod.date_to}`
    );
    return `Tax period "${name}" is locked. Unlock the period to modify accounting documents.`;
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
