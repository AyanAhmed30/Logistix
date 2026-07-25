import type { createAdminClient } from '@/utils/supabase/server';
import type { SessionPayload } from '@/lib/auth/session';
import {
  normalizeStoredPermissions,
  parsePermissionKeys,
} from '@/lib/module-permissions';

type Supabase = Awaited<ReturnType<typeof createAdminClient>>;

export type LegacySalesAgentRow = {
  id: string;
  permissions?: string[] | null;
  username?: string | null;
  name?: string | null;
};

const FULL_SALES_PERMISSIONS = normalizeStoredPermissions([
  'sales',
  'lead',
  'pipeline',
  'customer-list',
  'lead-transfer-tracking',
  'accounting',
  'inquiry-tracking',
  'customers',
  'quotations',
]);

const FULL_OPS_PERMISSIONS = normalizeStoredPermissions([
  'operations',
  'leads-inquiry',
  'management',
  'console',
  'loading-instruction',
  'import-packing-list',
  'import-invoice',
  'inquiry-confirmation',
  'calculator-config',
]);

function isMissingColumn(error: { message?: string } | null | undefined, column: string) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes(column) && (msg.includes('does not exist') || msg.includes('column'));
}

/** Resolve the sales_agents row for a portal session (preserves sales_agent_id FKs). */
export async function resolveSalesAgentForSession(
  supabase: Supabase,
  session: Pick<SessionPayload, 'username' | 'appUserId'>
): Promise<LegacySalesAgentRow | null> {
  if (session.appUserId) {
    const byAppUser = await supabase
      .from('sales_agents')
      .select('id, permissions, username, name')
      .eq('app_user_id', session.appUserId)
      .maybeSingle();

    if (!byAppUser.error && byAppUser.data) {
      return {
        id: String(byAppUser.data.id),
        permissions: parsePermissionKeys(byAppUser.data.permissions),
        username: byAppUser.data.username ? String(byAppUser.data.username) : null,
        name: byAppUser.data.name ? String(byAppUser.data.name) : null,
      };
    }

    if (byAppUser.error && !isMissingColumn(byAppUser.error, 'app_user_id')) {
      console.error('[resolveSalesAgentForSession] app_user_id lookup', byAppUser.error.message);
    }
  }

  const byUsername = await supabase
    .from('sales_agents')
    .select('id, permissions, username, name')
    .eq('username', session.username)
    .maybeSingle();

  if (!byUsername.error && byUsername.data) {
    return {
      id: String(byUsername.data.id),
      permissions: parsePermissionKeys(byUsername.data.permissions),
      username: byUsername.data.username ? String(byUsername.data.username) : null,
      name: byUsername.data.name ? String(byUsername.data.name) : null,
    };
  }

  if (byUsername.error?.message.includes('permissions')) {
    const fallback = await supabase
      .from('sales_agents')
      .select('id, username, name')
      .eq('username', session.username)
      .maybeSingle();
    if (!fallback.error && fallback.data) {
      return {
        id: String(fallback.data.id),
        permissions: [],
        username: fallback.data.username ? String(fallback.data.username) : null,
        name: fallback.data.name ? String(fallback.data.name) : null,
      };
    }
  }

  return null;
}

type LegacyAccountSource = 'sales_agent' | 'operations';

type LegacyAccountRow = {
  id: string;
  name: string | null;
  username: string;
  password: string;
  email?: string | null;
  permissions: unknown;
};

/**
 * Migrate a legacy sales_agents / operations_users row into app_users on login.
 * Idempotent — safe to call when the user already exists.
 */
export async function migrateLegacyAccountToPortal(
  supabase: Supabase,
  source: LegacyAccountSource,
  record: LegacyAccountRow
): Promise<{ id: string; username: string; role: string; permissions: string[]; full_name: string | null; default_organization_id: string | null } | null> {
  const username = String(record.username || '').trim();
  if (!username) return null;

  const { data: existing } = await supabase
    .from('app_users')
    .select('id, username, role, permissions, full_name, default_organization')
    .eq('username', username)
    .maybeSingle();

  const legacyPerms = parsePermissionKeys(record.permissions);
  const departmentPerms =
    source === 'sales_agent'
      ? legacyPerms.length > 0
        ? normalizeStoredPermissions(legacyPerms)
        : FULL_SALES_PERMISSIONS
      : legacyPerms.length > 0
        ? normalizeStoredPermissions(legacyPerms)
        : FULL_OPS_PERMISSIONS;

  let appUserId = existing?.id ? String(existing.id) : null;

  if (!appUserId) {
    const { data: defaultOrg } = await supabase
      .from('organizations')
      .select('id')
      .eq('status', 'active')
      .order('organization_name', { ascending: true })
      .limit(1)
      .maybeSingle();

    const insertPayload: Record<string, unknown> = {
      username,
      password: record.password,
      role: 'user',
      full_name: String(record.name || username).trim() || username,
      permissions: departmentPerms,
    };
    if (record.email) insertPayload.email = record.email;
    if (defaultOrg?.id) insertPayload.default_organization = defaultOrg.id;

    const { data: created, error } = await supabase
      .from('app_users')
      .insert([insertPayload])
      .select('id, username, role, permissions, full_name, default_organization')
      .single();

    if (error || !created) {
      console.error('[migrateLegacyAccountToPortal] insert', error?.message);
      return null;
    }
    appUserId = String(created.id);
  } else {
    const merged = normalizeStoredPermissions([
      ...parsePermissionKeys(existing?.permissions),
      ...departmentPerms,
    ]);
    await supabase.from('app_users').update({ permissions: merged }).eq('id', appUserId);
  }

  const bridgeTable = source === 'sales_agent' ? 'sales_agents' : 'operations_users';
  const bridgeUpdate: Record<string, unknown> = { app_user_id: appUserId };
  const { error: bridgeError } = await supabase
    .from(bridgeTable)
    .update(bridgeUpdate)
    .eq('id', record.id);

  if (bridgeError && !isMissingColumn(bridgeError, 'app_user_id')) {
    console.error('[migrateLegacyAccountToPortal] bridge', bridgeError.message);
  }

  const { data: defaultOrgRow } = await supabase
    .from('organizations')
    .select('id')
    .eq('status', 'active')
    .order('organization_name', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (defaultOrgRow?.id) {
    await supabase.from('user_organizations').insert({
      user_id: appUserId,
      organization_id: defaultOrgRow.id,
    });
  }

  const { data: finalUser } = await supabase
    .from('app_users')
    .select('id, username, role, permissions, full_name, default_organization')
    .eq('id', appUserId)
    .maybeSingle();

  if (!finalUser) return null;

  return {
    id: String(finalUser.id),
    username: String(finalUser.username),
    role: String(finalUser.role || 'user'),
    permissions: parsePermissionKeys(finalUser.permissions),
    full_name: finalUser.full_name ? String(finalUser.full_name) : null,
    default_organization_id: finalUser.default_organization
      ? String(finalUser.default_organization)
      : null,
  };
}
