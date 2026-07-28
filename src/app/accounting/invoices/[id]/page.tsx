import { Suspense } from 'react';
import { AccountingFormSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingInvoiceFormView } from '@/components/accounting/AccountingInvoiceFormView';

type Props = { params: Promise<{ id: string }> };

export default async function AccountingInvoiceDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingFormSkeleton />}>
      <AccountingInvoiceFormView invoiceId={id} />
    </Suspense>
  );
}
