import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingPaymentDetailView } from '@/components/accounting/AccountingPaymentDetailView';

type Props = { params: Promise<{ id: string }> };

export default async function AccountingPaymentDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={6} cols={4} />}>
      <AccountingPaymentDetailView paymentId={id} />
    </Suspense>
  );
}
