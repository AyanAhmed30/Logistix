import { redirect } from 'next/navigation';
import { requireCrmPageAccess } from '@/lib/crm-page-access';
import { getCrmOpportunityById } from '@/app/actions/crm/opportunities';
import { CrmOpportunityFormViewDynamic } from '@/components/crm/CrmDynamicViews';

export default async function CrmOpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCrmPageAccess('crm-pipeline');

  const { id } = await params;
  const result = await getCrmOpportunityById(id);
  if ('error' in result && result.error) {
    redirect('/crm/pipeline');
  }

  return <CrmOpportunityFormViewDynamic opportunityId={id} />;
}
