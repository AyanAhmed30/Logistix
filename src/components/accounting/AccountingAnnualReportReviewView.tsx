"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, LayoutTemplate, Plus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createAccountingAnnualReportWorkingFile,
  getAccountingAnnualReportForReview,
} from "@/app/actions/accounting/review";
import type {
  AnnualReport,
  AnnualReportFiscalYear,
} from "@/lib/accounting/financial-reporting/annual-report";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import {
  REVIEW_TEAL,
  ReviewReportCard,
  formatReviewMoney,
} from "@/components/accounting/AccountingReviewOdooPanels";

function ReportSection({
  title,
  lines,
}: {
  title: string;
  lines: { key?: string; label: string; amount: number; level?: number }[];
}) {
  if (!lines.length) return null;
  return (
    <div className="border-b border-slate-100 last:border-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 px-4 py-2 bg-slate-50">
        {title}
      </h3>
      <div className="divide-y divide-slate-50">
        {lines.map((line, index) => (
          <div
            key={line.key || `${line.label}-${index}`}
            className="flex items-center justify-between px-4 py-2 text-sm"
            style={{ paddingLeft: `${16 + (line.level || 0) * 12}px` }}
          >
            <span className="text-slate-700">{line.label}</span>
            <span className="tabular-nums font-medium text-slate-800">
              {formatReviewMoney(line.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AccountingAnnualReportReviewView() {
  const router = useRouter();
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const [report, setReport] = useState<AnnualReport | null>(null);
  const [fiscalYears, setFiscalYears] = useState<AnnualReportFiscalYear[]>([]);
  const [fiscalYearId, setFiscalYearId] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    if (isAdminContext) {
      setReport(null);
      setFiscalYears([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingAnnualReportForReview(
        fiscalYearId ? { fiscalYearId } : undefined
      );
      if ("error" in res && res.error) {
        toast.error(res.error);
        setReport(null);
      } else {
        setReport(res.report ?? null);
        setFiscalYears(res.fiscalYears ?? []);
        if (!fiscalYearId && res.fiscalYears?.[0]?.id) {
          setFiscalYearId(res.fiscalYears[0].id);
        }
      }
      setLoading(false);
    });
  }, [fiscalYearId, isAdminContext]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  async function handleNew() {
    if (!report) return;
    setCreating(true);
    const res = await createAccountingAnnualReportWorkingFile({
      dateFrom: report.date_from,
      dateTo: report.date_to,
      name: report.fiscal_year?.name
        ? `${report.fiscal_year.name} Annual Report`
        : undefined,
    });
    setCreating(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    if ("fileId" in res && res.fileId) {
      toast.success("Annual report working file created");
      router.push(`/accounting/review/working-files/${res.fileId}`);
    }
  }

  const plLines =
    report?.profit_and_loss.lines.map((l) => ({
      key: l.key,
      label: l.label,
      amount: l.amount,
      level: l.level,
    })) ?? [];

  const bsLines =
    report?.balance_sheet.lines.map((l) => ({
      key: l.key,
      label: l.label,
      amount: l.amount,
      level: l.level,
    })) ?? [];

  const cfLines =
    report?.cash_flow.lines.map((l) => ({
      key: l.key,
      label: l.label,
      amount: l.amount,
      level: l.level,
    })) ?? [];

  const hasActivity =
    report &&
    (Math.abs(report.profit_and_loss.netProfit || 0) > 0 ||
      bsLines.some((l) => Math.abs(l.amount) > 0) ||
      cfLines.some((l) => Math.abs(l.amount) > 0));

  return (
    <div className="-mx-1 sm:-mx-2 flex flex-col min-h-[calc(100vh-8rem)] bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-200">
        <Button
          type="button"
          size="sm"
          disabled={creating || isAdminContext || !report}
          onClick={() => void handleNew()}
          className="h-8 rounded-md px-3 font-medium text-white"
          style={{ backgroundColor: REVIEW_TEAL }}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New
        </Button>
        <span className="text-base font-semibold text-slate-800">
          Annual Reports
        </span>
        <div className="ml-auto flex items-center gap-2">
          {fiscalYears.length ? (
            <select
              value={fiscalYearId}
              onChange={(e) => setFiscalYearId(e.target.value)}
              className="h-8 text-xs border border-slate-200 rounded px-2 bg-white"
            >
              {fiscalYears.map((fy) => (
                <option key={fy.id} value={fy.id}>
                  {fy.name} ({fy.date_from} – {fy.date_to})
                </option>
              ))}
            </select>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => window.print()}
          >
            <Printer className="h-3.5 w-3.5 mr-1" />
            Print
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-4">
          <AccountingTableSkeleton rows={10} cols={4} />
        </div>
      ) : !hasActivity ? (
        <div className="flex-1 flex flex-col items-center justify-center py-12 px-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-8">
            Create an Annual Report
          </h2>
          <div className="grid gap-8 sm:grid-cols-3 max-w-4xl w-full text-center">
            <div className="space-y-3">
              <div
                className="mx-auto h-16 w-16 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${REVIEW_TEAL}18`, color: REVIEW_TEAL }}
              >
                <LayoutTemplate className="h-8 w-8" />
              </div>
              <p className="font-medium text-slate-800">Load a Template</p>
              <p className="text-xs text-slate-500">
                Start from fiscal year posted accounting data
              </p>
            </div>
            <div className="space-y-3">
              <div
                className="mx-auto h-16 w-16 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${REVIEW_TEAL}18`, color: REVIEW_TEAL }}
              >
                <FileText className="h-8 w-8" />
              </div>
              <p className="font-medium text-slate-800">Review its content</p>
              <p className="text-xs text-slate-500">
                P&amp;L, Balance Sheet, and Cash Flow from journal entries
              </p>
            </div>
            <div className="space-y-3">
              <div
                className="mx-auto h-16 w-16 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${REVIEW_TEAL}18`, color: REVIEW_TEAL }}
              >
                <Printer className="h-8 w-8" />
              </div>
              <p className="font-medium text-slate-800">Print your Report</p>
              <p className="text-xs text-slate-500">
                Reconciled with Trial Balance and existing statements
              </p>
            </div>
          </div>
          {!fiscalYears.length ? (
            <p className="text-xs text-slate-400 mt-8">
              No fiscal years configured — using calendar year. Create fiscal years
              under Configuration → Lock Dates.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <ReviewReportCard>
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800">
                {report?.fiscal_year?.name || "Annual Report"}
              </h2>
              <p className="text-xs text-slate-500">
                {report?.date_from} – {report?.date_to} · Posted entries ·{" "}
                {report?.currency}
                {report?.trial_balance_balanced ? " · Trial Balance OK" : ""}
              </p>
            </div>
            <ReportSection title="Profit & Loss" lines={plLines.slice(0, 40)} />
            <ReportSection title="Balance Sheet" lines={bsLines.slice(0, 40)} />
            <ReportSection title="Cash Flow" lines={cfLines.slice(0, 30)} />
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-4 text-sm">
              <span>
                Net Income:{" "}
                <strong className="tabular-nums">
                  {formatReviewMoney(report?.profit_and_loss.netProfit ?? 0)}
                </strong>
              </span>
              <span>
                Total Assets:{" "}
                <strong className="tabular-nums">
                  {formatReviewMoney(report?.balance_sheet.totalAssets ?? 0)}
                </strong>
              </span>
            </div>
          </ReviewReportCard>
        </div>
      )}
    </div>
  );
}
