import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingCreditNotesView } from '@/components/accounting/AccountingCreditNotesView';

export default function AccountingCreditNotesPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={8} />}>
      <AccountingCreditNotesView />
    </Suspense>
  );
}
