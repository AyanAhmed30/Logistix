/** Pure lock-date comparisons — no server imports. */

export function dateOnly(v: string | null | undefined): string {
  return String(v || '').slice(0, 10);
}

/** True when the document date is on or before a lock date (empty lock = unlocked). */
export function isAccountingDateOnOrBeforeLock(
  docDate: string,
  lockDate: string | null | undefined
): boolean {
  const lock = dateOnly(lockDate);
  if (!lock) return false;
  return dateOnly(docDate) <= lock;
}

export type AccountingLockDomain = 'sale' | 'purchase' | 'tax' | 'general';

export type AccountingLockSettingsInput = {
  hard_lock_date?: string | null;
  period_lock_date?: string | null;
  soft_lock_date?: string | null;
  sale_lock_date?: string | null;
  purchase_lock_date?: string | null;
  tax_lock_date?: string | null;
};

export function lockDomainFromJournalSource(
  sourceType: string | null | undefined
): AccountingLockDomain {
  switch (String(sourceType || '')) {
    case 'customer_invoice':
    case 'customer_payment':
    case 'credit_note':
    case 'asset_sale':
      return 'sale';
    case 'vendor_bill':
    case 'vendor_payment':
    case 'vendor_refund':
    case 'asset_purchase':
      return 'purchase';
    case 'tax_return':
      return 'tax';
    default:
      return 'general';
  }
}

function lockMsg(kind: string, accountingDate: string, lockDate: string) {
  const d = dateOnly(accountingDate);
  const l = dateOnly(lockDate);
  return `Posting is not allowed because the accounting date ${d} is on or before the ${kind} ${l}.`;
}

/**
 * Settings-level lock evaluation (no DB).
 * Sale/purchase locks apply only to their domain — never to miscellaneous journals.
 * Tax lock applies to sale, purchase, and tax documents (not miscellaneous).
 * Fiscal, period, and soft locks apply to every domain.
 */
export function evaluateAccountingLockSettings(args: {
  date: string;
  domain: AccountingLockDomain;
  settings: AccountingLockSettingsInput;
  allowSoftLockBypass?: boolean;
}): string | null {
  const date = dateOnly(args.date);
  const settings = args.settings;

  if (isAccountingDateOnOrBeforeLock(date, settings.hard_lock_date)) {
    return lockMsg('fiscal lock date', date, String(settings.hard_lock_date));
  }

  if (isAccountingDateOnOrBeforeLock(date, settings.period_lock_date)) {
    return lockMsg('period lock date', date, String(settings.period_lock_date));
  }

  if (
    !args.allowSoftLockBypass &&
    isAccountingDateOnOrBeforeLock(date, settings.soft_lock_date)
  ) {
    return `Posting is not allowed because the accounting date ${date} is on or before the soft lock date ${dateOnly(String(settings.soft_lock_date))}. Only Accounting Administrators can post into this period.`;
  }

  if (
    args.domain === 'sale' &&
    isAccountingDateOnOrBeforeLock(date, settings.sale_lock_date)
  ) {
    return lockMsg('sales lock date', date, String(settings.sale_lock_date));
  }

  if (
    args.domain === 'purchase' &&
    isAccountingDateOnOrBeforeLock(date, settings.purchase_lock_date)
  ) {
    return lockMsg('purchase lock date', date, String(settings.purchase_lock_date));
  }

  if (
    (args.domain === 'tax' ||
      args.domain === 'sale' ||
      args.domain === 'purchase') &&
    isAccountingDateOnOrBeforeLock(date, settings.tax_lock_date)
  ) {
    return lockMsg('tax lock date', date, String(settings.tax_lock_date));
  }

  return null;
}
