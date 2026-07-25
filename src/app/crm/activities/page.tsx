import { requireCrmPageAccess } from '@/lib/crm-page-access';
import { CrmActivitiesViewDynamic } from '@/components/crm/CrmDynamicViews';

export default async function CrmActivitiesPage() {
  await requireCrmPageAccess('crm-activities');
  return <CrmActivitiesViewDynamic />;
}
