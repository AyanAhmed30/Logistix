import { requireCrmPageAccess } from '@/lib/crm-page-access';
import { CrmCustomerFormClient } from '@/components/crm/CrmCustomerFormClient';

export default async function CrmNewCustomerPage() {
  await requireCrmPageAccess('crm-customers');
  return <CrmCustomerFormClient contactId={null} />;
}
