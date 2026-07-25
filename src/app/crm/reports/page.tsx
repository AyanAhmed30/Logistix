import { requireCrmPageAccess } from '@/lib/crm-page-access';
import { CrmReportsViewDynamic } from '@/components/crm/CrmDynamicViews';

export default async function CrmReportsPage() {
  await requireCrmPageAccess('crm-reports');
  return <CrmReportsViewDynamic />;
}
