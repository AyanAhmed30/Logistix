import { Suspense } from 'react';
import { AccountingJournalsView } from '@/components/accounting/AccountingJournalsView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

export default function AccountingJournalsPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={10} cols={8} />}>
      <AccountingJournalsView />
    </Suspense>
  );
}
