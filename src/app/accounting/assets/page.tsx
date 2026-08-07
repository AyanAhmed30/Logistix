import { Suspense } from 'react';
import { AccountingAssetsView } from '@/components/accounting/AccountingAssetsView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

export default function AccountingAssetsPage() {
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={10} cols={9} />}>
      <AccountingAssetsView />
    </Suspense>
  );
}
