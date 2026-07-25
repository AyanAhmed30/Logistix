import { Suspense } from 'react';
import { requireSalesPageAccess } from '@/lib/sales-page-access';
import { SalesPageSkeleton } from '@/components/sales/SalesSkeleton';
import { SalesCustomersViewDynamic } from '@/components/sales/SalesDynamicViews';

export default async function SalesCustomersPage() {
  await requireSalesPageAccess('customers');
  return (
    <Suspense fallback={<SalesPageSkeleton />}>
      <SalesCustomersViewDynamic />
    </Suspense>
  );
}
