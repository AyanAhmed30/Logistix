import { Suspense } from 'react';
import { AccountingAssetFormView } from '@/components/accounting/AccountingAssetFormView';
import { AccountingTableSkeleton } from '@/components/accounting/AccountingSkeleton';

type Props = { params: Promise<{ id: string }> };

export default async function AccountingAssetDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={4} />}>
      <AccountingAssetFormView assetId={id} />
    </Suspense>
  );
}
