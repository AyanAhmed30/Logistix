"use client";

import { useRouter } from "next/navigation";
import { ContactFormView } from "@/components/admin/contacts/ContactFormView";

/** New/edit vendor = existing Contacts form (Mark as Vendor). */
export function AccountingVendorFormClient({
  contactId,
}: {
  contactId: string | null;
}) {
  const router = useRouter();

  return (
    <ContactFormView
      contactId={contactId}
      readOnly={false}
      backLabel="Vendors"
      onBack={() => router.push("/accounting/vendors")}
      onSaved={(id) => {
        router.push(`/accounting/vendors/${id}`);
      }}
    />
  );
}
