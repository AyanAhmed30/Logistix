import { Suspense } from 'react';
import { AccountingFormSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingVendorRefundFormView } from '@/components/accounting/AccountingVendorRefundFormView';

type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingFormSkeleton />}>
      <AccountingVendorRefundFormView refundId={id} />
    </Suspense>
  );
}
