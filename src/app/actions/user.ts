'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';
import {
  filterOperationsPermissions,
  filterSalesPermissions,
  normalizeStoredPermissions,
  parsePermissionKeys,
} from '@/lib/module-permissions';
import { isSuperAdminSession } from '@/lib/auth/super-admin';
import {
  isOrganizationAdministratorSession,
  isPortalAccountSession,
} from '@/lib/auth/portal-access';
import {
  buildPortalUserAuditEntries,
  type PortalUserAuditSnapshot,
} from '@/lib/portal-user-audit';

export type PortalUserRole = 'user' | 'admin';

/** Where the account lives in the database. */
export type PortalUserSource = 'portal' | 'sales_agent' | 'operations';

export type PortalUserCompany = {
  id: string;
  organization_name: string;
};

export type PortalUser = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  username: string;
  role: PortalUserRole;
  /** Display department / account type for the Users list. */
  source: PortalUserSource;
  /** Module access rights (Sales + Operations keys). */
  permissions: string[];
  default_organization_id: string | null;
  companies: PortalUserCompany[];
  created_at: string;
};

export type PortalUserActivityLog = {
  id: string;
  user_id: string;
  action_type: string;
  field_name: string | null;
  previous_value: string | null;
  new_value: string | null;
  performed_by: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type DbError = { message?: string; code?: string; details?: string; hint?: string };

function isMissingColumnError(error: DbError | null | undefined, columns?: string[]) {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  const code = String(error.code || '');

  const looksMissing =
    code === '42703' ||
    code === 'PGRST204' ||
    (msg.includes('could not find the') && msg.includes('column')) ||
    (msg.includes('column') && msg.includes('does not exist'));

  if (!looksMissing) return false;
  if (!columns || columns.length === 0) return true;

  return columns.some((col) => {
    const c = col.toLowerCase();
    return (
      msg.includes(`'${c}'`) ||
      msg.includes(`"${c}"`) ||
      msg.includes(`.${c}`) ||
      msg.includes(` ${c} `) ||
      msg.includes(`(${c})`)
    );
  });
}

function formatDbError(error: DbError, fallback = 'Database error') {
  const parts = [error.message, error.details, error.hint].filter(Boolean);
  return parts.length ? parts.join(' — ') : fallback;
}

function schemaFixMessage(missing: string[], apiDetail?: string) {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '(unknown project)';
  const detail = apiDetail ? ` API said: ${apiDetail}.` : '';
  return (
    `Database API cannot see required objects on ${projectUrl}. Missing from API: ${missing.join(', ')}.${detail} ` +
    `Your SQL Editor can show columns while the API cache is stale. In that exact project SQL Editor run: ` +
    `NOTIFY pgrst, 'reload schema'; then wait 15 seconds and Save again. ` +
    `If it still fails: Project Settings → General → Restart project, then Save again. ` +
    `If columns are truly absent, run supabase/migrations/ENSURE_PORTAL_USER_SCHEMA.sql first.`
  );
}

async function probeSelect(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  table: string,
  column: string
): Promise<{ ok: true } | { ok: false; error: DbError }> {
  const { error } = await supabase.from(table).select(column).limit(1);
  if (!error) return { ok: true };
  return { ok: false, error };
}

/** Fail fast with the real missing objects before attempting insert. */
async function assertPortalUserSchema(
  supabase: Awaited<ReturnType<typeof createAdminClient>>
): Promise<{ ok: true } | { error: string }> {
  const missing: string[] = [];
  const apiErrors: string[] = [];

  // Baseline: if this fails, auth/key/RLS is the problem — not "missing columns".
  const baseline = await probeSelect(supabase, 'app_users', 'username');
  if (!baseline.ok) {
    console.error('[assertPortalUserSchema] baseline app_users.username', baseline.error);
    return {
      error:
        `Cannot read app_users via API (${formatDbError(baseline.error)}). ` +
        `Check SUPABASE_SERVICE_ROLE_KEY for ${process.env.NEXT_PUBLIC_SUPABASE_URL || 'this project'}.`,
    };
  }

  for (const col of ['full_name', 'email', 'permissions', 'default_organization'] as const) {
    const result = await probeSelect(supabase, 'app_users', col);
    if (!result.ok) {
      missing.push(`app_users.${col}`);
      apiErrors.push(`app_users.${col}: ${formatDbError(result.error)}`);
      console.error(`[assertPortalUserSchema] app_users.${col}`, result.error);
    }
  }

  const userOrgs = await probeSelect(supabase, 'user_organizations', 'user_id');
  if (!userOrgs.ok) {
    missing.push('table user_organizations');
    apiErrors.push(`user_organizations: ${formatDbError(userOrgs.error)}`);
    console.error('[assertPortalUserSchema] user_organizations', userOrgs.error);
  }

  const orgs = await probeSelect(supabase, 'organizations', 'id');
  if (!orgs.ok) {
    missing.push('table organizations');
    apiErrors.push(`organizations: ${formatDbError(orgs.error)}`);
    console.error('[assertPortalUserSchema] organizations', orgs.error);
  }

  if (missing.length > 0) {
    console.error('[assertPortalUserSchema]', { missing, apiErrors });
    return { error: schemaFixMessage(missing, apiErrors[0]) };
  }

  return { ok: true };
}

async function insertPortalAppUser(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  input: {
    fullName: string;
    email: string | null;
    phone?: string | null;
    username: string;
    password: string;
    role: PortalUserRole;
    permissions: string[];
  }
) {
  const payload: Record<string, unknown> = {
    full_name: input.fullName,
    email: input.email,
    username: input.username,
    password: input.password,
    role: input.role,
    permissions: input.permissions,
  };
  if (input.phone) payload.phone = input.phone;

  const { data, error } = await supabase
    .from('app_users')
    .insert([payload])
    .select('id')
    .single();

  if (error) {
    console.error('[insertPortalAppUser]', error);
    if (error.code === '23505') return { error: 'Username already exists' };
    if (isMissingColumnError(error)) {
      return {
        error: schemaFixMessage([
          error.message || 'app_users profile columns',
        ]),
      };
    }
    return { error: formatDbError(error) };
  }

  if (!data?.id) return { error: 'User insert returned no id' };
  return { id: data.id as string };
}

function parseRole(raw: unknown): PortalUserRole {
  return String(raw || '').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
}

function parseCompanyIds(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map((id) => String(id || '').trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

async function requireSuperAdmin() {
  const session = await getSession();
  if (!session || !isSuperAdminSession(session)) {
    return null;
  }
  return session;
}

type OrgUserManagementAuth =
  | { kind: 'super'; session: NonNullable<Awaited<ReturnType<typeof getSession>>> }
  | {
      kind: 'org_admin';
      session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
      organizationId: string;
      assignableOrganizationIds: string[];
    }
  | null;

async function resolveOrgUserManagementAuth(): Promise<OrgUserManagementAuth> {
  const session = await getSession();
  if (!session) return null;
  if (isSuperAdminSession(session)) return { kind: 'super', session };
  if (
    isOrganizationAdministratorSession(session) &&
    session.organizationId &&
    session.organizationIds?.includes(session.organizationId)
  ) {
    return {
      kind: 'org_admin',
      session,
      organizationId: session.organizationId,
      assignableOrganizationIds: session.organizationIds || [session.organizationId],
    };
  }
  return null;
}

async function userBelongsToOrganization(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  userId: string,
  organizationId: string
) {
  const { data } = await supabase
    .from('user_organizations')
    .select('user_id')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  return Boolean(data?.user_id);
}

function resolveAuditActor(session: NonNullable<Awaited<ReturnType<typeof getSession>>>): string {
  return session.fullName?.trim() || session.username || 'Administrator';
}

async function loadPortalUserAuditSnapshot(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  userId: string
): Promise<PortalUserAuditSnapshot | null> {
  const loaded = await loadUsersWithCompanies(supabase);
  if ('error' in loaded) return null;
  const user = loaded.users.find((entry) => entry.id === userId && entry.source === 'portal');
  if (!user) return null;

  let phone: string | null = user.phone ?? null;
  if (phone === null) {
    const { data } = await supabase.from('app_users').select('phone').eq('id', userId).maybeSingle();
    if (data && 'phone' in data && data.phone) phone = String(data.phone);
  }

  const defaultCompany =
    user.companies.find((company) => company.id === user.default_organization_id) || null;

  return {
    full_name: user.full_name,
    email: user.email,
    phone,
    username: user.username,
    role: user.role,
    permissions: user.permissions,
    companyIds: user.companies.map((company) => company.id),
    companyNames: user.companies.map((company) => company.organization_name),
    default_organization_id: user.default_organization_id,
    defaultCompanyName: defaultCompany?.organization_name ?? null,
  };
}

async function writePortalUserAuditLogs(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  userId: string,
  entries: ReturnType<typeof buildPortalUserAuditEntries>,
  performedBy: string
) {
  if (entries.length === 0) return;

  const rows = entries.map((entry) => ({
    user_id: userId,
    action_type: entry.action_type,
    field_name: entry.field_name,
    previous_value: entry.previous_value,
    new_value: entry.new_value,
    performed_by: performedBy,
    metadata: entry.metadata ?? null,
  }));

  const { error } = await supabase.from('portal_user_activity_logs').insert(rows);
  if (error) {
    console.error('[writePortalUserAuditLogs]', error.message);
  }
}

export async function getPortalUserActivityLogs(userId: string, input?: { limit?: number; offset?: number }) {
  const auth = await resolveOrgUserManagementAuth();
  if (!auth) return { error: 'Unauthorized' as const };
  if (!userId.trim()) return { error: 'User id is required' };

  const supabase = await createAdminClient();

  if (auth.kind === 'org_admin') {
    const belongs = await userBelongsToOrganization(supabase, userId, auth.organizationId);
    if (!belongs) return { error: 'Access Denied' as const };
  }

  const limit = Math.min(Math.max(Number(input?.limit ?? 30), 1), 100);
  const offset = Math.max(Number(input?.offset ?? 0), 0);

  const { data, error, count } = await supabase
    .from('portal_user_activity_logs')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    if (error.message.includes('portal_user_activity_logs') && error.message.includes('does not exist')) {
      return { logs: [] as PortalUserActivityLog[], total: 0, hasMore: false };
    }
    return { error: error.message };
  }

  const logs = (data || []) as PortalUserActivityLog[];
  const total = count ?? logs.length;
  return {
    logs,
    total,
    hasMore: offset + logs.length < total,
  };
}

/** @deprecated Use requireSuperAdmin */
async function requireAdmin() {
  return requireSuperAdmin();
}

async function isUsernameTaken(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  username: string,
  excludeUserId?: string
) {
  const trimmed = username.trim();

  let appQuery = supabase.from('app_users').select('id').eq('username', trimmed);
  if (excludeUserId) appQuery = appQuery.neq('id', excludeUserId);
  const { data: existingApp } = await appQuery.maybeSingle();
  if (existingApp) return 'Username already exists';

  // Sales / Operations accounts with the same login are allowed — they are synced
  // from Access Rights on this portal user. Organization logins still conflict.
  const { data: existingOrg } = await supabase
    .from('organizations')
    .select('id')
    .eq('username', trimmed)
    .maybeSingle();
  if (existingOrg) return 'Username already exists (used by an Organization)';
  return null;
}

function isMissingUserOrganizationsTable(error: DbError | null | undefined) {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  const code = String(error.code || '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (msg.includes('user_organizations') &&
      (msg.includes('schema cache') ||
        msg.includes('does not exist') ||
        msg.includes('could not find the table') ||
        msg.includes('relation')))
  );
}

/** Always use live DB column `default_organization`. Never touch `_id`. */
async function setDefaultOrganizationColumn(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  userId: string,
  defaultOrganizationId: string | null
) {
  const { error } = await supabase
    .from('app_users')
    .update({ default_organization: defaultOrganizationId })
    .eq('id', userId);

  return error;
}

async function syncUserCompanies(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  userId: string,
  companyIds: string[],
  defaultOrganizationId: string | null
) {
  const { error: deleteError } = await supabase
    .from('user_organizations')
    .delete()
    .eq('user_id', userId);

  if (deleteError) {
    console.error('[syncUserCompanies] delete', deleteError);
    if (isMissingUserOrganizationsTable(deleteError)) {
      return { error: schemaFixMessage(['table user_organizations']) };
    }
    return { error: formatDbError(deleteError) };
  }

  if (companyIds.length > 0) {
    const { error: insertError } = await supabase.from('user_organizations').insert(
      companyIds.map((organization_id) => ({ user_id: userId, organization_id }))
    );
    if (insertError) {
      console.error('[syncUserCompanies] insert', insertError);
      if (isMissingUserOrganizationsTable(insertError)) {
        return { error: schemaFixMessage(['table user_organizations']) };
      }
      if (insertError.code === '23503') {
        return { error: 'One or more selected companies do not exist' };
      }
      return { error: formatDbError(insertError) };
    }
  }

  const defaultError = await setDefaultOrganizationColumn(
    supabase,
    userId,
    defaultOrganizationId
  );
  if (defaultError) {
    console.error('[syncUserCompanies] default org', defaultError);
    if (isMissingColumnError(defaultError, ['default_organization'])) {
      return { error: schemaFixMessage(['app_users.default_organization']) };
    }
    if (defaultError.code === '23503') {
      return { error: 'Default company must belong to an existing organization' };
    }
    return { error: formatDbError(defaultError) };
  }

  return { success: true as const };
}

async function syncDepartmentLoginAccounts(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  input: {
    appUserId: string;
    fullName: string;
    username: string;
    password: string | null;
    email: string | null;
    permissions: string[];
  }
) {
  const salesPerms = filterSalesPermissions(input.permissions);
  const opsPerms = filterOperationsPermissions(input.permissions);

  if (salesPerms.length > 0) {
    const { data: existingSales } = await supabase
      .from('sales_agents')
      .select('id')
      .eq('username', input.username)
      .maybeSingle();

    const salesPayload: Record<string, unknown> = {
      name: input.fullName,
      username: input.username,
      email: input.email,
      permissions: salesPerms,
    };
    if (input.password) salesPayload.password = input.password;
    salesPayload.app_user_id = input.appUserId;

    if (existingSales?.id) {
      const { error } = await supabase
        .from('sales_agents')
        .update(salesPayload)
        .eq('id', existingSales.id);
      if (error) return { error: `Sales account sync failed: ${error.message}` };
    } else if (input.password) {
      const { error } = await supabase.from('sales_agents').insert([salesPayload]);
      if (error) return { error: `Sales account sync failed: ${error.message}` };
    }
  }

  if (opsPerms.length > 0) {
    const { data: existingOps } = await supabase
      .from('operations_users')
      .select('id')
      .eq('username', input.username)
      .maybeSingle();

    const opsPayload: Record<string, unknown> = {
      name: input.fullName,
      username: input.username,
      permissions: opsPerms,
    };
    if (input.password) opsPayload.password = input.password;
    opsPayload.app_user_id = input.appUserId;

    if (existingOps?.id) {
      const { error } = await supabase
        .from('operations_users')
        .update(opsPayload)
        .eq('id', existingOps.id);
      if (error) {
        if (error.message.includes('permissions') || error.message.includes('column')) {
          const fallback: Record<string, unknown> = {
            name: input.fullName,
            username: input.username,
            app_user_id: input.appUserId,
          };
          if (input.password) fallback.password = input.password;
          await supabase.from('operations_users').update(fallback).eq('id', existingOps.id);
        } else {
          return { error: `Operations account sync failed: ${error.message}` };
        }
      }
    } else if (input.password) {
      const { error } = await supabase.from('operations_users').insert([opsPayload]);
      if (error) {
        if (error.message.includes('permissions') || error.message.includes('column')) {
          const { error: retryError } = await supabase.from('operations_users').insert([
            {
              name: input.fullName,
              username: input.username,
              password: input.password,
              app_user_id: input.appUserId,
            },
          ]);
          if (retryError) return { error: `Operations account sync failed: ${retryError.message}` };
        } else {
          return { error: `Operations account sync failed: ${error.message}` };
        }
      }
    }
  }

  return { success: true as const };
}

async function loadUsersWithCompanies(
  supabase: Awaited<ReturnType<typeof createAdminClient>>
): Promise<{ users: PortalUser[] } | { error: string }> {
  const portalUsers: PortalUser[] = [];

  let users: Array<Record<string, unknown>> | null = null;

  {
    // Live DB column is `default_organization`
    const primary = await supabase
      .from('app_users')
      .select(
        'id, username, full_name, email, phone, role, permissions, default_organization, created_at'
      )
      .order('created_at', { ascending: false });

    if (!primary.error && primary.data) {
      users = primary.data as Array<Record<string, unknown>>;
    } else if (
      primary.error &&
      (isMissingColumnError(primary.error) ||
        primary.error.message.includes('full_name') ||
        primary.error.message.includes('phone') ||
        primary.error.message.includes('column'))
    ) {
      const legacy = await supabase
        .from('app_users')
        .select('id, username, full_name, email, role, permissions, default_organization, created_at')
        .order('created_at', { ascending: false });
      if (!legacy.error && legacy.data) {
        for (const row of legacy.data) {
          portalUsers.push({
            id: row.id,
            full_name: row.username,
            email: null,
            phone: null,
            username: row.username,
            role: parseRole(row.role),
            source: 'portal',
            permissions: [],
            default_organization_id: null,
            companies: [],
            created_at: row.created_at,
          });
        }
      } else if (primary.error) {
        return { error: primary.error.message };
      }
    } else if (primary.error) {
      return { error: primary.error.message };
    }
  }

  if (users) {
    const userIds = users.map((u) => String(u.id));
    let links: Array<{ user_id: string; organization_id: string }> = [];
    let organizationsById = new Map<string, string>();

    if (userIds.length > 0) {
      const { data: linkRows, error: linkError } = await supabase
        .from('user_organizations')
        .select('user_id, organization_id')
        .in('user_id', userIds);

      if (!linkError && linkRows) {
        links = linkRows as Array<{ user_id: string; organization_id: string }>;
        const orgIds = [...new Set(links.map((l) => l.organization_id))];
        if (orgIds.length > 0) {
          const { data: orgs } = await supabase
            .from('organizations')
            .select('id, organization_name')
            .in('id', orgIds);
          organizationsById = new Map(
            (orgs || []).map((org) => [org.id, org.organization_name as string])
          );
        }
      }
    }

    const companiesByUser = new Map<string, PortalUserCompany[]>();
    for (const link of links) {
      const name = organizationsById.get(link.organization_id);
      if (!name) continue;
      const list = companiesByUser.get(link.user_id) || [];
      list.push({ id: link.organization_id, organization_name: name });
      companiesByUser.set(link.user_id, list);
    }

    for (const row of users) {
      const defaultOrg = row.default_organization ?? null;
      portalUsers.push({
        id: String(row.id),
        full_name: String(row.full_name || row.username || ''),
        email: row.email ? String(row.email) : null,
        phone: row.phone ? String(row.phone) : null,
        username: String(row.username),
        role: parseRole(row.role),
        source: 'portal',
        permissions: parsePermissionKeys(row.permissions),
        default_organization_id: defaultOrg ? String(defaultOrg) : null,
        companies: companiesByUser.get(String(row.id)) || [],
        created_at: String(row.created_at),
      });
    }
  }

  portalUsers.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return { users: portalUsers };
}

export async function getPortalUsers() {
  if (!(await requireSuperAdmin())) return { error: 'Unauthorized' as const };

  const supabase = await createAdminClient();
  return loadUsersWithCompanies(supabase);
}

export async function getOrganizationPortalUsers(organizationId?: string) {
  const auth = await resolveOrgUserManagementAuth();
  if (!auth) return { error: 'Unauthorized' as const };

  const orgId =
    auth.kind === 'org_admin'
      ? auth.organizationId
      : String(organizationId || auth.session.organizationId || '').trim();

  if (!orgId) return { error: 'Organization is required' };

  if (
    auth.kind === 'org_admin' &&
    !auth.assignableOrganizationIds.includes(orgId)
  ) {
    return { error: 'Access Denied' as const };
  }

  const supabase = await createAdminClient();
  const loaded = await loadUsersWithCompanies(supabase);
  if ('error' in loaded) return loaded;

  const filtered = loaded.users.filter((user) =>
    user.companies.some((company) => company.id === orgId)
  );

  return { users: filtered, organizationId: orgId };
}

export async function getPortalUserProfile() {
  const session = await getSession();
  if (!session || !isPortalAccountSession(session)) {
    return { error: 'Unauthorized' as const };
  }

  const organizationId = session.organizationId;
  if (!organizationId) {
    return { error: 'No organization selected' as const };
  }

  const supabase = await createAdminClient();

  let fullName = session.fullName || session.username;
  if (session.appUserId) {
    const { data } = await supabase
      .from('app_users')
      .select('full_name, username')
      .eq('id', session.appUserId)
      .maybeSingle();
    if (data?.full_name) fullName = String(data.full_name);
  }

  const { count } = await supabase
    .from('user_organizations')
    .select('user_id', { count: 'exact', head: true })
    .eq('organization_id', organizationId);

  return {
    profile: {
      username: session.username,
      full_name: fullName,
      organization_name: session.organizationName || 'Organization',
      organization_user_count: count ?? 0,
    },
  };
}

export async function updatePortalUserPassword(password: string) {
  const session = await getSession();
  if (!session || !isPortalAccountSession(session) || !session.appUserId) {
    return { error: 'Unauthorized' as const };
  }

  const next = String(password || '').trim();
  if (next.length < 6) {
    return { error: 'Password must be at least 6 characters' };
  }

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from('app_users')
    .update({ password: next })
    .eq('id', session.appUserId);

  if (error) return { error: error.message };

  revalidatePath('/admin/dashboard');
  return { success: true as const };
}

export async function getPortalUser(userId: string) {
  const auth = await resolveOrgUserManagementAuth();
  if (!auth) return { error: 'Unauthorized' as const };
  if (!userId.trim()) return { error: 'User id is required' };

  const supabase = await createAdminClient();
  const loaded = await loadUsersWithCompanies(supabase);
  if ('error' in loaded) return loaded;
  const user = loaded.users.find((u) => u.id === userId && u.source === 'portal');
  if (!user) return { error: 'User not found' };

  if (auth.kind === 'org_admin') {
    const inOrg = user.companies.some((c) => c.id === auth.organizationId);
    if (!inOrg) return { error: 'Access Denied' };
  }

  return { user };
}

export async function createPortalUser(formData: FormData) {
  const auth = await resolveOrgUserManagementAuth();
  if (!auth) return { error: 'Unauthorized' };

  const fullName = String(formData.get('full_name') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const phone = String(formData.get('phone') || '').trim();
  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '').trim();
  const role = parseRole(formData.get('role'));
  let companyIds = parseCompanyIds(formData.get('company_ids'));
  const permissions = normalizeStoredPermissions(parsePermissionKeys(formData.get('permissions')));
  let defaultOrganizationId = String(formData.get('default_organization_id') || '').trim() || null;

  if (auth.kind === 'org_admin') {
    companyIds = companyIds.filter((id) => auth.assignableOrganizationIds.includes(id));
    if (companyIds.length === 0) {
      return { error: 'Assign at least one company from your assigned organizations' };
    }
    if (!defaultOrganizationId || !companyIds.includes(defaultOrganizationId)) {
      defaultOrganizationId =
        companyIds.includes(auth.organizationId) ? auth.organizationId : companyIds[0];
    }
    if (role === 'admin' && auth.session.appUserRole !== 'administrator') {
      return { error: 'Access Denied' };
    }
  }

  if (!fullName || !username || !password) {
    return { error: 'Full name, username, and password are required' };
  }
  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters' };
  }
  if (email && !EMAIL_PATTERN.test(email)) {
    return { error: 'Please enter a valid email address' };
  }
  if (companyIds.length === 0) {
    return { error: 'Assign at least one company' };
  }
  if (!defaultOrganizationId && companyIds.length === 1) {
    defaultOrganizationId = companyIds[0];
  }
  if (!defaultOrganizationId || !companyIds.includes(defaultOrganizationId)) {
    return { error: 'Default company must be one of the assigned companies' };
  }
  if (role === 'user' && permissions.length === 0) {
    return { error: 'Assign at least one module (Sales, Operations, and/or Warehouse)' };
  }

  const supabase = await createAdminClient();

  const schema = await assertPortalUserSchema(supabase);
  if ('error' in schema) return { error: schema.error };

  const usernameError = await isUsernameTaken(supabase, username);
  if (usernameError) return { error: usernameError };

  const inserted = await insertPortalAppUser(supabase, {
    fullName,
    email: email || null,
    phone: phone || null,
    username,
    password,
    role,
    permissions,
  });
  if ('error' in inserted) return { error: inserted.error };

  const userId = inserted.id;

  const sync = await syncUserCompanies(supabase, userId, companyIds, defaultOrganizationId);
  if ('error' in sync) {
    await supabase.from('app_users').delete().eq('id', userId);
    return { error: sync.error };
  }

  const deptSync = await syncDepartmentLoginAccounts(supabase, {
    appUserId: userId,
    fullName,
    username,
    password,
    email: email || null,
    permissions,
  });
  if ('error' in deptSync) {
    console.error('[createPortalUser] department sync:', deptSync.error);
  }

  const actor = resolveAuditActor(auth.session);
  const afterSnapshot = await loadPortalUserAuditSnapshot(supabase, userId);
  if (afterSnapshot) {
    await writePortalUserAuditLogs(
      supabase,
      userId,
      buildPortalUserAuditEntries(null, afterSnapshot),
      actor
    );
  }

  revalidatePath('/admin/dashboard');
  return {
    success: true,
    message: 'User created successfully.',
    userId,
  };
}

