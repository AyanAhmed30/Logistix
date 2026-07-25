import { Suspense } from 'react';
import { requireSalesPageAccess } from '@/lib/sales-page-access';
import { SalesPageSkeleton } from '@/components/sales/SalesSkeleton';
import { SalesOrdersToUpsellViewDynamic } from '@/components/sales/SalesDynamicViews';

export default async function SalesToUpsellPage() {
  await requireSalesPageAccess('quotations');
  return (
    <Suspense fallback={<SalesPageSkeleton />}>
      <SalesOrdersToUpsellViewDynamic />
    </Suspense>
  );
}
