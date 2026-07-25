import type { SessionPayload } from '@/lib/auth/session';

/** Hardcoded super-admin portal username (admin / admin123). */
export const SUPER_ADMIN_USERNAME = 'admin';

export const ADMIN_CONTEXT_LABEL = 'Admin';

export function isSuperAdminSession(session: SessionPayload | null | undefined): boolean {
  return session?.role === 'admin' && session.username === SUPER_ADMIN_USERNAME;
}

export function isSuperAdminInAdminContext(session: SessionPayload | null | undefined): boolean {
  return isSuperAdminSession(session) && !session?.organizationId;
}
