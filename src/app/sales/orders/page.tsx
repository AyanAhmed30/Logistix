import { Suspense } from 'react';
import { requireSalesPageAccess } from '@/lib/sales-page-access';
import { SalesPageSkeleton } from '@/components/sales/SalesSkeleton';
import { SalesOrdersViewDynamic } from '@/components/sales/SalesDynamicViews';

export default async function SalesOrdersPage() {
  await requireSalesPageAccess('quotations');
  return (
    <Suspense fallback={<SalesPageSkeleton />}>
      <SalesOrdersViewDynamic />
    </Suspense>
  );
}
