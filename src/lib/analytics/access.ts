/**
 * The single access decision for Analytics. Every analytics server action must
 * start here and use the returned scope in its queries, because they run with
 * the service-role client and the database cannot see who the user is.
 *
 * Anything that cannot be scoped is denied. In particular, a role without an
 * organization scope must never fall through to "no filter".
 */

import type { SessionPayload } from '@/lib/auth/session';
import { isSuperAdminSession } from '@/lib/auth/super-admin';
import { isOrganizationAdministratorSession } from '@/lib/auth/portal-access';
import { hasDepartmentAccess } from '@/lib/module-permissions';

export type AnalyticsDepartment = 'sales' | 'operations';

export type AnalyticsAccess =
  | { kind: 'denied' }
  /** organizationId null = every organization (Super Admin in Admin context only). */
  | { kind: 'admin'; organizationId: string | null }
  | {
      kind: 'self';
      username: string;
      organizationId: string | null;
      departments: AnalyticsDepartment[];
    };

const DENIED: AnalyticsAccess = { kind: 'denied' };

function selfDepartments(session: SessionPayload): AnalyticsDepartment[] {
  const departments: AnalyticsDepartment[] = [];
  if (
    session.role === 'sales_agent' ||
    (session.role === 'user' && hasDepartmentAccess(session.permissions, 'sales'))
  ) {
    departments.push('sales');
  }
  if (
    session.role === 'operations' ||
    (session.role === 'user' && hasDepartmentAccess(session.permissions, 'operations'))
  ) {
    departments.push('operations');
  }
  return departments;
}

export function resolveAnalyticsAccess(session: SessionPayload | null | undefined): AnalyticsAccess {
  if (!session) return DENIED;

  if (isSuperAdminSession(session)) {
    return { kind: 'admin', organizationId: session.organizationId ?? null };
  }

  if (isOrganizationAdministratorSession(session)) {
    const organizationId = session.organizationId;
    if (!organizationId || !(session.organizationIds ?? []).includes(organizationId)) return DENIED;
    return { kind: 'admin', organizationId };
  }

  const username = String(session.username || '').trim();
  const departments = selfDepartments(session);
  if (!username || departments.length === 0) return DENIED;

  // Portal users and agents work inside an organization. Only legacy Operations
  // logins have none, and they are limited to their own username.
  const organizationId = session.organizationId ?? null;
  if (!organizationId && session.role !== 'operations') return DENIED;

  return { kind: 'self', username, organizationId, departments };
}

/**
 * Whether this access may open one employee's analytics or reports. For an
 * organization administrator the caller must also confirm that the employee
 * belongs to the organization.
 */
export function canViewEmployee(
  access: AnalyticsAccess,
  department: AnalyticsDepartment,
  username: string
): boolean {
  if (access.kind === 'admin') return true;
  if (access.kind !== 'self') return false;
  return (
    access.departments.includes(department) &&
    access.username.toLowerCase() === String(username || '').trim().toLowerCase()
  );
}
