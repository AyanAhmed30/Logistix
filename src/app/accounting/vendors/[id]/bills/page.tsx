import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingVendorBillsListView } from '@/components/accounting/AccountingVendorBillsListView';

type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={6} cols={5} />}>
      <AccountingVendorBillsListView contactId={id} />
    </Suspense>
  );
}
