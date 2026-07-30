"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAccountingCreditNotes } from "@/app/actions/accounting/credit-notes";
import { formatMoney } from "@/lib/sales-quotation-form";
import { paymentStateLabel } from "@/lib/accounting-payments";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAccountingShell } from "@/components/accounting/AccountingShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 40;

type CreditNoteRow = NonNullable<
  Awaited<ReturnType<typeof getAccountingCreditNotes>>["creditNotes"]
>[number];

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
  const d = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Credit notes show amounts as negative (Odoo). */
function formatCnMoney(n: number) {
  const v = Number(n) || 0;
  if (v === 0) return formatMoney(0);
  return formatMoney(-Math.abs(v));
}

function listStatusLabel(row: CreditNoteRow) {
  if (row.status === "draft") return "Draft";
  if (row.status === "cancelled") return "Cancelled";
  if (row.payment_state === "in_payment") return "In Payment";
  if (row.payment_state === "paid") return "Paid";
  if (row.payment_state === "partial") return "Partial";
  if (row.amount_refunded > 0.004) return "Refunded";
  return paymentStateLabel(row.payment_state || "not_paid");
}

function statusBadgeClass(label: string) {
  const key = label.toLowerCase();
  if (key === "in payment") {
    return "bg-emerald-500 text-white border-emerald-500";
  }
  if (key === "paid" || key === "refunded") {
    return "bg-[#017e84] text-white border-[#017e84]";
  }
  if (key === "draft") {
    return "bg-slate-100 text-slate-600 border-slate-200";
  }
  if (key === "cancelled") {
    return "bg-slate-200 text-slate-700 border-slate-300";
  }
  if (key === "partial") {
    return "bg-amber-500 text-white border-amber-500";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export function AccountingCreditNotesView() {
  const router = useRouter();
  const { switchVersion } = useAdminOrganization();
  const { searchQuery, activeFilterId } = useAccountingShell();
  const debouncedSearch = useDebouncedValue(searchQuery, 280);
  const [rows, setRows] = useState<CreditNoteRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visibleCols, setVisibleCols] = useState(DEFAULT_COLS);

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
        setSelected(new Set());
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
  const allSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = rows.some((r) => selected.has(r.id));

  const pageTotals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        const due =
          r.payment_state === "in_payment"
            ? Number(r.total_amount) || 0
            : Number(r.amount_residual ?? r.total_amount) || 0;
        acc.untaxed += Number(r.untaxed_amount) || 0;
        acc.total += Number(r.total_amount) || 0;
        acc.due += due;
        return acc;
      },
      { untaxed: 0, total: 0, due: 0 }
    );
  }, [rows]);

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
            onClick={() => router.push("/accounting/credit-notes/new")}
          >
            New
          </Button>
          <p className="text-sm text-secondary-muted">Credit Notes</p>
        </div>
        <span className="text-sm text-secondary-muted">
          {total} credit note{total === 1 ? "" : "s"}
        </span>
      </div>

      {loading || isPending ? (
        <AccountingTableSkeleton rows={8} cols={9} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
          {rows.length === 0 ? (
            <div className="p-6 text-sm text-secondary-muted space-y-3">
              <p>No credit notes yet.</p>
              <Button
                size="sm"
                className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
                onClick={() => router.push("/accounting/credit-notes/new")}
              >
                New Credit Note
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
                        onCheckedChange={(v) => {
                          if (v === true)
                            setSelected(new Set(rows.map((r) => r.id)));
                          else setSelected(new Set());
                        }}
                        aria-label="Select all"
                        className="border-slate-300 data-[state=checked]:bg-[#017e84] data-[state=checked]:border-[#017e84] data-[state=indeterminate]:bg-[#017e84] data-[state=indeterminate]:border-[#017e84]"
                      />
                    </TableHead>
                    {visibleCols.number ? (
                      <TableHead className={thClass}>Number</TableHead>
                    ) : null}
                    {visibleCols.customer ? (
                      <TableHead className={thClass}>Customer</TableHead>
                    ) : null}
                    {visibleCols.invoice_date ? (
                      <TableHead className={thClass}>Invoice Date</TableHead>
                    ) : null}
                    {visibleCols.due_date ? (
                      <TableHead className={thClass}>Due Date</TableHead>
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
                      <TableHead className={cn(thClass, "text-right")}>
                        Total
                      </TableHead>
                    ) : null}
                    {visibleCols.amount_due ? (
                      <TableHead className={cn(thClass, "text-right")}>
                        Amount Due
                      </TableHead>
                    ) : null}
                    {visibleCols.status ? (
                      <TableHead className={thClass}>Status</TableHead>
                    ) : null}
                    <TableHead className="w-10 px-2 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-secondary-muted"
                            aria-label="Columns"
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
                  {rows.map((r) => {
                    const statusText = listStatusLabel(r);
                    const due =
                      r.payment_state === "in_payment"
                        ? Number(r.total_amount) || 0
                        : Number(r.amount_residual ?? r.total_amount) || 0;
                    return (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer border-b border-slate-100 hover:bg-[#017e84]/5"
                        onClick={() =>
                          router.push(`/accounting/credit-notes/${r.id}`)
                        }
                      >
                        <TableCell
                          className="w-10 px-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={selected.has(r.id)}
                            onCheckedChange={(v) => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (v === true) next.add(r.id);
                                else next.delete(r.id);
                                return next;
                              });
                            }}
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
                            {r.credit_note_number}
                          </TableCell>
                        ) : null}
                        {visibleCols.customer ? (
                          <TableCell className={tdClass}>
                            {r.customer_name}
                          </TableCell>
                        ) : null}
                        {visibleCols.invoice_date ? (
                          <TableCell className={cn(tdClass, "text-[#017e84]")}>
                            {formatShortDate(r.credit_note_date)}
                          </TableCell>
                        ) : null}
                        {visibleCols.due_date ? (
                          <TableCell className={tdClass} />
                        ) : null}
                        {visibleCols.last_reminder ? (
                          <TableCell className={tdClass} />
                        ) : null}
                        {visibleCols.tax_excluded ? (
                          <TableCell
                            className={cn(tdClass, "text-right tabular-nums")}
                          >
                            {formatCnMoney(r.untaxed_amount || 0)}
                          </TableCell>
                        ) : null}
                        {visibleCols.total ? (
                          <TableCell
                            className={cn(tdClass, "text-right tabular-nums")}
                          >
                            {formatCnMoney(r.total_amount || 0)}
                          </TableCell>
                        ) : null}
                        {visibleCols.amount_due ? (
                          <TableCell
                            className={cn(tdClass, "text-right tabular-nums")}
                          >
                            {formatCnMoney(due)}
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
                      <TableCell className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums">
                        {formatCnMoney(pageTotals.untaxed)}
                      </TableCell>
                    ) : null}
                    {visibleCols.total ? (
                      <TableCell className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums">
                        {formatCnMoney(pageTotals.total)}
                      </TableCell>
                    ) : null}
                    {visibleCols.amount_due ? (
                      <TableCell className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums">
                        {formatCnMoney(pageTotals.due)}
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
