import { Suspense } from 'react';
import { requireSalesPageAccess } from '@/lib/sales-page-access';
import { SalesPageSkeleton } from '@/components/sales/SalesSkeleton';
import { SalesReportsViewDynamic } from '@/components/sales/SalesDynamicViews';

export default async function SalesReportsPage() {
  await requireSalesPageAccess();
  return (
    <Suspense fallback={<SalesPageSkeleton rows={6} />}>
      <SalesReportsViewDynamic />
    </Suspense>
  );
}
