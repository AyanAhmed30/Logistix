import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { isSuperAdminSession } from '@/lib/auth/super-admin';
import { buildDashboardAccessFromSession as buildCrmAccess } from '@/lib/crm-page-access';
import type { DashboardAccessState } from '@/lib/dashboard-access';
import {
  accountingCanAccessReports,
  accountingCanManageAutomation,
  accountingCanManageConfig,
  accountingCanManageCreditNotes,
  accountingCanManageRefunds,
  accountingCanDeleteInvoices,
  accountingCanRegisterPayments,
  getAccountingAccessLevel,
  hasAccountingAccess,
  type AccountingAccessLevel,
} from '@/lib/accounting-roles';

/**
 * Accounting access: Super Admin OR portal users with an Accounting access level.
 */
export function sessionHasAccountingAccess(session: {
  role: string;
  username?: string;
  permissions?: string[] | null;
} | null): boolean {
  if (!session) return false;
  if (isSuperAdminSession(session as never)) return true;
  return hasAccountingAccess(session.permissions || []);
}

export function sessionAccountingLevel(session: {
  role: string;
  username?: string;
  permissions?: string[] | null;
} | null): AccountingAccessLevel {
  if (!session) return 'no';
  if (isSuperAdminSession(session as never)) return 'admin';
  return getAccountingAccessLevel(session.permissions || []);
}

export async function requireAccountingPageAccess(): Promise<DashboardAccessState> {
  const access = await buildCrmAccess();
  if (!access) redirect('/login');
  if (access.isSuperAdmin) return access;
  if (!hasAccountingAccess(access.permissions)) redirect('/access-denied');
  return access;
}

export async function requireAccountingActionAccess(opts?: {
  reports?: boolean;
  config?: boolean;
  automation?: boolean;
  creditNotes?: boolean;
  refunds?: boolean;
  deleteInvoice?: boolean;
  payments?: boolean;
}) {
  const session = await getSession();
  if (!session || !sessionHasAccountingAccess(session)) {
    return { error: 'Access Denied' as const, status: 403 as const };
  }
  const level = sessionAccountingLevel(session);
  if (opts?.reports && !accountingCanAccessReports(level)) {
    return { error: 'Reports require Accountant access' as const, status: 403 as const };
  }
  if (opts?.config && !accountingCanManageConfig(level)) {
    return { error: 'Configuration requires Accounting Administrator' as const, status: 403 as const };
  }
  if (opts?.automation && !accountingCanManageAutomation(level)) {
    return { error: 'Automation requires Accounting Administrator' as const, status: 403 as const };
  }
  if (opts?.creditNotes && !accountingCanManageCreditNotes(level)) {
    return { error: 'Credit notes require Accountant access' as const, status: 403 as const };
  }
  if (opts?.refunds && !accountingCanManageRefunds(level)) {
    return { error: 'Refunds require Accountant access' as const, status: 403 as const };
  }
  if (opts?.deleteInvoice && !accountingCanDeleteInvoices(level)) {
    return { error: 'Deleting invoices requires Accountant access' as const, status: 403 as const };
  }
  if (opts?.payments && !accountingCanRegisterPayments(level)) {
    return { error: 'Payment registration not permitted' as const, status: 403 as const };
  }
  return { session, level };
}

export { buildCrmAccess as buildDashboardAccessFromSession };
