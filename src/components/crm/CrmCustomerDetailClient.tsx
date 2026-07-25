"use client";

import { CrmCustomerFormClient } from "@/components/crm/CrmCustomerFormClient";

type Props = {
  contactId: string;
};

export function CrmCustomerDetailClient({ contactId }: Props) {
  return <CrmCustomerFormClient contactId={contactId} />;
}
