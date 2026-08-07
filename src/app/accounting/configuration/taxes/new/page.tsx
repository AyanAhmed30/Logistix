import { Suspense } from 'react';
import { AccountingTaxFormView } from '@/components/accounting/AccountingTaxFormView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

export default function AccountingTaxNewPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={2} />}>
      <AccountingTaxFormView />
    </Suspense>
  );
}
