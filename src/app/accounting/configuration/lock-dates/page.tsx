import { Suspense } from 'react';
import { AccountingLockDatesView } from '@/components/accounting/AccountingLockDatesView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

export default function AccountingConfigurationLockDatesPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={4} />}>
      <AccountingLockDatesView />
    </Suspense>
  );
}
