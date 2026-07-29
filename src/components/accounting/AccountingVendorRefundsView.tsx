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
import { getAccountingVendorRefunds } from "@/app/actions/accounting/vendor-refunds";
import { formatMoney } from "@/lib/sales-quotation-form";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAccountingShell } from "@/components/accounting/AccountingShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

const PAGE_SIZE = 40;

function statusLabel(status: string, amountRefunded: number) {
  if (status === "posted" && amountRefunded > 0.004) return "Refunded";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AccountingVendorRefundsView() {
  const router = useRouter();
  const { switchVersion } = useAdminOrganization();
  const { searchQuery, activeFilterId } = useAccountingShell();
  const debouncedSearch = useDebouncedValue(searchQuery, 280);
  const [rows, setRows] = useState<
    NonNullable<
      Awaited<ReturnType<typeof getAccountingVendorRefunds>>["refunds"]
    >
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
      const res = await getAccountingVendorRefunds({
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
        setRows(res.refunds ?? []);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white font-medium"
            onClick={() => router.push("/accounting/bills")}
          >
            New
          </Button>
          <p className="text-sm text-secondary-muted">
            Create a refund from a posted vendor bill.
          </p>
        </div>
        <span className="text-sm text-secondary-muted">
          {total} refund{total === 1 ? "" : "s"}
        </span>
      </div>

      {loading || isPending ? (
        <AccountingTableSkeleton rows={8} cols={8} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-6 text-sm text-secondary-muted space-y-3">
              <p>No vendor refunds yet.</p>
              <Button
                size="sm"
                className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
                onClick={() => router.push("/accounting/bills")}
              >
                Go to Bills
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Refund Number</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Vendor ID</TableHead>
                    <TableHead>Related Bill</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Organization</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() =>
                        router.push(`/accounting/vendor-refunds/${r.id}`)
                      }
                    >
                      <TableCell className="font-medium text-[#017e84]">
                        {r.refund_number}
                      </TableCell>
                      <TableCell>{r.vendor_name}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.vendor_lead_id || "—"}
                      </TableCell>
                      <TableCell>
                        {r.bill_id && r.bill_number ? (
                          <button
                            type="button"
                            className="text-[#017e84] hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/accounting/bills/${r.bill_id}`);
                            }}
                          >
                            {r.bill_number}
                          </button>
                        ) : (
                          r.bill_number || "—"
                        )}
                      </TableCell>
                      <TableCell>{r.refund_date || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(r.total_amount)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {statusLabel(r.status, r.amount_refunded)}
                      </TableCell>
                      <TableCell className="text-secondary-muted text-sm">
                        {r.organization_name || "—"}
                      </TableCell>
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
