import { Suspense } from 'react';
import { buildDashboardAccessFromSession } from '@/lib/crm-page-access';
import { redirect } from 'next/navigation';
import { CrmPageSkeleton } from '@/components/crm/CrmSkeleton';
import { CrmAllInquiriesViewDynamic } from '@/components/crm/CrmDynamicViews';

export default async function CrmAllInquiriesPage() {
  const access = await buildDashboardAccessFromSession();
  if (!access) redirect('/login');
  return (
    <Suspense fallback={<CrmPageSkeleton />}>
      <CrmAllInquiriesViewDynamic />
    </Suspense>
  );
}
