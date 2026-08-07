import { Suspense } from 'react';
import { AccountingChartOfAccountFormView } from '@/components/accounting/AccountingChartOfAccountFormView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

export default function AccountingChartOfAccountNewPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={2} />}>
      <AccountingChartOfAccountFormView />
    </Suspense>
  );
}
