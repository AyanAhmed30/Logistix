import { Suspense } from 'react';
import { AccountingPaymentTermFormView } from '@/components/accounting/AccountingPaymentTermFormView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

export default function AccountingPaymentTermNewPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={2} />}>
      <AccountingPaymentTermFormView />
    </Suspense>
  );
}
