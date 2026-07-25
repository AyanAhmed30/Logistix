import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { PortalUserDashboardWithOrganization } from '@/components/user/PortalUserDashboardWithOrganization';
import { hasModulePermission, parsePermissionKeys } from '@/lib/module-permissions';
import { getAdminOrganizationState, getPortalOrganizationProfile } from '@/app/actions/organization-context';
import type { Organization } from '@/app/actions/organizations';

export default async function UserDashboard() {
  const session = await getSession();

  if (!session || session.role !== 'user') {
    redirect('/login');
  }

  const permissions = parsePermissionKeys(session.permissions);
  const organizationState = await getAdminOrganizationState();

  let organization: Organization | null = null;
  if (
    session.organizationId &&
    (hasModulePermission(permissions, 'customers') ||
      hasModulePermission(permissions, 'quotations'))
  ) {
    const profile = await getPortalOrganizationProfile(session.organizationId);
    if ('organization' in profile && profile.organization) {
      organization = profile.organization as Organization;
    }
  }

  return (
    <PortalUserDashboardWithOrganization
      username={session.username}
      permissions={permissions}
      initialOrganizationState={organizationState}
      initialOrganization={organization}
    />
  );
}
