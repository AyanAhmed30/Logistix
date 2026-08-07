import { Suspense } from 'react';
import { AccountingAssetCategoriesView } from '@/components/accounting/AccountingAssetCategoriesView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

export default function AccountingAssetCategoriesPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={5} />}>
      <AccountingAssetCategoriesView />
    </Suspense>
  );
}
