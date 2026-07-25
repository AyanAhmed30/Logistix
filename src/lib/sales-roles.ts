/**
 * Odoo-style Sales access levels — single source of truth from permissions.
 *
 * - No → null (no Sales)
 * - User: Own Documents Only → sales_user
 * - User: All Documents → sales_manager
 * - Administrator → administrator (org Sales admin, not Super Admin)
 */

import type { SessionPayload } from '@/lib/auth/session';
import { isSuperAdminSession } from '@/lib/auth/super-admin';
import { isOrganizationAdministratorSession } from '@/lib/auth/portal-access';
import {
  getSalesAccessLevel,
  hasSalesAccess,
  type SalesAccessLevel,
} from '@/lib/module-permissions';

export type SalesAccessRole = 'administrator' | 'sales_manager' | 'sales_user';

export function resolveSalesAccessRole(
  session: SessionPayload | null | undefined
): SalesAccessRole | null {
  if (!session) return null;
  if (isSuperAdminSession(session)) return 'administrator';

  const level = getSalesAccessLevel(session.permissions || []);

  if (level === 'admin') return 'administrator';
  if (level === 'all') return 'sales_manager';
  if (level === 'own') return 'sales_user';

  // Organization administrator with any sales access (legacy) → all documents
  if (isOrganizationAdministratorSession(session) && hasSalesAccess(session.permissions)) {
    return 'sales_manager';
  }

  // Legacy sales_agent role
  if (session.role === 'sales_agent') {
    if (level === 'no') {
      // Legacy empty permissions = full org sales access
      if (!session.permissions || session.permissions.length === 0) {
        return 'sales_manager';
      }
      return 'sales_user';
    }
    return mapLevelToRole(level);
  }

  return null;
}

function mapLevelToRole(level: Exclude<SalesAccessLevel, 'no'>): SalesAccessRole {
  if (level === 'admin') return 'administrator';
  if (level === 'all') return 'sales_manager';
  return 'sales_user';
}

/** Managers and admins see all org records; own-documents users are ownership-scoped. */
export function salesRoleSeesAllOrgRecords(role: SalesAccessRole | null): boolean {
  return role === 'administrator' || role === 'sales_manager';
}

export function salesAccessSeesAllOrgRecords(
  session: SessionPayload | null | undefined
): boolean {
  return salesRoleSeesAllOrgRecords(resolveSalesAccessRole(session));
}

/**
 * PostgREST `.or(...)` clause for Own Documents users.
 * Returns null when the user may see all org records.
 */
export async function buildSalesOwnershipOrFilter(
  session: { username: string; role?: string; permissions?: string[] | null } | null | undefined
): Promise<string | null> {
  if (!session) return null;
  const role = resolveSalesAccessRole(session as SessionPayload);
  if (salesRoleSeesAllOrgRecords(role)) return null;

  const { resolveCurrentSalespersonId } = await import(
    '@/app/actions/sales/automation'
  );
  const agentId = await resolveCurrentSalespersonId();
  if (agentId) {
    return `salesperson_id.eq.${agentId},created_by.eq.${session.username}`;
  }
  return `created_by.eq.${session.username}`;
}
