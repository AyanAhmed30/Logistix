import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingCustomerInvoicesView } from '@/components/accounting/AccountingCustomerInvoicesView';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string }>;
};

export default async function AccountingCustomerInvoicesPage({
  params,
  searchParams,
}: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const filter =
    sp.filter === 'paid' || sp.filter === 'overdue' || sp.filter === 'outstanding'
      ? sp.filter
      : 'outstanding';

  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={7} />}>
      <AccountingCustomerInvoicesView contactId={id} initialFilter={filter} />
    </Suspense>
  );
}
