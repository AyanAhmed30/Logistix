import { Suspense } from 'react';
import { requireSalesPageAccess } from '@/lib/sales-page-access';
import { SalesPageSkeleton } from '@/components/sales/SalesSkeleton';
import { SalesOrdersToInvoiceViewDynamic } from '@/components/sales/SalesDynamicViews';

export default async function SalesToInvoicePage() {
  await requireSalesPageAccess('quotations');
  return (
    <Suspense fallback={<SalesPageSkeleton />}>
      <SalesOrdersToInvoiceViewDynamic />
    </Suspense>
  );
}
