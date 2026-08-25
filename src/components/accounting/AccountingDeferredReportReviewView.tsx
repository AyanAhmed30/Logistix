"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
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
  ReviewUnsupportedBanner,
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
  }, [kind, month, isAdminContext]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  const hasPostedActivity = Boolean(report?.has_journal_activity);
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
            <ReviewFilterChip>{currencyLabel}</ReviewFilterChip>
          </>
        }
      />

      <ReviewUnsupportedBanner
        title="Recognition engine is not implemented"
        body={
          kind === "deferred_revenue"
            ? "Invoices do not create deferral schedules, and nothing posts monthly recognition journal entries. This screen never invents recognition amounts. If a deferred-revenue account has posted journal items, those ledger facts are shown below."
            : "Vendor bills do not create prepaid/expense schedules, and nothing posts monthly recognition journal entries. This screen never invents recognition amounts. If a prepayments account has posted journal items, those ledger facts are shown below."
        }
      />

      {loading || isPending ? (
        <div className="mx-auto max-w-5xl mt-4">
          <AccountingTableSkeleton rows={8} cols={6} />
        </div>
      ) : !hasPostedActivity ? (
        <ReviewEmptyState
          title="No posted deferral activity"
          subtitle="There are no posted journal items on deferral accounts for this period. Automatic schedules are not supported yet."
        />
      ) : (
        <div className="space-y-4 mx-auto max-w-5xl mt-4 mb-8">
          {report && report.account_rows.length > 0 ? (
            <ReviewReportCard>
              <div className="px-4 py-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-800">
                  Posted journal activity
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Net posted debit/credit on{" "}
                  {kind === "deferred_revenue"
                    ? "Deferred Revenue"
                    : "Prepayments"}{" "}
                  accounts — not a recognition schedule
                </p>
              </div>
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
                        className="border-b border-slate-100 hover:bg-slate-50/60 cursor-pointer"
                        onClick={() =>
                          router.push("/accounting/review/journal-items")
                        }
                      >
                        <td className="py-2 px-4 text-slate-800">
                          <span className="font-medium">{row.account_code}</span>
                          <span className="text-slate-500 ml-2">
                            {row.account_name}
                          </span>
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
        </div>
      )}
    </div>
  );
}
