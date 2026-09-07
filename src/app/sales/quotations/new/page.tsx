import { Suspense } from 'react';
import { requireSalesPageAccess } from '@/lib/sales-page-access';
import { SalesPageSkeleton } from '@/components/sales/SalesSkeleton';
import { SalesQuotationFormView } from '@/components/sales/SalesQuotationFormView';

export default async function SalesNewQuotationPage() {
  await requireSalesPageAccess('quotations');
  return (
    <Suspense fallback={<SalesPageSkeleton rows={8} />}>
      <SalesQuotationFormView quotationId={null} />
    </Suspense>
  );
}
