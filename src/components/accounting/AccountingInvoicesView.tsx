"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import {
  getAccountingCustomerInvoices,
  type AccountingInvoiceListItem,
  type AccountingInvoiceStatus,
} from "@/app/actions/accounting/invoices";
import { paymentStateLabel } from "@/lib/accounting-payments";
import { formatMoney } from "@/lib/sales-quotation-form";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAccountingShell } from "@/components/accounting/AccountingShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import { useAccountingShortcuts } from "@/hooks/useAccountingShortcuts";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 40;

type ColKey =
  | "number"
  | "customer"
  | "invoice_date"
  | "due_date"
  | "last_reminder"
  | "tax_excluded"
  | "total"
  | "amount_due"
  | "status";

const DEFAULT_COLS: Record<ColKey, boolean> = {
  number: true,
  customer: true,
  invoice_date: true,
  due_date: true,
  last_reminder: true,
  tax_excluded: true,
  total: true,
  amount_due: true,
  status: true,
};

function formatShortDate(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    // Already a date string like YYYY-MM-DD
    const plain = new Date(`${value}T00:00:00`);
    if (Number.isNaN(plain.getTime())) return value;
    return plain.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Odoo list Status: workflow for draft/cancelled, else payment state. */
function listStatusLabel(inv: AccountingInvoiceListItem) {
  if (inv.status === "draft") return "Draft";
  if (inv.status === "cancelled") return "Cancelled";
  if (inv.status === "paid" || inv.payment_state === "paid") return "Paid";
  return paymentStateLabel(inv.payment_state || "not_paid");
}

function statusBadgeClass(label: string) {
  const key = label.toLowerCase();
  if (key === "in payment") {
    return "bg-emerald-500 text-white border-emerald-500";
  }
  if (key === "paid") {
    return "bg-[#017e84] text-white border-[#017e84]";
  }
  if (key === "overdue") {
    return "bg-red-500 text-white border-red-500";
  }
  if (key === "partial") {
    return "bg-amber-500 text-white border-amber-500";
  }
  if (key === "draft") {
    return "bg-slate-100 text-slate-600 border-slate-200";
  }
  if (key === "cancelled") {
    return "bg-slate-200 text-slate-700 border-slate-300";
  }
  // Not Paid / Posted-like
  return "bg-slate-100 text-slate-700 border-slate-200";
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visibleCols, setVisibleCols] = useState(DEFAULT_COLS);

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
  >("invoice_number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
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
        setSelected(new Set());
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
      setSortDir("asc");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allSelected =
    invoices.length > 0 && invoices.every((inv) => selected.has(inv.id));
  const someSelected = invoices.some((inv) => selected.has(inv.id));

  const pageTotals = useMemo(() => {
    return invoices.reduce(
      (acc, inv) => {
        acc.untaxed += Number(inv.untaxed_amount) || 0;
        acc.total += Number(inv.total_amount) || 0;
        acc.due += Number(inv.amount_residual ?? inv.total_amount) || 0;
        return acc;
      },
      { untaxed: 0, total: 0, due: 0 }
    );
  }, [invoices]);

  function toggleAll(checked: boolean) {
    if (checked) setSelected(new Set(invoices.map((i) => i.id)));
    else setSelected(new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const thClass =
    "h-9 px-3 text-xs font-medium text-secondary-muted whitespace-nowrap";
  const tdClass = "px-3 py-2.5 text-sm whitespace-nowrap";

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
            Customer Invoices
          </p>
        </div>
        <span className="text-sm text-secondary-muted">
          {total} invoice{total === 1 ? "" : "s"}
        </span>
      </div>

      {loading || isPending ? (
        <AccountingTableSkeleton rows={10} cols={9} />
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
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-200">
                    <TableHead className="w-10 px-3">
                      <Checkbox
                        checked={
                          allSelected
                            ? true
                            : someSelected
                              ? "indeterminate"
                              : false
                        }
                        onCheckedChange={(v) => toggleAll(v === true)}
                        aria-label="Select all"
                        className="border-slate-300 data-[state=checked]:bg-[#017e84] data-[state=checked]:border-[#017e84] data-[state=indeterminate]:bg-[#017e84] data-[state=indeterminate]:border-[#017e84]"
                      />
                    </TableHead>
                    {visibleCols.number ? (
                      <TableHead
                        className={cn(thClass, "cursor-pointer select-none")}
                        onClick={() => toggleSort("invoice_number")}
                      >
                        Number
                      </TableHead>
                    ) : null}
                    {visibleCols.customer ? (
                      <TableHead
                        className={cn(thClass, "cursor-pointer select-none")}
                        onClick={() => toggleSort("customer_name")}
                      >
                        Customer
                      </TableHead>
                    ) : null}
                    {visibleCols.invoice_date ? (
                      <TableHead
                        className={cn(thClass, "cursor-pointer select-none")}
                        onClick={() => toggleSort("invoice_date")}
                      >
                        Invoice Date
                      </TableHead>
                    ) : null}
                    {visibleCols.due_date ? (
                      <TableHead
                        className={cn(thClass, "cursor-pointer select-none")}
                        onClick={() => toggleSort("due_date")}
                      >
                        Due Date
                      </TableHead>
                    ) : null}
                    {visibleCols.last_reminder ? (
                      <TableHead className={thClass}>Last Reminder</TableHead>
                    ) : null}
                    {visibleCols.tax_excluded ? (
                      <TableHead className={cn(thClass, "text-right")}>
                        Tax Excluded
                      </TableHead>
                    ) : null}
                    {visibleCols.total ? (
                      <TableHead
                        className={cn(
                          thClass,
                          "text-right cursor-pointer select-none"
                        )}
                        onClick={() => toggleSort("total_amount")}
                      >
                        Total
                      </TableHead>
                    ) : null}
                    {visibleCols.amount_due ? (
                      <TableHead className={cn(thClass, "text-right")}>
                        Amount Due
                      </TableHead>
                    ) : null}
                    {visibleCols.status ? (
                      <TableHead
                        className={cn(thClass, "cursor-pointer select-none")}
                        onClick={() => toggleSort("status")}
                      >
                        Status
                      </TableHead>
                    ) : null}
                    <TableHead className="w-10 px-2 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-secondary-muted hover:text-primary-dark"
                            aria-label="Optional columns"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuLabel>Columns</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {(
                            [
                              ["number", "Number"],
                              ["customer", "Customer"],
                              ["invoice_date", "Invoice Date"],
                              ["due_date", "Due Date"],
                              ["last_reminder", "Last Reminder"],
                              ["tax_excluded", "Tax Excluded"],
                              ["total", "Total"],
                              ["amount_due", "Amount Due"],
                              ["status", "Status"],
                            ] as const
                          ).map(([key, label]) => (
                            <DropdownMenuCheckboxItem
                              key={key}
                              checked={visibleCols[key]}
                              onCheckedChange={(v) =>
                                setVisibleCols((prev) => ({
                                  ...prev,
                                  [key]: Boolean(v),
                                }))
                              }
                            >
                              {label}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => {
                    const statusText = listStatusLabel(inv);
                    return (
                      <TableRow
                        key={inv.id}
                        className="cursor-pointer border-b border-slate-100 hover:bg-[#017e84]/5"
                        onClick={() =>
                          router.push(`/accounting/invoices/${inv.id}`)
                        }
                      >
                        <TableCell
                          className="w-10 px-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={selected.has(inv.id)}
                            onCheckedChange={(v) =>
                              toggleOne(inv.id, v === true)
                            }
                            aria-label={`Select ${inv.invoice_number}`}
                            className="border-slate-300 data-[state=checked]:bg-[#017e84] data-[state=checked]:border-[#017e84]"
                          />
                        </TableCell>
                        {visibleCols.number ? (
                          <TableCell
                            className={cn(
                              tdClass,
                              "font-semibold text-primary-dark"
                            )}
                          >
                            {inv.invoice_number || "Draft"}
                          </TableCell>
                        ) : null}
                        {visibleCols.customer ? (
                          <TableCell className={tdClass}>
                            {inv.customer_name}
                          </TableCell>
                        ) : null}
                        {visibleCols.invoice_date ? (
                          <TableCell
                            className={cn(tdClass, "text-[#017e84]")}
                          >
                            {formatShortDate(inv.invoice_date)}
                          </TableCell>
                        ) : null}
                        {visibleCols.due_date ? (
                          <TableCell className={tdClass}>
                            {formatShortDate(inv.due_date)}
                          </TableCell>
                        ) : null}
                        {visibleCols.last_reminder ? (
                          <TableCell className={tdClass}>
                            {formatShortDate(inv.last_reminder_at)}
                          </TableCell>
                        ) : null}
                        {visibleCols.tax_excluded ? (
                          <TableCell
                            className={cn(tdClass, "text-right tabular-nums")}
                          >
                            {formatMoney(inv.untaxed_amount || 0)}
                          </TableCell>
                        ) : null}
                        {visibleCols.total ? (
                          <TableCell
                            className={cn(tdClass, "text-right tabular-nums")}
                          >
                            {formatMoney(inv.total_amount || 0)}
                          </TableCell>
                        ) : null}
                        {visibleCols.amount_due ? (
                          <TableCell
                            className={cn(tdClass, "text-right tabular-nums")}
                          >
                            {formatMoney(
                              inv.amount_residual ?? inv.total_amount ?? 0
                            )}
                          </TableCell>
                        ) : null}
                        {visibleCols.status ? (
                          <TableCell className={tdClass}>
                            <span
                              className={cn(
                                "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium",
                                statusBadgeClass(statusText)
                              )}
                            >
                              {statusText}
                            </span>
                          </TableCell>
                        ) : null}
                        <TableCell className="w-10 px-2" />
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="bg-slate-50/60 hover:bg-slate-50/60 border-t border-slate-200">
                    <TableCell className="px-3" />
                    {visibleCols.number ? <TableCell /> : null}
                    {visibleCols.customer ? <TableCell /> : null}
                    {visibleCols.invoice_date ? <TableCell /> : null}
                    {visibleCols.due_date ? <TableCell /> : null}
                    {visibleCols.last_reminder ? <TableCell /> : null}
                    {visibleCols.tax_excluded ? (
                      <TableCell className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-primary-dark">
                        {formatMoney(pageTotals.untaxed)}
                      </TableCell>
                    ) : null}
                    {visibleCols.total ? (
                      <TableCell className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-primary-dark">
                        {formatMoney(pageTotals.total)}
                      </TableCell>
                    ) : null}
                    {visibleCols.amount_due ? (
                      <TableCell className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-primary-dark">
                        {formatMoney(pageTotals.due)}
                      </TableCell>
                    ) : null}
                    {visibleCols.status ? <TableCell /> : null}
                    <TableCell />
                  </TableRow>
                </TableFooter>
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
