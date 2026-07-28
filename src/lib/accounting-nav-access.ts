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
import { ACCOUNTING_NAV_ITEMS, type AccountingNavItem } from '@/lib/accounting-navigation';

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
