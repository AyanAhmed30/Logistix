"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getAccountingLoansAnalysisForReview,
  type ReviewLoanAnalysisItem,
  type ReviewLoanAnalysisTotals,
} from "@/app/actions/accounting/review";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import {
  REVIEW_TEAL,
  ReviewListToolbar,
  ReviewMeasuresBar,
  ReviewPagination,
  ReviewUnsupportedBanner,
  formatReviewDate,
  formatReviewMoney,
} from "@/components/accounting/AccountingReviewOdooPanels";

const PAGE_SIZE = 40;

const STATUS_OPTIONS = [
  { id: "all", label: "All Active" },
  { id: "active", label: "Active" },
  { id: "partially_paid", label: "Partially Paid" },
  { id: "fully_paid", label: "Fully Paid" },
  { id: "closed", label: "Closed" },
  { id: "overdue", label: "Overdue" },
];

const GROUP_OPTIONS = [
  { id: "none", label: "No grouping" },
  { id: "status", label: "Status" },
  { id: "organization", label: "Organization" },
  { id: "currency", label: "Currency" },
];

function statusBadgeClass(status: string) {
  switch (status) {
    case "active":
      return "bg-sky-50 text-sky-800 border-sky-200";
    case "partially_paid":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "fully_paid":
    case "closed":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "cancelled":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AccountingLoansAnalysisReviewView() {
  const router = useRouter();
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 280);
  const [statusFilter, setStatusFilter] = useState("all");
  const [groupBy, setGroupBy] = useState("none");
  const [loans, setLoans] = useState<ReviewLoanAnalysisItem[]>([]);
  const [totals, setTotals] = useState<ReviewLoanAnalysisTotals>({
    principal: 0,
    principal_paid: 0,
    interest: 0,
    interest_paid: 0,
    payment: 0,
    outstanding: 0,
  });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [, startTransition] = useTransition();

  const filterPills = useMemo(() => {
    const pills: { id: string; label: string }[] = [];
    if (statusFilter === "overdue") {
      pills.push({ id: "overdue", label: "Overdue" });
    } else if (statusFilter !== "all") {
      const opt = STATUS_OPTIONS.find((o) => o.id === statusFilter);
      if (opt) pills.push({ id: statusFilter, label: opt.label });
    }
    return pills;
  }, [statusFilter]);

  const load = useCallback(() => {
    if (isAdminContext) {
      setLoans([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingLoansAnalysisForReview({
        search: debouncedSearch.trim() || undefined,
        status: statusFilter === "overdue" ? "all" : statusFilter,
        overdue: statusFilter === "overdue",
        page,
        pageSize: PAGE_SIZE,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setLoans([]);
        setTotal(0);
        setSchemaMissing(false);
      } else if ("migrationRequired" in res && res.migrationRequired) {
        setLoans([]);
        setTotal(0);
        setSchemaMissing(true);
        setTotals({
          principal: 0,
          principal_paid: 0,
          interest: 0,
          interest_paid: 0,
          payment: 0,
          outstanding: 0,
        });
      } else {
        setSchemaMissing(false);
        setLoans(res.loans ?? []);
        setTotal(res.total ?? 0);
        setTotals(
          res.totals ?? {
            principal: 0,
            principal_paid: 0,
            interest: 0,
            interest_paid: 0,
            payment: 0,
            outstanding: 0,
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

  const grouped = useMemo(() => {
    if (groupBy === "none") return null;
    const map = new Map<string, ReviewLoanAnalysisItem[]>();
    for (const loan of loans) {
      let key = "Other";
      if (groupBy === "status") key = statusLabel(loan.status);
      else if (groupBy === "organization")
        key = loan.organization_name || "—";
      else if (groupBy === "currency") key = loan.currency || "—";
      const list = map.get(key) || [];
      list.push(loan);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [loans, groupBy]);

  function openLoan(loan: ReviewLoanAnalysisItem) {
    router.push(`/accounting/loans/${loan.id}`);
  }

  function openJournalEntry(loan: ReviewLoanAnalysisItem, e: React.MouseEvent) {
    e.stopPropagation();
    if (loan.disbursement_journal_entry_id) {
      router.push(
        `/accounting/journal-entries/${loan.disbursement_journal_entry_id}`
      );
    }
  }

  function renderRow(loan: ReviewLoanAnalysisItem) {
    return (
      <tr
        key={loan.id}
        onClick={() => openLoan(loan)}
        className="border-b border-slate-100 hover:bg-slate-50/80 cursor-pointer"
      >
        <td className="px-3 py-2 text-sm font-medium text-slate-800 whitespace-nowrap">
          {loan.loan_number}
        </td>
        <td className="px-3 py-2 text-sm text-slate-700 max-w-[140px] truncate">
          {loan.name}
        </td>
        <td className="px-3 py-2 text-sm text-slate-600 whitespace-nowrap">
          {loan.lender_name || "—"}
        </td>
        <td className="px-3 py-2 text-sm text-slate-600 whitespace-nowrap">
          {formatReviewDate(loan.start_date)}
        </td>
        <td className="px-3 py-2 text-sm text-right tabular-nums text-slate-700">
          {formatReviewMoney(loan.principal_amount)}
        </td>
        <td className="px-3 py-2 text-sm text-right tabular-nums text-slate-700">
          {formatReviewMoney(loan.principal_paid)}
        </td>
        <td className="px-3 py-2 text-sm text-right tabular-nums text-slate-700">
          {formatReviewMoney(loan.total_interest)}
        </td>
        <td className="px-3 py-2 text-sm text-right tabular-nums text-slate-700">
          {formatReviewMoney(loan.interest_paid)}
        </td>
        <td className="px-3 py-2 text-sm text-right tabular-nums font-medium text-slate-800">
          {formatReviewMoney(loan.remaining_balance)}
        </td>
        <td className="px-3 py-2 text-sm text-slate-600 whitespace-nowrap">
          {loan.next_installment_date
            ? formatReviewDate(loan.next_installment_date)
            : "—"}
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          <span
            className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded border ${statusBadgeClass(loan.status)}`}
          >
            {statusLabel(loan.status)}
          </span>
        </td>
        <td className="px-3 py-2 text-sm text-slate-500 whitespace-nowrap">
          {loan.currency}
        </td>
        <td className="px-3 py-2 text-sm whitespace-nowrap">
          {loan.disbursement_journal_entry_id ? (
            <button
              type="button"
              onClick={(e) => openJournalEntry(loan, e)}
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
    );
  }

  return (
    <div className="-mx-1 sm:-mx-2 flex flex-col min-h-[calc(100vh-8rem)] bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
      <ReviewListToolbar
        title="Loans Analysis"
        search={search}
        onSearchChange={setSearch}
        filterPills={filterPills}
        onRemoveFilter={() => setStatusFilter("all")}
        extraFilters={
          <>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-7 text-xs border border-slate-200 rounded px-1.5 bg-white text-slate-700"
              aria-label="Status filter"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="h-7 text-xs border border-slate-200 rounded px-1.5 bg-white text-slate-700"
              aria-label="Group by"
            >
              {GROUP_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </>
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

      {schemaMissing ? (
        <ReviewUnsupportedBanner
          title="Loans schema is not installed"
          body="This screen does not invent principal or interest totals. Run create_accounting_loans_module.sql, then confirm loans so disbursement and repayment journal entries exist."
        />
      ) : (
        <ReviewMeasuresBar
          measures={[
            { label: "Principal", value: formatReviewMoney(totals.principal) },
            {
              label: "Principal Paid",
              value: formatReviewMoney(totals.principal_paid),
            },
            { label: "Interest", value: formatReviewMoney(totals.interest) },
            {
              label: "Interest Paid",
              value: formatReviewMoney(totals.interest_paid),
            },
            { label: "Payment", value: formatReviewMoney(totals.payment) },
            {
              label: "Outstanding",
              value: formatReviewMoney(totals.outstanding),
            },
          ]}
        />
      )}

      <div className="flex-1 overflow-auto">
        {loading ? (
          <AccountingTableSkeleton rows={8} cols={12} />
        ) : schemaMissing ? (
          <div className="py-16 text-center text-sm text-slate-500 px-6">
            No loan records are available until the loans tables exist.
          </div>
        ) : loans.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            No loans match the current filters.
          </div>
        ) : (
          <table className="w-full min-w-[1100px] text-left border-collapse">
            <thead className="sticky top-0 z-[1] bg-slate-50 border-b border-slate-200">
              <tr className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                <th className="px-3 py-2">Loan</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Lender</th>
                <th className="px-3 py-2">Start</th>
                <th className="px-3 py-2 text-right">Principal</th>
                <th className="px-3 py-2 text-right">Principal Paid</th>
                <th className="px-3 py-2 text-right">Interest</th>
                <th className="px-3 py-2 text-right">Interest Paid</th>
                <th className="px-3 py-2 text-right">Outstanding</th>
                <th className="px-3 py-2">Next Due</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Currency</th>
                <th className="px-3 py-2">Journal</th>
              </tr>
            </thead>
            <tbody>
              {grouped
                ? grouped.map(([label, items]) => (
                    <Fragment key={label}>
                      <tr className="bg-slate-50/60">
                        <td
                          colSpan={13}
                          className="px-3 py-1.5 text-xs font-semibold text-slate-600"
                        >
                          {label} ({items.length})
                        </td>
                      </tr>
                      {items.map(renderRow)}
                    </Fragment>
                  ))
                : loans.map(renderRow)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
