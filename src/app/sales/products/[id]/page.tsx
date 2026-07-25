import { Suspense } from 'react';
import { requireSalesPageAccess } from '@/lib/sales-page-access';
import { SalesPageSkeleton } from '@/components/sales/SalesSkeleton';
import { SalesProductFormViewDynamic } from '@/components/sales/SalesDynamicViews';

type Props = { params: Promise<{ id: string }> };

export default async function SalesProductDetailPage({ params }: Props) {
  await requireSalesPageAccess();
  const { id } = await params;
  return (
    <Suspense fallback={<SalesPageSkeleton rows={6} />}>
      <SalesProductFormViewDynamic productId={id} />
    </Suspense>
  );
}
