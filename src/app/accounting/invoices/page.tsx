import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingInvoicesView } from '@/components/accounting/AccountingInvoicesView';

export default function AccountingInvoicesPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={10} cols={8} />}>
      <AccountingInvoicesView />
    </Suspense>
  );
}
