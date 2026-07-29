import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingVendorProductFormView } from '@/components/accounting/AccountingVendorProductFormView';

export default function Page() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={6} cols={4} />}>
      <AccountingVendorProductFormView productId={null} />
    </Suspense>
  );
}
