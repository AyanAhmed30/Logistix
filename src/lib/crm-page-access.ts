import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { canAccessAdminDashboard } from '@/lib/auth/portal-access';
import { isSuperAdminSession } from '@/lib/auth/super-admin';
import { parsePermissionKeys } from '@/lib/module-permissions';
import type { DashboardAccessState } from '@/lib/dashboard-access';

export async function buildDashboardAccessFromSession(): Promise<DashboardAccessState | null> {
  const session = await getSession();
  if (!session || !canAccessAdminDashboard(session)) return null;

  return {
    isSuperAdmin: isSuperAdminSession(session),
    isPortalAccount: Boolean(session.appUserId),
    isOrganizationAdmin: session.appUserRole === 'administrator',
    appUserId: session.appUserId ?? null,
    appUserRole: session.appUserRole ?? null,
    username: session.username,
    fullName: session.fullName?.trim() || session.username,
    permissions: parsePermissionKeys(session.permissions),
  };
}

export async function requireCrmPageAccess(permissionKey: string) {
  const access = await buildDashboardAccessFromSession();
  if (!access) redirect('/login');

  if (access.isSuperAdmin) return access;

  const { hasModulePermission } = await import('@/lib/module-permissions');
  if (!hasModulePermission(access.permissions, permissionKey)) {
    redirect('/access-denied');
  }

  const { hasDepartmentAccess } = await import('@/lib/module-permissions');
  if (!hasDepartmentAccess(access.permissions, 'crm')) {
    redirect('/access-denied');
  }

  return access;
}
