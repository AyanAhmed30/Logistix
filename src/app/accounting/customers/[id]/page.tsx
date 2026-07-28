import { Suspense } from 'react';
import { AccountingFormSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingCustomerHub } from '@/components/accounting/AccountingCustomerHub';

type Props = { params: Promise<{ id: string }> };

export default async function AccountingCustomerDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingFormSkeleton />}>
      <AccountingCustomerHub contactId={id} />
    </Suspense>
  );
}
