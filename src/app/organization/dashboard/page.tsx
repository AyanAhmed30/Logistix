import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { OrganizationDashboardShell } from '@/components/organization/OrganizationDashboardShell';
import { getOrganizationProfile } from '@/app/actions/organizations';

export default async function OrganizationDashboardPage() {
  const session = await getSession();

  if (!session || session.role !== 'organization') {
    redirect('/login');
  }

  const profileResult = await getOrganizationProfile();
  if ('error' in profileResult || !profileResult.organization) {
    redirect('/login');
  }

  return (
    <OrganizationDashboardShell
      organization={profileResult.organization}
      username={session.username}
    />
  );
}