export async function updatePortalUser(formData: FormData) {
  const auth = await resolveOrgUserManagementAuth();
  if (!auth) return { error: 'Unauthorized' };

  const id = String(formData.get('id') || '').trim();
  const fullName = String(formData.get('full_name') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const phone = String(formData.get('phone') || '').trim();
  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '').trim();
  const role = parseRole(formData.get('role'));
  let companyIds = parseCompanyIds(formData.get('company_ids'));
  const permissions = normalizeStoredPermissions(parsePermissionKeys(formData.get('permissions')));
  let defaultOrganizationId = String(formData.get('default_organization_id') || '').trim() || null;

  if (!id) return { error: 'User id is required' };

  const supabase = await createAdminClient();
  const beforeSnapshot = await loadPortalUserAuditSnapshot(supabase, id);

  if (auth.kind === 'org_admin') {
    const belongs = await userBelongsToOrganization(supabase, id, auth.organizationId);
    if (!belongs) return { error: 'Access Denied' };
    companyIds = companyIds.filter((cid) => auth.assignableOrganizationIds.includes(cid));
    if (companyIds.length === 0) {
      return { error: 'Assign at least one company from your assigned organizations' };
    }
    companyIds = [...new Set(companyIds)];
    if (!defaultOrganizationId || !companyIds.includes(defaultOrganizationId)) {
      defaultOrganizationId =
        companyIds.includes(auth.organizationId) ? auth.organizationId : companyIds[0];
    }
  }
  if (!fullName || !username) {
    return { error: 'Full name and username are required' };
  }
  if (password && password.length < 6) {
    return { error: 'Password must be at least 6 characters' };
  }
  if (email && !EMAIL_PATTERN.test(email)) {
    return { error: 'Please enter a valid email address' };
  }
  if (companyIds.length === 0) {
    return { error: 'Assign at least one company' };
  }
  if (!defaultOrganizationId && companyIds.length === 1) {
    defaultOrganizationId = companyIds[0];
  }
  if (!defaultOrganizationId || !companyIds.includes(defaultOrganizationId)) {
    return { error: 'Default company must be one of the assigned companies' };
  }
  if (role === 'user' && permissions.length === 0) {
    return { error: 'Assign at least one module (Sales, Operations, and/or Warehouse)' };
  }

  const schema = await assertPortalUserSchema(supabase);
  if ('error' in schema) return { error: schema.error };

  const usernameError = await isUsernameTaken(supabase, username, id);
  if (usernameError) return { error: usernameError };

  const updatePayload: Record<string, unknown> = {
    full_name: fullName,
    email: email || null,
    username,
    role,
    permissions,
  };
  if (phone) updatePayload.phone = phone;
  else updatePayload.phone = null;
  if (password) updatePayload.password = password;

  const { error } = await supabase.from('app_users').update(updatePayload).eq('id', id);
  if (error) {
    if (isMissingColumnError(error, ['permissions'])) {
      const fallback: Record<string, unknown> = {
        full_name: fullName,
        email: email || null,
        username,
        role,
      };
      if (password) fallback.password = password;
      const retry = await supabase.from('app_users').update(fallback).eq('id', id);
      if (retry.error) {
        if (isMissingColumnError(retry.error, ['full_name', 'email'])) {
          const minimal: Record<string, unknown> = { username, role };
          if (password) minimal.password = password;
          const minimalRetry = await supabase.from('app_users').update(minimal).eq('id', id);
          if (minimalRetry.error) {
            if (minimalRetry.error.code === '23505') return { error: 'Username already exists' };
            return { error: formatDbError(minimalRetry.error) };
          }
        } else if (retry.error.code === '23505') {
          return { error: 'Username already exists' };
        } else {
          return { error: formatDbError(retry.error) };
        }
      }
    } else if (isMissingColumnError(error, ['full_name', 'email', 'permissions'])) {
      const minimal: Record<string, unknown> = { username, role };
      if (password) minimal.password = password;
      const retry = await supabase.from('app_users').update(minimal).eq('id', id);
      if (retry.error) {
        if (retry.error.code === '23505') return { error: 'Username already exists' };
        return { error: formatDbError(retry.error) };
      }
    } else if (error.code === '23505') {
      return { error: 'Username already exists' };
    } else {
      return { error: formatDbError(error) };
    }
  }

  const sync = await syncUserCompanies(supabase, id, companyIds, defaultOrganizationId);
  if ('error' in sync) return sync;

  let passwordForSync = password || null;
  if (!passwordForSync) {
    const { data: current } = await supabase
      .from('app_users')
      .select('password')
      .eq('id', id)
      .maybeSingle();
    passwordForSync = current?.password ? String(current.password) : null;
  }

  const deptSync = await syncDepartmentLoginAccounts(supabase, {
    appUserId: id,
    fullName,
    username,
    password: passwordForSync,
    email: email || null,
    permissions,
  });
  if ('error' in deptSync) return deptSync;

  const afterSnapshot = await loadPortalUserAuditSnapshot(supabase, id);
  if (beforeSnapshot && afterSnapshot) {
    await writePortalUserAuditLogs(
      supabase,
      id,
      buildPortalUserAuditEntries(beforeSnapshot, afterSnapshot, {
        includePasswordChange: Boolean(password),
      }),
      resolveAuditActor(auth.session)
    );
  }

  const reloaded = await getPortalUser(id);
  revalidatePath('/admin/dashboard');
  return {
    success: true,
    user: 'user' in reloaded ? reloaded.user : undefined,
    ...('warning' in sync && sync.warning ? { warning: sync.warning } : {}),
  };
}

