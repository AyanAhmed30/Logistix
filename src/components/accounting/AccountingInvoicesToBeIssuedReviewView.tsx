"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAccountingInvoicesToBeIssuedForReview,
  type ReviewInvoiceToIssueLine,
} from "@/app/actions/accounting/review";
import { createAccountingInvoiceFromOrder } from "@/app/actions/accounting/invoices";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import {
  ReviewCalendarIcon,
  ReviewFilterChip,
  ReviewListToolbar,
  ReviewPagination,
  formatReviewDate,
  formatReviewMoney,
} from "@/components/accounting/AccountingReviewOdooPanels";

const PAGE_SIZE = 40;

const INVOICE_STATUS_OPTIONS = [
  { id: "to_invoice", label: "To Invoice" },
  { id: "no", label: "Not Invoiced" },
  { id: "invoiced", label: "Invoiced" },
  { id: "all", label: "All" },
];

const GROUP_OPTIONS = [
  { id: "none", label: "No grouping" },
  { id: "customer", label: "Customer" },
  { id: "salesperson", label: "Salesperson" },
  { id: "invoice_status", label: "Invoice Status" },
];

function invoiceBadgeClass(status: string) {
  switch (status) {
    case "to_invoice":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "invoiced":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

function invoiceStatusLabel(status: string) {
  switch (status) {
    case "to_invoice":
      return "To Invoice";
    case "invoiced":
      return "Invoiced";
    case "no":
      return "Not Invoiced";
    default:
      return status;
  }
}

export function AccountingInvoicesToBeIssuedReviewView() {
  const router = useRouter();
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 280);
  const [invoiceStatus, setInvoiceStatus] = useState("to_invoice");
  const [groupBy, setGroupBy] = useState("none");
  const [asOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<ReviewInvoiceToIssueLine[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filterPills = useMemo(
    () => [
      { id: "365", label: "For the Last 365 Days" },
      { id: "status", label: invoiceStatusLabel(invoiceStatus) },
    ],
    [invoiceStatus]
  );

  const load = useCallback(() => {
    if (isAdminContext) {
      setLines([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingInvoicesToBeIssuedForReview({
        search: debouncedSearch.trim() || undefined,
        invoiceStatus: invoiceStatus as "to_invoice" | "no" | "invoiced" | "all",
        asOf,
        page,
        pageSize: PAGE_SIZE,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setLines([]);
        setTotal(0);
      } else {
        setLines(res.lines ?? []);
        setTotal(res.total ?? 0);
      }
      setLoading(false);
    });
  }, [page, debouncedSearch, invoiceStatus, asOf, isAdminContext]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, invoiceStatus, switchVersion]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    if (groupBy === "none") return null;
    const map = new Map<string, ReviewInvoiceToIssueLine[]>();
    for (const row of lines) {
      let key = "Other";
      if (groupBy === "customer") key = row.customer_name || "—";
      else if (groupBy === "salesperson")
        key = row.salesperson_name || "Unassigned";
      else if (groupBy === "invoice_status")
        key = invoiceStatusLabel(row.invoice_status);
      const list = map.get(key) || [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [lines, groupBy]);

  async function handleCreateInvoice(
    quotationId: string,
    e: React.MouseEvent
  ) {
    e.stopPropagation();
    setCreatingId(quotationId);
    const res = await createAccountingInvoiceFromOrder(quotationId);
    setCreatingId(null);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    if ("invoiceId" in res && res.invoiceId) {
      toast.success("Invoice created");
      load();
      router.push(`/accounting/invoices/${res.invoiceId}`);
    }
  }

  function openOrder(row: ReviewInvoiceToIssueLine) {
    router.push(`/sales/orders/${row.quotation_id}`);
  }

  function renderRow(row: ReviewInvoiceToIssueLine) {
    return (
      <tr
        key={row.line_id}
        onClick={() => openOrder(row)}
        className="border-b border-slate-100 hover:bg-slate-50/80 cursor-pointer"
      >
        <td className="px-3 py-2 text-sm font-medium text-slate-800 whitespace-nowrap">
          {row.order_reference}
        </td>
        <td className="px-3 py-2 text-sm text-slate-700 max-w-[120px] truncate">
          {row.customer_name}
        </td>
        <td className="px-3 py-2 text-sm text-slate-600 max-w-[180px] truncate">
          {row.description}
        </td>
        <td className="px-3 py-2 text-sm text-slate-600 whitespace-nowrap">
          {row.salesperson_name || "—"}
        </td>
        <td className="px-3 py-2 text-sm text-right tabular-nums text-slate-700">
          {row.quantity}
        </td>
        <td className="px-3 py-2 text-sm text-right tabular-nums text-slate-700">
          {row.qty_delivered}
        </td>
        <td className="px-3 py-2 text-sm text-right tabular-nums text-slate-700">
          {row.qty_invoiced}
        </td>
        <td className="px-3 py-2 text-sm text-right tabular-nums text-slate-700">
          {formatReviewMoney(row.unit_price)}
        </td>
        <td className="px-3 py-2 text-sm text-right tabular-nums font-medium text-slate-800">
          {formatReviewMoney(row.amount)}
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          <span
            className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded border ${invoiceBadgeClass(row.invoice_status)}`}
          >
            {invoiceStatusLabel(row.invoice_status)}
          </span>
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          {row.invoice_status === "to_invoice" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={creatingId === row.quotation_id || isPending}
              onClick={(e) => handleCreateInvoice(row.quotation_id, e)}
            >
              <FilePlus2 className="h-3 w-3 mr-1" />
              Invoice
            </Button>
          ) : null}
        </td>
      </tr>
    );
  }

  return (
    <div className="-mx-1 sm:-mx-2 flex flex-col min-h-[calc(100vh-8rem)] bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-100 bg-white text-xs text-slate-600">
        <ReviewCalendarIcon />
        <span>As of {formatReviewDate(asOf)}</span>
      </div>

      <ReviewListToolbar
        title="Invoices To Be Issued"
        search={search}
        onSearchChange={setSearch}
        filterPills={filterPills}
        onRemoveFilter={(id) => {
          if (id === "status") setInvoiceStatus("to_invoice");
        }}
        extraFilters={
          <>
            <select
              value={invoiceStatus}
              onChange={(e) => setInvoiceStatus(e.target.value)}
              className="h-7 text-xs border border-slate-200 rounded px-1.5 bg-white text-slate-700"
              aria-label="Invoice status"
            >
              {INVOICE_STATUS_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="h-7 text-xs border border-slate-200 rounded px-1.5 bg-white text-slate-700"
              aria-label="Group by"
            >
              {GROUP_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <ReviewFilterChip icon={<ReviewCalendarIcon />}>
              Customer
            </ReviewFilterChip>
          </>
        }
        pagination={
          <ReviewPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        }
      />

      <div className="flex-1 overflow-auto">
        {loading ? (
          <AccountingTableSkeleton rows={8} cols={11} />
        ) : lines.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            No invoiceable sales order lines match the current filters.
          </div>
        ) : (
          <table className="w-full min-w-[1050px] text-left border-collapse">
            <thead className="sticky top-0 z-[1] bg-slate-50 border-b border-slate-200">
              <tr className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                <th className="px-3 py-2">Order Reference</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Salesperson</th>
                <th className="px-3 py-2 text-right">Quantity</th>
                <th className="px-3 py-2 text-right">Delivered</th>
                <th className="px-3 py-2 text-right">Invoiced</th>
                <th className="px-3 py-2 text-right">Unit Price</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {grouped
                ? grouped.map(([label, items]) => (
                    <Fragment key={label}>
                      <tr className="bg-slate-50/60">
                        <td
                          colSpan={11}
                          className="px-3 py-1.5 text-xs font-semibold text-slate-600"
                        >
                          {label} ({items.length})
                        </td>
                      </tr>
                      {items.map(renderRow)}
                    </Fragment>
                  ))
                : lines.map(renderRow)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
