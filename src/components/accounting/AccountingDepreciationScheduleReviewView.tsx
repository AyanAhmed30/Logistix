"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  getAccountingDepreciationScheduleForReview,
  type ReviewDepreciationLine,
  type ReviewDepreciationTotals,
} from "@/app/actions/accounting/review";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import {
  REVIEW_TEAL,
  ReviewListToolbar,
  ReviewMeasuresBar,
  ReviewPagination,
  formatReviewDate,
  formatReviewMoney,
} from "@/components/accounting/AccountingReviewOdooPanels";

const PAGE_SIZE = 40;

const STATUS_OPTIONS = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "posted", label: "Posted" },
];

function statusBadgeClass(status: string) {
  switch (status) {
    case "posted":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "draft":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "cancelled":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

export function AccountingDepreciationScheduleReviewView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("line") || "";
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 280);
  const [statusFilter, setStatusFilter] = useState("all");
  const [lines, setLines] = useState<ReviewDepreciationLine[]>([]);
  const [totals, setTotals] = useState<ReviewDepreciationTotals>({
    amount: 0,
    posted_amount: 0,
    draft_amount: 0,
    posted_count: 0,
    draft_count: 0,
  });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();

  const filterPills = useMemo(() => {
    const pills: { id: string; label: string }[] = [];
    if (statusFilter !== "all") {
      const opt = STATUS_OPTIONS.find((o) => o.id === statusFilter);
      if (opt) pills.push({ id: statusFilter, label: opt.label });
    }
    return pills;
  }, [statusFilter]);

  const load = useCallback(() => {
    if (isAdminContext) {
      setLines([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingDepreciationScheduleForReview({
        search: debouncedSearch.trim() || undefined,
        status: statusFilter,
        page,
        pageSize: PAGE_SIZE,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setLines([]);
        setTotal(0);
      } else if ("migrationRequired" in res && res.migrationRequired) {
        toast.error("Asset depreciation tables are not available.");
        setLines([]);
        setTotal(0);
      } else {
        setLines(res.lines ?? []);
        setTotal(res.total ?? 0);
        setTotals(
          res.totals ?? {
            amount: 0,
            posted_amount: 0,
            draft_amount: 0,
            posted_count: 0,
            draft_count: 0,
          }
        );
      }
      setLoading(false);
    });
  }, [page, debouncedSearch, statusFilter, isAdminContext]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, switchVersion]);

  useEffect(() => {
    load();
  }, [load]);

  function openAsset(line: ReviewDepreciationLine) {
    router.push(`/accounting/assets/${line.asset_id}`);
  }

  function openJournal(line: ReviewDepreciationLine, e: React.MouseEvent) {
    e.stopPropagation();
    if (line.journal_entry_id) {
      router.push(`/accounting/journal-entries/${line.journal_entry_id}`);
    }
  }

  return (
    <div className="-mx-1 sm:-mx-2 flex flex-col min-h-[calc(100vh-8rem)] bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
      <ReviewListToolbar
        title="Depreciation Schedule"
        search={search}
        onSearchChange={setSearch}
        filterPills={filterPills}
        onRemoveFilter={() => setStatusFilter("all")}
        extraFilters={
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-7 text-xs border border-slate-200 rounded px-1.5 bg-white text-slate-700"
            aria-label="Status"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        }
        pagination={
          <ReviewPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        }
      />

      <ReviewMeasuresBar
        measures={[
          { label: "Scheduled", value: formatReviewMoney(totals.amount) },
          { label: "Posted", value: formatReviewMoney(totals.posted_amount) },
          { label: "Draft", value: formatReviewMoney(totals.draft_amount) },
          { label: "Posted lines", value: String(totals.posted_count) },
        ]}
      />

      {loading ? (
        <div className="p-4">
          <AccountingTableSkeleton rows={10} cols={10} />
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full min-w-[960px] text-sm border-collapse">
            <thead className="sticky top-0 z-[1] bg-slate-50 border-b border-slate-200">
              <tr className="text-xs text-slate-500 font-medium">
                <th className="px-3 py-2 text-left">Asset</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Period</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Remaining</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Journal</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-sm text-slate-400">
                    No depreciation lines from confirmed assets.
                  </td>
                </tr>
              ) : (
                lines.map((line) => (
                  <tr
                    key={line.id}
                    onClick={() => openAsset(line)}
                    className={`border-b border-slate-100 hover:bg-slate-50/80 cursor-pointer ${
                      highlightId === line.id ? "bg-[#017e84]/8" : ""
                    }`}
                  >
                    <td className="px-3 py-2 text-sm font-medium text-slate-800 whitespace-nowrap">
                      {line.asset_number}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 max-w-[180px] truncate">
                      {line.asset_name}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-600 whitespace-nowrap">
                      {line.period_label || `#${line.sequence}`}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-600 whitespace-nowrap">
                      {formatReviewDate(line.depreciation_date)}
                    </td>
                    <td className="px-3 py-2 text-sm text-right tabular-nums text-slate-700">
                      {formatReviewMoney(line.amount)}
                    </td>
                    <td className="px-3 py-2 text-sm text-right tabular-nums text-slate-700">
                      {formatReviewMoney(line.remaining_value)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded border capitalize ${statusBadgeClass(line.status)}`}
                      >
                        {line.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm whitespace-nowrap">
                      {line.journal_entry_id ? (
                        <button
                          type="button"
                          onClick={(e) => openJournal(line, e)}
                          className="text-xs font-medium hover:underline"
                          style={{ color: REVIEW_TEAL }}
                        >
                          JE
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
