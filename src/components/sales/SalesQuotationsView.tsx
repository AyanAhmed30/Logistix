"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  LayoutGrid,
  List,
  RefreshCw,
  Upload,
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
  getSalesQuotationsList,
  type SalesQuotationListItem,
} from "@/app/actions/sales/quotations-list";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useSalesShell } from "@/components/sales/SalesShell";
import {
  SalesEmptyState,
  SalesKanbanSkeleton,
  SalesPageSkeleton,
} from "@/components/sales/SalesSkeleton";
import {
  SALES_GROUP_BY_OPTIONS,
  salesQuotationStatusLabel,
  type SalesQuotationUiStatus,
} from "@/lib/sales-navigation";

type ViewMode = "list" | "kanban";
type SortKey =
  | "quotation_number"
  | "customer_name"
  | "total_amount"
  | "created_at"
  | "expiration_date";

const PAGE_SIZE = 40;

function statusBadgeClass(status: SalesQuotationUiStatus) {
  switch (status) {
    case "sent":
      return "bg-sky-100 text-sky-800 border-sky-200";
    case "review":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    case "confirmed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "cancelled":
      return "bg-slate-100 text-slate-600 border-slate-200";
    case "expired":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "draft":
    default:
      return "bg-amber-50 text-amber-900 border-amber-200";
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

export function SalesQuotationsView() {
  const router = useRouter();
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const { searchQuery, activeFilterId, groupBy, setGroupBy } = useSalesShell();

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SalesQuotationListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [refreshKey, setRefreshKey] = useState(0);

  const statusFilter =
    activeFilterId === "all"
      ? "all"
      : (activeFilterId as SalesQuotationUiStatus);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getSalesQuotationsList({
      search: searchQuery,
      status: statusFilter,
      sortBy,
      sortDir,
      page,
      pageSize: PAGE_SIZE,
    });
    if ("error" in res && res.error) {
      toast.error(res.error);
      setRows([]);
      setTotal(0);
    } else if ("quotations" in res) {
      setRows(res.quotations);
      setTotal(res.total);
    }
    setLoading(false);
  }, [searchQuery, statusFilter, sortBy, sortDir, page]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, switchVersion]);

  useEffect(() => {
    void load();
  }, [load, switchVersion, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const grouped = useMemo(() => {
    if (groupBy === "none") return null;
    const map = new Map<string, SalesQuotationListItem[]>();
    for (const row of rows) {
      let key = "Other";
      if (groupBy === "status") key = salesQuotationStatusLabel(row.status);
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
      setSortDir(key === "quotation_number" || key === "customer_name" ? "asc" : "desc");
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

  function handleNew() {
    if (isAdminContext) {
      toast.info(
        "Select a specific organization from the company switcher to create a quotation."
      );
      return;
    }
    router.push("/sales/quotations/new");
  }

  function handleExport() {
    if (rows.length === 0) {
      toast.info("Nothing to export.");
      return;
    }
    const header = [
      "Quotation Number",
      "Customer",
      "Salesperson",
      "Quotation Date",
      "Expiration Date",
      "Total",
      "Status",
      "Organization",
    ];
    const lines = rows.map((r) =>
      [
        r.quotation_number,
        r.customer_name,
        r.salesperson_name || "",
        formatDate(r.quotation_date),
        formatDate(r.expiration_date),
        String(r.total),
        salesQuotationStatusLabel(r.status),
        r.organization_name || "",
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quotations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported quotations CSV");
  }

  function openRow(row: SalesQuotationListItem) {
    // Form not implemented yet — route to placeholder detail
    router.push(`/sales/quotations/${row.id}`);
  }

  const kanbanColumns: { id: SalesQuotationUiStatus; label: string }[] = [
    { id: "draft", label: "Quotation" },
    { id: "sent", label: "Quotation Sent" },
    { id: "review", label: "Customer Review" },
    { id: "expired", label: "Expired" },
    { id: "confirmed", label: "Sales Order" },
    { id: "cancelled", label: "Cancelled" },
  ];

  function renderTable(items: SalesQuotationListItem[]) {
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80">
              <TableHead
                className="cursor-pointer select-none whitespace-nowrap"
                onClick={() => toggleSort("quotation_number")}
              >
                Number
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
                className="cursor-pointer select-none whitespace-nowrap"
                onClick={() => toggleSort("created_at")}
              >
                Quotation Date
                <SortIcon column="created_at" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none whitespace-nowrap"
                onClick={() => toggleSort("expiration_date")}
              >
                Expiration
                <SortIcon column="expiration_date" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => toggleSort("total_amount")}
              >
                Total
                <SortIcon column="total_amount" />
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Organization</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer hover:bg-[#017e84]/5"
                onClick={() => openRow(row)}
              >
                <TableCell className="font-medium text-[#017e84] whitespace-nowrap">
                  {row.quotation_number}
                </TableCell>
                <TableCell className="text-primary-dark">
                  {row.customer_name}
                </TableCell>
                <TableCell className="text-secondary-muted">
                  {row.salesperson_name || "—"}
                </TableCell>
                <TableCell className="text-secondary-muted whitespace-nowrap">
                  {formatDate(row.quotation_date)}
                </TableCell>
                <TableCell className="text-secondary-muted whitespace-nowrap">
                  {formatDate(row.expiration_date)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatMoney(row.total)}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(row.status)}`}
                  >
                    {salesQuotationStatusLabel(row.status)}
                  </span>
                </TableCell>
                <TableCell className="text-secondary-muted">
                  {row.organization_name || "—"}
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
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-sm border border-slate-200 bg-white p-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`h-7 px-2 rounded-sm ${
                viewMode === "list" ? "bg-slate-100 text-[#017e84]" : ""
              }`}
              onClick={() => setViewMode("list")}
              aria-pressed={viewMode === "list"}
              title="List view"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`h-7 px-2 rounded-sm ${
                viewMode === "kanban" ? "bg-slate-100 text-[#017e84]" : ""
              }`}
              onClick={() => setViewMode("kanban")}
              aria-pressed={viewMode === "kanban"}
              title="Kanban view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>

          {viewMode === "list" ? (
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
                <DropdownMenuRadioGroup
                  value={groupBy}
                  onValueChange={setGroupBy}
                >
                  {SALES_GROUP_BY_OPTIONS.map((opt) => (
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
          ) : null}

          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-sm border-slate-200 font-normal gap-1.5"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-sm border-slate-200 font-normal gap-1.5"
            onClick={handleExport}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-sm border-slate-200 font-normal gap-1.5"
            onClick={() =>
              toast.info("Import will be available in a later Sales phase.")
            }
          >
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Import</span>
          </Button>
        </div>

        <span className="text-sm text-secondary-muted">
          {total} quotation{total === 1 ? "" : "s"}
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden min-h-[320px]">
        {loading ? (
          <div className="p-4">
            {viewMode === "kanban" ? (
              <SalesKanbanSkeleton />
            ) : (
              <SalesPageSkeleton rows={8} />
            )}
          </div>
        ) : rows.length === 0 ? (
          <SalesEmptyState
            title="No quotations found"
            description="Create a quotation with New, or adjust search and filters."
            action={
              <Button
                size="sm"
                className="h-8 bg-[#017e84] hover:bg-[#016970] text-white rounded-sm"
                onClick={handleNew}
              >
                New
              </Button>
            }
          />
        ) : viewMode === "kanban" ? (
          <div className="flex gap-3 overflow-x-auto p-3">
            {kanbanColumns.map((col) => {
              const cards = rows.filter((r) => r.status === col.id);
              return (
                <div
                  key={col.id}
                  className="w-[280px] shrink-0 rounded-sm border border-slate-200 bg-slate-50/80"
                >
                  <div className="px-3 py-2.5 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-sm font-semibold text-primary-dark">
                      {col.label}
                    </span>
                    <span className="text-xs text-secondary-muted">
                      {cards.length}
                    </span>
                  </div>
                  <div className="p-2 space-y-2 max-h-[70vh] overflow-y-auto">
                    {cards.length === 0 ? (
                      <p className="text-xs text-secondary-muted px-1 py-4 text-center">
                        No records
                      </p>
                    ) : (
                      cards.map((card) => (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => openRow(card)}
                          className="w-full text-left rounded-sm border border-slate-200 bg-white p-3 shadow-sm hover:border-[#017e84]/40 transition-colors"
                        >
                          <p className="text-sm font-semibold text-[#017e84]">
                            {card.quotation_number}
                          </p>
                          <p className="text-sm text-primary-dark mt-1 truncate">
                            {card.customer_name}
                          </p>
                          <p className="text-xs text-secondary-muted mt-2">
                            {card.salesperson_name || "Unassigned"}
                          </p>
                          <p className="text-sm font-medium tabular-nums mt-2">
                            {formatMoney(card.total)}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : grouped ? (
          <div className="divide-y divide-slate-200">
            {grouped.map(([label, items]) => (
              <div key={label}>
                <div className="px-4 py-2 bg-slate-50 text-sm font-semibold text-primary-dark">
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

      {viewMode === "list" && total > 0 ? (
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
