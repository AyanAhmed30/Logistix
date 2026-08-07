import { Suspense } from 'react';
import { AccountingTaxFormView } from '@/components/accounting/AccountingTaxFormView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

type Props = { params: Promise<{ id: string }> };

export default async function AccountingTaxDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={2} />}>
      <AccountingTaxFormView taxId={id} />
    </Suspense>
  );
}
