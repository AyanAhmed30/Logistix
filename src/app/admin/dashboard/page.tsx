import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { AdminDashboardShell } from '@/components/admin/AdminDashboardShell';
import { getAdminOrganizationState } from '@/app/actions/organization-context';
import { canAccessAdminDashboard } from '@/lib/auth/portal-access';
import { isSuperAdminSession } from '@/lib/auth/super-admin';
import { parsePermissionKeys } from '@/lib/module-permissions';
import type { DashboardAccessState } from '@/lib/dashboard-access';

export default async function AdminDashboard() {
  const session = await getSession();

  if (!session || !canAccessAdminDashboard(session)) {
    redirect('/login');
  }

  if (session.role === 'sales_agent' || session.role === 'operations') {
    redirect('/login');
  }

  const organizationState = await getAdminOrganizationState();

  const access: DashboardAccessState = {
    isSuperAdmin: isSuperAdminSession(session),
    isPortalAccount: Boolean(session.appUserId),
    isOrganizationAdmin: session.appUserRole === 'administrator',
    appUserId: session.appUserId ?? null,
    appUserRole: session.appUserRole ?? null,
    sessionRole: session.role ?? null,
    username: session.username,
    fullName: session.fullName?.trim() || session.username,
    permissions: parsePermissionKeys(session.permissions),
  };

  return (
    <AdminDashboardShell initialOrganizationState={organizationState} access={access} />
  );
}
