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
import { getSalesOrdersToUpsell } from "@/app/actions/sales/to-invoice";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useSalesShell } from "@/components/sales/SalesShell";
import {
  SalesEmptyState,
  SalesPageSkeleton,
} from "@/components/sales/SalesSkeleton";

type Row = {
  id: string;
  quotation_number: string;
  customer_name: string;
  salesperson_name: string | null;
  current_revenue: number;
  invoice_status: string;
  upsell_opportunity: string;
  order_date: string;
};

type SortKey =
  | "quotation_number"
  | "customer_name"
  | "total_amount"
  | "created_at";

const PAGE_SIZE = 40;
const GROUP_OPTIONS = [
  { id: "none", label: "No grouping" },
  { id: "salesperson", label: "Salesperson" },
  { id: "customer", label: "Customer" },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function SalesOrdersToUpsellView() {
  const router = useRouter();
  const { switchVersion } = useAdminOrganization();
  const { searchQuery, activeFilterId, groupBy, setGroupBy } = useSalesShell();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getSalesOrdersToUpsell({
      search: searchQuery,
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
      let list = res.orders as Row[];
      if (activeFilterId === "invoiced" || activeFilterId === "to_invoice") {
        list = list.filter((r) => r.invoice_status === activeFilterId);
      }
      setRows(list);
      setTotal(activeFilterId === "all" ? (res.total ?? 0) : list.length);
    }
    setLoading(false);
  }, [searchQuery, activeFilterId, sortBy, sortDir, page]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, activeFilterId, switchVersion]);

  useEffect(() => {
    void load();
  }, [load, switchVersion, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const grouped = useMemo(() => {
    if (groupBy === "none") return null;
    const map = new Map<string, Row[]>();
    for (const row of rows) {
      let key = "Other";
      if (groupBy === "salesperson") key = row.salesperson_name || "Unassigned";
      else if (groupBy === "customer") key = row.customer_name || "—";
      const list = map.get(key) || [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, groupBy]);

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
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
      "Current Revenue",
      "Upsell Opportunity",
    ];
    const lines = rows.map((r) =>
      [
        r.quotation_number,
        r.customer_name,
        r.salesperson_name || "",
        String(r.current_revenue),
        r.upsell_opportunity,
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
    a.download = `orders-to-upsell-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  }

  function renderTable(items: Row[]) {
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80">
              <TableHead
                className="cursor-pointer"
                onClick={() => toggleSort("quotation_number")}
              >
                Sales Order
                <SortIcon column="quotation_number" />
              </TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => toggleSort("customer_name")}
              >
                Customer
                <SortIcon column="customer_name" />
              </TableHead>
              <TableHead>Salesperson</TableHead>
              <TableHead
                className="cursor-pointer text-right"
                onClick={() => toggleSort("total_amount")}
              >
                Current Revenue
                <SortIcon column="total_amount" />
              </TableHead>
              <TableHead>Upsell Opportunity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer hover:bg-[#017e84]/5"
                onClick={() => router.push(`/sales/orders/${row.id}`)}
              >
                <TableCell className="font-medium text-[#017e84]">
                  {row.quotation_number}
                </TableCell>
                <TableCell>{row.customer_name}</TableCell>
                <TableCell className="text-secondary-muted">
                  {row.salesperson_name || "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatMoney(row.current_revenue)}
                </TableCell>
                <TableCell className="text-secondary-muted text-sm">
                  {row.upsell_opportunity}
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
        <div className="flex flex-wrap gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-sm font-normal"
              >
                Group By
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel className="text-[11px] uppercase text-secondary-muted">
                Group By
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={groupBy} onValueChange={setGroupBy}>
                {GROUP_OPTIONS.map((opt) => (
                  <DropdownMenuRadioItem key={opt.id} value={opt.id}>
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
        <span className="text-sm text-secondary-muted">{total} order{total === 1 ? "" : "s"}</span>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm shadow-sm min-h-[320px] overflow-hidden">
        {loading ? (
          <div className="p-4">
            <SalesPageSkeleton rows={8} />
          </div>
        ) : rows.length === 0 ? (
          <SalesEmptyState
            title="No upsell candidates"
            description="Confirmed sales orders appear here for future upsell recommendations."
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
            className="h-8"
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
            className="h-8"
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
