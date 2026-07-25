"use client";

import { useRouter } from "next/navigation";
import { ContactFormView } from "@/components/admin/contacts/ContactFormView";

type Props = {
  contactId: string | null;
};

/** Full Contacts-module form inside CRM Customers (create + edit). */
export function CrmCustomerFormClient({ contactId }: Props) {
  const router = useRouter();

  return (
    <ContactFormView
      contactId={contactId}
      readOnly={false}
      backLabel="Customers"
      onBack={() => router.push("/crm/customers")}
      onSaved={(id) => {
        router.push(`/crm/customers/${id}`);
        router.refresh();
      }}
    />
  );
}
