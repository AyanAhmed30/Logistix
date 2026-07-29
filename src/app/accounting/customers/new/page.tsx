import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingCustomerFormClient } from '@/components/accounting/AccountingCustomerFormClient';

export default function AccountingNewCustomerPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={6} cols={4} />}>
      <AccountingCustomerFormClient contactId={null} />
    </Suspense>
  );
}
