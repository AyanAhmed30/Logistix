'use server';

import { cookies } from 'next/headers';
import { createAdminClient } from '@/utils/supabase/server';
import {
  decrypt,
  encrypt,
  getSession,
  getSessionCookieOptions,
  type SessionPayload,
} from '@/lib/auth/session';
import {
  ADMIN_CONTEXT_LABEL,
  isSuperAdminInAdminContext,
  isSuperAdminSession,
} from '@/lib/auth/super-admin';
import { fetchPortalUserOrganizationAssignments } from '@/lib/portal-user-organizations';
import { isPortalAccountSession } from '@/lib/auth/portal-access';

export type OrganizationSwitcherItem = {
  id: string;
  organization_name: string;
};

export type AdminOrganizationState = {
  organizationId: string | null;
  organizationName: string | null;
  organizations: OrganizationSwitcherItem[];
  /** True for hardcoded super admin (admin / admin123). */
  isSuperAdmin: boolean;
  /** True when super admin is in global Admin context (no org selected). */
  isAdminContext: boolean;
};

function isTransientSupabaseError(message: string, code?: string | null) {
  const msg = String(message || '').toLowerCase();
  return (
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('enotfound') ||
    msg.includes('socket') ||
    code === '42P01' ||
    msg.includes('does not exist')
  );
}

async function loadAllActiveOrganizations() {
  try {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('organizations')
      .select('id, organization_name')
      .eq('status', 'active')
      .order('organization_name', { ascending: true });

    if (error) {
      const msg = String(error.message || '');
      if (isTransientSupabaseError(msg, error.code)) {
        if (!msg.toLowerCase().includes('fetch failed')) {
          console.error('[loadAllActiveOrganizations]', msg);
        }
        return [] as OrganizationSwitcherItem[];
      }
      console.error('[loadAllActiveOrganizations]', msg);
      return [] as OrganizationSwitcherItem[];
    }

    return (data || []).map((row) => ({
      id: String(row.id),
      organization_name: String(row.organization_name || 'Organization'),
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.toLowerCase().includes('fetch failed')) {
      console.error('[loadAllActiveOrganizations]', msg);
    }
    return [] as OrganizationSwitcherItem[];
  }
}

async function resolveOrganizationName(organizationId: string) {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from('organizations')
    .select('organization_name')
    .eq('id', organizationId)
    .maybeSingle();
  return data?.organization_name ? String(data.organization_name) : 'Organization';
}

function canAccessOrganization(session: SessionPayload, organizationId: string, allowedIds?: string[]) {
  if (isSuperAdminSession(session)) return true;
  const ids = allowedIds ?? session.organizationIds ?? [];
  if (ids.length === 0) return false;
  return ids.includes(organizationId);
}

async function resolvePortalOrganizationAccess(session: SessionPayload) {
  if (!session.appUserId) {
    return {
      organizationIds: session.organizationIds ?? [],
      organizations: [] as OrganizationSwitcherItem[],
      activeOrganizationId: session.organizationId ?? null,
      activeOrganizationName: session.organizationName ?? null,
    };
  }

  // Fast path: single-org portal users already have identity in the JWT —
  // avoid re-querying user_organizations + organizations on every layout render.
  const sessionOrgIds = (session.organizationIds || [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  if (
    sessionOrgIds.length === 1 &&
    session.organizationId &&
    session.organizationName &&
    sessionOrgIds[0] === session.organizationId
  ) {
    return {
      organizationIds: sessionOrgIds,
      organizations: [
        {
          id: sessionOrgIds[0],
          organization_name: session.organizationName,
        },
      ],
      activeOrganizationId: session.organizationId,
      activeOrganizationName: session.organizationName,
    };
  }

  const supabase = await createAdminClient();
  return fetchPortalUserOrganizationAssignments(supabase, session.appUserId, {
    preferredOrganizationId: session.organizationId,
    defaultOrganizationId: null,
    fallbackOrganizationIds: session.organizationIds,
  });
}

async function writeSession(payload: SessionPayload) {
  const token = await encrypt({ ...payload, lastActivity: Date.now() });
  (await cookies()).set('session', token, getSessionCookieOptions());
}

function buildAdminOrganizationState(
  session: SessionPayload,
  organizations: OrganizationSwitcherItem[],
  overrides?: {
    organizationId?: string | null;
    organizationName?: string | null;
  }
): AdminOrganizationState {
  const isSuperAdmin = isSuperAdminSession(session);
  const isAdminContext = isSuperAdminInAdminContext(session);

  return {
    organizationId: overrides?.organizationId ?? session.organizationId ?? null,
    organizationName: isAdminContext
      ? ADMIN_CONTEXT_LABEL
      : overrides?.organizationName ?? session.organizationName ?? null,
    organizations,
    isSuperAdmin,
    isAdminContext,
  };
}

/** Initial state for admin header switcher (server component). */
export async function getAdminOrganizationState(): Promise<AdminOrganizationState> {
  const session = await getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'user')) {
    return {
      organizationId: null,
      organizationName: null,
      organizations: [],
      isSuperAdmin: false,
      isAdminContext: false,
    };
  }

  let organizations: OrganizationSwitcherItem[] = [];
  let activeOrganizationId: string | null = session.organizationId ?? null;
  let activeOrganizationName: string | null = session.organizationName ?? null;

  try {
    if (isSuperAdminSession(session)) {
      organizations = await loadAllActiveOrganizations();
      // Soft fallback: keep current org visible in switcher if DB is unreachable
      if (
        organizations.length === 0 &&
        session.organizationId &&
        !isSuperAdminInAdminContext(session)
      ) {
        organizations = [
          {
            id: session.organizationId,
            organization_name: session.organizationName || 'Organization',
          },
        ];
      }
    } else if (isPortalAccountSession(session) && session.appUserId) {
      const assignment = await resolvePortalOrganizationAccess(session);
      organizations = assignment.organizations;
      activeOrganizationId = assignment.activeOrganizationId;
      activeOrganizationName = assignment.activeOrganizationName;

      // Do NOT write cookies here — getAdminOrganizationState is called from
      // Server Components (e.g. admin dashboard). Cookie mutation is only allowed
      // in Server Actions / Route Handlers (switchAdminOrganization, etc.).
    } else if (session.organizationIds && session.organizationIds.length > 0) {
      try {
        const supabase = await createAdminClient();
        const { data, error } = await supabase
          .from('organizations')
          .select('id, organization_name')
          .in('id', session.organizationIds)
          .eq('status', 'active')
          .order('organization_name', { ascending: true });

        if (error || !data?.length) {
          organizations = session.organizationIds.map((id) => ({
            id,
            organization_name:
              id === session.organizationId
                ? session.organizationName || 'Organization'
                : 'Organization',
          }));
        } else {
          organizations = data.map((row) => ({
            id: String(row.id),
            organization_name: String(row.organization_name || 'Organization'),
          }));
        }
      } catch {
        organizations = session.organizationIds.map((id) => ({
          id,
          organization_name:
            id === session.organizationId
              ? session.organizationName || 'Organization'
              : 'Organization',
        }));
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.toLowerCase().includes('fetch failed')) {
      console.error('[getAdminOrganizationState]', msg);
    }
    // Never crash the admin dashboard on org-switcher load failures
    if (session.organizationId) {
      organizations = [
        {
          id: session.organizationId,
          organization_name: session.organizationName || 'Organization',
        },
      ];
    }
  }

  return buildAdminOrganizationState(session, organizations, {
    organizationId: activeOrganizationId,
    organizationName: activeOrganizationName,
  });
}

/** Switch active organization without re-login. */
export async function switchAdminOrganization(organizationId: string) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;
    if (!token) return { error: 'Unauthorized' as const };

    let session: SessionPayload;
    try {
      session = await decrypt(token);
    } catch {
      return { error: 'Unauthorized' as const };
    }

    if (session.role !== 'admin' && session.role !== 'user') {
      return { error: 'Access Denied' as const };
    }

    const id = String(organizationId || '').trim();
    if (!id) return { error: 'Organization id is required' };

    let allowedIds = session.organizationIds ?? [];
    if (isPortalAccountSession(session) && session.appUserId) {
      const assignment = await resolvePortalOrganizationAccess(session);
      allowedIds = assignment.organizationIds;
    }

    if (!canAccessOrganization(session, id, allowedIds)) {
      return { error: 'Access Denied' as const };
    }

    const organizationName = await resolveOrganizationName(id);

    await writeSession({
      ...session,
      organizationIds: allowedIds,
      organizationId: id,
      organizationName,
    });

    return {
      success: true as const,
      organizationId: id,
      organizationName,
      isAdminContext: false as const,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Unable to switch organization',
    };
  }
}

/** Switch super admin back to global Admin context (no organization scope). */
export async function switchToAdminContext() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;
    if (!token) return { error: 'Unauthorized' as const };

    let session: SessionPayload;
    try {
      session = await decrypt(token);
    } catch {
      return { error: 'Unauthorized' as const };
    }

    if (!isSuperAdminSession(session)) {
      return { error: 'Access Denied' as const };
    }

    if (!session.organizationId) {
      return {
        success: true as const,
        organizationId: null,
        organizationName: ADMIN_CONTEXT_LABEL,
        isAdminContext: true as const,
      };
    }

    await writeSession({
      username: session.username,
      role: session.role,
      organizationIds: session.organizationIds,
      permissions: session.permissions,
      lastActivity: Date.now(),
    });

    return {
      success: true as const,
      organizationId: null,
      organizationName: ADMIN_CONTEXT_LABEL,
      isAdminContext: true as const,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Unable to switch to Admin context',
    };
  }
}

