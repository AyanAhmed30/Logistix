import { Suspense } from 'react';
import { AccountingFormSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingBillFormView } from '@/components/accounting/AccountingBillFormView';

type Props = { params: Promise<{ id: string }> };

export default async function AccountingBillDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingFormSkeleton />}>
      <AccountingBillFormView billId={id} />
    </Suspense>
  );
}
