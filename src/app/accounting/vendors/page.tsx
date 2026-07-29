import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingVendorsView } from '@/components/accounting/AccountingVendorsView';

export default function Page() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={6} />}>
      <AccountingVendorsView />
    </Suspense>
  );
}
