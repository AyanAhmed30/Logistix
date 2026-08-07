import { Suspense } from 'react';
import { AccountingLoansView } from '@/components/accounting/AccountingLoansView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

export default function AccountingLoansPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={10} cols={11} />}>
      <AccountingLoansView />
    </Suspense>
  );
}
