"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createManualAccountingCreditNote } from "@/app/actions/accounting/credit-notes";
import { AccountingFormSkeleton } from "@/components/accounting/AccountingSkeleton";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";

/**
 * Odoo-style New Credit Note: create a Draft, then open the credit note form.
 */
export default function NewAccountingCreditNotePage() {
  const router = useRouter();
  const { isAdminContext } = useAdminOrganization();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      if (isAdminContext) {
        toast.info("Select a specific organization to create credit notes.");
        router.replace("/accounting/credit-notes");
        return;
      }
      const res = await createManualAccountingCreditNote();
      if ("error" in res && res.error) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      if ("creditNoteId" in res && res.creditNoteId) {
        router.replace(`/accounting/credit-notes/${res.creditNoteId}`);
      }
    })();
  }, [isAdminContext, router]);

  if (error) {
    return (
      <div className="bg-white border border-slate-200 rounded-sm p-6 space-y-3">
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          className="text-sm text-[#017e84] hover:underline"
          onClick={() => router.push("/accounting/credit-notes")}
        >
          Back to Credit Notes
        </button>
      </div>
    );
  }

  return <AccountingFormSkeleton />;
}
