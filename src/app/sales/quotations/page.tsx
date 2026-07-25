import { Suspense } from 'react';
import { requireSalesPageAccess } from '@/lib/sales-page-access';
import { SalesPageSkeleton } from '@/components/sales/SalesSkeleton';
import { SalesQuotationsViewDynamic } from '@/components/sales/SalesDynamicViews';

export default async function SalesQuotationsPage() {
  await requireSalesPageAccess('quotations');
  return (
    <Suspense fallback={<SalesPageSkeleton />}>
      <SalesQuotationsViewDynamic />
    </Suspense>
  );
}
