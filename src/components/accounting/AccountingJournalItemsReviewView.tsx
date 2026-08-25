"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  getAccountingJournalItemsForReview,
  type ReviewJournalItem,
} from "@/app/actions/accounting/review";
import { journalEntrySourceHref } from "@/lib/accounting-journal-navigation";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAccountingShell } from "@/components/accounting/AccountingShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import {
  REVIEW_TEAL,
  ReviewListToolbar,
  ReviewPagination,
  formatReviewDate,
  formatReviewMoney,
} from "@/components/accounting/AccountingReviewOdooPanels";

const PAGE_SIZE = 80;

export function AccountingJournalItemsReviewView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const journalId = searchParams.get("journal") || "";
  const journalCode = searchParams.get("code") || "";
  const yearFilter = searchParams.get("year") || "";
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const { searchQuery, activeFilterId, setActiveFilterId, setSearchQuery } =
    useAccountingShell();
  const debouncedSearch = useDebouncedValue(searchQuery, 280);
  const [items, setItems] = useState<ReviewJournalItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const filterPills = useMemo(() => {
    const pills: { id: string; label: string }[] = [];
    if (activeFilterId === "posted") pills.push({ id: "posted", label: "Posted" });
    if (activeFilterId === "draft") pills.push({ id: "draft", label: "Draft" });
    if (journalId) {
      pills.push({
        id: "journal",
        label: journalCode ? `Journal ${journalCode}` : "This journal",
      });
    }
    if (yearFilter) {
      pills.push({ id: "year", label: yearFilter });
    }
    return pills;
  }, [activeFilterId, journalId, journalCode, yearFilter]);

  const load = useCallback(() => {
    if (isAdminContext) {
      setItems([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    const yearNum = Number(yearFilter);
    const dateFrom =
      yearFilter && Number.isFinite(yearNum)
        ? `${yearNum}-01-01`
        : undefined;
    const dateTo =
      yearFilter && Number.isFinite(yearNum)
        ? `${yearNum}-12-31`
        : undefined;
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingJournalItemsForReview({
        search: debouncedSearch.trim() || undefined,
        status: activeFilterId || "posted",
        journalId: journalId || undefined,
        dateFrom,
        dateTo,
        groupBy: "none",
        page,
        pageSize: PAGE_SIZE,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setItems([]);
        setTotal(0);
      } else {
        setItems(res.items ?? []);
        setTotal(res.total ?? 0);
      }
      setLoading(false);
    });
  }, [
    page,
    debouncedSearch,
    activeFilterId,
    isAdminContext,
    journalId,
    yearFilter,
  ]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeFilterId, switchVersion, journalId, yearFilter]);

  useEffect(() => {
    load();
  }, [load]);

  function openEntry(item: ReviewJournalItem) {
    router.push(`/accounting/journal-entries/${item.journal_entry_id}`);
  }

  function openJournalEntryNumber(item: ReviewJournalItem, e: React.MouseEvent) {
    e.stopPropagation();
    router.push(
      journalEntrySourceHref({
        entryId: item.journal_entry_id,
        sourceType: item.source_type,
        sourceId: item.source_id,
        isManual: item.is_manual,
      })
    );
  }

  const allSelected = items.length > 0 && items.every((i) => selected[i.line_id]);

  return (
    <div className="-mx-1 sm:-mx-2 flex flex-col min-h-[calc(100vh-8rem)] bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
      <ReviewListToolbar
        title="Journal Items"
        search={searchQuery}
        onSearchChange={setSearchQuery}
        filterPills={filterPills}
        onRemoveFilter={(id) => {
          if (id === "posted" || id === "draft") setActiveFilterId("all");
          if (id === "journal" || id === "year") {
            const next = new URLSearchParams(searchParams.toString());
            if (id === "journal") {
              next.delete("journal");
              next.delete("code");
            }
            if (id === "year") next.delete("year");
            const qs = next.toString();
            router.replace(
              qs
                ? `/accounting/review/journal-items?${qs}`
                : "/accounting/review/journal-items"
            );
          }
        }}
        extraFilters={
          activeFilterId === "all" ? (
            <div className="flex gap-1 ml-1">
              <button
                type="button"
                className="text-xs px-2 py-0.5 rounded hover:bg-slate-100 text-slate-600"
                onClick={() => setActiveFilterId("posted")}
              >
                + Posted
              </button>
              <button
                type="button"
                className="text-xs px-2 py-0.5 rounded hover:bg-slate-100 text-slate-600"
                onClick={() => setActiveFilterId("draft")}
              >
                + Draft
              </button>
            </div>
          ) : null
        }
        pagination={
          <ReviewPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        }
        onPrint={() => window.print()}
      />

      {loading || isPending ? (
        <div className="p-4">
          <AccountingTableSkeleton rows={12} cols={8} />
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full min-w-[960px] text-sm border-collapse">
            <thead className="sticky top-0 z-[1] bg-slate-50 border-b border-slate-200">
              <tr className="text-xs text-slate-500 font-medium">
                <th className="w-10 py-2 px-2 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const next: Record<string, boolean> = {};
                        for (const i of items) next[i.line_id] = true;
                        setSelected(next);
                      } else {
                        setSelected({});
                      }
                    }}
                    className="rounded border-slate-300"
                  />
                </th>
                <th className="py-2 px-3 text-left whitespace-nowrap">Date</th>
                <th className="py-2 px-3 text-left whitespace-nowrap">Journal Entry</th>
                <th className="py-2 px-3 text-left whitespace-nowrap">Account</th>
                <th className="py-2 px-3 text-left whitespace-nowrap">Partner</th>
                <th className="py-2 px-3 text-left min-w-[180px]">Label</th>
                <th className="py-2 px-3 text-right whitespace-nowrap">Debit</th>
                <th className="py-2 px-3 text-right whitespace-nowrap">Credit</th>
                <th className="py-2 px-3 text-left whitespace-nowrap">Matching</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-sm text-slate-400">
                    No journal items found. Post journal entries to see lines here.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.line_id}
                    className="border-b border-slate-100 hover:bg-[#017e84]/5 cursor-pointer"
                    onClick={() => openEntry(item)}
                  >
                    <td className="py-2 px-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={!!selected[item.line_id]}
                        onChange={(e) =>
                          setSelected((s) => ({
                            ...s,
                            [item.line_id]: e.target.checked,
                          }))
                        }
                        className="rounded border-slate-300"
                      />
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap text-slate-700">
                      {formatReviewDate(item.entry_date)}
                    </td>
                    <td
                      className="py-2 px-3 whitespace-nowrap font-medium hover:underline"
                      style={{ color: REVIEW_TEAL }}
                      onClick={(e) => openJournalEntryNumber(item, e)}
                    >
                      {item.source_number || item.entry_number}
                    </td>
                    <td className="py-2 px-3 max-w-[160px] truncate text-slate-700">
                      {item.account_code
                        ? `${item.account_code} ${item.account_name || ""}`.trim()
                        : item.account_name || "—"}
                    </td>
                    <td className="py-2 px-3 max-w-[140px] truncate text-slate-700">
                      {item.partner_name || ""}
                    </td>
                    <td className="py-2 px-3 max-w-[220px] truncate text-slate-600">
                      {item.label || ""}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-800">
                      {item.debit > 0 ? formatReviewMoney(item.debit) : ""}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-800">
                      {item.credit > 0 ? formatReviewMoney(item.credit) : ""}
                    </td>
                    <td className="py-2 px-3 text-slate-500 text-xs whitespace-nowrap">
                      {item.matching ||
                        (item.amount_residual != null && item.amount_residual > 0.004
                          ? formatReviewMoney(item.amount_residual)
                          : "")}
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
