import { Suspense } from 'react';
import { AccountingChartOfAccountsView } from '@/components/accounting/AccountingChartOfAccountsView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

export default function AccountingChartOfAccountsPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={12} cols={8} />}>
      <AccountingChartOfAccountsView />
    </Suspense>
  );
}
