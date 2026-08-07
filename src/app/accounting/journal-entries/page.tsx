import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingJournalEntriesView } from '@/components/accounting/AccountingJournalEntriesView';

export default function AccountingJournalEntriesPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={10} cols={9} />}>
      <AccountingJournalEntriesView />
    </Suspense>
  );
}
