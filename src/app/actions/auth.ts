'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/utils/supabase/server';
import { encrypt, getSessionCookieOptions } from '@/lib/auth/session';
import { verifyPassword } from '@/lib/auth/password';
import { parsePermissionKeys } from '@/lib/module-permissions';
import { SUPER_ADMIN_USERNAME } from '@/lib/auth/super-admin';
import type { SessionAppUserRole } from '@/lib/auth/session';
import { fetchPortalUserOrganizationAssignments } from '@/lib/portal-user-organizations';
import { migrateLegacyAccountToPortal } from '@/lib/legacy-user-bridge';
import { authenticatePortalUser } from "@/lib/local-auth";

const ADMIN_USERNAME = SUPER_ADMIN_USERNAME;
const ADMIN_PASSWORD = 'admin123';

const DASHBOARD_BY_ROLE: Record<string, string> = {
  admin: '/admin/dashboard',
  organization: '/organization/dashboard',
  user: '/admin/dashboard',
};

async function establishSession(params: {
  username: string;
  role: import('@/lib/auth/session').SessionRole;
  appUserId?: string;
  appUserRole?: SessionAppUserRole;
  fullName?: string;
  organizationName?: string;
  organizationId?: string;
  organizationIds?: string[];
  permissions?: string[];
}) {
  const cookieOptions = getSessionCookieOptions();
  const session = await encrypt({
    username: params.username,
    role: params.role,
    appUserId: params.appUserId,
    appUserRole: params.appUserRole,
    fullName: params.fullName,
    organizationName: params.organizationName,
    organizationId: params.organizationId,
    organizationIds: params.organizationIds,
    permissions: params.permissions,
    lastActivity: Date.now(),
  });
  (await cookies()).set('session', session, cookieOptions);
  const redirectTo = params.appUserId
    ? '/admin/dashboard'
    : DASHBOARD_BY_ROLE[params.role] || '/login';
  return { redirectTo };
}

async function loadPortalUserOrganizations(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  userId: string,
  defaultOrganizationId: string | null
) {
  const assignment = await fetchPortalUserOrganizationAssignments(supabase, userId, {
    defaultOrganizationId,
  });

  return {
    organizationIds: assignment.organizationIds,
    organizationId: assignment.activeOrganizationId ?? undefined,
    organizationName: assignment.activeOrganizationName ?? undefined,
  };
}

type LegacySalesLoginRow = {
  id: string;
  name: string | null;
  username: string;
  password: string;
  email?: string | null;
  permissions: unknown;
};

type LegacyOpsLoginRow = {
  id: string;
  name: string | null;
  username: string;
  password: string;
  permissions: unknown;
};

