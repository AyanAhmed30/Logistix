"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createManualAccountingInvoice } from "@/app/actions/accounting/invoices";
import { AccountingFormSkeleton } from "@/components/accounting/AccountingSkeleton";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";

/**
 * Odoo-style New Invoice: create a Draft, then open the existing form.
 */
export default function NewAccountingInvoicePage() {
  const router = useRouter();
  const { isAdminContext } = useAdminOrganization();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      if (isAdminContext) {
        toast.info("Select a specific organization to create invoices.");
        router.replace("/accounting/invoices");
        return;
      }
      const res = await createManualAccountingInvoice();
      if ("error" in res && res.error) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      if ("invoiceId" in res && res.invoiceId) {
        toast.success("Draft invoice created");
        router.replace(`/accounting/invoices/${res.invoiceId}`);
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
          onClick={() => router.push("/accounting/invoices")}
        >
          Back to Customer Invoices
        </button>
      </div>
    );
  }

  return <AccountingFormSkeleton />;
}
