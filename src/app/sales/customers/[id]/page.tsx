import { requireSalesPageAccess } from '@/lib/sales-page-access';
import { SalesCustomerFormClient } from '@/components/sales/SalesCustomerFormClient';

type Props = { params: Promise<{ id: string }> };

export default async function SalesCustomerDetailPage({ params }: Props) {
  await requireSalesPageAccess('customers');
  const { id } = await params;
  return <SalesCustomerFormClient contactId={id} />;
}
