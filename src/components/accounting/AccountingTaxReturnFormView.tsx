"use client";

import {
  useCallback,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookOpen,
  FileText,
  Lock,
  MessageSquare,
  StickyNote,
  Truck,
  Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  cancelAccountingTaxReturn,
  confirmAccountingTaxReturn,
  fileAccountingTaxReturn,
  generateAccountingTaxReturn,
  getAccountingTaxReturnActivity,
  getAccountingTaxReturnDetail,
  lockAccountingTaxPeriod,
  unlockAccountingTaxPeriod,
  updateAccountingTaxReturn,
  type AccountingTaxReturnDetail,
  type AccountingTaxReturnLine,
  type AccountingTaxReturnLog,
} from "@/app/actions/accounting/tax-returns";
import {
  getAccountingJournals,
  getAccountingChartAccounts,
} from "@/app/actions/accounting/journal-entries";
import { formatMoney } from "@/lib/sales-quotation-form";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import { cn } from "@/lib/utils";

type Props = { returnId: string };

const STATUS_STEPS = [
  { id: "draft", label: "Draft" },
  { id: "generated", label: "Generated" },
  { id: "confirmed", label: "Confirmed" },
  { id: "filed", label: "Filed" },
] as const;

function TaxStatusBar({ status }: { status: string }) {
  if (status === "cancelled") {
    return (
      <span className="inline-flex h-7 items-center rounded-sm border border-red-200 bg-red-50 px-2.5 text-xs font-semibold text-red-700">
        Cancelled
      </span>
    );
  }
  const order = ["draft", "generated", "confirmed", "filed"];
  let activeIndex = order.indexOf(status);
  if (activeIndex < 0) activeIndex = 0;

  return (
    <div className="flex items-center shrink-0" role="list" aria-label="Tax return status">
      {STATUS_STEPS.map((step, index) => {
        const active = index === activeIndex;
        const done = index < activeIndex;
        const isLast = index === STATUS_STEPS.length - 1;
        return (
          <div key={step.id} className="flex items-center" role="listitem">
            <span
              className={cn(
                "relative inline-flex h-7 items-center px-3 text-xs font-semibold",
                active
                  ? "bg-[#017e84] text-white"
                  : done
                    ? "bg-[#017e84]/15 text-[#017e84]"
                    : "bg-slate-100 text-slate-500",
                !isLast &&
                  "after:absolute after:right-[-6px] after:top-0 after:z-10 after:border-y-[14px] after:border-l-[6px] after:border-y-transparent",
                !isLast &&
                  (active
                    ? "after:border-l-[#017e84]"
                    : done
                      ? "after:border-l-[#017e84]/15"
                      : "after:border-l-slate-100")
              )}
            >
              {step.label}
            </span>
            {!isLast ? <span className="w-1.5" /> : null}
          </div>
        );
      })}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary-muted mb-3">
      {children}
    </p>
  );
}

function FormRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(120px,38%)_1fr] gap-x-3 items-center min-h-9 py-1">
      <div className="text-sm text-secondary-muted">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const fieldClass =
  "h-8 w-full rounded-sm border-0 border-b border-transparent bg-transparent px-0 text-sm text-primary-dark shadow-none focus-visible:ring-0 focus-visible:border-[#017e84] hover:border-slate-200";
const selectClass =
  "h-8 w-full rounded-sm border-0 border-b border-transparent bg-transparent px-0 text-sm text-primary-dark focus:outline-none focus:border-[#017e84] hover:border-slate-200";
const btnPrimary =
  "h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white";
const btnSecondary = "h-8 rounded-sm border-slate-200";

