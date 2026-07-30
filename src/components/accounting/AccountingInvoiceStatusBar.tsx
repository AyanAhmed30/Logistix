"use client";

import { useMemo } from "react";
import type { AccountingInvoiceStatus } from "@/app/actions/accounting/invoices";
import { cn } from "@/lib/utils";

/** Odoo-style: Draft → Posted → Paid — only current step is active. */
const STEPS: { id: "draft" | "posted" | "paid"; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "posted", label: "Posted" },
  { id: "paid", label: "Paid" },
];

type Props = {
  status: AccountingInvoiceStatus;
  paymentState?: string | null;
  className?: string;
};

function resolveActiveStep(
  status: AccountingInvoiceStatus,
  paymentState?: string | null
): number {
  if (status === "cancelled") return -1;
  // Draft is always step 0 — never treat empty/zero drafts as Paid
  if (status === "draft") return 0;
  if (status === "paid" || paymentState === "paid") return 2;
  if (status === "posted") return 1;
  return 0;
}

export function AccountingInvoiceStatusBar({
  status,
  paymentState,
  className,
}: Props) {
  const activeIndex = useMemo(
    () => resolveActiveStep(status, paymentState),
    [status, paymentState]
  );

  if (status === "cancelled") {
    return (
      <div className={cn("flex items-center shrink-0", className)}>
        <span className="inline-flex h-7 items-center rounded-sm border border-slate-300 bg-slate-100 px-2.5 text-xs font-semibold text-slate-700">
          Cancelled
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn("flex items-center shrink-0 overflow-x-auto", className)}
      role="list"
      aria-label="Invoice status"
    >
      {STEPS.map((step, index) => {
        const active = index === activeIndex;
        const done = index < activeIndex;
        const isLast = index === STEPS.length - 1;
        return (
          <div key={step.id} className="flex items-center" role="listitem">
            <span
              className={cn(
                "relative inline-flex h-7 items-center px-3.5 text-xs font-semibold whitespace-nowrap border",
                index === 0 ? "rounded-l-sm" : "border-l-0",
                isLast ? "rounded-r-sm" : "",
                active
                  ? "bg-[#017e84] text-white border-[#017e84] z-[2]"
                  : done
                    ? "bg-[#e6f4f5] text-[#017e84] border-[#017e84]/40"
                    : "bg-white text-slate-400 border-slate-200"
              )}
            >
              {step.label}
              {!isLast ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute -right-[7px] top-1/2 z-[1] h-0 w-0 -translate-y-1/2 border-y-[14px] border-y-transparent border-l-[7px]",
                    active
                      ? "border-l-[#017e84]"
                      : done
                        ? "border-l-[#e6f4f5]"
                        : "border-l-white"
                  )}
                />
              ) : null}
              {!isLast ? (
                <span
                  aria-hidden
                  className="absolute -right-[8px] top-1/2 z-[0] h-0 w-0 -translate-y-1/2 border-y-[15px] border-y-transparent border-l-[8px] border-l-slate-200"
                />
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
