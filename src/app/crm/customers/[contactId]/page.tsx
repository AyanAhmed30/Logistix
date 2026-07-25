import { redirect } from 'next/navigation';
import { requireCrmPageAccess } from '@/lib/crm-page-access';
import { getCrmCustomerById } from '@/app/actions/crm/customers';
import { CrmCustomerDetailClient } from '@/components/crm/CrmCustomerDetailClient';

export default async function CrmCustomerDetailPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  await requireCrmPageAccess('crm-customers');

  const { contactId } = await params;
  const result = await getCrmCustomerById(contactId);
  if ('error' in result && result.error) {
    redirect('/crm/customers');
  }

  return <CrmCustomerDetailClient contactId={contactId} />;
}
