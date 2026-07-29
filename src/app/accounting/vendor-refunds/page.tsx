import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingVendorRefundsView } from '@/components/accounting/AccountingVendorRefundsView';

export default function Page() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={8} />}>
      <AccountingVendorRefundsView />
    </Suspense>
  );
}
