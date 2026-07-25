import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { buildDashboardAccessFromSession } from '@/lib/crm-page-access';
import { sessionHasSalesAccess } from '@/lib/auth/require-access';
import { hasDepartmentAccess, hasModulePermission } from '@/lib/module-permissions';

export { buildDashboardAccessFromSession };

/** Server-only Sales page guard. Do not import this module from Client Components. */
export async function requireSalesPageAccess(permissionKey?: string) {
  const access = await buildDashboardAccessFromSession();
  if (!access) redirect('/login');

  if (access.isSuperAdmin) return access;

  const session = await getSession();
  if (!session || !sessionHasSalesAccess(session)) {
    redirect('/access-denied');
  }

  // Odoo-style: any Sales access level unlocks the whole Sales app.
  // permissionKey kept for call-site compatibility; department access is enough.
  if (
    permissionKey &&
    !hasDepartmentAccess(access.permissions, 'sales') &&
    session.role !== 'sales_agent' &&
    !hasModulePermission(access.permissions, permissionKey)
  ) {
    redirect('/access-denied');
  }

  return access;
}
