import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingPaymentsView } from '@/components/accounting/AccountingPaymentsView';

export default function AccountingPaymentsPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={10} cols={8} />}>
      <AccountingPaymentsView />
    </Suspense>
  );
}
