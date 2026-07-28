"use client";

import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { ContactFormView } from "@/components/admin/contacts/ContactFormView";

type Props = {
  contactId: string | null;
};

/** Contacts form inside Sales Customers — same Contacts data, Sales layout. */
export function SalesCustomerFormClient({ contactId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRelatedPanel =
    searchParams.get("related") === "documents" ? ("documents" as const) : null;

  return (
    <ContactFormView
      contactId={contactId}
      readOnly={false}
      backLabel="Customers"
      initialRelatedPanel={initialRelatedPanel}
      documentsBasePath={contactId ? `/sales/customers/${contactId}` : undefined}
      onBack={() => router.push("/sales/customers")}
      onSaved={(id) => {
        router.push(`/sales/customers/${id}`);
      }}
    />
  );
}