/** Refresh org list after Settings CRUD (keeps current selection). */
export async function refreshAdminOrganizationList() {
  return getAdminOrganizationState();
}

const PORTAL_ORGANIZATION_SELECT =
  'id, organization_name, email, phone, address, street, street_2, city, state, zip, country, website, logo_url, branches, description, username, status, created_at, updated_at';

/** Load full organization profile for portal user (validates assignment). */
export async function getPortalOrganizationProfile(organizationId?: string) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'user') {
      return { error: 'Unauthorized' as const };
    }

    const id = String(organizationId || session.organizationId || '').trim();
    if (!id) {
      return { error: 'No organization selected' as const };
    }

    const assignment = await resolvePortalOrganizationAccess(session);
    if (!canAccessOrganization(session, id, assignment.organizationIds)) {
      return { error: 'Access Denied' as const };
    }

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('organizations')
      .select(PORTAL_ORGANIZATION_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) return { error: error.message };
    if (!data || data.status === 'inactive') {
      return { error: 'Organization not found' as const };
    }

    return {
      organization: {
        ...(data as Record<string, unknown>),
        street: String(data.street || data.address || ''),
        street_2: String(data.street_2 || ''),
        state: String(data.state || ''),
        zip: String(data.zip || ''),
        website: String(data.website || ''),
        logo_url: typeof data.logo_url === 'string' ? data.logo_url : null,
        branches: Array.isArray(data.branches) ? data.branches : [],
      },
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Unable to load organization',
    };
  }
}
