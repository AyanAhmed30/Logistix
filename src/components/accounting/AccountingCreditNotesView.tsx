"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAccountingCreditNotes } from "@/app/actions/accounting/credit-notes";
import { formatMoney } from "@/lib/sales-quotation-form";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAccountingShell } from "@/components/accounting/AccountingShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

const PAGE_SIZE = 40;

export function AccountingCreditNotesView() {
  const router = useRouter();
  const { switchVersion } = useAdminOrganization();
  const { searchQuery, activeFilterId } = useAccountingShell();
  const debouncedSearch = useDebouncedValue(searchQuery, 280);
  const [rows, setRows] = useState<
    Awaited<ReturnType<typeof getAccountingCreditNotes>> extends {
      creditNotes?: infer C;
    }
      ? NonNullable<C>
      : never
  >([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    const status =
      activeFilterId === "all"
        ? "all"
        : (activeFilterId as "draft" | "posted" | "cancelled");
    startTransition(async () => {
      const res = await getAccountingCreditNotes({
        search: debouncedSearch.trim() || undefined,
        status,
        page,
        pageSize: PAGE_SIZE,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setRows([]);
        setTotal(0);
      } else {
        setRows(res.creditNotes ?? []);
        setTotal(res.total ?? 0);
      }
      setLoading(false);
    });
  }, [activeFilterId, page, debouncedSearch]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeFilterId, switchVersion]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      {loading || isPending ? (
        <AccountingTableSkeleton rows={8} cols={8} />
      ) : (
      <div className="bg-white border border-slate-200 rounded-sm overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
        {rows.length === 0 ? (
          <div className="p-6 text-sm text-secondary-muted">
            No credit notes yet. Create one from a posted invoice.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead>Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Customer ID</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => router.push(`/accounting/credit-notes/${r.id}`)}
                  >
                    <TableCell className="font-medium text-[#017e84]">
                      {r.credit_note_number}
                    </TableCell>
                    <TableCell>{r.customer_name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.customer_lead_id || "—"}
                    </TableCell>
                    <TableCell>{r.invoice_number || "—"}</TableCell>
                    <TableCell>{r.credit_note_date || "—"}</TableCell>
                    <TableCell className="capitalize text-xs">{r.refund_type}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(r.total_amount)}
                    </TableCell>
                    <TableCell className="capitalize text-xs">{r.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      )}

      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-secondary-muted">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
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
