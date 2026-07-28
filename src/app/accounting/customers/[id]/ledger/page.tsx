import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingCustomerLedgerView } from '@/components/accounting/AccountingCustomerLedgerView';

type Props = { params: Promise<{ id: string }> };

export default async function AccountingCustomerLedgerPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={10} cols={8} />}>
      <AccountingCustomerLedgerView contactId={id} />
    </Suspense>
  );
}
