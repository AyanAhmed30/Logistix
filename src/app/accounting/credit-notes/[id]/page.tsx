import { Suspense } from 'react';
import { AccountingFormSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingCreditNoteFormView } from '@/components/accounting/AccountingCreditNoteFormView';

type Props = { params: Promise<{ id: string }> };

export default async function AccountingCreditNoteDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingFormSkeleton />}>
      <AccountingCreditNoteFormView creditNoteId={id} />
    </Suspense>
  );
}
