"use client";

/**
 * @deprecated Legacy invoice/payment analytics dashboard.
 * Financial Statement Reports (BS / P&L / Cash Flow) live in
 * AccountingStatementReportsView + financial-reporting foundation.
 * This component is retained only for reference and is no longer routed.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  FileSpreadsheet,
  FileText,
  PieChart as PieIcon,
  TrendingUp,
  Users,
  Wallet,
  Building2,
  CalendarRange,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getAccountingReportBundle,
  logAccountingReportExported,
  type ReportFilters,
} from "@/app/actions/accounting/reports";
import {
  exportRowsAsCsv,
  exportRowsAsExcel,
  exportRowsAsPdf,
} from "@/lib/accounting-report-export";
import { formatMoney } from "@/lib/sales-quotation-form";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import {
  AccountingChartSkeleton,
  AccountingKpiSkeleton,
} from "@/components/accounting/AccountingSkeleton";

const TEAL = "#017e84";
const COLORS = [TEAL, "#0ea5a8", "#94a3b8", "#f59e0b", "#ef4444", "#64748b", "#10b981"];

type ReportId =
  | "overview"
  | "revenue"
  | "customers"
  | "invoices"
  | "payments"
  | "outstanding"
  | "aging"
  | "monthly"
  | "organization";

const REPORT_CARDS: {
  id: ReportId;
  title: string;
  description: string;
  icon: typeof TrendingUp;
}[] = [
  { id: "revenue", title: "Revenue Analysis", description: "Daily to yearly revenue KPIs", icon: TrendingUp },
  { id: "customers", title: "Customer Analysis", description: "Top customers & outstanding", icon: Users },
  { id: "invoices", title: "Invoice Analysis", description: "Status breakdown & volumes", icon: FileText },
  { id: "payments", title: "Payment Analysis", description: "Collection & methods", icon: Wallet },
  { id: "outstanding", title: "Outstanding Report", description: "Open balances by customer", icon: AlertTriangle },
  { id: "aging", title: "Aging Report", description: "Current · 1–30 · 31–60 · 61–90 · 90+", icon: CalendarRange },
  { id: "monthly", title: "Monthly Revenue", description: "Revenue vs payments by month", icon: BarChart3 },
  { id: "organization", title: "Organization Reports", description: "Scoped to active organization", icon: Building2 },
];

type Bundle = {
  kpis: {
    total_revenue: number;
    collected_revenue: number;
    outstanding_revenue: number;
    average_invoice_value: number;
    invoice_count: number;
    payment_count: number;
    collection_rate: number;
  };
  revenueByDay: { label: string; value: number; secondary?: number }[];
  revenueByWeek: { label: string; value: number; secondary?: number }[];
  revenueByMonth: { label: string; value: number; secondary?: number }[];
  revenueByQuarter: { label: string; value: number; secondary?: number }[];
  revenueByYear: { label: string; value: number; secondary?: number }[];
  invoiceStatusBreakdown: { name: string; value: number }[];
  paymentMethods: { name: string; value: number }[];
  paymentTrend: { label: string; value: number; secondary?: number }[];
  topCustomers: { name: string; value: number; id?: string }[];
  outstandingCustomers: { name: string; value: number; id?: string }[];
  outstandingRows: {
    id: string;
    invoice_number: string;
    customer_name: string;
    customer_lead_id: string | null;
    salesperson_name: string | null;
    due_date: string | null;
    outstanding_amount: number;
    days_overdue: number;
    organization_id: string | null;
  }[];
  aging: {
    current: number;
    d1_30: number;
    d31_60: number;
    d61_90: number;
    d90_plus: number;
  };
  agingChart: { name: string; value: number }[];
  monthlyComparison: { label: string; value: number; secondary?: number }[];
};

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-slate-200 bg-white p-3">
      <p className="text-[11px] uppercase tracking-wide text-secondary-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-primary-dark tabular-nums">{value}</p>
    </div>
  );
}

export function AccountingReportsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const report = (searchParams.get("report") as ReportId) || "overview";
  const { switchVersion } = useAdminOrganization();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [salesperson, setSalesperson] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const filters: ReportFilters = useMemo(
    () => ({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      salesperson: salesperson.trim() || undefined,
      invoiceStatus,
      paymentStatus,
    }),
    [dateFrom, dateTo, salesperson, invoiceStatus, paymentStatus]
  );

  const load = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingReportBundle(filters);
      if ("error" in res && res.error) {
        toast.error(res.error);
        setBundle(null);
      } else if ("kpis" in res && res.kpis) {
        setBundle(res as Bundle);
      } else {
        setBundle(null);
      }
      setLoading(false);
    });
  }, [filters]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  function openReport(id: ReportId) {
    router.push(id === "overview" ? "/accounting/reports" : `/accounting/reports?report=${id}`);
  }

  async function exportCurrent(format: "csv" | "excel" | "pdf") {
    if (!bundle) return;
    const rows =
      report === "outstanding" || report === "aging"
        ? bundle.outstandingRows.map((r) => ({
            invoice_number: r.invoice_number,
            customer: r.customer_name,
            due_date: r.due_date || "",
            outstanding: r.outstanding_amount,
            days_overdue: r.days_overdue,
            salesperson: r.salesperson_name || "",
          }))
        : report === "customers"
          ? bundle.topCustomers.map((c) => ({ name: c.name, revenue: c.value }))
          : bundle.revenueByMonth.map((p) => ({
              period: p.label,
              revenue: p.value,
              payments: p.secondary ?? 0,
            }));
    const columns =
      report === "outstanding" || report === "aging"
        ? [
            { key: "invoice_number", label: "Invoice" },
            { key: "customer", label: "Customer" },
            { key: "due_date", label: "Due Date" },
            { key: "outstanding", label: "Outstanding" },
            { key: "days_overdue", label: "Days Overdue" },
            { key: "salesperson", label: "Salesperson" },
          ]
        : report === "customers"
          ? [
              { key: "name", label: "Customer" },
              { key: "revenue", label: "Revenue" },
            ]
          : [
              { key: "period", label: "Period" },
              { key: "revenue", label: "Revenue" },
              { key: "payments", label: "Payments" },
            ];
    const title = REPORT_CARDS.find((c) => c.id === report)?.title || "Accounting Report";
    const base = `accounting-${report}-${new Date().toISOString().slice(0, 10)}`;
    if (format === "csv") exportRowsAsCsv(`${base}.csv`, columns, rows);
    else if (format === "excel") exportRowsAsExcel(base, columns, rows, title);
    else await exportRowsAsPdf(title, columns, rows, `${base}.pdf`);
    await logAccountingReportExported(report, format);
    toast.success(
      format === "pdf"
        ? "Report PDF exported"
        : format === "excel"
          ? "Report exported to Excel"
          : "Report exported to CSV"
    );
  }

  if (report === "overview") {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-primary-dark">Accounting Reports</h2>
          <p className="text-sm text-secondary-muted">
            Odoo-style analysis for revenue, customers, invoices, and collections
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {REPORT_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => openReport(card.id)}
                className="text-left rounded-sm border border-slate-200 bg-white p-4 hover:border-[#017e84]/50 transition-colors"
              >
                <Icon className="h-5 w-5 text-[#017e84] mb-2" />
                <p className="font-semibold text-primary-dark text-sm">{card.title}</p>
                <p className="text-xs text-secondary-muted mt-1">{card.description}</p>
              </button>
            );
          })}
        </div>
        {bundle ? (
          <div className="grid gap-2 sm:grid-cols-4">
            <Kpi label="Total Revenue" value={formatMoney(bundle.kpis.total_revenue)} />
            <Kpi label="Collected" value={formatMoney(bundle.kpis.collected_revenue)} />
            <Kpi label="Outstanding" value={formatMoney(bundle.kpis.outstanding_revenue)} />
            <Kpi label="Collection Rate" value={`${bundle.kpis.collection_rate}%`} />
          </div>
        ) : null}
      </div>
    );
  }

  const title = REPORT_CARDS.find((c) => c.id === report)?.title || "Report";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-sm mb-2"
            onClick={() => openReport("overview")}
          >
            All Reports
          </Button>
          <h2 className="text-lg font-semibold text-primary-dark">{title}</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm"
            disabled={!bundle}
            onClick={() => void exportCurrent("csv")}
          >
            CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm"
            disabled={!bundle}
            onClick={() => void exportCurrent("excel")}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
            Excel
          </Button>
          <Button
            size="sm"
            className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016a6f]"
            disabled={!bundle}
            onClick={() => void exportCurrent("pdf")}
          >
            PDF
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 bg-white border border-slate-200 rounded-sm p-3">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 w-36 rounded-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 w-36 rounded-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Salesperson</Label>
          <Input
            value={salesperson}
            onChange={(e) => setSalesperson(e.target.value)}
            placeholder="Name"
            className="h-8 w-40 rounded-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Invoice Status</Label>
          <select
            value={invoiceStatus}
            onChange={(e) => setInvoiceStatus(e.target.value)}
            className="h-8 rounded-sm border border-slate-200 px-2 text-sm bg-white"
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="posted">Posted</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Payment Status</Label>
          <select
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value)}
            className="h-8 rounded-sm border border-slate-200 px-2 text-sm bg-white"
          >
            <option value="all">All</option>
            <option value="not_paid">Not Paid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
      </div>

      {loading || isPending || !bundle ? (
        <div className="space-y-4">
          <AccountingKpiSkeleton count={4} />
          <div className="grid gap-3 lg:grid-cols-2">
            <AccountingChartSkeleton />
            <AccountingChartSkeleton />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-4">
            <Kpi label="Total Revenue" value={formatMoney(bundle.kpis.total_revenue)} />
            <Kpi label="Collected" value={formatMoney(bundle.kpis.collected_revenue)} />
            <Kpi label="Outstanding" value={formatMoney(bundle.kpis.outstanding_revenue)} />
            <Kpi
              label="Avg Invoice"
              value={formatMoney(bundle.kpis.average_invoice_value)}
            />
          </div>

          {(report === "revenue" || report === "monthly" || report === "organization") && (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="bg-white border border-slate-200 rounded-sm p-3 h-72">
                <p className="text-sm font-semibold mb-2">Revenue (Monthly)</p>
                <ResponsiveContainer width="100%" height="90%">
                  <LineChart data={bundle.revenueByMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="value" name="Revenue" stroke={TEAL} strokeWidth={2} />
                    <Line type="monotone" dataKey="secondary" name="Payments" stroke="#94a3b8" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white border border-slate-200 rounded-sm p-3 h-72">
                <p className="text-sm font-semibold mb-2">Revenue (Bar)</p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={bundle.monthlyComparison}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="value" name="Revenue" fill={TEAL} />
                    <Bar dataKey="secondary" name="Payments" fill="#94a3b8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {report === "revenue" ? (
            <div className="grid gap-2 sm:grid-cols-5 text-sm">
              {[
                ["Daily (30d)", bundle.revenueByDay],
                ["Weekly", bundle.revenueByWeek],
                ["Monthly", bundle.revenueByMonth],
                ["Quarterly", bundle.revenueByQuarter],
                ["Yearly", bundle.revenueByYear],
              ].map(([label, series]) => (
                <div key={String(label)} className="border border-slate-200 rounded-sm bg-white p-2">
                  <p className="text-xs text-secondary-muted">{label as string}</p>
                  <p className="font-semibold tabular-nums">
                    {formatMoney(
                      (series as { value: number }[]).reduce((a, p) => a + p.value, 0)
                    )}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {(report === "customers" || report === "organization") && (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="bg-white border border-slate-200 rounded-sm p-3 h-72">
                <p className="text-sm font-semibold mb-2">Top Customers</p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={bundle.topCustomers} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill={TEAL} name="Revenue" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white border border-slate-200 rounded-sm p-3 h-72">
                <p className="text-sm font-semibold mb-2 flex items-center gap-1">
                  <PieIcon className="h-3.5 w-3.5" /> Outstanding Share
                </p>
                <ResponsiveContainer width="100%" height="90%">
                  <PieChart>
                    <Pie
                      data={bundle.outstandingCustomers}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={90}
                      label={false}
                    >
                      {bundle.outstandingCustomers.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {(report === "invoices" || report === "organization") && (
            <div className="bg-white border border-slate-200 rounded-sm p-3 h-72">
              <p className="text-sm font-semibold mb-2">Invoice Status</p>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={bundle.invoiceStatusBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill={TEAL} name="Count" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {(report === "payments" || report === "organization") && (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="bg-white border border-slate-200 rounded-sm p-3 h-72">
                <p className="text-sm font-semibold mb-2">Payment Trend</p>
                <ResponsiveContainer width="100%" height="90%">
                  <LineChart data={bundle.paymentTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" name="Payments" stroke={TEAL} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white border border-slate-200 rounded-sm p-3 h-72">
                <p className="text-sm font-semibold mb-2">Payment Methods</p>
                <ResponsiveContainer width="100%" height="90%">
                  <PieChart>
                    <Pie data={bundle.paymentMethods} dataKey="value" nameKey="name" outerRadius={90}>
                      {bundle.paymentMethods.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <p className="text-sm text-secondary-muted lg:col-span-2">
                Collection rate: <strong>{bundle.kpis.collection_rate}%</strong> ·{" "}
                {bundle.kpis.payment_count} payments
              </p>
            </div>
          )}

          {(report === "aging" || report === "organization") && (
            <div className="bg-white border border-slate-200 rounded-sm p-3 h-72">
              <p className="text-sm font-semibold mb-2">Aging Buckets</p>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={bundle.agingChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#f59e0b" name="Amount" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {(report === "outstanding" || report === "aging") && (
            <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Days Overdue</TableHead>
                    <TableHead>Salesperson</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bundle.outstandingRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-secondary-muted">
                        No outstanding invoices
                      </TableCell>
                    </TableRow>
                  ) : (
                    bundle.outstandingRows.slice(0, 100).map((r) => (
                      <TableRow
                        key={r.id}
                        className={r.days_overdue > 0 ? "bg-amber-50/60" : undefined}
                      >
                        <TableCell>
                          <Link
                            href={`/accounting/invoices/${r.id}`}
                            className="text-[#017e84] hover:underline"
                          >
                            {r.invoice_number}
                          </Link>
                        </TableCell>
                        <TableCell>{r.customer_name}</TableCell>
                        <TableCell>{r.due_date || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(r.outstanding_amount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {r.days_overdue}
                        </TableCell>
                        <TableCell>{r.salesperson_name || "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
