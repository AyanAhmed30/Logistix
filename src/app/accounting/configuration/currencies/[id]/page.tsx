import { Suspense } from 'react';
import { AccountingCurrencyFormView } from '@/components/accounting/AccountingCurrencyFormView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

type Props = { params: Promise<{ id: string }> };

export default async function AccountingCurrencyDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={2} />}>
      <AccountingCurrencyFormView currencyId={id} />
    </Suspense>
  );
}
