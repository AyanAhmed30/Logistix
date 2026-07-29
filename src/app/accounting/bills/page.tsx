import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingBillsView } from '@/components/accounting/AccountingBillsView';

export default function AccountingBillsPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={10} cols={9} />}>
      <AccountingBillsView />
    </Suspense>
  );
}
