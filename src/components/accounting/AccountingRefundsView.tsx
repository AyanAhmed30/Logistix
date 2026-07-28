"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getAccountingRefundHistory,
  type AccountingRefundListItem,
} from "@/app/actions/accounting/credit-notes";
import { formatMoney } from "@/lib/sales-quotation-form";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAccountingShell } from "@/components/accounting/AccountingShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

const PAGE_SIZE = 20;

export function AccountingRefundsView() {
  const { switchVersion } = useAdminOrganization();
  const { searchQuery } = useAccountingShell();
  const [rows, setRows] = useState<AccountingRefundListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [localSearch, setLocalSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const effectiveSearch = useDebouncedValue(
    searchQuery.trim() || localSearch.trim(),
    280
  );

  const load = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingRefundHistory({
        search: effectiveSearch || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setRows([]);
        setTotal(0);
      } else {
        setRows(res.refunds ?? []);
        setTotal(res.total ?? 0);
      }
      setLoading(false);
    });
  }, [effectiveSearch, page]);

  useEffect(() => {
    setPage(1);
  }, [effectiveSearch, switchVersion]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Input
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search refunds…"
          className="h-8 w-56 rounded-sm"
        />
      </div>
      {loading || isPending ? (
        <AccountingTableSkeleton rows={8} cols={7} />
      ) : (
      <div className="bg-white border border-slate-200 rounded-sm overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
        {rows.length === 0 ? (
          <div className="p-6 text-sm text-secondary-muted">No refund history yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead>Refund Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Credit Note</TableHead>
                  <TableHead>Organization</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.refund_date || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatMoney(r.amount)}
                    </TableCell>
                    <TableCell className="capitalize text-xs">{r.refund_type}</TableCell>
                    <TableCell>{r.refunded_by || "—"}</TableCell>
                    <TableCell>
                      {r.invoice_id && r.invoice_number ? (
                        <Link
                          href={`/accounting/invoices/${r.invoice_id}`}
                          className="text-[#017e84] hover:underline"
                        >
                          {r.invoice_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {r.credit_note_id && r.credit_note_number ? (
                        <Link
                          href={`/accounting/credit-notes/${r.credit_note_id}`}
                          className="text-[#017e84] hover:underline"
                        >
                          {r.credit_note_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{r.organization_name || "—"}</TableCell>
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
