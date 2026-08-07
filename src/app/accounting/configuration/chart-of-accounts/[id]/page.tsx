import { Suspense } from 'react';
import { AccountingChartOfAccountFormView } from '@/components/accounting/AccountingChartOfAccountFormView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

type Props = { params: Promise<{ id: string }> };

export default async function AccountingChartOfAccountDetailPage({
  params,
}: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={2} />}>
      <AccountingChartOfAccountFormView accountId={id} />
    </Suspense>
  );
}
