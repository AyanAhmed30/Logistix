import { Suspense } from 'react';
import { AccountingJournalFormView } from '@/components/accounting/AccountingJournalFormView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

export default function AccountingJournalNewPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={2} />}>
      <AccountingJournalFormView />
    </Suspense>
  );
}
