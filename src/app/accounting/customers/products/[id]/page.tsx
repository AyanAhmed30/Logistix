import { Suspense } from 'react';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingProductFormView } from '@/components/accounting/AccountingProductFormView';

type Props = { params: Promise<{ id: string }> };

export default async function AccountingProductDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={6} cols={4} />}>
      <AccountingProductFormView productId={id} />
    </Suspense>
  );
}
