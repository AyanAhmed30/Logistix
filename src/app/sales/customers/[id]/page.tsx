import { Suspense } from 'react';
import { requireSalesPageAccess } from '@/lib/sales-page-access';
import { SalesCustomerFormClient } from '@/components/sales/SalesCustomerFormClient';
import { SalesPageSkeleton } from '@/components/sales/SalesSkeleton';

type Props = { params: Promise<{ id: string }> };

export default async function SalesCustomerDetailPage({ params }: Props) {
  await requireSalesPageAccess('customers');
  const { id } = await params;
  return (
    <Suspense fallback={<SalesPageSkeleton />}>
      <SalesCustomerFormClient contactId={id} />
    </Suspense>
  );
}
