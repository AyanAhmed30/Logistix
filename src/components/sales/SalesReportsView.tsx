"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, FileSpreadsheet, RefreshCw } from "lucide-react";
import {
  getSalesReportsDashboard,
  type SalesReportFilters,
  type SalesReportsDashboard,
} from "@/app/actions/sales/reports";
import { getSalespersonOptions } from "@/app/actions/contacts";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useSalesShell } from "@/components/sales/SalesShell";
import { SalesReportSkeleton } from "@/components/sales/SalesSkeleton";

const CHART_COLORS = [
  "#017e84",
  "#0ea5a8",
  "#64748b",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#10b981",
];

type ReportView =
  | "sales"
  | "products"
  | "salesperson"
  | "customers"
  | "organization";

function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: string[][]) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const v = String(cell ?? "");
          if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
          return v;
        })
        .join(",")
    )
    .join("\n");
}

function exportDashboard(
  dashboard: SalesReportsDashboard,
  format: "csv" | "excel"
) {
  const rows: string[][] = [
    ["Metric", "Value"],
    ["Total Quotations", String(dashboard.total_quotations)],
    ["Total Sales Orders", String(dashboard.total_orders)],
    ["Total Revenue", String(dashboard.total_revenue)],
    ["Confirmed Orders", String(dashboard.confirmed_orders)],
    ["Cancelled Orders", String(dashboard.cancelled_orders)],
    ["Average Order Value", String(dashboard.average_order_value)],
    [],
    ["Status", "Count", "Revenue"],
    ...dashboard.quotations_by_status.map((r) => [
      r.name,
      String(r.count),
      String(r.revenue),
    ]),
    [],
    ["Month", "Count", "Revenue"],
    ...dashboard.revenue_by_month.map((r) => [
      r.name,
      String(r.count),
      String(r.revenue),
    ]),
    [],
    ["Salesperson", "Count", "Revenue"],
    ...dashboard.salesperson_performance.map((r) => [
      r.name,
      String(r.count),
      String(r.revenue),
    ]),
    [],
    ["Product", "Count", "Revenue"],
    ...dashboard.product_performance.map((r) => [
      r.name,
      String(r.count),
      String(r.revenue),
    ]),
    [],
    ["Customer", "Count", "Revenue"],
    ...dashboard.customer_analysis.map((r) => [
      r.name,
      String(r.count),
      String(r.revenue),
    ]),
    [],
    ["Organization", "Count", "Revenue"],
    ...dashboard.organization_reports.map((r) => [
      r.name,
      String(r.count),
      String(r.revenue),
    ]),
  ];

  if (format === "csv") {
    downloadBlob(
      `sales-reports-${Date.now()}.csv`,
      toCsv(rows),
      "text/csv;charset=utf-8"
    );
  } else {
    const tsv = rows.map((r) => r.join("\t")).join("\n");
    downloadBlob(
      `sales-reports-${Date.now()}.xls`,
      "\uFEFF" + tsv,
      "application/vnd.ms-excel;charset=utf-8"
    );
  }
  toast.success(format === "csv" ? "CSV exported" : "Excel file exported");
}

