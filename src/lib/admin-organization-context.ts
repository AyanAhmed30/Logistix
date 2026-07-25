import { getSession, type SessionPayload, type SessionRole } from '@/lib/auth/session';
import {
  ADMIN_CONTEXT_LABEL,
  isSuperAdminInAdminContext,
} from '@/lib/auth/super-admin';

export type AdminOrgScope = {
  session: SessionPayload;
  /** `null` when super admin is in global Admin context (no org filter). */
  organizationId: string | null;
  organizationName: string;
};

export type AdminOrgScopeResult =
  | AdminOrgScope
  | { error: string; status?: 401 | 403 };

/** Admin portal, portal users, and sales agents scope business data by active organization. */
export function sessionUsesOrganizationScope(role: SessionRole): boolean {
  return role === 'admin' || role === 'user' || role === 'sales_agent';
}

/**
 * Resolve organization scope for admin / portal user sessions.
 * Returns `null` for legacy roles that do not use organization scoping.
 */
export async function resolveSessionOrganizationScope(
  session: SessionPayload
): Promise<AdminOrgScopeResult | null> {
  if (!sessionUsesOrganizationScope(session.role)) return null;
  return requireAdminOrganizationScope();
}

/** Active organization id from session (admin / portal user). */
export async function getActiveOrganizationId(): Promise<string | null> {
  const session = await getSession();
  return session?.organizationId ?? null;
}

/**
 * Require an active organization for business-module server actions.
 * Settings / global admin actions should NOT call this.
 */
export async function requireAdminOrganizationScope(): Promise<AdminOrgScopeResult> {
  const session = await getSession();
  if (!session) {
    return { error: 'Unauthorized', status: 401 };
  }

  if (session.role !== 'admin' && session.role !== 'user' && session.role !== 'sales_agent') {
    return { error: 'Access Denied', status: 403 };
  }

  const organizationId = session.organizationId ?? null;

  if (!organizationId) {
    if (isSuperAdminInAdminContext(session)) {
      return {
        session,
        organizationId: null,
        organizationName: ADMIN_CONTEXT_LABEL,
      };
    }
    return {
      error: 'No organization selected. Choose a company from the header switcher.',
      status: 403,
    };
  }

  if (
    session.organizationIds &&
    session.organizationIds.length > 0 &&
    !session.organizationIds.includes(organizationId)
  ) {
    return { error: 'Access Denied', status: 403 };
  }

  return {
    session,
    organizationId,
    organizationName: session.organizationName || 'Organization',
  };
}

type OrgFilterableQuery<T> = T & {
  eq: (column: string, value: string) => T;
};

/**
 * Strict multi-company filter (Odoo-style): only rows for the active organization.
 * Does not include legacy NULL organization_id rows — those belong to no company.
 */
export function applyOrganizationFilter<T extends OrgFilterableQuery<T>>(
  query: T,
  organizationId: string | null | undefined,
  column = 'organization_id'
): T {
  if (!organizationId) return query;
  return query.eq(column, organizationId);
}

/** True when PostgREST reports a missing organization_id column. */
export function isMissingOrganizationColumnError(error: {
  message?: string;
  code?: string;
} | null | undefined) {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  const code = String(error.code || '');
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    (msg.includes('organization_id') && msg.includes('does not exist')) ||
    (msg.includes('could not find') && msg.includes('organization_id'))
  );
}
