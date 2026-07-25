import { Suspense } from 'react';
import { requireSalesPageAccess } from '@/lib/sales-page-access';
import { SalesPageSkeleton } from '@/components/sales/SalesSkeleton';
import { SalesProductsViewDynamic } from '@/components/sales/SalesDynamicViews';

export default async function SalesProductsPage() {
  await requireSalesPageAccess();
  return (
    <Suspense fallback={<SalesPageSkeleton />}>
      <SalesProductsViewDynamic />
    </Suspense>
  );
}