function BarChart({
  data,
  valueKey = "count",
}: {
  data: Array<{ name: string; count: number; revenue?: number }>;
  valueKey?: "count" | "revenue";
}) {
  const max = Math.max(
    ...data.map((d) =>
      Number(valueKey === "revenue" ? d.revenue ?? 0 : d.count)
    ),
    1
  );
  if (data.length === 0) {
    return (
      <p className="text-xs text-secondary-muted py-8 text-center">No data</p>
    );
  }
  return (
    <div className="space-y-2">
      {data.map((d, i) => {
        const val = Number(valueKey === "revenue" ? d.revenue ?? 0 : d.count);
        const pct = Math.max(4, (val / max) * 100);
        return (
          <div key={`${d.name}-${i}`} className="space-y-1">
            <div className="flex justify-between text-xs gap-2">
              <span className="text-primary-dark font-medium truncate">
                {d.name}
              </span>
              <span className="text-secondary-muted tabular-nums shrink-0">
                {valueKey === "revenue" ? formatMoney(val) : val}
              </span>
            </div>
            <div className="h-2.5 rounded-sm bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-sm transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LineChart({
  data,
}: {
  data: Array<{ name: string; revenue: number }>;
}) {
  if (data.length === 0) {
    return (
      <p className="text-xs text-secondary-muted py-8 text-center">No data</p>
    );
  }
  const max = Math.max(...data.map((d) => d.revenue), 1);
  const w = 320;
  const h = 120;
  const pad = 8;
  const points = data.map((d, i) => {
    const x = pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2);
    const y = h - pad - (d.revenue / max) * (h - pad * 2);
    return `${x},${y}`;
  });
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32">
        <polyline
          fill="none"
          stroke="#017e84"
          strokeWidth="2"
          points={points.join(" ")}
        />
        {data.map((d, i) => {
          const x = pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2);
          const y = h - pad - (d.revenue / max) * (h - pad * 2);
          return (
            <circle key={d.name} cx={x} cy={y} r="3" fill="#017e84">
              <title>
                {d.name}: {formatMoney(d.revenue)}
              </title>
            </circle>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-secondary-muted mt-1">
        <span>{data[0]?.name}</span>
        <span>{data[data.length - 1]?.name}</span>
      </div>
    </div>
  );
}

function DonutChart({
  data,
}: {
  data: Array<{ name: string; count: number }>;
}) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  let acc = 0;
  const segments = data.map((d, i) => {
    const start = acc / total;
    acc += d.count;
    const end = acc / total;
    return { ...d, start, end, color: CHART_COLORS[i % CHART_COLORS.length] };
  });
  const gradient = segments
    .map((s) => `${s.color} ${s.start * 100}% ${s.end * 100}%`)
    .join(", ");

  return (
    <div className="flex items-center gap-4">
      <div
        className="h-28 w-28 rounded-full shrink-0"
        style={{
          background:
            data.every((d) => d.count === 0)
              ? "#e2e8f0"
              : `conic-gradient(${gradient})`,
          mask: "radial-gradient(farthest-side, transparent 52%, #000 53%)",
          WebkitMask:
            "radial-gradient(farthest-side, transparent 52%, #000 53%)",
        }}
      />
      <ul className="space-y-1.5 text-xs">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="text-primary-dark">{d.name}</span>
            <span className="text-secondary-muted tabular-nums">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-sm shadow-sm p-4">
      <h2 className="text-sm font-semibold text-primary-dark mb-3">{title}</h2>
      {children}
    </div>
  );
}

function NamedTable({
  title,
  rows,
  search,
}: {
  title: string;
  rows: Array<{ name: string; count: number; revenue: number }>;
  search: string;
}) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-primary-dark">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-secondary-muted">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Name</th>
              <th className="text-right px-4 py-2 font-medium">Count</th>
              <th className="text-right px-4 py-2 font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-8 text-center text-secondary-muted text-xs"
                >
                  No data
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.name} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-medium text-primary-dark">
                    {row.name}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.count}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatMoney(row.revenue)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SalesReportsView() {
  const { switchVersion } = useAdminOrganization();
  const { searchQuery } = useSalesShell();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view");
  const reportView: ReportView =
    viewParam === "products"
      ? "products"
      : viewParam === "salesperson"
        ? "salesperson"
        : viewParam === "customers"
          ? "customers"
          : viewParam === "organization"
            ? "organization"
            : "sales";

  const [dashboard, setDashboard] = useState<SalesReportsDashboard | null>(
    null
  );
  const [salespersons, setSalespersons] = useState<
    { id: string; name: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const [salespersonId, setSalespersonId] = useState("all");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [groupBy, setGroupBy] = useState<
    "none" | "salesperson" | "customer" | "product" | "month" | "status"
  >("none");

  const filters: SalesReportFilters = useMemo(
    () => ({
      salespersonId: salespersonId === "all" ? null : salespersonId,
      status: status === "all" ? null : status,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      groupBy,
    }),
    [salespersonId, status, dateFrom, dateTo, groupBy]
  );

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getSalesReportsDashboard(filters);
    setLoading(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    if ("dashboard" in res && res.dashboard) setDashboard(res.dashboard);
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load, switchVersion]);

  useEffect(() => {
    void getSalespersonOptions().then((res) => {
      if ("salespersons" in res && res.salespersons) {
        setSalespersons(res.salespersons);
      }
    });
  }, [switchVersion]);

  const kpis = dashboard
    ? [
        { label: "Total Quotations", value: String(dashboard.total_quotations) },
        { label: "Total Sales Orders", value: String(dashboard.total_orders) },
        {
          label: "Total Revenue",
          value: formatMoney(dashboard.total_revenue),
        },
        {
          label: "Confirmed Orders",
          value: String(dashboard.confirmed_orders),
        },
        {
          label: "Cancelled Orders",
          value: String(dashboard.cancelled_orders),
        },
        {
          label: "Average Order Value",
          value: formatMoney(dashboard.average_order_value),
        },
      ]
    : [];

  const subtitle =
    reportView === "products"
      ? "Product performance across quotations and orders"
      : reportView === "salesperson"
        ? "Salesperson performance and revenue contribution"
        : reportView === "customers"
          ? "Customer analysis and order volume"
          : reportView === "organization"
            ? "Organization-level sales breakdown"
            : "Quotations analysis, sales analysis, and revenue trends";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-secondary-muted">{subtitle}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-sm"
            disabled={!dashboard || isPending}
            onClick={() => dashboard && exportDashboard(dashboard, "csv")}
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-sm"
            disabled={!dashboard || isPending}
            onClick={() => dashboard && exportDashboard(dashboard, "excel")}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Excel
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-[#017e84] hover:bg-[#016970] rounded-sm"
            disabled={loading || isPending}
            onClick={() => startTransition(() => void load())}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={salespersonId} onValueChange={setSalespersonId}>
          <SelectTrigger className="w-[160px] h-8 rounded-sm text-sm">
            <SelectValue placeholder="Salesperson" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All salespersons</SelectItem>
            {salespersons.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[150px] h-8 rounded-sm text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="quotation">Draft</SelectItem>
            <SelectItem value="quotation_sent">Sent</SelectItem>
            <SelectItem value="customer_review">Customer Review</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="sales_order">Sales Order</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={groupBy}
          onValueChange={(v) =>
            setGroupBy(
              v as
                | "none"
                | "salesperson"
                | "customer"
                | "product"
                | "month"
                | "status"
            )
          }
        >
          <SelectTrigger className="w-[150px] h-8 rounded-sm text-sm">
            <SelectValue placeholder="Group By" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Group By</SelectItem>
            <SelectItem value="salesperson">Salesperson</SelectItem>
            <SelectItem value="customer">Customer</SelectItem>
            <SelectItem value="product">Product</SelectItem>
            <SelectItem value="month">Month</SelectItem>
            <SelectItem value="status">Status</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-[150px] h-8 rounded-sm"
          title="From date"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-[150px] h-8 rounded-sm"
          title="To date"
        />
      </div>

      {loading && !dashboard ? (
        <SalesReportSkeleton />
      ) : dashboard ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {kpis.map((k) => (
              <div
                key={k.label}
                className="bg-white border border-slate-200 px-3 py-3 shadow-sm rounded-sm"
              >
                <div className="text-[10px] uppercase tracking-wide text-secondary-muted">
                  {k.label}
                </div>
                <div className="text-sm font-semibold text-primary-dark mt-1 tabular-nums leading-snug">
                  {k.value}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {(reportView === "sales" || groupBy === "status") && (
              <ChartCard title="Quotations Analysis (by Status)">
                <DonutChart data={dashboard.quotations_by_status} />
              </ChartCard>
            )}
            {(reportView === "sales" || groupBy === "month") && (
              <ChartCard title="Revenue Analysis (by Month)">
                <LineChart data={dashboard.revenue_by_month} />
              </ChartCard>
            )}
            {(reportView === "sales" || reportView === "salesperson") && (
              <ChartCard title="Salesperson Performance">
                <BarChart
                  data={dashboard.salesperson_performance}
                  valueKey="revenue"
                />
              </ChartCard>
            )}
            {(reportView === "sales" || reportView === "products") && (
              <ChartCard title="Product Performance">
                <BarChart
                  data={dashboard.product_performance}
                  valueKey="revenue"
                />
              </ChartCard>
            )}
            {(reportView === "sales" || reportView === "customers") && (
              <ChartCard title="Customer Analysis">
                <BarChart
                  data={dashboard.customer_analysis}
                  valueKey="revenue"
                />
              </ChartCard>
            )}
            {(reportView === "sales" || reportView === "organization") && (
              <ChartCard title="Organization Reports">
                <BarChart
                  data={dashboard.organization_reports}
                  valueKey="revenue"
                />
              </ChartCard>
            )}
            {reportView === "sales" ? (
              <ChartCard title="Orders vs Quotations">
                <DonutChart data={dashboard.orders_vs_quotations} />
              </ChartCard>
            ) : null}
          </div>

          {reportView === "salesperson" || groupBy === "salesperson" ? (
            <NamedTable
              title="Salesperson Performance"
              rows={dashboard.salesperson_performance}
              search={searchQuery}
            />
          ) : null}
          {reportView === "products" || groupBy === "product" ? (
            <NamedTable
              title="Product Performance"
              rows={dashboard.product_performance}
              search={searchQuery}
            />
          ) : null}
          {reportView === "customers" || groupBy === "customer" ? (
            <NamedTable
              title="Customer Analysis"
              rows={dashboard.customer_analysis}
              search={searchQuery}
            />
          ) : null}
          {reportView === "organization" ? (
            <NamedTable
              title="Organization Reports"
              rows={dashboard.organization_reports}
              search={searchQuery}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
