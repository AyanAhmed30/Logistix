import { redirect } from 'next/navigation';
import { getAdminOrganizationState } from '@/app/actions/organization-context';
import { AnalyticsShell } from '@/components/analytics/AnalyticsShell';
import { resolveAnalyticsAccess } from '@/lib/analytics/access';
import { getSession } from '@/lib/auth/session';
import { buildDashboardAccessFromSession } from '@/lib/crm-page-access';

export default async function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  // Admin views only for now; employee self-service arrives with Daily Logging.
  if (resolveAnalyticsAccess(session).kind !== 'admin') redirect('/access-denied');

  const access = await buildDashboardAccessFromSession();
  if (!access) redirect('/access-denied');

  const organizationState = await getAdminOrganizationState();

  return (
    <AnalyticsShell access={access} initialOrganizationState={organizationState}>
      {children}
    </AnalyticsShell>
  );
}
