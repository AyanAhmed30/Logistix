import { Suspense } from 'react';
import { AccountingTaxReturnFormView } from '@/components/accounting/AccountingTaxReturnFormView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

type Props = { params: Promise<{ id: string }> };

export default async function AccountingTaxReturnDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={4} />}>
      <AccountingTaxReturnFormView returnId={id} />
    </Suspense>
  );
}
