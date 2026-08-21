/**
 * Client-safe accounting nav helpers (no server imports).
 */
import type { AccountingAccessLevel } from '@/lib/accounting-roles';
import {
  accountingCanAccessReports,
  accountingCanAccessReview,
  accountingCanAccessReviewAudit,
  accountingCanManageConfig,
  accountingCanManageCreditNotes,
  accountingCanManageLockDates,
} from '@/lib/accounting-roles';
import {
  ACCOUNTING_NAV_STRUCTURE,
  type AccountingNavEntry,
  type AccountingNavItem,
  ACCOUNTING_NAV_ITEMS,
} from '@/lib/accounting-navigation';

function childAllowed(
  id: string,
  level: AccountingAccessLevel
): boolean {
  if (id === 'accounting-credit-notes') return accountingCanManageCreditNotes(level);
  if (id === 'accounting-vendor-refunds') return accountingCanManageCreditNotes(level);
  if (id === 'accounting-lock-dates') return accountingCanManageLockDates(level);
  if (id === 'accounting-chart-of-accounts') return accountingCanManageConfig(level);
  if (id === 'accounting-journals') return accountingCanManageConfig(level);
  if (id === 'accounting-taxes') return accountingCanManageConfig(level);
  if (id === 'accounting-payment-terms') return accountingCanManageConfig(level);
  if (id === 'accounting-currencies') return accountingCanManageConfig(level);
  if (
    id === 'accounting-report-balance-sheet' ||
    id === 'accounting-report-profit-loss' ||
    id === 'accounting-report-cash-flow' ||
    id === 'accounting-report-trial-balance' ||
    id === 'accounting-report-general-ledger' ||
    id === 'accounting-report-partner-ledger' ||
    id === 'accounting-report-aged-receivable' ||
    id === 'accounting-report-aged-payable' ||
    id === 'accounting-report-tax' ||
    id === 'accounting-reports'
  ) {
    return accountingCanAccessReports(level);
  }
  if (
    id === 'accounting-review-journal-audit' ||
    id === 'accounting-review-audit-trail' ||
    id === 'accounting-review-annual-report'
  ) {
    return accountingCanAccessReviewAudit(level);
  }
  if (
    id === 'accounting-review-journal-items' ||
    id === 'accounting-review-loans-analysis' ||
    id === 'accounting-review-invoices-to-be-issued' ||
    id === 'accounting-review-working-files' ||
    id === 'accounting-review-deferred-revenues' ||
    id === 'accounting-review-deferred-expenses' ||
    id === 'accounting-review-menu'
  ) {
    return accountingCanAccessReview(level);
  }
  return true;
}

export function getAccountingNavStructureForLevel(
  level: AccountingAccessLevel
): AccountingNavEntry[] {
  return ACCOUNTING_NAV_STRUCTURE.map((entry) => {
    if (entry.type === 'link') {
      return entry;
    }
    if (
      entry.id === 'accounting-configuration-menu' &&
      !accountingCanManageConfig(level) &&
      !accountingCanManageLockDates(level)
    ) {
      return null;
    }
    if (entry.id === 'accounting-reports-menu' && !accountingCanAccessReports(level)) {
      return null;
    }
    if (entry.id === 'accounting-review-menu' && !accountingCanAccessReview(level)) {
      return null;
    }
    const children = entry.children.filter((c) => childAllowed(c.id, level));
    if (!children.length) return null;
    return { ...entry, children };
  }).filter(Boolean) as AccountingNavEntry[];
}

/** @deprecated Prefer getAccountingNavStructureForLevel */
export function getAccountingNavItemsForLevel(
  level: AccountingAccessLevel
): AccountingNavItem[] {
  return ACCOUNTING_NAV_ITEMS.filter((item) => {
    if (
      item.id === 'accounting-reports' ||
      item.id === 'accounting-report-balance-sheet' ||
      item.id === 'accounting-report-profit-loss' ||
      item.id === 'accounting-report-cash-flow' ||
      item.id === 'accounting-report-trial-balance' ||
      item.id === 'accounting-report-general-ledger' ||
      item.id === 'accounting-report-partner-ledger' ||
      item.id === 'accounting-report-aged-receivable' ||
      item.id === 'accounting-report-aged-payable' ||
      item.id === 'accounting-report-tax'
    ) {
      return accountingCanAccessReports(level);
    }
    if (
      item.id === 'accounting-review-journal-audit' ||
      item.id === 'accounting-review-audit-trail' ||
      item.id === 'accounting-review-annual-report'
    ) {
      return accountingCanAccessReviewAudit(level);
    }
    if (
      item.id === 'accounting-review-journal-items' ||
      item.id === 'accounting-review-loans-analysis' ||
      item.id === 'accounting-review-invoices-to-be-issued' ||
      item.id === 'accounting-review-working-files' ||
      item.id === 'accounting-review-deferred-revenues' ||
      item.id === 'accounting-review-deferred-expenses'
    ) {
      return accountingCanAccessReview(level);
    }
    if (item.id === 'accounting-credit-notes') return accountingCanManageCreditNotes(level);
    if (item.id === 'accounting-chart-of-accounts') return accountingCanManageConfig(level);
    if (item.id === 'accounting-journals') return accountingCanManageConfig(level);
    if (item.id === 'accounting-taxes') return accountingCanManageConfig(level);
    if (item.id === 'accounting-payment-terms') return accountingCanManageConfig(level);
    if (item.id === 'accounting-currencies') return accountingCanManageConfig(level);
    if (item.id === 'accounting-lock-dates') return accountingCanManageLockDates(level);
    return true;
  });
}
