/**
 * Client-safe accounting nav helpers (no server imports).
 */
import type { AccountingAccessLevel } from '@/lib/accounting-roles';
import {
  accountingCanAccessReports,
  accountingCanManageAutomation,
  accountingCanManageCreditNotes,
  accountingCanManageRefunds,
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
  return true;
}

export function getAccountingNavStructureForLevel(
  level: AccountingAccessLevel
): AccountingNavEntry[] {
  return ACCOUNTING_NAV_STRUCTURE.map((entry) => {
    if (entry.type === 'link') {
      if (entry.item.id === 'accounting-reports' && !accountingCanAccessReports(level)) {
        return null;
      }
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
    if (item.id === 'accounting-reports') return accountingCanAccessReports(level);
    if (item.id === 'accounting-automation') return accountingCanManageAutomation(level);
    if (item.id === 'accounting-credit-notes') return accountingCanManageCreditNotes(level);
    if (item.id === 'accounting-refunds') return accountingCanManageRefunds(level);
    return true;
  });
}
