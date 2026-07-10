import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import type { Organization } from '@/app/actions/organizations';

const ORGANIZATION_SELECT =
  'id, organization_name, email, phone, address, street, street_2, city, state, zip, country, website, logo_url, branches, description, username, status, created_at, updated_at';

export type OrganizationContext =
  | {
      session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
      organization: Organization;
      supabase: Awaited<ReturnType<typeof createAdminClient>>;
    }
  | { error: string };

export async function requireOrganizationContext(): Promise<OrganizationContext> {
  const session = await getSession();
  if (!session || session.role !== 'organization') {
    return { error: 'Unauthorized' };
  }

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('organizations')
    .select(ORGANIZATION_SELECT)
    .eq('username', session.username)
    .maybeSingle();

  if (error) {
    return { error: error.message };
  }
  if (!data) {
    return { error: 'Organization not found' };
  }
  if (data.status === 'inactive') {
    return { error: 'This organization account is inactive.' };
  }

  return {
    session,
    organization: {
      ...(data as Organization),
      street: String(data.street || data.address || ''),
      street_2: String(data.street_2 || ''),
      state: String(data.state || ''),
      zip: String(data.zip || ''),
      website: String(data.website || ''),
      logo_url: typeof data.logo_url === 'string' ? data.logo_url : null,
      branches: Array.isArray(data.branches) ? (data.branches as Organization['branches']) : [],
    },
    supabase,
  };
}
