import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingVendorPaymentsView } from '@/components/accounting/AccountingVendorPaymentsView';

export default function Page() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={10} cols={8} />}>
      <AccountingVendorPaymentsView />
    </Suspense>
  );
}
