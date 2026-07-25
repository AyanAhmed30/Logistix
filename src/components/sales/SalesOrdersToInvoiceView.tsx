"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  FilePlus2,
  RefreshCw,
} from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  createSalesInvoiceFromOrder,
  getSalesOrdersToInvoice,
  type SalesToInvoiceListItem,
} from "@/app/actions/sales/to-invoice";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useSalesShell } from "@/components/sales/SalesShell";
import {
  SalesEmptyState,
  SalesPageSkeleton,
} from "@/components/sales/SalesSkeleton";
import {
  salesInvoiceStatusLabel,
  type SalesOrderInvoiceStatus,
} from "@/lib/sales-navigation";

type SortKey =
  | "quotation_number"
  | "customer_name"
  | "total_amount"
  | "created_at";

const PAGE_SIZE = 40;
const GROUP_OPTIONS = [
  { id: "none", label: "No grouping" },
  { id: "invoice_status", label: "Invoice Status" },
  { id: "salesperson", label: "Salesperson" },
  { id: "customer", label: "Customer" },
];

function invoiceBadgeClass(status: SalesOrderInvoiceStatus) {
  switch (status) {
    case "to_invoice":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "invoiced":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "no":
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

export function SalesOrdersToInvoiceView() {
  const router = useRouter();
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const { searchQuery, activeFilterId, groupBy, setGroupBy } = useSalesShell();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SalesToInvoiceListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [refreshKey, setRefreshKey] = useState(0);
  const [isPending, startTransition] = useTransition();

  const invoiceStatus =
    activeFilterId === "all"
      ? "all"
      : (activeFilterId as SalesOrderInvoiceStatus);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getSalesOrdersToInvoice({
      search: searchQuery,
      invoiceStatus,
      sortBy,
      sortDir,
      page,
      pageSize: PAGE_SIZE,
    });
    if ("error" in res && res.error) {
      toast.error(res.error);
      setRows([]);
      setTotal(0);
    } else if ("orders" in res) {
      setRows(res.orders ?? []);
      setTotal(res.total ?? 0);
    }
    setLoading(false);
  }, [searchQuery, invoiceStatus, sortBy, sortDir, page]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, invoiceStatus, switchVersion]);

  useEffect(() => {
    void load();
  }, [load, switchVersion, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const grouped = useMemo(() => {
    if (groupBy === "none") return null;
    const map = new Map<string, SalesToInvoiceListItem[]>();
    for (const row of rows) {
      let key = "Other";
      if (groupBy === "invoice_status")
        key = salesInvoiceStatusLabel(row.invoice_status);
      else if (groupBy === "salesperson")
        key = row.salesperson_name || "Unassigned";
      else if (groupBy === "customer") key = row.customer_name || "—";
      const list = map.get(key) || [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, groupBy]);

  function toggleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir(
        key === "quotation_number" || key === "customer_name" ? "asc" : "desc"
      );
    }
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sortBy !== column) return null;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 inline ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 inline ml-1" />
    );
  }

  function handleExport() {
    if (!rows.length) {
      toast.info("Nothing to export.");
      return;
    }
    const header = [
      "Sales Order",
      "Customer",
      "Salesperson",
      "Order Date",
      "Total",
      "Invoice Status",
      "Organization",
    ];
    const lines = rows.map((r) =>
      [
        r.quotation_number,
        r.customer_name,
        r.salesperson_name || "",
        formatDate(r.order_date),
        String(r.total),
        salesInvoiceStatusLabel(r.invoice_status),
        r.organization_name || "",
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-to-invoice-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  }

  function createInvoice(row: SalesToInvoiceListItem) {
    if (isAdminContext) {
      toast.info("Select a specific organization to create invoices.");
      return;
    }
    if (row.sales_invoice_id) {
      router.push(`/sales/invoices/${row.sales_invoice_id}`);
      return;
    }
    startTransition(async () => {
      const res = await createSalesInvoiceFromOrder(row.id);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("invoiceId" in res && res.invoiceId) {
        toast.success(
          res.alreadyExists ? "Opening existing invoice" : "Invoice created"
        );
        router.push(`/sales/invoices/${res.invoiceId}`);
      }
    });
  }

  function renderTable(items: SalesToInvoiceListItem[]) {
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80">
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => toggleSort("quotation_number")}
              >
                Sales Order
                <SortIcon column="quotation_number" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => toggleSort("customer_name")}
              >
                Customer
                <SortIcon column="customer_name" />
              </TableHead>
              <TableHead>Salesperson</TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => toggleSort("created_at")}
              >
                Order Date
                <SortIcon column="created_at" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => toggleSort("total_amount")}
              >
                Total
                <SortIcon column="total_amount" />
              </TableHead>
              <TableHead>Invoice Status</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => (
              <TableRow
                key={row.id}
                className="hover:bg-[#017e84]/5 cursor-pointer"
                onClick={() => router.push(`/sales/to-invoice/${row.id}`)}
              >
                <TableCell className="font-medium text-[#017e84] whitespace-nowrap">
                  {row.quotation_number}
                </TableCell>
                <TableCell>{row.customer_name}</TableCell>
                <TableCell className="text-secondary-muted">
                  {row.salesperson_name || "—"}
                </TableCell>
                <TableCell className="text-secondary-muted whitespace-nowrap">
                  {formatDate(row.order_date)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatMoney(row.total)}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[11px] font-medium ${invoiceBadgeClass(row.invoice_status)}`}
                  >
                    {salesInvoiceStatusLabel(row.invoice_status)}
                  </span>
                </TableCell>
                <TableCell className="text-secondary-muted">
                  {row.organization_name || "—"}
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  {row.invoice_status === "to_invoice" ||
                  row.sales_invoice_id ? (
                    <Button
                      size="sm"
                      className="h-7 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white gap-1"
                      disabled={isPending}
                      onClick={() => createInvoice(row)}
                    >
                      <FilePlus2 className="h-3.5 w-3.5" />
                      {row.sales_invoice_id ? "View Invoice" : "Create Invoice"}
                    </Button>
                  ) : (
                    <span className="text-xs text-secondary-muted">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-sm border-slate-200 font-normal"
              >
                Group By
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-secondary-muted">
                Group By
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={groupBy} onValueChange={setGroupBy}>
                {GROUP_OPTIONS.map((opt) => (
                  <DropdownMenuRadioItem
                    key={opt.id}
                    value={opt.id}
                    className="cursor-pointer"
                  >
                    {opt.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-sm gap-1.5"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-sm gap-1.5"
            onClick={handleExport}
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
        <span className="text-sm text-secondary-muted">
          {total} order{total === 1 ? "" : "s"}
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden min-h-[320px]">
        {loading ? (
          <div className="p-4">
            <SalesPageSkeleton rows={8} />
          </div>
        ) : rows.length === 0 ? (
          <SalesEmptyState
            title="No orders to invoice"
            description="Confirm a quotation to create a sales order, then create an invoice."
            action={
              <Button
                size="sm"
                className="h-8 bg-[#017e84] hover:bg-[#016970] text-white rounded-sm"
                onClick={() => router.push("/sales/orders")}
              >
                Go to Orders
              </Button>
            }
          />
        ) : grouped ? (
          <div className="divide-y divide-slate-200">
            {grouped.map(([label, items]) => (
              <div key={label}>
                <div className="px-4 py-2 bg-slate-50 text-sm font-semibold">
                  {label}
                  <span className="ml-2 font-normal text-secondary-muted">
                    ({items.length})
                  </span>
                </div>
                {renderTable(items)}
              </div>
            ))}
          </div>
        ) : (
          renderTable(rows)
        )}
      </div>

      {total > 0 ? (
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
