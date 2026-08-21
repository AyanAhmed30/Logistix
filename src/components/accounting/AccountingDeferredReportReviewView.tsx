"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import {
  REVIEW_TEAL,
  ReviewCalendarIcon,
  ReviewEmptyState,
  ReviewFilterChip,
  ReviewReportCard,
  ReviewReportToolbar,
  ReviewSlidersIcon,
  formatReviewMoney,
} from "@/components/accounting/AccountingReviewOdooPanels";
import {
  getAccountingDeferredExpensesForReview,
  getAccountingDeferredRevenuesForReview,
} from "@/app/actions/accounting/review";
import type { DeferredReviewReport } from "@/lib/accounting/financial-reporting/deferred-report";
import { formatMonthYear } from "@/lib/accounting/financial-reporting/periods";

type Props = {
  kind: "deferred_revenue" | "deferred_expense";
};

export function AccountingDeferredReportReviewView({ kind }: Props) {
  const router = useRouter();
  const title =
    kind === "deferred_revenue" ? "Deferred Revenue" : "Deferred Expense";
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [report, setReport] = useState<DeferredReviewReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [monthOpen, setMonthOpen] = useState(false);

  const load = useCallback(() => {
    if (isAdminContext) {
      setReport(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    startTransition(async () => {
      const fn =
        kind === "deferred_revenue"
          ? getAccountingDeferredRevenuesForReview
          : getAccountingDeferredExpensesForReview;
      const res = await fn({ month });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setReport(null);
      } else if ("report" in res) {
        setReport(res.report ?? null);
      }
      setLoading(false);
    });
  }, [kind, month, isAdminContext, switchVersion]);

  useEffect(() => {
    load();
  }, [load]);

  const hasData = useMemo(() => {
    if (!report) return false;
    return (
      report.has_journal_activity ||
      report.has_schedules ||
      report.account_rows.length > 0
    );
  }, [report]);

  const currencyLabel =
    report?.currency === "PKR" || !report?.currency
      ? "In .Rs."
      : `In ${report.currency}`;

  return (
    <div className="-mx-1 sm:-mx-2">
      <ReviewReportToolbar
        title={title}
        onPrint={() => window.print()}
        filters={
          <>
            <div className="relative">
              <ReviewFilterChip
                icon={<ReviewCalendarIcon />}
                onClick={() => setMonthOpen((v) => !v)}
              >
                {formatMonthYear(`${month}-01`)}
              </ReviewFilterChip>
              {monthOpen ? (
                <div className="absolute right-0 top-full mt-1 z-20 rounded-md border border-slate-200 bg-white p-2 shadow-md">
                  <input
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="h-8 rounded border border-slate-200 px-2 text-sm"
                  />
                  <button
                    type="button"
                    className="mt-2 block w-full text-xs font-medium"
                    style={{ color: REVIEW_TEAL }}
                    onClick={() => setMonthOpen(false)}
                  >
                    Apply
                  </button>
                </div>
              ) : null}
            </div>
            <ReviewFilterChip>Comparison</ReviewFilterChip>
            <ReviewFilterChip icon={<ReviewSlidersIcon />}>
              Group by Account
            </ReviewFilterChip>
            <ReviewFilterChip>Options</ReviewFilterChip>
            <ReviewFilterChip>{currencyLabel}</ReviewFilterChip>
          </>
        }
      />

      {loading || isPending ? (
        <div className="mx-auto max-w-5xl mt-4">
          <AccountingTableSkeleton rows={8} cols={6} />
        </div>
      ) : !hasData ? (
        <ReviewEmptyState
          title="No data to display!"
          subtitle="There is no data to display for the given filters."
        />
      ) : (
        <div className="space-y-4 mx-auto max-w-5xl mt-4 mb-8">
          {report && report.account_rows.length > 0 ? (
            <ReviewReportCard>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left font-medium text-xs text-slate-500 py-2 px-4">
                        Account
                      </th>
                      {report.month_columns.map((col) => (
                        <th
                          key={col.key}
                          className="text-right font-medium text-xs text-slate-500 py-2 px-3"
                        >
                          {col.label}
                        </th>
                      ))}
                      <th className="text-right font-medium text-xs text-slate-500 py-2 px-3">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.account_rows.map((row) => (
                      <tr
                        key={row.account_id}
                        className="border-b border-slate-100 hover:bg-slate-50/60"
                      >
                        <td className="py-2 px-4 text-slate-800">
                          <span className="font-medium">{row.account_code}</span>
                          <span className="text-slate-500 ml-2">{row.account_name}</span>
                        </td>
                        {row.months.map((m) => (
                          <td
                            key={m.month_key}
                            className="py-2 px-3 text-right tabular-nums text-slate-700"
                          >
                            {m.amount ? formatReviewMoney(m.amount) : "—"}
                          </td>
                        ))}
                        <td className="py-2 px-3 text-right tabular-nums font-medium text-slate-800">
                          {formatReviewMoney(row.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ReviewReportCard>
          ) : null}

          {report && report.schedules.length > 0 ? (
            <ReviewReportCard>
              <div className="px-4 py-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-800">
                  Recognition Schedules
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Traceable deferral schedules linked to source documents
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="text-left py-2 px-3">Source</th>
                      <th className="text-left py-2 px-3">Partner</th>
                      <th className="text-left py-2 px-3">Product</th>
                      <th className="text-right py-2 px-3">Original</th>
                      <th className="text-right py-2 px-3">Recognized</th>
                      <th className="text-right py-2 px-3">Remaining</th>
                      <th className="text-left py-2 px-3">Next Date</th>
                      <th className="text-left py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.schedules.map((s) => (
                      <tr
                        key={s.id}
                        className="border-b border-slate-100 hover:bg-slate-50/60 cursor-pointer"
                        onClick={() => {
                          if (s.initial_journal_entry_id) {
                            router.push(
                              `/accounting/journal-entries/${s.initial_journal_entry_id}`
                            );
                          }
                        }}
                      >
                        <td className="py-2 px-3 font-medium text-slate-800">
                          {s.source_number || "—"}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {s.partner_name || "—"}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {s.product_name || "—"}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {formatReviewMoney(s.original_amount)}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {formatReviewMoney(s.recognized_amount)}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums font-medium">
                          {formatReviewMoney(s.remaining_amount)}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {s.next_recognition_date || "—"}
                        </td>
                        <td className="py-2 px-3 capitalize text-slate-600">
                          {s.status.replace(/_/g, " ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ReviewReportCard>
          ) : null}

          {report && !report.has_deferral_accounts ? (
            <p className="text-xs text-center text-slate-500 px-4">
              Configure accounts with type{" "}
              {kind === "deferred_revenue" ? "Deferred Revenue" : "Prepayments"}{" "}
              in Chart of Accounts to track deferral balances from journal entries.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
