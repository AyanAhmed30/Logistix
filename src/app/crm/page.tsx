import { redirect } from 'next/navigation';
import { buildDashboardAccessFromSession } from '@/lib/crm-page-access';
import { defaultCrmRouteForAccess } from '@/lib/dashboard-access';

export default async function CrmIndexPage() {
  const access = await buildDashboardAccessFromSession();
  if (!access) redirect('/login');

  redirect(defaultCrmRouteForAccess(access));
}
