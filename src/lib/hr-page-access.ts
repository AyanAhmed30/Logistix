import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canAccessAdminDashboard } from "@/lib/auth/portal-access";
import { isSuperAdminSession } from "@/lib/auth/super-admin";
import {
  hasDepartmentAccess,
  hasModulePermission,
  parsePermissionKeys,
} from "@/lib/module-permissions";
import type { DashboardAccessState } from "@/lib/dashboard-access";

export async function buildHrDashboardAccessFromSession(): Promise<DashboardAccessState | null> {
  const session = await getSession();
  if (!session) return null;

  if (!canAccessAdminDashboard(session)) return null;

  return {
    isSuperAdmin: isSuperAdminSession(session),
    isPortalAccount: Boolean(session.appUserId),
    isOrganizationAdmin: session.appUserRole === "administrator",
    appUserId: session.appUserId ?? null,
    appUserRole: session.appUserRole ?? null,
    sessionRole: session.role ?? null,
    username: session.username,
    fullName: session.fullName?.trim() || session.username,
    permissions: parsePermissionKeys(session.permissions),
  };
}

/**
 * Require HR department access (super admin, or any HR child/parent permission).
 */
export async function requireHrModuleAccess(): Promise<DashboardAccessState> {
  const access = await buildHrDashboardAccessFromSession();
  if (!access) redirect("/login");

  if (access.isSuperAdmin) {
    return access;
  }

  if (!hasDepartmentAccess(access.permissions, "hr")) {
    redirect("/access-denied");
  }

  return access;
}

/**
 * Require a specific HR child permission for a page.
 */
export async function requireHrPageAccess(permissionKey: string) {
  const access = await requireHrModuleAccess();

  if (access.isSuperAdmin) return access;

  if (!hasModulePermission(access.permissions, permissionKey)) {
    redirect("/access-denied");
  }

  return access;
}
