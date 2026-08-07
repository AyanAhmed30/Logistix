import { Suspense } from 'react';
import { AccountingCurrencyFormView } from '@/components/accounting/AccountingCurrencyFormView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

export default function AccountingCurrencyNewPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={2} />}>
      <AccountingCurrencyFormView />
    </Suspense>
  );
}
