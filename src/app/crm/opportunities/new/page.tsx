import { requireCrmPageAccess } from '@/lib/crm-page-access';
import { CrmOpportunityFormViewDynamic } from '@/components/crm/CrmDynamicViews';

export default async function CrmNewOpportunityPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  await requireCrmPageAccess('crm-pipeline');
  const params = await searchParams;
  return (
    <CrmOpportunityFormViewDynamic initialStageId={params.stage || null} />
  );
}
