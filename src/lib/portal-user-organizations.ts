import type { createAdminClient } from '@/utils/supabase/server';

export type PortalOrganizationItem = {
  id: string;
  organization_name: string;
};

export type PortalUserOrganizationAssignment = {
  organizationIds: string[];
  organizations: PortalOrganizationItem[];
  activeOrganizationId: string | null;
  activeOrganizationName: string | null;
};

async function readDefaultOrganizationId(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  userId: string,
  hint?: string | null
): Promise<string | null> {
  if (hint?.trim()) return hint.trim();

  const { data, error } = await supabase
    .from('app_users')
    .select('default_organization, default_organization_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    const msg = String(error.message || '');
    // Soft-fail network / missing-column cases (common in local dev)
    if (
      msg.includes('fetch failed') ||
      msg.includes('default_organization') ||
      msg.includes('column') ||
      error.code === '42703'
    ) {
      return null;
    }
    console.error('[readDefaultOrganizationId]', msg);
    return null;
  }

  const row = data as Record<string, unknown> | null;
  const value = row?.default_organization ?? row?.default_organization_id;
  return value ? String(value) : null;
}

/** Load assigned organizations for a portal user directly from the database. */
export async function fetchPortalUserOrganizationAssignments(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  userId: string,
  options?: {
    preferredOrganizationId?: string | null;
    defaultOrganizationId?: string | null;
    fallbackOrganizationIds?: string[] | null;
  }
): Promise<PortalUserOrganizationAssignment> {
  const { data: links, error: linksError } = await supabase
    .from('user_organizations')
    .select('organization_id')
    .eq('user_id', userId);

  if (linksError) {
    const msg = String(linksError.message || '');
    if (!msg.includes('fetch failed')) {
      console.error('[fetchPortalUserOrganizationAssignments]', msg);
    }
  }

  let organizationIds = [
    ...new Set(
      (links || [])
        .map((row) => String(row.organization_id || '').trim())
        .filter(Boolean)
    ),
  ];

  // Prefer session / caller fallbacks when DB is unreachable
  if (organizationIds.length === 0) {
    const fallbacks = (options?.fallbackOrganizationIds || [])
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    if (fallbacks.length > 0) {
      organizationIds = [...new Set(fallbacks)];
    } else if (options?.preferredOrganizationId?.trim()) {
      organizationIds = [options.preferredOrganizationId.trim()];
    }
  }

  if (organizationIds.length === 0) {
    const fallbackDefault = await readDefaultOrganizationId(
      supabase,
      userId,
      options?.defaultOrganizationId
    );
    if (fallbackDefault) {
      organizationIds = [fallbackDefault];
    }
  }

  if (organizationIds.length === 0) {
    return {
      organizationIds: [],
      organizations: [],
      activeOrganizationId: null,
      activeOrganizationName: null,
    };
  }

  const { data: orgRows, error: orgError } = await supabase
    .from('organizations')
    .select('id, organization_name')
    .in('id', organizationIds)
    .eq('status', 'active')
    .order('organization_name', { ascending: true });

  if (orgError) {
    const msg = String(orgError.message || '');
    if (!msg.includes('fetch failed')) {
      console.error('[fetchPortalUserOrganizationAssignments] organizations', msg);
    }
    // Soft fallback when org rows cannot be loaded (e.g. network)
    const preferred = options?.preferredOrganizationId?.trim();
    const activeOrganizationId =
      (preferred && organizationIds.includes(preferred) ? preferred : null) ||
      organizationIds[0] ||
      null;
    return {
      organizationIds,
      organizations: organizationIds.map((id) => ({
        id,
        organization_name: 'Organization',
      })),
      activeOrganizationId,
      activeOrganizationName: activeOrganizationId ? 'Organization' : null,
    };
  }

  const organizations: PortalOrganizationItem[] = (orgRows || []).map((row) => ({
    id: String(row.id),
    organization_name: String(row.organization_name || 'Organization'),
  }));

  const activeIds = organizations.map((org) => org.id);
  const preferred = options?.preferredOrganizationId?.trim();
  const defaultId = await readDefaultOrganizationId(
    supabase,
    userId,
    options?.defaultOrganizationId
  );

  const activeOrganizationId =
    (preferred && activeIds.includes(preferred) ? preferred : null) ||
    (defaultId && activeIds.includes(defaultId) ? defaultId : null) ||
    activeIds[0] ||
    null;

  const activeOrganizationName = activeOrganizationId
    ? organizations.find((org) => org.id === activeOrganizationId)?.organization_name ?? null
    : null;

  return {
    organizationIds: activeIds,
    organizations,
    activeOrganizationId,
    activeOrganizationName,
  };
}
