import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingVendorTimelineView } from '@/components/accounting/AccountingVendorTimelineView';

type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={6} cols={3} />}>
      <AccountingVendorTimelineView contactId={id} />
    </Suspense>
  );
}
