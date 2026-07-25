import type { SessionPayload } from '@/lib/auth/session';
import { isSuperAdminSession } from '@/lib/auth/super-admin';

export type PortalAppUserRole = 'user' | 'administrator';

export function isPortalAccountSession(session: SessionPayload | null | undefined): boolean {
  return Boolean(session?.appUserId);
}

export function isOrganizationAdministratorSession(
  session: SessionPayload | null | undefined
): boolean {
  return isPortalAccountSession(session) && session?.appUserRole === 'administrator';
}

/** Super Admin or any portal account (User / Organization Administrator). */
export function canAccessAdminDashboard(session: SessionPayload | null | undefined): boolean {
  if (!session) return false;
  if (isSuperAdminSession(session)) return true;
  return isPortalAccountSession(session);
}

export function canManageOrganizationUsers(session: SessionPayload | null | undefined): boolean {
  if (!session) return false;
  if (isSuperAdminSession(session)) return true;
  return isOrganizationAdministratorSession(session);
}

export function canManageGlobalSettings(session: SessionPayload | null | undefined): boolean {
  return isSuperAdminSession(session);
}
