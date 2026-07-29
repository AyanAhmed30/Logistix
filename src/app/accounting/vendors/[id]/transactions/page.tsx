import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingVendorTransactionsView } from '@/components/accounting/AccountingVendorTransactionsView';

type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={6} />}>
      <AccountingVendorTransactionsView contactId={id} />
    </Suspense>
  );
}
