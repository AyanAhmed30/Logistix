"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getAccountingReviewAuditTrail,
  type AuditTrailEntry,
} from "@/app/actions/accounting/review";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAccountingShell } from "@/components/accounting/AccountingShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import {
  ReviewAuthorCell,
  ReviewChangeDescription,
  ReviewListToolbar,
  ReviewPagination,
  formatReviewDateTime,
} from "@/components/accounting/AccountingReviewOdooPanels";

const PAGE_SIZE = 80;

function auditFieldLabel(entry: AuditTrailEntry): string | undefined {
  if (entry.previous_value != null || entry.new_value != null) {
    if (entry.action.includes("status")) return "Status";
    if (entry.entity_type === "journal_entry") return "Journal Entry";
    return entry.module;
  }
  return undefined;
}

function auditDescription(entry: AuditTrailEntry) {
  const hasChange =
    entry.previous_value != null ||
    entry.new_value != null;
  if (hasChange && String(entry.previous_value) !== String(entry.new_value)) {
    return (
      <ReviewChangeDescription
        previous={entry.previous_value}
        next={entry.new_value}
        fieldLabel={auditFieldLabel(entry)}
      />
    );
  }
  const action = entry.action.replace(/_/g, " ");
  return (
    <span className="text-sm text-slate-600 capitalize">{action}</span>
  );
}

export function AccountingAuditTrailView() {
  const router = useRouter();
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const { searchQuery, setSearchQuery } = useAccountingShell();
  const debouncedSearch = useDebouncedValue(searchQuery, 280);
  const [entries, setEntries] = useState<AuditTrailEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    if (isAdminContext) {
      setEntries([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingReviewAuditTrail({
        search: debouncedSearch.trim() || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setEntries([]);
        setTotal(0);
      } else {
        setEntries(res.entries ?? []);
        setTotal(res.total ?? 0);
      }
      setLoading(false);
    });
  }, [page, debouncedSearch, isAdminContext, switchVersion]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, switchVersion]);

  useEffect(() => {
    load();
  }, [load]);

  function openRecord(entry: AuditTrailEntry) {
    if (entry.entity_type === "journal_entry" && entry.entity_id) {
      router.push(`/accounting/journal-entries/${entry.entity_id}`);
    }
  }

  const allSelected =
    entries.length > 0 && entries.every((e) => selected[e.id]);

  return (
    <div className="-mx-1 sm:-mx-2 flex flex-col min-h-[calc(100vh-8rem)] bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
      <ReviewListToolbar
        title="Audit Trail"
        search={searchQuery}
        onSearchChange={setSearchQuery}
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
          <AccountingTableSkeleton rows={12} cols={4} />
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full min-w-[720px] text-sm border-collapse">
            <thead className="sticky top-0 z-[1] bg-slate-50 border-b border-slate-200">
              <tr className="text-xs text-slate-500 font-medium">
                <th className="w-10 py-2 px-2 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const next: Record<string, boolean> = {};
                        for (const en of entries) next[en.id] = true;
                        setSelected(next);
                      } else {
                        setSelected({});
                      }
                    }}
                    className="rounded border-slate-300"
                  />
                </th>
                <th className="py-2 px-3 text-left whitespace-nowrap w-[140px]">Date</th>
                <th className="py-2 px-3 text-left whitespace-nowrap w-[180px]">Author</th>
                <th className="py-2 px-3 text-left whitespace-nowrap w-[160px]">Name</th>
                <th className="py-2 px-3 text-left min-w-[280px]">Description</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-sm text-slate-400">
                    No audit trail entries yet.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={`border-b border-slate-100 hover:bg-[#017e84]/5 ${
                      entry.entity_type === "journal_entry"
                        ? "cursor-pointer"
                        : ""
                    }`}
                    onClick={() => openRecord(entry)}
                  >
                    <td className="py-2.5 px-2 align-top" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={!!selected[entry.id]}
                        onChange={(e) =>
                          setSelected((s) => ({
                            ...s,
                            [entry.id]: e.target.checked,
                          }))
                        }
                        className="rounded border-slate-300"
                      />
                    </td>
                    <td className="py-2.5 px-3 align-top whitespace-nowrap text-slate-700">
                      {formatReviewDateTime(entry.performed_at)}
                    </td>
                    <td className="py-2.5 px-3 align-top">
                      <ReviewAuthorCell name={entry.performed_by} />
                    </td>
                    <td className="py-2.5 px-3 align-top text-slate-800 font-medium max-w-[160px] truncate">
                      {entry.record_label}
                    </td>
                    <td className="py-2.5 px-3 align-top">{auditDescription(entry)}</td>
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
