import { getSession, type SessionPayload } from '@/lib/auth/session';
import { isSuperAdminSession } from '@/lib/auth/super-admin';

/**
 * Super Admin looking at an organization may view CRM, Contact, Sales and
 * Accounting records but not change them. Every other user and module is
 * unaffected, and so is Super Admin in the Admin context.
 */
export const VIEW_ONLY_MESSAGE =
  'View only: Super Admin cannot change CRM, Contact, Sales or Accounting records while viewing an organization.';

export function isSuperAdminViewOnly(session: SessionPayload | null | undefined): boolean {
  return isSuperAdminSession(session) && Boolean(session?.organizationId);
}

/** For write actions in the view-only modules: the error to return, or null to continue. */
export async function viewOnlyError(): Promise<string | null> {
  return isSuperAdminViewOnly(await getSession()) ? VIEW_ONLY_MESSAGE : null;
}
