import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingVendorFormClient } from '@/components/accounting/AccountingVendorFormClient';

export default function Page() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={6} cols={4} />}>
      <AccountingVendorFormClient contactId={null} />
    </Suspense>
  );
}
