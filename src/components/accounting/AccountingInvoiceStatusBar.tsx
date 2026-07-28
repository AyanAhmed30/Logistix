"use client";

import { useMemo } from "react";
import type { AccountingInvoiceStatus } from "@/app/actions/accounting/invoices";
import { paymentStateLabel } from "@/lib/accounting-payments";
import { cn } from "@/lib/utils";

const STEPS: { id: AccountingInvoiceStatus; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "posted", label: "Posted" },
  { id: "paid", label: "Paid" },
];

type Props = {
  status: AccountingInvoiceStatus;
  paymentState?: string | null;
  className?: string;
};

function stepIndex(status: AccountingInvoiceStatus): number {
  if (status === "cancelled") return -1;
  if (status === "draft") return 0;
  if (status === "posted") return 1;
  if (status === "paid") return 2;
  return 0;
}

export function AccountingInvoiceStatusBar({
  status,
  paymentState,
  className,
}: Props) {
  const activeIndex = useMemo(() => stepIndex(status), [status]);
  const payBadge =
    status === "posted" || status === "paid"
      ? paymentStateLabel(paymentState || (status === "paid" ? "paid" : "not_paid"))
      : null;

  if (status === "cancelled") {
    return (
      <div className={cn("flex items-center shrink-0", className)}>
        <span className="inline-flex h-7 items-center rounded-sm border border-slate-300 bg-slate-100 px-2.5 text-xs font-semibold text-slate-700">
          Cancelled
        </span>
      </div>
    );
  }

  if (status === "paid") {
    return (
      <div className={cn("flex items-center shrink-0 gap-2", className)}>
        <div className="flex items-center overflow-x-auto" role="list" aria-label="Invoice status">
          {STEPS.map((step, index) => {
            const active = index === 2;
            const done = index < 2;
            const isLast = index === STEPS.length - 1;
            return (
              <div key={step.id} className="flex items-center" role="listitem">
                <span
                  className={cn(
                    "relative inline-flex h-7 items-center px-3 text-[11px] sm:text-xs font-semibold whitespace-nowrap border",
                    index === 0 ? "rounded-l-sm" : "border-l-0",
                    isLast ? "rounded-r-sm" : "",
                    active
                      ? "bg-[#017e84] text-white border-[#017e84]"
                      : done
                        ? "bg-[#e6f4f5] text-[#017e84] border-[#017e84]/40"
                        : "bg-white text-slate-500 border-slate-200"
                  )}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
        <span className="inline-flex h-7 items-center rounded-sm border border-emerald-300 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800">
          Paid
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
                "relative inline-flex h-7 items-center px-3 text-[11px] sm:text-xs font-semibold whitespace-nowrap border",
                index === 0 ? "rounded-l-sm" : "border-l-0",
                isLast ? "rounded-r-sm" : "",
                active
                  ? "bg-[#017e84] text-white border-[#017e84]"
                  : done
                    ? "bg-[#e6f4f5] text-[#017e84] border-[#017e84]/40"
                    : "bg-white text-slate-500 border-slate-200"
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
      {payBadge ? (
        <span
          className={cn(
            "ml-2 inline-flex h-7 items-center rounded-sm border px-2.5 text-xs font-semibold",
            paymentState === "overdue"
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : paymentState === "partial"
                ? "border-sky-300 bg-sky-50 text-sky-900"
                : "border-slate-200 bg-slate-50 text-slate-700"
          )}
        >
          {payBadge}
        </span>
      ) : null}
    </div>
  );
}
