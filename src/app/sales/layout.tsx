import { redirect } from 'next/navigation';
import { getAdminOrganizationState } from '@/app/actions/organization-context';
import { getSession } from '@/lib/auth/session';
import { buildDashboardAccessFromSession } from '@/lib/sales-page-access';
import { sessionHasSalesAccess } from '@/lib/auth/require-access';
import { SalesLayoutClient } from '@/components/sales/SalesLayoutClient';

export default async function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await buildDashboardAccessFromSession();
  if (!access) redirect('/login');

  if (!access.isSuperAdmin) {
    const session = await getSession();
    if (!session || !sessionHasSalesAccess(session)) {
      redirect('/access-denied');
    }
  }

  const organizationState = await getAdminOrganizationState();

  return (
    <SalesLayoutClient access={access} initialOrganizationState={organizationState}>
      {children}
    </SalesLayoutClient>
  );
}
