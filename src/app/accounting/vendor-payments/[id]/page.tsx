import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingVendorPaymentDetailView } from '@/components/accounting/AccountingVendorPaymentDetailView';

type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={6} cols={4} />}>
      <AccountingVendorPaymentDetailView paymentId={id} />
    </Suspense>
  );
}
