"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  getAccountingCustomerInvoices,
  type AccountingInvoiceListItem,
  type AccountingInvoiceStatus,
} from "@/app/actions/accounting/invoices";
import { paymentStateLabel } from "@/lib/accounting-payments";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAccountingShell } from "@/components/accounting/AccountingShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import { useAccountingShortcuts } from "@/hooks/useAccountingShortcuts";

const PAGE_SIZE = 40;

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMoney(n: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function AccountingInvoicesView() {
  const router = useRouter();
  const { switchVersion } = useAdminOrganization();
  const { searchQuery, activeFilterId } = useAccountingShell();
  const debouncedSearch = useDebouncedValue(searchQuery, 280);
  const [invoices, setInvoices] = useState<AccountingInvoiceListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useAccountingShortcuts({
    onSearchFocus: () => {
      const el = document.querySelector<HTMLInputElement>(
        'input[placeholder*="Search invoices"]'
      );
      el?.focus();
      el?.select();
    },
  });
  const [sortBy, setSortBy] = useState<
    | "invoice_number"
    | "customer_name"
    | "invoice_date"
    | "due_date"
    | "total_amount"
    | "status"
  >("invoice_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    const status =
      activeFilterId === "all"
        ? "all"
        : (activeFilterId as AccountingInvoiceStatus);
    startTransition(async () => {
      const res = await getAccountingCustomerInvoices({
        search: debouncedSearch.trim() || undefined,
        status,
        sortBy,
        sortDir,
        page,
        pageSize: PAGE_SIZE,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setInvoices([]);
        setTotal(0);
      } else {
        setInvoices(res.invoices ?? []);
        setTotal(res.total ?? 0);
      }
      setLoading(false);
    });
  }, [activeFilterId, page, debouncedSearch, sortBy, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeFilterId, switchVersion]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir(col === "invoice_date" || col === "total_amount" ? "desc" : "asc");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white font-medium"
            onClick={() => router.push("/accounting/invoices/new")}
          >
            New
          </Button>
          <p className="text-sm text-secondary-muted">
            Create invoices manually or from Sales Orders.
          </p>
        </div>
        <span className="text-sm text-secondary-muted">
          {total} invoice{total === 1 ? "" : "s"}
        </span>
      </div>

      {loading || isPending ? (
        <AccountingTableSkeleton rows={10} cols={8} />
      ) : (
      <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
        {invoices.length === 0 ? (
          <div className="p-8 text-center text-sm text-secondary-muted space-y-3">
            <p>No customer invoices yet.</p>
            <Button
              size="sm"
              className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
              onClick={() => router.push("/accounting/invoices/new")}
            >
              New Invoice
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort("invoice_number")}
                  >
                    Invoice Number
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort("customer_name")}
                  >
                    Customer
                  </TableHead>
                  <TableHead>Customer ID</TableHead>
                  <TableHead>Sales Order</TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort("invoice_date")}
                  >
                    Invoice Date
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort("due_date")}
                  >
                    Due Date
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort("status")}
                  >
                    Status
                  </TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead
                    className="cursor-pointer select-none text-right"
                    onClick={() => toggleSort("total_amount")}
                  >
                    Total
                  </TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Organization</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow
                    key={inv.id}
                    className="cursor-pointer hover:bg-[#017e84]/5"
                    onClick={() => router.push(`/accounting/invoices/${inv.id}`)}
                  >
                    <TableCell className="font-medium text-[#017e84]">
                      {inv.invoice_number}
                    </TableCell>
                    <TableCell>{inv.customer_name}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {inv.customer_lead_id || "—"}
                    </TableCell>
                    <TableCell>{inv.sales_order_number || "—"}</TableCell>
                    <TableCell>{inv.invoice_date || "—"}</TableCell>
                    <TableCell>{inv.due_date || "—"}</TableCell>
                    <TableCell>
                      <span className="inline-flex h-6 items-center rounded-sm border border-slate-200 bg-slate-50 px-2 text-xs capitalize">
                        {statusLabel(inv.status)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex h-6 items-center rounded-sm border border-slate-200 bg-slate-50 px-2 text-xs">
                        {paymentStateLabel(inv.payment_state || "not_paid")}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatMoney(inv.total_amount)}
                    </TableCell>
                    <TableCell className="text-right text-secondary-muted">
                      {formatMoney(inv.amount_residual ?? inv.total_amount)}
                    </TableCell>
                    <TableCell className="text-secondary-muted">
                      {inv.organization_name || "—"}
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