export async function deletePortalUser(formData: FormData) {
  const auth = await resolveOrgUserManagementAuth();
  if (!auth) return { error: 'Unauthorized' };

  const id = String(formData.get('id') || '').trim();
  if (!id) return { error: 'User id is required' };

  const supabase = await createAdminClient();

  if (auth.kind === 'org_admin') {
    if (id === auth.session.appUserId) {
      return { error: 'You cannot delete your own account' };
    }
    const belongs = await userBelongsToOrganization(supabase, id, auth.organizationId);
    if (!belongs) return { error: 'Access Denied' };
  }
  const { error } = await supabase.from('app_users').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/admin/dashboard');
  return { success: true };
}

/** @deprecated Prefer getPortalUsers — kept for AdminDashboardShell compatibility */
export async function getAppUsers() {
  const result = await getPortalUsers();
  if ("error" in result && result.error === "Unauthorized") {
    return { error: "Unauthorized" as const };
  }
  if ("error" in result && !("users" in result)) {
    return {
      error: result.error,
      users: [] as Array<{
        id: string;
        username: string;
        password: string;
        created_at: string;
      }>,
    };
  }
  const users: PortalUser[] =
    "users" in result && Array.isArray(result.users) ? result.users : [];
  return {
    users: users.map((u: PortalUser) => ({
      id: u.id,
      username: u.username,
      password: "",
      created_at: u.created_at,
    })),
  };
}

export async function createUser(formData: FormData) {
  // Legacy create path → delegate to portal user with minimal fields
  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '').trim();
  if (!username || !password) return { error: 'Username and password are required' };

  const supabase = await createAdminClient();
  const orgs = await supabase.from('organizations').select('id').order('created_at', { ascending: true }).limit(1);
  const companyId = orgs.data?.[0]?.id;
  if (!companyId) {
    return { error: 'Create an organization first, then create a user.' };
  }

  const fd = new FormData();
  fd.set('full_name', username);
  fd.set('username', username);
  fd.set('password', password);
  fd.set('role', 'user');
  fd.set('company_ids', JSON.stringify([companyId]));
  fd.set('default_organization_id', companyId);
  return createPortalUser(fd);
}

export async function updateUser(formData: FormData) {
  if (!(await requireAdmin())) throw new Error('Unauthorized');

  const id = formData.get('id') as string;
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  if (!id || !username?.trim() || !password?.trim()) {
    return { error: 'User id, username, and password are required' };
  }

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from('app_users')
    .update({ username, password })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/admin/dashboard');
  return { success: true };
}

export async function deleteUser(formData: FormData) {
  return deletePortalUser(formData);
}
