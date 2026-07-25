import { Suspense } from 'react';
import { requireSalesPageAccess } from '@/lib/sales-page-access';
import { SalesPageSkeleton } from '@/components/sales/SalesSkeleton';
import { SalesQuotationFormViewDynamic } from '@/components/sales/SalesDynamicViews';

type Props = { params: Promise<{ id: string }> };

export default async function SalesQuotationDetailPage({ params }: Props) {
  await requireSalesPageAccess('quotations');
  const { id } = await params;
  return (
    <Suspense fallback={<SalesPageSkeleton rows={8} />}>
      <SalesQuotationFormViewDynamic quotationId={id} />
    </Suspense>
  );
}
