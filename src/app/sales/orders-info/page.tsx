import { Suspense } from 'react';
import { requireSalesPageAccess } from '@/lib/sales-page-access';
import { SalesPageSkeleton } from '@/components/sales/SalesSkeleton';
import { SalesOrdersInfoViewDynamic } from '@/components/sales/SalesDynamicViews';

export default async function SalesOrdersInfoPage() {
  await requireSalesPageAccess('quotations');
  return (
    <Suspense fallback={<SalesPageSkeleton />}>
      <SalesOrdersInfoViewDynamic />
    </Suspense>
  );
}
