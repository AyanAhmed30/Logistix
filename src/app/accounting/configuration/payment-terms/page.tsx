import { Suspense } from 'react';
import { AccountingPaymentTermsView } from '@/components/accounting/AccountingPaymentTermsView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

export default function AccountingPaymentTermsPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={10} cols={6} />}>
      <AccountingPaymentTermsView />
    </Suspense>
  );
}
