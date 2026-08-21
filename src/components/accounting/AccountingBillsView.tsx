"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import {
  getAccountingVendorBills,
  type AccountingBillListItem,
  type AccountingBillStatus,
} from "@/app/actions/accounting/bills";
import { paymentStateLabel } from "@/lib/accounting-payments";
import { formatMoney } from "@/lib/sales-quotation-form";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAccountingShell } from "@/components/accounting/AccountingShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

const PAGE_SIZE = 40;

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AccountingBillsView() {
  const router = useRouter();
  const { switchVersion } = useAdminOrganization();
  const { searchQuery, activeFilterId } = useAccountingShell();
  const debouncedSearch = useDebouncedValue(searchQuery, 280);
  const [bills, setBills] = useState<AccountingBillListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    const status =
      activeFilterId === "all" ? "all" : (activeFilterId as AccountingBillStatus);
    startTransition(async () => {
      const res = await getAccountingVendorBills({
        search: debouncedSearch.trim() || undefined,
        status,
        page,
        pageSize: PAGE_SIZE,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setBills([]);
        setTotal(0);
      } else {
        setBills(res.bills ?? []);
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
            asChild
          >
            <Link href="/accounting/bills/new">New</Link>
          </Button>
          <p className="text-sm text-secondary-muted">Vendor bills (AP).</p>
        </div>
        <span className="text-sm text-secondary-muted">
          {total} bill{total === 1 ? "" : "s"}
        </span>
      </div>

      {loading || isPending ? (
        <AccountingTableSkeleton rows={10} cols={9} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
          {bills.length === 0 ? (
            <div className="p-8 text-center text-sm text-secondary-muted space-y-3">
              <p>No vendor bills yet.</p>
              <Button
                size="sm"
                className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
                asChild
              >
                <Link href="/accounting/bills/new">New Bill</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Bill Number</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Vendor ID</TableHead>
                    <TableHead>Bill Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Organization</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.map((b) => (
                    <TableRow
                      key={b.id}
                      className="cursor-pointer hover:bg-[#017e84]/5"
                      onClick={() => router.push(`/accounting/bills/${b.id}`)}
                    >
                      <TableCell className="font-medium text-[#017e84]">
                        {b.status === "draft" && !b.bill_number
                          ? "/"
                          : b.bill_number}
                      </TableCell>
                      <TableCell>{b.vendor_name || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {b.vendor_lead_id || "—"}
                      </TableCell>
                      <TableCell>{b.bill_date || "—"}</TableCell>
                      <TableCell>{b.due_date || "—"}</TableCell>
                      <TableCell>{b.reference || "—"}</TableCell>
                      <TableCell>
                        <span className="inline-flex h-6 items-center rounded-sm border border-slate-200 bg-slate-50 px-2 text-xs capitalize">
                          {statusLabel(b.status)}
                        </span>
                        <span className="ml-1 text-[10px] text-secondary-muted">
                          {paymentStateLabel(b.payment_state)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(b.total_amount)}
                      </TableCell>
                      <TableCell className="text-secondary-muted text-sm">
                        {b.organization_name || "—"}
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
