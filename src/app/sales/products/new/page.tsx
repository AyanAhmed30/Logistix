import { Suspense } from 'react';
import { requireSalesPageAccess } from '@/lib/sales-page-access';
import { SalesPageSkeleton } from '@/components/sales/SalesSkeleton';
import { SalesProductFormViewDynamic } from '@/components/sales/SalesDynamicViews';

export default async function SalesNewProductPage() {
  await requireSalesPageAccess();
  return (
    <Suspense fallback={<SalesPageSkeleton rows={6} />}>
      <SalesProductFormViewDynamic productId={null} />
    </Suspense>
  );
}
