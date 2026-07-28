import { Suspense } from 'react';
import { AccountingFormSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingCustomerTimelineView } from '@/components/accounting/AccountingCustomerTimelineView';

type Props = { params: Promise<{ id: string }> };

export default async function AccountingCustomerTimelinePage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingFormSkeleton />}>
      <AccountingCustomerTimelineView contactId={id} />
    </Suspense>
  );
}
