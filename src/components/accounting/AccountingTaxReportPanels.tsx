"use client";

/**
 * Phase 4 — Tax Report (Odoo Generic Tax / Tax Return layout).
 * Sections: Sales · Purchases · Net · Tax
 */

import { Fragment } from "react";
import { MoreVertical } from "lucide-react";
import type { TaxReport } from "@/lib/accounting/financial-reporting/tax-report";

function formatAmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

export function TaxReportTable({ report }: { report: TaxReport }) {
  const sales = report.sections.find((s) => s.id === 'sales');
  const purchases = report.sections.find((s) => s.id === 'purchases');
  return (
    <div
      className="overflow-x-auto"
      data-testid="tax-report"
      data-total-net={String(report.totalNet)}
      data-total-tax={String(report.totalTax)}
      data-sales-tax={String(sales?.totalTax || 0)}
      data-purchase-tax={String(purchases?.totalTax || 0)}
    >
      <table className="w-full min-w-[480px] text-sm border-collapse">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500">
            <th className="text-left font-medium py-2 px-4 w-[55%]" />
            <th className="text-right font-medium py-2 px-4 w-[22.5%]">Net</th>
            <th className="text-right font-medium py-2 px-4 w-[22.5%]">Tax</th>
          </tr>
        </thead>
        <tbody>
          {report.sections.map((section) => (
            <Fragment key={section.id}>
              <tr className="bg-slate-200/90 border-y border-slate-300/80">
                <td className="py-2.5 px-4 text-xs sm:text-sm font-bold uppercase tracking-wide text-slate-800">
                  {section.label}
                </td>
                <td className="py-2.5 px-4 text-right tabular-nums text-sm font-bold text-slate-800">
                  {section.lines.length ? formatAmt(section.totalNet) : ""}
                </td>
                <td className="py-2.5 px-4 text-right tabular-nums text-sm font-bold text-slate-800">
                  {formatAmt(section.totalTax)}
                </td>
              </tr>
              {section.lines.map((line) => (
                <tr
                  key={line.key}
                  className="border-b border-slate-100 hover:bg-slate-50/80"
                >
                  <td className="py-2 px-4 pl-8 text-slate-700">
                    <span className="inline-flex items-center gap-1.5">
                      <span>{line.label}</span>
                      <button
                        type="button"
                        className="p-0.5 rounded text-slate-300 hover:text-slate-500"
                        aria-label="Line options"
                        title="Line options"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums text-slate-700">
                    {formatAmt(line.net)}
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums text-slate-800 bg-slate-50/90 font-medium">
                    {formatAmt(line.tax)}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
