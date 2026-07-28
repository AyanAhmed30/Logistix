import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingCustomerTransactionsView } from '@/components/accounting/AccountingCustomerTransactionsView';

type Props = { params: Promise<{ id: string }> };

export default async function AccountingCustomerTransactionsPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={5} />}>
      <AccountingCustomerTransactionsView contactId={id} />
    </Suspense>
  );
}
