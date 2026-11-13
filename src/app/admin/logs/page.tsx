import { redirect } from 'next/navigation';
import { getAdminOrganizationState } from '@/app/actions/organization-context';
import { AnalyticsShell } from '@/components/analytics/AnalyticsShell';
import { WorkLogsPage } from '@/components/sales-activity/WorkLogsPage';
import { isTrackedSalesAgent } from '@/lib/auth/activity-tracking';
import { getSession } from '@/lib/auth/session';
import { buildDashboardAccessFromSession } from '@/lib/crm-page-access';

export const metadata = { title: 'Logs' };

/** Sales agents' own work logs (header "Logs" button). */
export default async function SalesAgentLogsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isTrackedSalesAgent(session)) redirect('/admin/dashboard');

  const access = await buildDashboardAccessFromSession();
  if (!access) redirect('/access-denied');
  const organizationState = await getAdminOrganizationState();

  // Same "back to Dashboard" frame the Analytics pages use.
  return (
    <AnalyticsShell access={access} initialOrganizationState={organizationState}>
      <WorkLogsPage />
    </AnalyticsShell>
  );
}
