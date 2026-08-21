"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  getAccountingJournalAuditReport,
  type JournalAuditReport,
} from "@/app/actions/accounting/review";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAccountingShell } from "@/components/accounting/AccountingShell";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import {
  ReviewCalendarIcon,
  ReviewFilterChip,
  ReviewReportCard,
  ReviewReportToolbar,
  ReviewSlidersIcon,
  formatReviewMoney,
} from "@/components/accounting/AccountingReviewOdooPanels";

export function AccountingJournalAuditView() {
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const { activeFilterId } = useAccountingShell();
  const [report, setReport] = useState<JournalAuditReport | null>(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [yearOpen, setYearOpen] = useState(false);
  const postedOnly = activeFilterId !== "draft" && activeFilterId !== "all";

  const load = useCallback(() => {
    if (isAdminContext) {
      setReport(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingJournalAuditReport({
        year,
        postedOnly: activeFilterId === "posted" || activeFilterId === "all" ? true : postedOnly,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setReport(null);
      } else if ("report" in res && res.report) {
        setReport(res.report);
      }
      setLoading(false);
    });
  }, [year, activeFilterId, postedOnly, isAdminContext]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  const currencyLabel =
    report?.currency === "PKR" || !report?.currency
      ? "In .Rs."
      : `In ${report.currency}`;

  return (
    <div className="-mx-1 sm:-mx-2">
      <ReviewReportToolbar
        title="Journal Audit"
        onPrint={() => window.print()}
        filters={
          <>
            <div className="relative">
              <ReviewFilterChip
                icon={<ReviewCalendarIcon />}
                onClick={() => setYearOpen((v) => !v)}
              >
                {year}
              </ReviewFilterChip>
              {yearOpen ? (
                <div className="absolute right-0 top-full mt-1 z-20 rounded-md border border-slate-200 bg-white p-2 shadow-md">
                  <input
                    type="number"
                    min={2000}
                    max={2100}
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value) || year)}
                    className="h-8 w-24 rounded border border-slate-200 px-2 text-sm"
                  />
                  <button
                    type="button"
                    className="mt-2 block w-full text-xs text-[#017e84] font-medium"
                    onClick={() => setYearOpen(false)}
                  >
                    Apply
                  </button>
                </div>
              ) : null}
            </div>
            <ReviewFilterChip icon={<ReviewSlidersIcon />}>
              {activeFilterId === "draft" ? "Draft Entries" : "Posted Entries"}
            </ReviewFilterChip>
            <ReviewFilterChip>{currencyLabel}</ReviewFilterChip>
          </>
        }
      />

      {loading || isPending ? (
        <div className="mx-auto max-w-4xl mt-4">
          <AccountingTableSkeleton rows={8} cols={5} />
        </div>
      ) : (
        <ReviewReportCard>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left font-medium text-xs text-slate-500 py-2 px-4 w-[40%]" />
                  <th className="text-right font-medium text-xs text-slate-500 py-2 px-3">
                    Documents
                  </th>
                  <th className="text-right font-medium text-xs text-slate-500 py-2 px-3">
                    To Review
                  </th>
                  <th className="text-right font-medium text-xs text-slate-500 py-2 px-3">
                    Debit
                  </th>
                  <th className="text-right font-medium text-xs text-slate-500 py-2 px-3">
                    Credit
                  </th>
                  <th className="text-right font-medium text-xs text-slate-500 py-2 px-3">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-slate-200/90 border-y border-slate-300/80">
                  <td className="py-2.5 px-4 text-xs sm:text-sm font-bold uppercase tracking-wide text-slate-800">
                    Name
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-sm font-bold text-slate-800">
                    {report?.totals.documents ?? 0}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-sm font-bold text-slate-800">
                    {report?.totals.to_review ?? 0}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-sm font-bold text-slate-800">
                    {formatReviewMoney(report?.totals.total_debit ?? 0)}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-sm font-bold text-slate-800">
                    {formatReviewMoney(report?.totals.total_credit ?? 0)}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-sm font-bold text-slate-800">
                    {formatReviewMoney(report?.totals.balance ?? 0)}
                  </td>
                </tr>
                {(report?.rows || []).map((row) => (
                  <tr
                    key={row.journal_id}
                    className="border-b border-slate-100 hover:bg-slate-50/80"
                  >
                    <td className="py-2 px-4 pl-8 text-slate-700">
                      {row.journal_code
                        ? `${row.journal_code} — ${row.journal_name}`
                        : row.journal_name}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-700">
                      {row.documents}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-700">
                      {row.to_review || ""}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-700">
                      {formatReviewMoney(row.total_debit)}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-700">
                      {formatReviewMoney(row.total_credit)}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-800 font-medium bg-slate-50/90">
                      {formatReviewMoney(row.balance)}
                    </td>
                  </tr>
                ))}
                {!report?.rows.length ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 text-center text-sm text-slate-400"
                    >
                      No journal entries for {year}.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </ReviewReportCard>
      )}
    </div>
  );
}
