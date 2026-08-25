"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createManualAccountingInvoice } from "@/app/actions/accounting/invoices";
import { AccountingFormSkeleton } from "@/components/accounting/AccountingSkeleton";
import { useAdminOrganizationOptional } from "@/contexts/AdminOrganizationContext";

/**
 * Odoo-style New Invoice: create a Draft, then open the existing form.
 */
export default function NewAccountingInvoicePage() {
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
        toast.info("Select a specific organization to create invoices.");
        router.replace("/accounting/invoices");
      }
      return;
    }
    if (started.current) return;
    started.current = true;

    void (async () => {
      try {
        const res = await createManualAccountingInvoice();
        if ("error" in res && res.error) {
          started.current = false;
          setError(res.error);
          toast.error(res.error);
          return;
        }
        if ("invoiceId" in res && res.invoiceId) {
          router.replace(`/accounting/invoices/${res.invoiceId}`);
        }
      } catch (err) {
        started.current = false;
        const message =
          err instanceof Error ? err.message : "Failed to create invoice";
        setError(message);
        toast.error(message);
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
          onClick={() => router.push("/accounting/invoices")}
        >
          Back to Customer Invoices
        </button>
      </div>
    );
  }

  return <AccountingFormSkeleton />;
}
