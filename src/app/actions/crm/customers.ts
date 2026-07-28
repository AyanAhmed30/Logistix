'use server';

import { requireAnyChildModule, isAccessDenied } from '@/lib/auth/require-access';
import type { ContactWithRelations } from '@/app/actions/contacts';

/**
 * CRM Customers — reuses the main Contacts list API so CRM and Admin stay in sync.
 */
export async function getCrmCustomers(search?: string) {
  try {
    const auth = await requireAnyChildModule(['crm-customers']);
    if (isAccessDenied(auth)) return { error: auth.error };

    const { getContacts } = await import('@/app/actions/contacts');
    const result = await getContacts(search);
    if ('error' in result && result.error) return { error: result.error };

    return { customers: (result.contacts ?? []) as ContactWithRelations[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load CRM customers' };
  }
}

/** Search customers for the CRM global search bar. */
export async function searchCrmCustomers(query: string) {
  return getCrmCustomers(query);
}

export async function getCrmCustomerById(contactId: string) {
  try {
    const auth = await requireAnyChildModule(['crm-customers']);
    if (isAccessDenied(auth)) return { error: auth.error };

    const { getContactById } = await import('@/app/actions/contacts');
    const result = await getContactById(contactId);
    if ('error' in result && result.error) return { error: result.error };
    if (!('contact' in result) || !result.contact) return { error: 'Contact not found.' };

    return { contact: result.contact };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load customer' };
  }
}
