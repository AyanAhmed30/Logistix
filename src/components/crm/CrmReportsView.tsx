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
  getCrmReportsDashboard,
  type CrmReportFilters,
  type CrmReportsDashboard,
} from "@/app/actions/crm/reports";
import {
  getCachedCrmPipelineStages,
  getCachedSalespersonOptions,
} from "@/lib/crm-client-cache";
import { type SalespersonOption } from "@/app/actions/contacts";
import type { CrmPipelineStage } from "@/app/actions/crm/types";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { CrmPageSkeleton } from "@/components/crm/CrmSkeleton";

const CHART_COLORS = ["#017e84", "#0ea5a8", "#64748b", "#f59e0b", "#ef4444", "#8b5cf6", "#10b981"];

function formatMoney(n: number) {
  return `Rs. ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
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

/** Excel-friendly TSV (opens in Excel); PDF reserved for later. */
function exportDashboard(dashboard: CrmReportsDashboard, format: "csv" | "excel") {
  const rows: string[][] = [
    ["Metric", "Value"],
    ["Total Opportunities", String(dashboard.total_opportunities)],
    ["Open Opportunities", String(dashboard.open_opportunities)],
    ["Won Opportunities", String(dashboard.won_opportunities)],
    ["Lost Opportunities", String(dashboard.lost_opportunities)],
    ["Total Expected Revenue", String(dashboard.total_expected_revenue)],
    ["Open Expected Revenue", String(dashboard.open_expected_revenue)],
    ["Won Revenue", String(dashboard.won_revenue)],
    ["Win Rate %", String(dashboard.win_rate)],
    [],
    ["Stage", "Count", "Revenue"],
    ...dashboard.by_stage.map((r) => [r.name, String(r.count), String(r.value ?? 0)]),
    [],
    ["Salesperson", "Open", "Won", "Lost", "Revenue", "Win Rate %"],
    ...dashboard.salesperson_performance.map((r) => [
      r.name,
      String(r.open),
      String(r.won),
      String(r.lost),
      String(r.revenue),
      String(r.win_rate),
    ]),
    [],
    ["Activity Type", "Count"],
    ...dashboard.activities_by_type.map((r) => [r.name, String(r.count)]),
  ];

  if (format === "csv") {
    downloadBlob(`crm-reports-${Date.now()}.csv`, toCsv(rows), "text/csv;charset=utf-8");
  } else {
    // UTF-16LE BOM helps Excel open Unicode correctly
    const tsv = rows.map((r) => r.join("\t")).join("\n");
    const bom = "\uFEFF";
    downloadBlob(
      `crm-reports-${Date.now()}.xls`,
      bom + tsv,
      "application/vnd.ms-excel;charset=utf-8"
    );
  }
  toast.success(format === "csv" ? "CSV exported" : "Excel file exported");
}

function BarChart({
  data,
  valueKey = "count",
}: {
  data: Array<{ name: string; count: number; value?: number }>;
  valueKey?: "count" | "value";
}) {
  const max = Math.max(...data.map((d) => Number(valueKey === "value" ? d.value ?? 0 : d.count)), 1);
  if (data.length === 0) {
    return <p className="text-xs text-secondary-muted py-8 text-center">No data</p>;
  }
  return (
    <div className="space-y-2">
      {data.map((d, i) => {
        const val = Number(valueKey === "value" ? d.value ?? 0 : d.count);
        const pct = Math.max(4, (val / max) * 100);
        return (
          <div key={d.name} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-primary-dark font-medium truncate">{d.name}</span>
              <span className="text-secondary-muted tabular-nums">
                {valueKey === "value" ? formatMoney(val) : val}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
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
            total === 0 || data.every((d) => d.count === 0)
              ? "#e2e8f0"
              : `conic-gradient(${gradient})`,
          mask: "radial-gradient(farthest-side, transparent 52%, #000 53%)",
          WebkitMask: "radial-gradient(farthest-side, transparent 52%, #000 53%)",
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

export function CrmReportsView() {
  const { switchVersion } = useAdminOrganization();
  const searchParams = useSearchParams();
  const reportView = searchParams.get("view") === "activities" ? "activities" : "pipeline";
  const [dashboard, setDashboard] = useState<CrmReportsDashboard | null>(null);
  const [stages, setStages] = useState<CrmPipelineStage[]>([]);
  const [salespersons, setSalespersons] = useState<SalespersonOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const [salespersonId, setSalespersonId] = useState("all");
  const [stageId, setStageId] = useState("all");
  const [tag, setTag] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filters: CrmReportFilters = useMemo(
    () => ({
      salespersonId: salespersonId === "all" ? null : salespersonId,
      stageId: stageId === "all" ? null : stageId,
      tag: tag.trim() || null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    }),
    [salespersonId, stageId, tag, dateFrom, dateTo]
  );

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getCrmReportsDashboard(filters);
    setLoading(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    if ("dashboard" in res) setDashboard(res.dashboard);
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load, switchVersion]);

  useEffect(() => {
    void Promise.all([getCachedCrmPipelineStages(), getCachedSalespersonOptions()]).then(
      ([stagesRes, salesRes]) => {
        if ("stages" in stagesRes && stagesRes.stages) setStages(stagesRes.stages);
        if ("salespersons" in salesRes && salesRes.salespersons) {
          setSalespersons(salesRes.salespersons);
        }
      }
    );
  }, [switchVersion]);

  const kpis = dashboard
    ? [
        { label: "Total Opportunities", value: String(dashboard.total_opportunities) },
        { label: "Open", value: String(dashboard.open_opportunities) },
        { label: "Won", value: String(dashboard.won_opportunities) },
        { label: "Lost", value: String(dashboard.lost_opportunities) },
        { label: "Expected Revenue", value: formatMoney(dashboard.total_expected_revenue) },
        { label: "Win Rate", value: `${dashboard.win_rate}%` },
        {
          label: "Activities",
          value: `${dashboard.activity_summary.scheduled} open / ${dashboard.activity_summary.overdue} overdue`,
        },
      ]
    : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-secondary-muted">
          {reportView === "activities"
            ? "Activity volume, overdue work, and follow-up performance"
            : "Pipeline analysis, forecasts, and salesperson performance"}
        </p>
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
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
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

        <Select value={stageId} onValueChange={setStageId}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="Tag filter…"
          className="w-[140px] h-9"
        />
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-[150px] h-9"
          title="From date"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-[150px] h-9"
          title="To date"
        />
      </div>

      {loading && !dashboard ? (
        <CrmPageSkeleton rows={6} />
      ) : dashboard ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            {kpis.map((k) => {
              const emphasize =
                reportView === "activities" && k.label === "Activities";
              return (
              <div
                key={k.label}
                className={`bg-white border px-3 py-3 shadow-sm rounded-sm ${
                  emphasize
                    ? "border-[#017e84] ring-1 ring-[#017e84]/30"
                    : "border-slate-200"
                }`}
              >
                <div className="text-[10px] uppercase tracking-wide text-secondary-muted">
                  {k.label}
                </div>
                <div className="text-sm font-semibold text-primary-dark mt-1 tabular-nums leading-snug">
                  {k.value}
                </div>
              </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {reportView === "activities" ? (
              <>
                <ChartCard title="Activities by Type">
                  <BarChart data={dashboard.activities_by_type} />
                </ChartCard>
                <ChartCard title="Win vs Lost">
                  <DonutChart data={dashboard.win_vs_lost} />
                </ChartCard>
                <ChartCard title="Opportunities by Stage">
                  <BarChart data={dashboard.by_stage} />
                </ChartCard>
                <ChartCard title="Revenue Forecast (weighted)">
                  <BarChart data={dashboard.revenue_forecast} valueKey="value" />
                </ChartCard>
              </>
            ) : (
              <>
                <ChartCard title="Opportunities by Stage">
                  <BarChart data={dashboard.by_stage} />
                </ChartCard>
                <ChartCard title="Revenue Forecast (weighted)">
                  <BarChart data={dashboard.revenue_forecast} valueKey="value" />
                </ChartCard>
                <ChartCard title="Win vs Lost">
                  <DonutChart data={dashboard.win_vs_lost} />
                </ChartCard>
                <ChartCard title="Activities by Type">
                  <BarChart data={dashboard.activities_by_type} />
                </ChartCard>
              </>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-primary-dark">
                Salesperson Performance
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-secondary-muted">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Salesperson</th>
                    <th className="text-right px-4 py-2 font-medium">Open</th>
                    <th className="text-right px-4 py-2 font-medium">Won</th>
                    <th className="text-right px-4 py-2 font-medium">Lost</th>
                    <th className="text-right px-4 py-2 font-medium">Revenue</th>
                    <th className="text-right px-4 py-2 font-medium">Win Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dashboard.salesperson_performance.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-secondary-muted text-xs">
                        No opportunity data
                      </td>
                    </tr>
                  ) : (
                    dashboard.salesperson_performance.map((row) => (
                      <tr key={row.name} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 font-medium text-primary-dark">{row.name}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{row.open}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">
                          {row.won}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-red-600">
                          {row.lost}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {formatMoney(row.revenue)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{row.win_rate}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Stage Analysis">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-secondary-muted">
                    <tr>
                      <th className="text-left py-1 font-medium">Stage</th>
                      <th className="text-right py-1 font-medium">Count</th>
                      <th className="text-right py-1 font-medium">Revenue</th>
                      <th className="text-right py-1 font-medium">Avg Prob</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.stage_analysis.map((s) => (
                      <tr key={s.name} className="border-t border-slate-100">
                        <td className="py-1.5">{s.name}</td>
                        <td className="py-1.5 text-right tabular-nums">{s.count}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {formatMoney(s.revenue)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{s.avg_probability}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>
            <ChartCard title="Lost Reasons">
              {dashboard.lost_reasons.length === 0 ? (
                <p className="text-xs text-secondary-muted py-6 text-center">
                  No lost opportunities in this period
                </p>
              ) : (
                <BarChart data={dashboard.lost_reasons} valueKey="value" />
              )}
            </ChartCard>
          </div>
        </>
      ) : null}
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
