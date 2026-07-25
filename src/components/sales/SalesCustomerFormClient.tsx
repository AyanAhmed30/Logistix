"use client";

import { useRouter } from "next/navigation";
import { ContactFormView } from "@/components/admin/contacts/ContactFormView";

type Props = {
  contactId: string | null;
};

/** Contacts form inside Sales Customers — same Contacts data, Sales layout. */
export function SalesCustomerFormClient({ contactId }: Props) {
  const router = useRouter();

  return (
    <ContactFormView
      contactId={contactId}
      readOnly={false}
      backLabel="Customers"
      onBack={() => router.push("/sales/customers")}
      onSaved={(id) => {
        router.push(`/sales/customers/${id}`);
        router.refresh();
      }}
    />
  );
}
