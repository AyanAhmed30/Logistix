import { Suspense } from 'react';
import { AccountingCurrenciesView } from '@/components/accounting/AccountingCurrenciesView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

export default function AccountingCurrenciesPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={10} cols={7} />}>
      <AccountingCurrenciesView />
    </Suspense>
  );
}
