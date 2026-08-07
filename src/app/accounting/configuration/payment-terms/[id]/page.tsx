import { Suspense } from 'react';
import { AccountingPaymentTermFormView } from '@/components/accounting/AccountingPaymentTermFormView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

type Props = { params: Promise<{ id: string }> };

export default async function AccountingPaymentTermDetailPage({
  params,
}: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={2} />}>
      <AccountingPaymentTermFormView termId={id} />
    </Suspense>
  );
}
