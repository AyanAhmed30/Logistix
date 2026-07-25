import { requireSalesPageAccess } from '@/lib/sales-page-access';
import { SalesCustomerFormClient } from '@/components/sales/SalesCustomerFormClient';

export default async function SalesNewCustomerPage() {
  await requireSalesPageAccess('customers');
  return <SalesCustomerFormClient contactId={null} />;
}
