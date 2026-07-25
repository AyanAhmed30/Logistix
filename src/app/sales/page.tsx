import { redirect } from 'next/navigation';
import { buildDashboardAccessFromSession } from '@/lib/sales-page-access';
import { defaultSalesRouteForAccess } from '@/lib/dashboard-access';

export default async function SalesIndexPage() {
  const access = await buildDashboardAccessFromSession();
  if (!access) redirect('/login');
  redirect(defaultSalesRouteForAccess(access));
}
