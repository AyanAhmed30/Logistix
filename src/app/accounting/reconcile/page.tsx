import { Suspense } from 'react';
import { AccountingReconcileView } from '@/components/accounting/AccountingReconcileView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

export default function AccountingReconcilePage() {
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <AccountingTableSkeleton rows={10} cols={9} />
        </div>
      }
    >
      <AccountingReconcileView />
    </Suspense>
  );
}
