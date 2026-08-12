/**
 * Client-safe accounting nav helpers (no server imports).
 */
import type { AccountingAccessLevel } from '@/lib/accounting-roles';
import {
  accountingCanAccessReports,
  accountingCanManageAutomation,
  accountingCanManageConfig,
  accountingCanManageCreditNotes,
  accountingCanManageRefunds,
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
  if (id === 'accounting-refunds') return accountingCanManageRefunds(level);
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
  return true;
}

export function getAccountingNavStructureForLevel(
  level: AccountingAccessLevel
): AccountingNavEntry[] {
  return ACCOUNTING_NAV_STRUCTURE.map((entry) => {
    if (entry.type === 'link') {
      if (
        entry.item.id === 'accounting-automation' &&
        !accountingCanManageAutomation(level)
      ) {
        return null;
      }
      if (entry.item.id === 'accounting-refunds' && !accountingCanManageRefunds(level)) {
        return null;
      }
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
    if (item.id === 'accounting-automation') return accountingCanManageAutomation(level);
    if (item.id === 'accounting-credit-notes') return accountingCanManageCreditNotes(level);
    if (item.id === 'accounting-refunds') return accountingCanManageRefunds(level);
    if (item.id === 'accounting-chart-of-accounts') return accountingCanManageConfig(level);
    if (item.id === 'accounting-journals') return accountingCanManageConfig(level);
    if (item.id === 'accounting-taxes') return accountingCanManageConfig(level);
    if (item.id === 'accounting-payment-terms') return accountingCanManageConfig(level);
    if (item.id === 'accounting-currencies') return accountingCanManageConfig(level);
    if (item.id === 'accounting-lock-dates') return accountingCanManageLockDates(level);
    return true;
  });
}
