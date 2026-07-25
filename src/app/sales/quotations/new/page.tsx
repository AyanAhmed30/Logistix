import { Suspense } from 'react';
import { requireSalesPageAccess } from '@/lib/sales-page-access';
import { SalesPageSkeleton } from '@/components/sales/SalesSkeleton';
import { SalesQuotationFormViewDynamic } from '@/components/sales/SalesDynamicViews';

export default async function SalesNewQuotationPage() {
  await requireSalesPageAccess('quotations');
  return (
    <Suspense fallback={<SalesPageSkeleton rows={8} />}>
      <SalesQuotationFormViewDynamic quotationId={null} />
    </Suspense>
  );
}
