import { Suspense } from 'react';
import { requireCrmPageAccess } from '@/lib/crm-page-access';
import { CrmPageSkeleton } from '@/components/crm/CrmSkeleton';
import { CrmCustomersViewDynamic } from '@/components/crm/CrmDynamicViews';

export default async function CrmCustomersPage() {
  await requireCrmPageAccess('crm-customers');
  return (
    <Suspense fallback={<CrmPageSkeleton />}>
      <CrmCustomersViewDynamic />
    </Suspense>
  );
}
