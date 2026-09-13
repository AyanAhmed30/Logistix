import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canAccessAdminDashboard } from "@/lib/auth/portal-access";
import { isSuperAdminSession } from "@/lib/auth/super-admin";
import { parsePermissionKeys } from "@/lib/module-permissions";
import type { DashboardAccessState } from "@/lib/dashboard-access";

export async function buildTodoDashboardAccessFromSession(): Promise<DashboardAccessState | null> {
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
 * Global Admin To-Do module — available to Super Admin and portal accounts
 * that can open the Admin dashboard.
 */
export async function requireTodoModuleAccess(): Promise<DashboardAccessState> {
  const access = await buildTodoDashboardAccessFromSession();
  if (!access) redirect("/login");
  return access;
}
