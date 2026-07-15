'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/utils/supabase/server';
import { encrypt, getSessionCookieOptions, type SessionRole } from '@/lib/auth/session';
import { verifyPassword } from '@/lib/auth/password';

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';

const DASHBOARD_BY_ROLE: Record<SessionRole, string> = {
  admin: '/admin/dashboard',
  sales_agent: '/sales-agent/dashboard',
  operations: '/operations/dashboard',
  organization: '/organization/dashboard',
  user: '/user/dashboard',
};

function parsePermissions(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === 'string');
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      return [];
    }
  }
  return [];
}

async function establishSession(params: {
  username: string;
  role: SessionRole;
  organizationName?: string;
  permissions?: string[];
}) {
  const cookieOptions = getSessionCookieOptions();
  const session = await encrypt({
    username: params.username,
    role: params.role,
    organizationName: params.organizationName,
    permissions: params.permissions,
    lastActivity: Date.now(),
  });
  (await cookies()).set('session', session, cookieOptions);
  return { redirectTo: DASHBOARD_BY_ROLE[params.role] };
}

export async function login(formData: FormData) {
  try {
    const username = String(formData.get('username') || '').trim();
    const password = String(formData.get('password') || '').trim();

    if (!username || !password) {
      return { error: 'Username and password are required' };
    }

    // Fast path: admin never hits the database.
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      return await establishSession({ username, role: 'admin' });
    }

    // Single shared client + one round-trip per role table (no nested auth helpers).
    const supabase = await createAdminClient();
    const [salesAgentResult, opsUserResult, appUserResult, organizationResult] = await Promise.all([
      supabase
        .from('sales_agents')
        .select('username, permissions')
        .eq('username', username)
        .eq('password', password)
        .maybeSingle(),
      supabase
        .from('operations_users')
        .select('username')
        .eq('username', username)
        .eq('password', password)
        .maybeSingle(),
      supabase
        .from('app_users')
        .select('username, role')
        .eq('username', username)
        .eq('password', password)
        .maybeSingle(),
      supabase
        .from('organizations')
        .select('username, password, organization_name, status')
        .eq('username', username)
        .maybeSingle(),
    ]);

    if (salesAgentResult.error) {
      // Permissions column may be missing on older schemas — retry without it.
      if (
        salesAgentResult.error.message.includes('permissions') ||
        salesAgentResult.error.message.includes('column "permissions"')
      ) {
        const retry = await supabase
          .from('sales_agents')
          .select('username')
          .eq('username', username)
          .eq('password', password)
          .maybeSingle();
        if (retry.error) return { error: retry.error.message };
        if (retry.data) {
          return await establishSession({
            username: retry.data.username,
            role: 'sales_agent',
            permissions: [],
          });
        }
      } else {
        return { error: salesAgentResult.error.message };
      }
    } else if (salesAgentResult.data) {
      return await establishSession({
        username: salesAgentResult.data.username,
        role: 'sales_agent',
        permissions: parsePermissions(salesAgentResult.data.permissions),
      });
    }

    if (
      opsUserResult.error &&
      !opsUserResult.error.message.includes('does not exist') &&
      !opsUserResult.error.message.includes('relation')
    ) {
      return { error: opsUserResult.error.message };
    }
    if (opsUserResult.data) {
      return await establishSession({
        username: opsUserResult.data.username,
        role: 'operations',
      });
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
      if (verifyPassword(password, org.password)) {
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

    if (appUserResult.error) {
      return { error: appUserResult.error.message };
    }
    if (appUserResult.data) {
      return await establishSession({
        username: appUserResult.data.username,
        role: 'user',
      });
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
