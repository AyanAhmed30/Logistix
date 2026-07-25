'use server';

import { getSession } from '@/lib/auth/session';
import { getSalesAgentByUsername } from '@/app/actions/sales_agents';
import { hasModulePermission } from '@/lib/module-permissions';
import { isSuperAdminSession } from '@/lib/auth/super-admin';

/**
 * Assigned module = full access.
 * Admins always pass. Portal users / sales agents / operations users pass when
 * the required module key is in their session (or legacy empty = full access).
 */
export async function hasPermission(requiredPermission: string): Promise<boolean> {
  try {
    const session = await getSession();

    if (!session) {
      return false;
    }

    if (isSuperAdminSession(session)) {
      return true;
    }

    // Single source of truth: module keys on the session (from user creation).
    if (hasModulePermission(session.permissions, requiredPermission)) {
      return true;
    }

    // Legacy sales_agent: empty permissions = full access; also check DB row.
    if (session.role === 'sales_agent') {
      if (!session.permissions || session.permissions.length === 0) {
        return true;
      }

      const result = await getSalesAgentByUsername(session.username);
      if (result && 'salesAgent' in result && result.salesAgent) {
        const permissions = result.salesAgent.permissions;
        if (Array.isArray(permissions) && permissions.length === 0) {
          return true;
        }
        if (Array.isArray(permissions) && permissions.length > 0) {
          return hasModulePermission(permissions, requiredPermission);
        }
      }
    }

    // Legacy operations role: empty permissions = full access.
    if (session.role === 'operations') {
      if (!session.permissions || session.permissions.length === 0) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Check if the current user is an admin or has a specific permission.
 */
export async function isAuthorized(requiredPermission?: string): Promise<boolean> {
  const session = await getSession();

  if (!session) {
    return false;
  }

  if (isSuperAdminSession(session)) {
    return true;
  }

  if (!requiredPermission) {
    return false;
  }

  return hasPermission(requiredPermission);
}
