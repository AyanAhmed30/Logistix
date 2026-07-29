import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingVendorStatementView } from '@/components/accounting/AccountingVendorStatementView';

type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={5} />}>
      <AccountingVendorStatementView contactId={id} />
    </Suspense>
  );
}
