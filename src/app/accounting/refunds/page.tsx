import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingRefundsView } from '@/components/accounting/AccountingRefundsView';

export default function AccountingRefundsPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={7} />}>
      <AccountingRefundsView />
    </Suspense>
  );
}
