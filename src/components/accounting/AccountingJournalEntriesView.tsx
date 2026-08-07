"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createManualAccountingJournalEntry,
  getAccountingJournalEntries,
  type AccountingJournalEntryListItem,
} from "@/app/actions/accounting/journal-entries";
import { journalEntrySourceHref } from "@/lib/accounting-journal-navigation";
import { formatMoney } from "@/lib/sales-quotation-form";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAccountingShell } from "@/components/accounting/AccountingShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 40;

function statusBadge(status: string) {
  if (status === "posted") {
    return "bg-emerald-50 text-emerald-800 border-emerald-200";
  }
  if (status === "cancelled") {
    return "bg-slate-100 text-slate-700 border-slate-300";
  }
  return "bg-sky-50 text-sky-800 border-sky-200";
}

export function AccountingJournalEntriesView() {
  const router = useRouter();
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const { searchQuery, activeFilterId } = useAccountingShell();
  const debouncedSearch = useDebouncedValue(searchQuery, 280);
  const [entries, setEntries] = useState<AccountingJournalEntryListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingJournalEntries({
        search: debouncedSearch.trim() || undefined,
        status: activeFilterId || "all",
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
  }, [page, debouncedSearch, activeFilterId]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeFilterId, switchVersion]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  function handleNew() {
    if (isAdminContext) {
      toast.info("Select a specific organization to create a journal entry.");
      return;
    }
    startTransition(async () => {
      const res = await createManualAccountingJournalEntry();
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if (res.entry) {
        router.push(`/accounting/journal-entries/${res.entry.id}`);
      }
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function openEntry(e: AccountingJournalEntryListItem) {
    router.push(
      journalEntrySourceHref({
        entryId: e.id,
        sourceType: e.source_type,
        sourceId: e.source_id,
        isManual: e.is_manual,
      })
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-secondary-muted">
          Posted invoice and credit note journal entries.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-secondary-muted">
            {total} entr{total === 1 ? "y" : "ies"}
          </span>
          <Button
            size="sm"
            className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
            disabled={isPending}
            onClick={handleNew}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New
          </Button>
        </div>
      </div>

      {loading || isPending ? (
        <AccountingTableSkeleton rows={10} cols={9} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
          {entries.length === 0 ? (
            <div className="p-8 text-center text-sm text-secondary-muted space-y-3">
              <p>No journal entries yet.</p>
              <Button
                size="sm"
                className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
                onClick={handleNew}
              >
                Create Journal Entry
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Number</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Journal</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Partner</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead>Created By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow
                      key={e.id}
                      className="cursor-pointer hover:bg-[#017e84]/5"
                      onClick={() => openEntry(e)}
                    >
                      <TableCell className="font-medium text-[#017e84] whitespace-nowrap">
                        {e.source_number || e.reference || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {e.entry_date}
                      </TableCell>
                      <TableCell>
                        {e.journal_code || e.journal_name || "—"}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate">
                        {e.reference || "—"}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate">
                        {e.partner_name || "—"}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate">
                        {e.organization_name || "—"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold capitalize",
                            statusBadge(e.status)
                          )}
                        >
                          {e.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatMoney(e.total_debit)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatMoney(e.total_credit)}
                      </TableCell>
                      <TableCell className="text-secondary-muted">
                        {e.created_by || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-secondary-muted">
            {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
