import { Suspense } from 'react';
import { AccountingLoanFormView } from '@/components/accounting/AccountingLoanFormView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

type Props = { params: Promise<{ id: string }> };

export default async function AccountingLoanDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={4} />}>
      <AccountingLoanFormView loanId={id} />
    </Suspense>
  );
}
