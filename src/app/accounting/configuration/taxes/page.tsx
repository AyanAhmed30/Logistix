import { Suspense } from 'react';
import { AccountingTaxesView } from '@/components/accounting/AccountingTaxesView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

export default function AccountingTaxesPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={10} cols={8} />}>
      <AccountingTaxesView />
    </Suspense>
  );
}
