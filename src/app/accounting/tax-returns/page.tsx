import { Suspense } from 'react';
import { AccountingTaxReturnsView } from '@/components/accounting/AccountingTaxReturnsView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

export default function AccountingTaxReturnsPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={10} cols={8} />}>
      <AccountingTaxReturnsView />
    </Suspense>
  );
}
