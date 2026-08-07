import { Suspense } from 'react';
import { AccountingJournalFormView } from '@/components/accounting/AccountingJournalFormView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

type Props = { params: Promise<{ id: string }> };

export default async function AccountingJournalDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={2} />}>
      <AccountingJournalFormView journalId={id} />
    </Suspense>
  );
}
