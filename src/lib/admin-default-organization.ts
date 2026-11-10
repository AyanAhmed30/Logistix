import type { SupabaseClient } from '@supabase/supabase-js';

type OrganizationRow = { id: unknown; organization_name: unknown };

/**
 * Super Admin's saved default company, if it is still an active organization.
 * Any problem (no preference, deleted or inactive company, migration 055 not run
 * yet) returns null, which means "start in Admin".
 */
export async function loadAdminDefaultOrganization(
  supabase: SupabaseClient,
  username: string,
  activeOrganizations: OrganizationRow[]
): Promise<{ id: string; name: string } | null> {
  try {
    const { data, error } = await supabase
      .from('admin_preferences')
      .select('default_organization_id')
      .eq('username', username)
      .maybeSingle();
    if (error) {
      // Until migration 055 runs there is simply no preference to read.
      if (error.code !== 'PGRST205' && error.code !== '42P01') {
        console.error('[admin-default-organization]', error.message);
      }
      return null;
    }
    const id = data?.default_organization_id ? String(data.default_organization_id) : null;
    if (!id) return null;
    const match = activeOrganizations.find((org) => String(org.id) === id);
    return match ? { id, name: String(match.organization_name || 'Organization') } : null;
  } catch (error) {
    console.error('[admin-default-organization]', error);
    return null;
  }
}