export async function login(formData: FormData) {
  try {
    const username = String(formData.get('username') || '').trim();
    const password = String(formData.get('password') || '').trim();

    if (!username || !password) {
      return { error: 'Username and password are required' };
    }
    const cookieOptions = getSessionCookieOptions();
    const sessionBase = { lastActivity: Date.now() };

    const localUser = authenticatePortalUser(username, password);
    if (localUser) {
      const session = await encrypt({
        username: localUser.username,
        role: "user",
        ...sessionBase,
      });
      (await cookies()).set("session", session, cookieOptions);
      redirect("/welcome");
    }

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      const supabase = await createAdminClient();
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, organization_name')
        .eq('status', 'active')
        .order('organization_name', { ascending: true });

      const organizationIds = (orgs || []).map((o) => String(o.id));

      return await establishSession({
        username,
        role: 'admin',
        organizationIds,
      });
    }

    const supabase = await createAdminClient();

    // 1) Portal users — use live column `default_organization`
    {
      let appUser: {
        id: string;
        username: string;
        role: string | null;
        permissions: unknown;
        default_organization_id: string | null;
        full_name?: string | null;
      } | null = null;

      const appUserResult = await supabase
        .from('app_users')
        .select('id, username, role, permissions, default_organization, full_name')
        .eq('username', username)
        .eq('password', password)
        .maybeSingle();

      if (
        appUserResult.error &&
        (appUserResult.error.message.includes('permissions') ||
          appUserResult.error.message.includes('default_organization') ||
          appUserResult.error.message.includes('column'))
      ) {
        const retry = await supabase
          .from('app_users')
          .select('id, username, role')
          .eq('username', username)
          .eq('password', password)
          .maybeSingle();
        if (retry.error) return { error: retry.error.message };
        if (retry.data) {
          appUser = {
            id: retry.data.id,
            username: retry.data.username,
            role: retry.data.role,
            permissions: [],
            default_organization_id: null,
          };
        }
      } else if (appUserResult.error) {
        return { error: appUserResult.error.message };
      } else if (appUserResult.data) {
        const row = appUserResult.data as Record<string, unknown>;
        appUser = {
          id: String(row.id),
          username: String(row.username),
          role: row.role ? String(row.role) : null,
          permissions: row.permissions,
          default_organization_id: row.default_organization
            ? String(row.default_organization)
            : null,
          full_name: row.full_name ? String(row.full_name) : null,
        };
      }

      if (appUser) {
        const appUserRole: SessionAppUserRole =
          String(appUser.role || '').toLowerCase() === 'admin' ? 'administrator' : 'user';
        const permissions = parsePermissionKeys(appUser.permissions);
        const orgs = await loadPortalUserOrganizations(
          supabase,
          appUser.id,
          appUser.default_organization_id
        );

        return await establishSession({
          username: appUser.username,
          role: 'user',
          appUserId: appUser.id,
          appUserRole,
          fullName: appUser.full_name?.trim() || appUser.username,
          permissions,
          organizationName: orgs.organizationName,
          organizationId: orgs.organizationId,
          organizationIds: orgs.organizationIds,
        });
      }
    }

    // 2+3+4) Legacy Sales / Operations / Organization — parallel after portal miss
    {
      const [salesAgentResult, opsUserResult, organizationResult] = await Promise.all([
        supabase
          .from('sales_agents')
          .select('id, name, username, password, email, permissions')
          .eq('username', username)
          .eq('password', password)
          .maybeSingle(),
        supabase
          .from('operations_users')
          .select('id, name, username, password, permissions')
          .eq('username', username)
          .eq('password', password)
          .maybeSingle(),
        supabase
          .from('organizations')
          .select('username, password, organization_name, status')
          .eq('username', username)
          .maybeSingle(),
      ]);

      let salesRow: LegacySalesLoginRow | null = null;
      if (salesAgentResult.error) {
        if (
          salesAgentResult.error.message.includes('permissions') ||
          salesAgentResult.error.message.includes('column')
        ) {
          const retry = await supabase
            .from('sales_agents')
            .select('id, name, username, password, email')
            .eq('username', username)
            .eq('password', password)
            .maybeSingle();
          if (!retry.error && retry.data) {
            salesRow = { ...retry.data, permissions: [] };
          }
        } else if (
          !salesAgentResult.error.message.includes('does not exist') &&
          !salesAgentResult.error.message.includes('relation')
        ) {
          return { error: salesAgentResult.error.message };
        }
      } else if (salesAgentResult.data) {
        salesRow = salesAgentResult.data as LegacySalesLoginRow;
      }

      if (salesRow) {
        const migrated = await migrateLegacyAccountToPortal(supabase, 'sales_agent', salesRow);
        if (migrated) {
          const appUserRole: SessionAppUserRole = 'user';
          const orgs = await loadPortalUserOrganizations(
            supabase,
            migrated.id,
            migrated.default_organization_id
          );
          return await establishSession({
            username: migrated.username,
            role: 'user',
            appUserId: migrated.id,
            appUserRole,
            fullName: migrated.full_name?.trim() || migrated.username,
            permissions: migrated.permissions,
            organizationName: orgs.organizationName,
            organizationId: orgs.organizationId,
            organizationIds: orgs.organizationIds,
          });
        }
      }

      let opsRow: LegacyOpsLoginRow | null = null;
      if (opsUserResult.error) {
        if (
          opsUserResult.error.message.includes('permissions') ||
          opsUserResult.error.message.includes('column')
        ) {
          const opsRetry = await supabase
            .from('operations_users')
            .select('id, name, username, password')
            .eq('username', username)
            .eq('password', password)
            .maybeSingle();
          if (!opsRetry.error && opsRetry.data) {
            opsRow = { ...opsRetry.data, permissions: [] };
          }
        } else if (
          !opsUserResult.error.message.includes('does not exist') &&
          !opsUserResult.error.message.includes('relation')
        ) {
          return { error: opsUserResult.error.message };
        }
      } else if (opsUserResult.data) {
        opsRow = opsUserResult.data as LegacyOpsLoginRow;
      }

      if (opsRow) {
        const migrated = await migrateLegacyAccountToPortal(
          supabase,
          'operations',
          opsRow
        );
        if (migrated) {
          const orgs = await loadPortalUserOrganizations(
            supabase,
            migrated.id,
            migrated.default_organization_id
          );
          return await establishSession({
            username: migrated.username,
            role: 'user',
            appUserId: migrated.id,
            appUserRole: 'user',
            fullName: migrated.full_name?.trim() || migrated.username,
            permissions: migrated.permissions,
            organizationName: orgs.organizationName,
            organizationId: orgs.organizationId,
            organizationIds: orgs.organizationIds,
          });
        }
      }

      if (
        organizationResult.error &&
        !organizationResult.error.message.includes('does not exist') &&
        !organizationResult.error.message.includes('relation')
      ) {
        return { error: organizationResult.error.message };
      }
      if (organizationResult.data) {
        const org = organizationResult.data;
        if (org.username && org.password && verifyPassword(password, org.password)) {
          if (org.status === 'inactive') {
            return {
              error: 'This organization account is inactive. Please contact the administrator.',
            };
          }
          return await establishSession({
            username: org.username,
            role: 'organization',
            organizationName: org.organization_name,
          });
        }
      }
    }

    return { error: 'Invalid username or password' };
  } catch {
    return { error: 'Login failed. Please try again.' };
  }
}

export async function logout() {
  (await cookies()).set('session', '', { expires: new Date(0) });
  redirect('/login');
}
