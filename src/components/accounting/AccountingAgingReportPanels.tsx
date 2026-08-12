"use client";

/**
 * Phase 3 — Aged Receivable / Aged Payable tables (Odoo structure, #017e84 theme).
 */

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AgingReport } from "@/lib/accounting/financial-reporting/aging";

function formatAmt(n: number) {
  const isZero = Math.abs(n) < 0.004;
  return (
    <span
      className={`tabular-nums ${isZero ? "text-slate-300" : "text-slate-800"}`}
    >
      {new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n || 0)}
    </span>
  );
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

function FragmentGroup({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function AgingReportTable({
  report,
  rootLabel,
}: {
  report: AgingReport;
  rootLabel: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = { __root: true };
    for (const p of report.partners) init[p.partner_key] = true;
    return init;
  });

  const toggle = (key: string) =>
    setOpen((s) => ({ ...s, [key]: !s[key] }));

  const bucketCols = report.buckets;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-sm border-collapse">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500">
            <th className="text-left font-medium py-2 px-3 min-w-[220px]" />
            <th className="text-left font-medium py-2 px-3 whitespace-nowrap">
              Invoice Date
            </th>
            {bucketCols.map((b) => (
              <th
                key={b.id}
                className={`text-right font-medium py-2 px-3 whitespace-nowrap ${
                  b.id === "not_due" ? "bg-slate-50" : ""
                }`}
              >
                {b.label}
              </th>
            ))}
            <th className="text-right font-medium py-2 px-3 bg-slate-50">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Root summary */}
          <tr className="border-b border-slate-200 bg-slate-50/80 font-semibold">
            <td className="py-2.5 px-3" colSpan={2}>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-slate-800"
                onClick={() => toggle("__root")}
              >
                {open.__root ? (
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                )}
                {rootLabel}
              </button>
            </td>
            {bucketCols.map((b) => (
              <td
                key={b.id}
                className={`py-2.5 px-3 text-right ${
                  b.id === "not_due" ? "bg-white/70" : ""
                }`}
              >
                {formatAmt(report.totals[b.id])}
              </td>
            ))}
            <td className="py-2.5 px-3 text-right bg-white/70">
              {formatAmt(report.grandTotal)}
            </td>
          </tr>

          {open.__root
            ? report.partners.map((p) => {
                const isOpen = !!open[p.partner_key];
                return (
                  <FragmentGroup key={p.partner_key}>
                    <tr className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="py-2 px-3 pl-8" colSpan={2}>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 font-medium text-slate-800"
                          onClick={() => toggle(p.partner_key)}
                        >
                          {isOpen ? (
                            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                          )}
                          {p.partner_name}
                          <span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">
                            Partner
                          </span>
                          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">
                            Statement
                          </span>
                        </button>
                      </td>
                      {bucketCols.map((b) => (
                        <td
                          key={b.id}
                          className={`py-2 px-3 text-right ${
                            b.id === "not_due" ? "bg-slate-50/80" : ""
                          }`}
                        >
                          {formatAmt(p.amounts[b.id])}
                        </td>
                      ))}
                      <td className="py-2 px-3 text-right bg-slate-50/80 font-medium">
                        {formatAmt(p.total)}
                      </td>
                    </tr>
                    {isOpen
                      ? p.lines.map((l) => (
                          <tr
                            key={l.key}
                            className="border-b border-slate-50 text-slate-700"
                          >
                            <td className="py-1.5 pl-14 pr-3 text-[#017e84]">
                              {l.reference || "—"}
                            </td>
                            <td className="py-1.5 px-3 whitespace-nowrap">
                              {formatDate(l.document_date)}
                            </td>
                            {bucketCols.map((b) => (
                              <td
                                key={b.id}
                                className={`py-1.5 px-3 text-right ${
                                  b.id === "not_due" ? "bg-slate-50/50" : ""
                                }`}
                              >
                                {formatAmt(l.amounts[b.id])}
                              </td>
                            ))}
                            <td className="py-1.5 px-3 text-right bg-slate-50/50">
                              {formatAmt(l.outstanding)}
                            </td>
                          </tr>
                        ))
                      : null}
                  </FragmentGroup>
                );
              })
            : null}

          {!report.partners.length ? (
            <tr>
              <td
                colSpan={3 + bucketCols.length}
                className="py-10 text-center text-sm text-slate-500"
              >
                No outstanding {report.side === "receivable" ? "receivables" : "payables"}{" "}
                as of {formatDate(report.asOf)}.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
