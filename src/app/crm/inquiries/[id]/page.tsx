import { Suspense } from 'react';
import { buildDashboardAccessFromSession } from '@/lib/crm-page-access';
import { redirect } from 'next/navigation';
import { CrmFormSkeleton } from '@/components/crm/CrmSkeleton';
import { CrmInquiryDetailViewDynamic } from '@/components/crm/CrmDynamicViews';

export default async function CrmInquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await buildDashboardAccessFromSession();
  if (!access) redirect('/login');
  const { id } = await params;
  return (
    <Suspense fallback={<CrmFormSkeleton />}>
      <CrmInquiryDetailViewDynamic inquiryId={id} />
    </Suspense>
  );
}
