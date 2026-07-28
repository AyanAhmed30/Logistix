import { Suspense } from 'react';
import { AccountingKpiSkeleton, AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingCustomerStatementView } from '@/components/accounting/AccountingCustomerStatementView';

type Props = { params: Promise<{ id: string }> };

export default async function AccountingCustomerStatementPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense
      fallback={
        <div className="space-y-3">
          <AccountingKpiSkeleton count={6} />
          <AccountingTableSkeleton rows={8} cols={5} />
        </div>
      }
    >
      <AccountingCustomerStatementView contactId={id} />
    </Suspense>
  );
}
