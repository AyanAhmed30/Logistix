import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { isSuperAdminSession } from '@/lib/auth/super-admin';
import { buildDashboardAccessFromSession as buildCrmAccess } from '@/lib/crm-page-access';
import type { DashboardAccessState } from '@/lib/dashboard-access';
import {
  hasEffectiveAccountingAccess,
  resolveEffectiveAccountingLevel,
} from '@/lib/accounting-access-bridge';
import {
  accountingCanAccessReports,
  accountingCanManageAutomation,
  accountingCanManageConfig,
  accountingCanManageCreditNotes,
  accountingCanManageRefunds,
  accountingCanManageLockDates,
  accountingCanDeleteInvoices,
  accountingCanRegisterPayments,
  type AccountingAccessLevel,
} from '@/lib/accounting-roles';

/**
 * Accounting access: Super Admin, explicit Accounting role,
 * or Sales access (implied Billing for SO → Invoice flow).
 */
export function sessionHasAccountingAccess(session: {
  role: string;
  username?: string;
  permissions?: string[] | null;
} | null): boolean {
  if (!session) return false;
  return hasEffectiveAccountingAccess({
    isSuperAdmin: isSuperAdminSession(session as never),
    role: session.role,
    permissions: session.permissions,
  });
}

export function sessionAccountingLevel(session: {
  role: string;
  username?: string;
  permissions?: string[] | null;
} | null): AccountingAccessLevel {
  if (!session) return 'no';
  return resolveEffectiveAccountingLevel({
    isSuperAdmin: isSuperAdminSession(session as never),
    role: session.role,
    permissions: session.permissions,
  });
}

export async function requireAccountingPageAccess(): Promise<DashboardAccessState> {
  const access = await buildCrmAccess();
  if (!access) redirect('/login');
  if (access.isSuperAdmin) return access;
  const allowed = hasEffectiveAccountingAccess({
    isSuperAdmin: false,
    role: access.sessionRole,
    permissions: access.permissions,
  });
  if (!allowed) redirect('/access-denied');
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
  lockDates?: boolean;
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
  if (opts?.lockDates && !accountingCanManageLockDates(level)) {
    return { error: 'Lock dates require Accountant access' as const, status: 403 as const };
  }
  return { session, level };
}

export { buildCrmAccess as buildDashboardAccessFromSession };
