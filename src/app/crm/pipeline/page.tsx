import { Suspense } from 'react';
import { requireCrmPageAccess } from '@/lib/crm-page-access';
import { CrmKanbanSkeleton } from '@/components/crm/CrmSkeleton';
import { CrmPipelineViewDynamic } from '@/components/crm/CrmDynamicViews';

export default async function CrmPipelinePage() {
  await requireCrmPageAccess('crm-pipeline');
  return (
    <Suspense fallback={<CrmKanbanSkeleton />}>
      <CrmPipelineViewDynamic />
    </Suspense>
  );
}
