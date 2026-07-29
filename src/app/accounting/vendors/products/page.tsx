import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingVendorProductsView } from '@/components/accounting/AccountingVendorProductsView';

export default function Page() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={6} />}>
      <AccountingVendorProductsView />
    </Suspense>
  );
}
