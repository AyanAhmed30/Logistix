import { Suspense } from 'react';
import { AccountingFormSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingJournalEntryFormView } from '@/components/accounting/AccountingJournalEntryFormView';

type Props = { params: Promise<{ id: string }> };

export default async function AccountingJournalEntryDetailPage({
  params,
}: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingFormSkeleton />}>
      <AccountingJournalEntryFormView entryId={id} />
    </Suspense>
  );
}
