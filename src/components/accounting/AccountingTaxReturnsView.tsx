"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Lock, Plus } from "lucide-react";
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
  createAccountingTaxReturn,
  getAccountingTaxDashboard,
  getAccountingTaxReport,
  getAccountingTaxReturns,
  type AccountingTaxDashboard,
  type AccountingTaxReportRow,
  type AccountingTaxReturnListItem,
} from "@/app/actions/accounting/tax-returns";
import { formatMoney } from "@/lib/sales-quotation-form";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAccountingShell } from "@/components/accounting/AccountingShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 40;

function statusBadge(status: string) {
  switch (status) {
    case "filed":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "confirmed":
      return "bg-sky-50 text-sky-800 border-sky-200";
    case "generated":
      return "bg-indigo-50 text-indigo-800 border-indigo-200";
    case "cancelled":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-amber-50 text-amber-800 border-amber-200";
  }
}

function DashCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-secondary-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          accent ? "text-[#017e84]" : "text-primary-dark"
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[11px] text-secondary-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function AccountingTaxReturnsView() {
  const router = useRouter();
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const { searchQuery, activeFilterId } = useAccountingShell();
  const debouncedSearch = useDebouncedValue(searchQuery, 280);
  const [dashboard, setDashboard] = useState<AccountingTaxDashboard | null>(null);
  const [returns, setReturns] = useState<AccountingTaxReturnListItem[]>([]);
  const [reportRows, setReportRows] = useState<AccountingTaxReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"returns" | "report">("returns");
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      const [dash, list, report] = await Promise.all([
        getAccountingTaxDashboard(),
        getAccountingTaxReturns({
          search: debouncedSearch.trim() || undefined,
          status: activeFilterId || "all",
          page,
          pageSize: PAGE_SIZE,
        }),
        getAccountingTaxReport({ page: 1, pageSize: 30 }),
      ]);

      if ("error" in dash && dash.error) {
        toast.error(dash.error);
      } else if (dash.dashboard) {
        setDashboard(dash.dashboard);
        if ("migrationRequired" in dash && dash.migrationRequired) {
          toast.info("Run create_accounting_tax_returns_module.sql to enable Tax Returns.");
        }
      }

      if ("error" in list && list.error) {
        toast.error(list.error);
        setReturns([]);
        setTotal(0);
      } else {
        setReturns(list.returns ?? []);
        setTotal(list.total ?? 0);
        if ("migrationRequired" in list && list.migrationRequired) {
          toast.info("Run create_accounting_tax_returns_module.sql to enable Tax Returns.");
        }
      }

      if (!("error" in report) && report.rows) {
        setReportRows(report.rows);
      }

      setLoading(false);
    });
  }, [page, debouncedSearch, activeFilterId]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeFilterId, switchVersion]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  function handleNew() {
    if (isAdminContext) {
      toast.info("Select a specific organization to create a tax return.");
      return;
    }
    startTransition(async () => {
      const res = await createAccountingTaxReturn();
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if (res.returnId) {
        router.push(`/accounting/tax-returns/${res.returnId}`);
      }
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const netPositive = (dashboard?.net_tax || 0) >= 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-secondary-muted">
            Automatic GST / VAT from posted invoices and vendor bills.
          </p>
          {dashboard ? (
            <p className="text-xs text-secondary-muted mt-0.5">
              Current period: <span className="font-medium text-primary-dark">{dashboard.period_name}</span>
              {dashboard.period_locked ? (
                <span className="ml-2 inline-flex items-center gap-0.5 text-amber-700">
                  <Lock className="h-3 w-3" /> Locked
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-sm border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setView("returns")}
              className={cn(
                "h-8 px-3 text-xs font-medium",
                view === "returns"
                  ? "bg-[#017e84] text-white"
                  : "bg-white text-secondary-muted hover:bg-slate-50"
              )}
            >
              Returns
            </button>
            <button
              type="button"
              onClick={() => setView("report")}
              className={cn(
                "h-8 px-3 text-xs font-medium border-l border-slate-200",
                view === "report"
                  ? "bg-[#017e84] text-white"
                  : "bg-white text-secondary-muted hover:bg-slate-50"
              )}
            >
              Tax Report
            </button>
          </div>
          <Button
            size="sm"
            className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
            disabled={isPending}
            onClick={handleNew}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New Return
          </Button>
        </div>
      </div>

      {dashboard ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-2.5">
          <DashCard
            label="Sales Tax"
            value={formatMoney(dashboard.sales_tax)}
            hint="Collected"
          />
          <DashCard
            label="Purchase Tax"
            value={formatMoney(dashboard.purchase_tax)}
            hint="Paid / recoverable"
          />
          <DashCard
            label={netPositive ? "Net Payable" : "Net Refundable"}
            value={formatMoney(Math.abs(dashboard.net_tax))}
            accent
          />
          <DashCard label="Period" value={dashboard.period_name} />
          <DashCard label="Filed Returns" value={String(dashboard.filed_returns)} />
          <DashCard label="Draft Returns" value={String(dashboard.draft_returns)} />
          <DashCard label="Locked Periods" value={String(dashboard.locked_periods)} />
        </div>
      ) : null}

      {loading || isPending ? (
        <AccountingTableSkeleton rows={8} cols={8} />
      ) : view === "returns" ? (
        <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
          {returns.length === 0 ? (
            <div className="p-8 text-center text-sm text-secondary-muted space-y-3">
              <p>No tax returns yet for this organization.</p>
              <Button
                size="sm"
                className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
                onClick={handleNew}
              >
                Generate Tax Return
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Number</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Sales Tax</TableHead>
                    <TableHead className="text-right">Purchase Tax</TableHead>
                    <TableHead className="text-right">Net Tax</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Organization</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returns.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-[#017e84]/5"
                      onClick={() => router.push(`/accounting/tax-returns/${r.id}`)}
                    >
                      <TableCell className="font-medium text-[#017e84] whitespace-nowrap">
                        {r.return_number}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate font-medium">
                        {r.name}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {r.date_from} → {r.date_to}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(r.sales_tax)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(r.purchase_tax)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatMoney(r.net_tax)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold capitalize",
                            statusBadge(r.status)
                          )}
                        >
                          {r.status}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate text-sm text-secondary-muted">
                        {r.organization_name || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/60">
            <p className="text-sm font-semibold text-primary-dark">
              Tax Report — {dashboard?.period_name || "Current period"}
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead>Date</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Rate %</TableHead>
                  <TableHead className="text-right">Taxable</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-sm text-secondary-muted py-10"
                    >
                      No posted taxable documents in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  reportRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {row.document_date || "—"}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-[#017e84]">
                        {row.source_number || "—"}
                      </TableCell>
                      <TableCell className="text-sm max-w-[160px] truncate">
                        {row.partner_name || "—"}
                      </TableCell>
                      <TableCell className="text-sm capitalize">
                        {row.tax_type.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {row.tax_rate}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {formatMoney(row.taxable_amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-medium">
                        {formatMoney(row.tax_amount)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {view === "returns" && totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-secondary-muted">
            {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
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