export function AccountingTaxReturnFormView({ returnId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<AccountingTaxReturnDetail | null>(null);
  const [logs, setLogs] = useState<AccountingTaxReturnLog[]>([]);
  const [journals, setJournals] = useState<{ id: string; name: string; code: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [tab, setTab] = useState<"summary" | "sales" | "purchase" | "lines">("summary");
  const [chatterMode, setChatterMode] = useState<"message" | "note" | "activity" | null>(null);
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [adjustments, setAdjustments] = useState("0");
  const [journalId, setJournalId] = useState("");
  const [salesTaxAccountId, setSalesTaxAccountId] = useState("");
  const [purchaseTaxAccountId, setPurchaseTaxAccountId] = useState("");
  const [authorityAccountId, setAuthorityAccountId] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    void Promise.all([
      getAccountingTaxReturnDetail(returnId),
      getAccountingTaxReturnActivity(returnId),
      getAccountingJournals(),
      getAccountingChartAccounts(),
    ]).then(([det, act, jrn, acc]) => {
      if ("error" in det && det.error) {
        toast.error(det.error);
        setDetail(null);
      } else if (det.taxReturn) {
        const t = det.taxReturn;
        setDetail(t);
        setName(t.name);
        setNotes(t.notes || "");
        setAdjustments(String(t.adjustments || 0));
        setJournalId(t.journal_id || "");
        setSalesTaxAccountId(t.sales_tax_account_id || "");
        setPurchaseTaxAccountId(t.purchase_tax_account_id || "");
        setAuthorityAccountId(t.tax_authority_account_id || "");
      }
      if (!("error" in act)) setLogs(act.logs || []);
      if (!("error" in jrn)) {
        setJournals(
          (jrn.journals || []).map((j) => ({
            id: String(j.id),
            name: String(j.name || ""),
            code: String(j.code || ""),
          }))
        );
      }
      if (!("error" in acc)) {
        setAccounts(
          (acc.accounts || []).map((a) => ({
            id: String(a.id),
            code: String(a.code || ""),
            name: String(a.name || ""),
          }))
        );
      }
      setLoading(false);
    });
  }, [returnId]);

  useEffect(() => {
    load();
  }, [load]);

  const canEdit =
    detail && !["filed", "cancelled"].includes(detail.status) && !detail.period_locked;

  function handleGenerate() {
    startTransition(async () => {
      if (canEdit) {
        await updateAccountingTaxReturn(returnId, {
          name,
          notes,
          adjustments: parseFloat(adjustments) || 0,
          journal_id: journalId || null,
          sales_tax_account_id: salesTaxAccountId || null,
          purchase_tax_account_id: purchaseTaxAccountId || null,
          tax_authority_account_id: authorityAccountId || null,
        });
      }
      const res = await generateAccountingTaxReturn(returnId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Tax return generated from posted documents");
      load();
    });
  }

  function handleConfirm() {
    startTransition(async () => {
      const res = await confirmAccountingTaxReturn(returnId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Tax return confirmed");
      load();
    });
  }

  function handleFile() {
    startTransition(async () => {
      const res = await fileAccountingTaxReturn(returnId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Tax return filed");
      load();
    });
  }

  function handleCancel() {
    startTransition(async () => {
      const res = await cancelAccountingTaxReturn(returnId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Tax return cancelled");
      load();
    });
  }

  function handleLock() {
    if (!detail) return;
    startTransition(async () => {
      const res = await lockAccountingTaxPeriod({
        dateFrom: detail.date_from,
        dateTo: detail.date_to,
        returnId: detail.id,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Tax period locked");
      load();
    });
  }

  function handleUnlock() {
    if (!detail?.period_id) return;
    startTransition(async () => {
      const res = await unlockAccountingTaxPeriod(detail.period_id!, detail.id);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Tax period unlocked");
      load();
    });
  }

  if (loading) return <AccountingTableSkeleton rows={8} cols={4} />;

  if (!detail) {
    return (
      <div className="p-8 text-center text-sm text-secondary-muted">
        Tax return not found.{" "}
        <button
          type="button"
          className="text-[#017e84] hover:underline"
          onClick={() => router.push("/accounting/tax-returns")}
        >
          Back to list
        </button>
      </div>
    );
  }

  const salesLines = detail.lines.filter((l) => l.line_type === "sales");
  const purchaseLines = detail.lines.filter((l) => l.line_type === "purchase");
  const netPositive = detail.net_tax >= 0;

  function sourceHref(line: AccountingTaxReturnLine) {
    if (!line.source_id) return null;
    if (line.source_type === "customer_invoice") {
      return `/accounting/invoices/${line.source_id}`;
    }
    if (line.source_type === "vendor_bill") {
      return `/accounting/bills/${line.source_id}`;
    }
    if (line.source_type === "credit_note") {
      return `/accounting/credit-notes/${line.source_id}`;
    }
    return null;
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          {detail.status === "draft" || detail.status === "generated" ? (
            <Button
              size="sm"
              className={btnPrimary}
              disabled={isPending || detail.period_locked}
              onClick={handleGenerate}
            >
              {detail.status === "draft" ? "Generate" : "Regenerate"}
            </Button>
          ) : null}
          {detail.status === "generated" ? (
            <Button
              size="sm"
              className={btnPrimary}
              disabled={isPending || detail.period_locked}
              onClick={handleConfirm}
            >
              Confirm
            </Button>
          ) : null}
          {detail.status === "confirmed" ? (
            <Button
              size="sm"
              className={btnPrimary}
              disabled={isPending || detail.period_locked}
              onClick={handleFile}
            >
              Submit / File
            </Button>
          ) : null}
          {detail.status === "filed" && !detail.period_locked ? (
            <Button
              size="sm"
              variant="outline"
              className={btnSecondary}
              disabled={isPending}
              onClick={handleLock}
            >
              <Lock className="h-3.5 w-3.5 mr-1" />
              Lock Period
            </Button>
          ) : null}
          {detail.period_locked && detail.period_id ? (
            <Button
              size="sm"
              variant="outline"
              className={btnSecondary}
              disabled={isPending}
              onClick={handleUnlock}
            >
              <Unlock className="h-3.5 w-3.5 mr-1" />
              Unlock Period
            </Button>
          ) : null}
          {!["filed", "cancelled"].includes(detail.status) ? (
            <Button
              size="sm"
              variant="outline"
              className={cn(btnSecondary, "text-red-700 border-red-200")}
              disabled={isPending}
              onClick={handleCancel}
            >
              Cancel
            </Button>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {detail.period_locked ? (
            <span className="inline-flex h-7 items-center gap-1 rounded-sm border border-amber-200 bg-amber-50 px-2 text-xs font-semibold text-amber-800">
              <Lock className="h-3 w-3" /> Period Locked
            </span>
          ) : null}
          <TaxStatusBar status={detail.status} />
        </div>
      </div>

      <div className="flex-1 grid xl:grid-cols-[minmax(0,1fr)_320px] min-h-0">
        <div className="overflow-auto p-4 sm:p-6 space-y-5">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="inline-flex min-w-[100px] flex-col items-center justify-center rounded-sm border border-slate-200 bg-slate-50/80 px-3 py-2 hover:bg-slate-50"
              onClick={() => setTab("sales")}
            >
              <FileText className="h-4 w-4 text-[#017e84] mb-0.5" />
              <span className="text-base font-semibold tabular-nums leading-none">
                {detail.invoice_count}
              </span>
              <span className="text-[11px] text-secondary-muted mt-0.5">
                Invoices
              </span>
            </button>
            <button
              type="button"
              className="inline-flex min-w-[100px] flex-col items-center justify-center rounded-sm border border-slate-200 bg-slate-50/80 px-3 py-2 hover:bg-slate-50"
              onClick={() => setTab("purchase")}
            >
              <Truck className="h-4 w-4 text-[#017e84] mb-0.5" />
              <span className="text-base font-semibold tabular-nums leading-none">
                {detail.bill_count}
              </span>
              <span className="text-[11px] text-secondary-muted mt-0.5">
                Vendor Bills
              </span>
            </button>
            <button
              type="button"
              className="inline-flex min-w-[100px] flex-col items-center justify-center rounded-sm border border-slate-200 bg-slate-50/80 px-3 py-2 hover:bg-slate-50 disabled:opacity-50"
              disabled={!detail.journal_entry_id}
              onClick={() => {
                if (detail.journal_entry_id) {
                  router.push(
                    `/accounting/journal-entries/${detail.journal_entry_id}`
                  );
                }
              }}
            >
              <BookOpen className="h-4 w-4 text-[#017e84] mb-0.5" />
              <span className="text-base font-semibold tabular-nums leading-none">
                {detail.journal_entry_id ? 1 : 0}
              </span>
              <span className="text-[11px] text-secondary-muted mt-0.5">
                Journal Entries
              </span>
            </button>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-secondary-muted">Tax Return</p>
            <Input
              value={name}
              disabled={!canEdit}
              onChange={(e) => setName(e.target.value)}
              className="h-auto border-0 border-b border-slate-200 rounded-none px-0 text-2xl sm:text-3xl font-bold text-primary-dark shadow-none focus-visible:ring-0 focus-visible:border-[#017e84]"
            />
            <p className="text-xs text-secondary-muted font-mono pt-1">
              {detail.return_number} · {detail.date_from} → {detail.date_to}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border border-slate-200 rounded-sm p-3 bg-slate-50/40">
            <div>
              <p className="text-[11px] text-secondary-muted">Sales Tax</p>
              <p className="text-sm font-semibold tabular-nums">
                {formatMoney(detail.sales_tax)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-secondary-muted">Purchase Tax</p>
              <p className="text-sm font-semibold tabular-nums">
                {formatMoney(detail.purchase_tax)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-secondary-muted">Credit Note Tax</p>
              <p className="text-sm font-semibold tabular-nums">
                {formatMoney(detail.credit_note_tax)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-secondary-muted">
                {netPositive ? "Net Payable" : "Net Refundable"}
              </p>
              <p className="text-sm font-semibold tabular-nums text-[#017e84]">
                {formatMoney(Math.abs(detail.net_tax))}
              </p>
            </div>
          </div>

          <div className="flex gap-4 border-b border-slate-200">
            {(
              [
                ["summary", "GST / VAT Summary"],
                ["sales", "Sales Tax"],
                ["purchase", "Purchase Tax"],
                ["lines", "All Lines"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "pb-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  tab === id
                    ? "border-[#017e84] text-[#017e84]"
                    : "border-transparent text-secondary-muted hover:text-primary-dark"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "summary" ? (
            <div className="grid lg:grid-cols-2 gap-x-10 gap-y-8">
              <div>
                <SectionTitle>Sales</SectionTitle>
                <FormRow label="Total Sales">
                  <span className="text-sm tabular-nums font-medium">
                    {formatMoney(detail.total_sales)}
                  </span>
                </FormRow>
                <FormRow label="Taxable Sales">
                  <span className="text-sm tabular-nums">
                    {formatMoney(detail.taxable_sales)}
                  </span>
                </FormRow>
                <FormRow label="Exempt Sales">
                  <span className="text-sm tabular-nums">
                    {formatMoney(detail.exempt_sales)}
                  </span>
                </FormRow>
                <FormRow label="Sales Tax">
                  <span className="text-sm tabular-nums font-semibold">
                    {formatMoney(detail.sales_tax)}
                  </span>
                </FormRow>
              </div>
              <div>
                <SectionTitle>Purchases</SectionTitle>
                <FormRow label="Total Purchases">
                  <span className="text-sm tabular-nums font-medium">
                    {formatMoney(detail.total_purchases)}
                  </span>
                </FormRow>
                <FormRow label="Taxable Purchases">
                  <span className="text-sm tabular-nums">
                    {formatMoney(detail.taxable_purchases)}
                  </span>
                </FormRow>
                <FormRow label="Purchase Tax">
                  <span className="text-sm tabular-nums font-semibold">
                    {formatMoney(detail.purchase_tax)}
                  </span>
                </FormRow>
                <FormRow label="Adjustments">
                  <Input
                    value={adjustments}
                    disabled={!canEdit}
                    onChange={(e) => setAdjustments(e.target.value)}
                    className={cn(fieldClass, "tabular-nums")}
                  />
                </FormRow>
              </div>
              <div>
                <SectionTitle>Settlement Accounts</SectionTitle>
                <FormRow label="Sales Tax Account">
                  <select
                    value={salesTaxAccountId}
                    disabled={!canEdit}
                    onChange={(e) => setSalesTaxAccountId(e.target.value)}
                    className={selectClass}
                  >
                    <option value=""> </option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} {a.name}
                      </option>
                    ))}
                  </select>
                </FormRow>
                <FormRow label="Purchase Tax Account">
                  <select
                    value={purchaseTaxAccountId}
                    disabled={!canEdit}
                    onChange={(e) => setPurchaseTaxAccountId(e.target.value)}
                    className={selectClass}
                  >
                    <option value=""> </option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} {a.name}
                      </option>
                    ))}
                  </select>
                </FormRow>
                <FormRow label="Tax Authority Account">
                  <select
                    value={authorityAccountId}
                    disabled={!canEdit}
                    onChange={(e) => setAuthorityAccountId(e.target.value)}
                    className={selectClass}
                  >
                    <option value=""> </option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} {a.name}
                      </option>
                    ))}
                  </select>
                </FormRow>
                <FormRow label="Journal">
                  <select
                    value={journalId}
                    disabled={!canEdit}
                    onChange={(e) => setJournalId(e.target.value)}
                    className={selectClass}
                  >
                    <option value=""> </option>
                    {journals.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.code ? `${j.code} — ${j.name}` : j.name}
                      </option>
                    ))}
                  </select>
                </FormRow>
              </div>
              <div>
                <SectionTitle>Notes</SectionTitle>
                <textarea
                  value={notes}
                  disabled={!canEdit}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={6}
                  className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[#017e84]"
                  placeholder="Internal notes…"
                />
              </div>
            </div>
          ) : null}

          {(tab === "sales" || tab === "purchase" || tab === "lines") && (
            <div className="border border-slate-200 rounded-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Date</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Partner</TableHead>
                    {tab === "lines" ? <TableHead>Type</TableHead> : null}
                    <TableHead className="text-right">Rate %</TableHead>
                    <TableHead className="text-right">Taxable</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(tab === "sales"
                    ? salesLines
                    : tab === "purchase"
                      ? purchaseLines
                      : detail.lines
                  ).length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={tab === "lines" ? 8 : 7}
                        className="text-center text-sm text-secondary-muted py-10"
                      >
                        Click <strong>Generate</strong> to collect tax from posted documents.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (tab === "sales"
                      ? salesLines
                      : tab === "purchase"
                        ? purchaseLines
                        : detail.lines
                    ).map((line) => {
                      const href = sourceHref(line);
                      return (
                        <TableRow key={line.id}>
                          <TableCell className="text-sm whitespace-nowrap">
                            {line.document_date || "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {href ? (
                              <button
                                type="button"
                                className="text-[#017e84] hover:underline font-medium"
                                onClick={() => router.push(href)}
                              >
                                {line.source_number || "—"}
                              </button>
                            ) : (
                              line.source_number || "—"
                            )}
                          </TableCell>
                          <TableCell className="text-sm max-w-[140px] truncate">
                            {line.partner_name || "—"}
                          </TableCell>
                          {tab === "lines" ? (
                            <TableCell className="text-sm capitalize">
                              {line.line_type.replace(/_/g, " ")}
                            </TableCell>
                          ) : null}
                          <TableCell className="text-right tabular-nums text-sm">
                            {line.tax_rate}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {formatMoney(line.taxable_amount)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-medium">
                            {formatMoney(line.tax_amount)}
                          </TableCell>
                          <TableCell>
                            {line.journal_entry_id ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-[#017e84]"
                                onClick={() =>
                                  router.push(
                                    `/accounting/journal-entries/${line.journal_entry_id}`
                                  )
                                }
                              >
                                <BookOpen className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <aside className="border-l border-slate-200 bg-[#fafbfc] overflow-auto flex flex-col min-h-0">
          <div className="flex flex-wrap items-center gap-1.5 p-3 border-b border-slate-200 bg-white">
            <Button
              size="sm"
              className={cn(btnPrimary, "h-7 text-xs")}
              onClick={() =>
                setChatterMode(chatterMode === "message" ? null : "message")
              }
            >
              <MessageSquare className="h-3 w-3 mr-1" />
              Send message
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={cn(btnSecondary, "h-7 text-xs")}
              onClick={() => setChatterMode(chatterMode === "note" ? null : "note")}
            >
              <StickyNote className="h-3 w-3 mr-1" />
              Log note
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={cn(btnSecondary, "h-7 text-xs")}
              onClick={() =>
                setChatterMode(chatterMode === "activity" ? null : "activity")
              }
            >
              Activity
            </Button>
          </div>
          <div className="p-3 space-y-4 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary-muted">
              Activity
            </p>
            {logs.length === 0 ? (
              <p className="text-sm text-secondary-muted">No activity yet.</p>
            ) : (
              <ul className="space-y-4">
                {logs.map((l) => (
                  <li key={l.id} className="flex gap-2.5">
                    <div className="h-8 w-8 rounded-full bg-[#017e84]/15 text-[#017e84] flex items-center justify-center text-xs font-bold shrink-0">
                      {(l.performed_by || "T").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-primary-dark capitalize">
                        <span className="font-medium">{l.performed_by || "System"}</span>
                        {" — "}
                        {l.action.replace(/_/g, " ")}
                      </p>
                      {l.previous_status || l.new_status ? (
                        <p className="text-[11px] text-secondary-muted mt-0.5 capitalize">
                          {[l.previous_status, l.new_status]
                            .filter(Boolean)
                            .join(" → ")
                            .replace(/_/g, " ")}
                        </p>
                      ) : null}
                      <p className="text-[11px] text-secondary-muted mt-0.5">
                        {l.performed_at
                          ? new Date(l.performed_at).toLocaleString()
                          : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
