"use client";

import { useMemo } from "react";
import type { SalesQuotationUiStatus } from "@/lib/sales-navigation";
import { cn } from "@/lib/utils";

/** Odoo Sales Order statusbar: Quotation → Quotation Sent → Sales Order */
const ODOO_STEPS: { id: SalesQuotationUiStatus; label: string }[] = [
  { id: "draft", label: "Quotation" },
  { id: "sent", label: "Quotation Sent" },
  { id: "confirmed", label: "Sales Order" },
];

type Props = {
  statusUi: SalesQuotationUiStatus;
  isLocked?: boolean;
  mode?: "quotation" | "order";
  deliveryStatus?: "waiting" | "ready" | "delivered";
  className?: string;
};

function mapToOdooStep(statusUi: SalesQuotationUiStatus): number {
  if (statusUi === "cancelled" || statusUi === "expired") return -1;
  if (statusUi === "draft") return 0;
  if (statusUi === "sent" || statusUi === "review") return 1;
  if (statusUi === "confirmed") return 2;
  return 0;
}

/** Compact Odoo-style statusbar for the right side of the action row. */
export function SalesQuotationStatusBar({
  statusUi,
  isLocked,
  className,
}: Props) {
  const activeIndex = useMemo(() => mapToOdooStep(statusUi), [statusUi]);

  if (statusUi === "cancelled") {
    return (
      <div className={cn("flex items-center shrink-0", className)}>
        <span className="inline-flex h-7 items-center rounded-sm border border-slate-300 bg-slate-100 px-2.5 text-xs font-semibold text-slate-700">
          Cancelled
        </span>
      </div>
    );
  }

  if (statusUi === "expired") {
    return (
      <div className={cn("flex items-center shrink-0", className)}>
        <span className="inline-flex h-7 items-center rounded-sm border border-amber-300 bg-amber-50 px-2.5 text-xs font-semibold text-amber-900">
          Expired
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn("flex items-center shrink-0 overflow-x-auto", className)}
      role="list"
      aria-label="Document status"
    >
      {ODOO_STEPS.map((step, index) => {
        const active = index === activeIndex;
        const done = index < activeIndex;
        const isLast = index === ODOO_STEPS.length - 1;
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
      {isLocked ? (
        <span className="ml-2 inline-flex h-7 items-center rounded-sm border border-amber-300 bg-amber-50 px-2 text-[11px] font-semibold text-amber-900">
          Locked
        </span>
      ) : null}
    </div>
  );
}
