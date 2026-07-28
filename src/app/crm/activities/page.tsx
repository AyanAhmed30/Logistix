import { Suspense } from 'react';
import { requireCrmPageAccess } from '@/lib/crm-page-access';
import { CrmActivitiesViewDynamic } from '@/components/crm/CrmDynamicViews';
import { CrmPageSkeleton } from '@/components/crm/CrmSkeleton';

export default async function CrmActivitiesPage() {
  await requireCrmPageAccess('crm-activities');
  return (
    <Suspense fallback={<CrmPageSkeleton />}>
      <CrmActivitiesViewDynamic />
    </Suspense>
  );
}
