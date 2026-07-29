import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingProductFormView } from '@/components/accounting/AccountingProductFormView';

export default function AccountingNewProductPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={6} cols={4} />}>
      <AccountingProductFormView productId={null} />
    </Suspense>
  );
}
