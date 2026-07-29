"use client";

import { useRouter } from "next/navigation";
import { ContactFormView } from "@/components/admin/contacts/ContactFormView";

/** New customer = existing Contacts form (single source of truth). */
export function AccountingCustomerFormClient({
  contactId,
}: {
  contactId: string | null;
}) {
  const router = useRouter();

  return (
    <ContactFormView
      contactId={contactId}
      readOnly={false}
      backLabel="Customers"
      onBack={() => router.push("/accounting/customers")}
      onSaved={(id) => {
        router.push(`/accounting/customers/${id}`);
      }}
    />
  );
}
