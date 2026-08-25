"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createManualAccountingCreditNote } from "@/app/actions/accounting/credit-notes";
import { AccountingFormSkeleton } from "@/components/accounting/AccountingSkeleton";
import { useAdminOrganizationOptional } from "@/contexts/AdminOrganizationContext";

/**
 * Odoo-style New Credit Note: create a Draft, then open the credit note form.
 */
export default function NewAccountingCreditNotePage() {
  const router = useRouter();
  const org = useAdminOrganizationOptional();
  const isAdminContext = org?.isAdminContext ?? false;
  const isSwitching = org?.isSwitching ?? true;
  const organizationId = org?.organizationId ?? null;
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (isSwitching) return;
    if (isAdminContext || !organizationId) {
      if (!isSwitching && isAdminContext) {
        toast.info("Select a specific organization to create credit notes.");
        router.replace("/accounting/credit-notes");
      }
      return;
    }
    if (started.current) return;
    started.current = true;

    void (async () => {
      const res = await createManualAccountingCreditNote();
      if ("error" in res && res.error) {
        started.current = false;
        setError(res.error);
        toast.error(res.error);
        return;
      }
      if ("creditNoteId" in res && res.creditNoteId) {
        router.replace(`/accounting/credit-notes/${res.creditNoteId}`);
      }
    })();
  }, [isAdminContext, isSwitching, organizationId, router]);

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
