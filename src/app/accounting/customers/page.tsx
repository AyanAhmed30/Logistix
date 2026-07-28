import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingCustomersView } from '@/components/accounting/AccountingCustomersView';

export default function AccountingCustomersPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={6} />}>
      <AccountingCustomersView />
    </Suspense>
  );
}
