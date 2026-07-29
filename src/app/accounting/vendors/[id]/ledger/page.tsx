import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingVendorLedgerView } from '@/components/accounting/AccountingVendorLedgerView';

type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={6} />}>
      <AccountingVendorLedgerView contactId={id} />
    </Suspense>
  );
}
