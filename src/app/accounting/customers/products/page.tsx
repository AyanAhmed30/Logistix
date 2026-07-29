import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingProductsView } from '@/components/accounting/AccountingProductsView';

export default function AccountingCustomersProductsPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={6} />}>
      <AccountingProductsView />
    </Suspense>
  );
}
