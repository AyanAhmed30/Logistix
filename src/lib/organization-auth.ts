import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import type { Organization } from '@/app/actions/organizations';
import { hasModulePermission } from '@/lib/module-permissions';

const ORGANIZATION_SELECT =
  'id, organization_name, email, phone, address, street, street_2, city, state, zip, country, website, logo_url, branches, description, username, status, created_at, updated_at';

export type OrganizationModuleKey = 'customers' | 'quotations';

export type OrganizationContext =
  | {
      session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
      organization: Organization;
      supabase: Awaited<ReturnType<typeof createAdminClient>>;
    }
  | { error: string };

function normalizeOrganizationRow(data: Record<string, unknown>): Organization {
  return {
    ...(data as Organization),
    street: String(data.street || data.address || ''),
    street_2: String(data.street_2 || ''),
    state: String(data.state || ''),
    zip: String(data.zip || ''),
    website: String(data.website || ''),
    logo_url: typeof data.logo_url === 'string' ? data.logo_url : null,
    branches: Array.isArray(data.branches) ? (data.branches as Organization['branches']) : [],
  };
}

async function loadOrganizationById(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  organizationId: string
): Promise<{ organization: Organization } | { error: string }> {
  const { data, error } = await supabase
    .from('organizations')
    .select(ORGANIZATION_SELECT)
    .eq('id', organizationId)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: 'Organization not found' };
  if (data.status === 'inactive') {
    return { error: 'This organization account is inactive.' };
  }

  return { organization: normalizeOrganizationRow(data as Record<string, unknown>) };
}

/**
 * Organization Portal context for:
 * - legacy `organization` role (username login)
 * - portal users with assigned `customers` / `quotations` module + company
 */
export async function requireOrganizationContext(options?: {
  moduleKey?: OrganizationModuleKey;
}): Promise<OrganizationContext> {
  const session = await getSession();
  if (!session) {
    return { error: 'Unauthorized' };
  }

  const supabase = await createAdminClient();
  const moduleKey = options?.moduleKey;

  // Legacy organization portal login
  if (session.role === 'organization') {
    const { data, error } = await supabase
      .from('organizations')
      .select(ORGANIZATION_SELECT)
      .eq('username', session.username)
      .maybeSingle();

    if (error) return { error: error.message };
    if (!data) return { error: 'Organization not found' };
    if (data.status === 'inactive') {
      return { error: 'This organization account is inactive.' };
    }

    return {
      session,
      organization: normalizeOrganizationRow(data as Record<string, unknown>),
      supabase,
    };
  }

  // Portal user / admin acting on assigned company modules
  if (session.role === 'user' || session.role === 'admin' || session.role === 'sales_agent') {
    if (moduleKey && session.role !== 'admin') {
      if (!hasModulePermission(session.permissions, moduleKey)) {
        return { error: 'Access Denied' };
      }
    }

    const organizationId = session.organizationId;
    if (!organizationId) {
      return { error: 'No company assigned to this user.' };
    }

    if (
      session.organizationIds &&
      session.organizationIds.length > 0 &&
      !session.organizationIds.includes(organizationId)
    ) {
      return { error: 'Access Denied' };
    }

    const loaded = await loadOrganizationById(supabase, organizationId);
    if ('error' in loaded) return { error: loaded.error };

    return {
      session,
      organization: loaded.organization,
      supabase,
    };
  }

  return { error: 'Unauthorized' };
}
