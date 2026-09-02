import { getSession, type SessionPayload } from '@/lib/auth/session';
import {
  hasDepartmentAccess,
  hasModulePermission,
  type ModuleDepartment,
} from '@/lib/module-permissions';
import {
  canManageOrganizationUsers,
} from '@/lib/auth/portal-access';
import { isSuperAdminSession } from '@/lib/auth/super-admin';

export type AccessDenied = { error: 'Access Denied'; status: 403 };

export function accessDenied(_message = 'Access Denied'): AccessDenied {
  return { error: 'Access Denied', status: 403 };
}

type AccessSession = {
  role: string;
  permissions?: string[] | null;
};

export function sessionHasSalesAccess(session: AccessSession): boolean {
  if (isSuperAdminSession(session as SessionPayload)) return true;
  if (session.role === 'sales_agent') return true;
  if (session.role === 'user' && hasDepartmentAccess(session.permissions, 'sales')) {
    return true;
  }
  return false;
}

export function sessionHasOperationsAccess(session: AccessSession): boolean {
  if (isSuperAdminSession(session as SessionPayload)) return true;
  if (session.role === 'operations') return true;
  if (session.role === 'user' && hasDepartmentAccess(session.permissions, 'operations')) {
    return true;
  }
  return false;
}

export function sessionHasWarehouseAccess(session: AccessSession): boolean {
  if (isSuperAdminSession(session as SessionPayload)) return true;
  if (session.role === 'user' && hasDepartmentAccess(session.permissions, 'warehouse')) {
    return true;
  }
  return false;
}

export function sessionHasCrmAccess(session: AccessSession): boolean {
  if (isSuperAdminSession(session as SessionPayload)) return true;
  if (session.role === 'sales_agent') return true;
  if (session.role === 'user' && hasDepartmentAccess(session.permissions, 'crm')) {
    return true;
  }
  // Sales access always includes CRM
  if (session.role === 'user' && hasDepartmentAccess(session.permissions, 'sales')) {
    return true;
  }
  return false;
}

export function sessionHasHrAccess(session: AccessSession): boolean {
  if (isSuperAdminSession(session as SessionPayload)) return true;
  return hasDepartmentAccess(session.permissions, 'hr');
}

/** True when acting as a Sales person (legacy sales_agent or portal user with Sales). */
export function isSalesPortalActor(session: AccessSession): boolean {
  return (
    session.role === 'sales_agent' ||
    (session.role === 'user' && hasDepartmentAccess(session.permissions, 'sales'))
  );
}

/** True when acting as an Operations person (legacy operations or portal user with Operations). */
export function isOperationsPortalActor(session: AccessSession): boolean {
  return (
    session.role === 'operations' ||
    (session.role === 'user' && hasDepartmentAccess(session.permissions, 'operations'))
  );
}

export async function requireAuth(): Promise<SessionPayload | AccessDenied> {
  const session = await getSession();
  if (!session) return accessDenied('Unauthorized');
  return session;
}

export async function requireSuperAdmin(): Promise<SessionPayload | AccessDenied> {
  const session = await requireAuth();
  if ('error' in session) return session;
  if (!isSuperAdminSession(session)) return accessDenied();
  return session;
}

/** @deprecated Alias — use requireSuperAdmin for global admin actions. */
export async function requireAdmin(): Promise<SessionPayload | AccessDenied> {
  return requireSuperAdmin();
}

export async function requireOrganizationAdmin(): Promise<SessionPayload | AccessDenied> {
  const session = await requireAuth();
  if ('error' in session) return session;
  if (canManageOrganizationUsers(session)) return session;
  return accessDenied();
}

export async function requireSalesAccess(): Promise<SessionPayload | AccessDenied> {
  const session = await requireAuth();
  if ('error' in session) return session;
  if (!sessionHasSalesAccess(session)) return accessDenied();
  return session;
}

export async function requireOperationsAccess(): Promise<SessionPayload | AccessDenied> {
  const session = await requireAuth();
  if ('error' in session) return session;
  if (!sessionHasOperationsAccess(session)) return accessDenied();
  return session;
}

export async function requireWarehouseAccess(): Promise<SessionPayload | AccessDenied> {
  const session = await requireAuth();
  if ('error' in session) return session;
  if (!sessionHasWarehouseAccess(session)) return accessDenied();
  return session;
}

export async function requireCrmAccess(): Promise<SessionPayload | AccessDenied> {
  const session = await requireAuth();
  if ('error' in session) return session;
  if (!sessionHasCrmAccess(session)) return accessDenied();
  return session;
}

export async function requireHrAccess(): Promise<SessionPayload | AccessDenied> {
  const session = await requireAuth();
  if ('error' in session) return session;
  if (!sessionHasHrAccess(session)) return accessDenied();
  return session;
}

export async function requireHrChildModule(
  moduleKey: string
): Promise<SessionPayload | AccessDenied> {
  const session = await requireAuth();
  if ('error' in session) return session;

  if (isSuperAdminSession(session)) return session;

  if (hasModulePermission(session.permissions, moduleKey)) return session;
  return accessDenied();
}

export async function requireDepartment(
  department: ModuleDepartment
): Promise<SessionPayload | AccessDenied> {
  if (department === 'sales') return requireSalesAccess();
  if (department === 'crm') return requireCrmAccess();
  if (department === 'operations') return requireOperationsAccess();
  if (department === 'warehouse') return requireWarehouseAccess();
  if (department === 'hr') return requireHrAccess();
  if (department === 'accounting') {
    const session = await requireAuth();
    if ('error' in session) return session;
    if (isSuperAdminSession(session) || hasDepartmentAccess(session.permissions, 'accounting')) {
      return session;
    }
    return accessDenied();
  }
  return accessDenied();
}

/** Warehouse user portal action — legacy users without appUserId retain full warehouse access. */
export async function requireWarehousePortalUser(
  moduleKey: string
): Promise<SessionPayload | AccessDenied> {
  const session = await requireAuth();
  if ('error' in session) return session;
  if (session.role !== 'user') return accessDenied('Unauthorized');
  if (!session.appUserId) return session;
  if (hasModulePermission(session.permissions, moduleKey)) return session;
  return accessDenied();
}

export async function requireChildModule(
  moduleKey: string
): Promise<SessionPayload | AccessDenied> {
  return requireAnyChildModule([moduleKey]);
}

/** Allow access when the session has any of the listed module keys. */
export async function requireAnyChildModule(
  moduleKeys: string[]
): Promise<SessionPayload | AccessDenied> {
  const session = await requireAuth();
  if ('error' in session) return session;

  if (isSuperAdminSession(session)) return session;

  const keys = moduleKeys.filter(Boolean);
  if (keys.length === 0) return accessDenied();

  if (session.role === 'sales_agent' || session.role === 'operations') {
    // Legacy empty permissions = full module access for that role.
    if (!session.permissions || session.permissions.length === 0) return session;
    if (keys.some((key) => hasModulePermission(session.permissions, key))) {
      return session;
    }
    return accessDenied();
  }

  // Portal users (and any other role carrying module assignments).
  if (keys.some((key) => hasModulePermission(session.permissions, key))) {
    return session;
  }

  return accessDenied();
}

export function isAccessDenied(result: unknown): result is AccessDenied {
  return Boolean(
    result &&
      typeof result === 'object' &&
      'error' in result &&
      (result as AccessDenied).error === 'Access Denied'
  );
}
