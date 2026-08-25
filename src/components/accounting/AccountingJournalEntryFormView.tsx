"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  MessageSquare,
  Paperclip,
  Search,
  StickyNote,
  CalendarPlus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  cancelAccountingJournalEntry,
  duplicateAccountingJournalEntry,
  getAccountingChartAccounts,
  getAccountingJournalEntryDetail,
  getAccountingJournalEntryLogs,
  getAccountingJournals,
  postAccountingJournalEntry,
  resetAccountingJournalEntryToDraft,
  updateAccountingJournalEntry,
  type AccountingJournalEntryDetail,
  type AccountingJournalEntryLog,
} from "@/app/actions/accounting/journal-entries";
import { AccountingFormSkeleton } from "@/components/accounting/AccountingSkeleton";
import { formatMoney } from "@/lib/sales-quotation-form";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { cn } from "@/lib/utils";

type Props = { entryId: string };

type LineDraft = {
  key: string;
  id?: string;
  account_id: string;
  label: string;
  partner_name: string;
  debit: string;
  credit: string;
  tax_label: string;
};

const btnSecondary =
  "h-8 rounded-sm border-slate-200 bg-white font-normal text-primary-dark hover:bg-slate-50";
const btnPrimary =
  "h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white font-medium";

const fieldUnderline =
  "h-9 rounded-none border-0 border-b border-slate-200 bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:border-[#017e84]";

function newLine(): LineDraft {
  return {
    key: `l-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    account_id: "",
    label: "",
    partner_name: "",
    debit: "",
    credit: "",
    tax_label: "",
  };
}

/** Odoo-style chevron status: Draft → Posted */
function JournalStatusBar({ status }: { status: string }) {
  if (status === "cancelled") {
    return (
      <span className="inline-flex h-7 items-center rounded-sm border border-slate-300 bg-slate-100 px-2.5 text-xs font-semibold text-slate-700">
        Cancelled
      </span>
    );
  }
  const activeIndex = status === "posted" ? 1 : 0;
  const steps = ["Draft", "Posted"];
  return (
    <div className="flex items-center shrink-0 overflow-x-auto" role="list">
      {steps.map((label, index) => {
        const active = index === activeIndex;
        const done = index < activeIndex;
        const isLast = index === steps.length - 1;
        return (
          <div key={label} className="flex items-center" role="listitem">
            <span
              className={cn(
                "relative inline-flex h-7 items-center px-3.5 text-xs font-semibold whitespace-nowrap border",
                index === 0 ? "rounded-l-sm" : "border-l-0",
                isLast ? "rounded-r-sm" : "",
                active
                  ? "bg-[#017e84] text-white border-[#017e84] z-[2]"
                  : done
                    ? "bg-[#e6f4f5] text-[#017e84] border-[#017e84]/40"
                    : "bg-white text-slate-400 border-slate-200"
              )}
            >
              {label}
              {!isLast ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-0 -right-2 z-[3] h-0 w-0 border-y-[14px] border-y-transparent border-l-[8px]",
                    active
                      ? "border-l-[#017e84]"
                      : done
                        ? "border-l-[#017e84]/40"
                        : "border-l-slate-200"
                  )}
                />
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function AccountingJournalEntryFormView({ entryId }: Props) {
  const router = useRouter();
  const { isAdminContext } = useAdminOrganization();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<AccountingJournalEntryDetail | null>(
    null
  );
  const [logs, setLogs] = useState<AccountingJournalEntryLog[]>([]);
  const [journals, setJournals] = useState<
    { id: string; name: string; code: string; type: string }[]
  >([]);
  const [accounts, setAccounts] = useState<
    { id: string; code: string; name: string; type: string }[]
  >([]);
  const [journalId, setJournalId] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [reference, setReference] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [activeTab, setActiveTab] = useState<"items" | "other">("items");
  const [chatterMode, setChatterMode] = useState<
    "message" | "note" | "activity" | null
  >(null);
  const [isPending, startTransition] = useTransition();

  const status = detail?.status || "draft";
  const readOnly = status !== "draft" || isAdminContext;
  const isAuto = Boolean(detail && !detail.is_manual);

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const l of lines) {
      debit += parseFloat(l.debit) || 0;
      credit += parseFloat(l.credit) || 0;
    }
    return {
      debit: Math.round(debit * 100) / 100,
      credit: Math.round(credit * 100) / 100,
      balanced:
        Math.round(debit * 100) === Math.round(credit * 100) && debit > 0,
    };
  }, [lines]);

  const hydrate = useCallback((entry: AccountingJournalEntryDetail) => {
    setDetail(entry);
    setJournalId(entry.journal_id);
    setEntryDate(entry.entry_date);
    setReference(entry.reference || "");
    setPartnerName(entry.partner_name || "");
    setLines(
      entry.lines.length
        ? entry.lines.map((l) => ({
            key: l.id,
            id: l.id,
            account_id: l.account_id,
            label: l.label || "",
            partner_name: l.partner_name || "",
            debit: l.debit ? String(l.debit) : "",
            credit: l.credit ? String(l.credit) : "",
            tax_label: l.tax_label || "",
          }))
        : [newLine()]
    );
  }, []);

  const refreshLogs = useCallback(async () => {
    const r = await getAccountingJournalEntryLogs(entryId);
    if ("logs" in r) setLogs(r.logs || []);
  }, [entryId]);

  const load = useCallback(async () => {
    setLoading(true);
    const [entryRes, journalsRes, accountsRes, logsRes] = await Promise.all([
      getAccountingJournalEntryDetail(entryId),
      getAccountingJournals(),
      getAccountingChartAccounts(),
      getAccountingJournalEntryLogs(entryId),
    ]);
    if ("error" in entryRes && entryRes.error) {
      toast.error(entryRes.error);
      setLoading(false);
      return;
    }
    if (entryRes.entry) hydrate(entryRes.entry);
    if ("journals" in journalsRes && journalsRes.journals) {
      setJournals(journalsRes.journals as typeof journals);
    }
    if ("accounts" in accountsRes && accountsRes.accounts) {
      setAccounts(accountsRes.accounts as typeof accounts);
    }
    if ("logs" in logsRes && logsRes.logs) setLogs(logsRes.logs);
    setLoading(false);
  }, [entryId, hydrate]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l))
    );
  }

  function buildLinesPayload() {
    return lines.map((l) => ({
      id: l.id,
      account_id: l.account_id,
      label: l.label,
      partner_name: l.partner_name || null,
      debit: parseFloat(l.debit) || 0,
      credit: parseFloat(l.credit) || 0,
      tax_label: l.tax_label || null,
    }));
  }

  function handleSave(silent = false) {
    return new Promise<boolean>((resolve) => {
      startTransition(async () => {
        const res = await updateAccountingJournalEntry(entryId, {
          journal_id: journalId,
          entry_date: entryDate,
          reference,
          partner_name: partnerName || null,
          lines: buildLinesPayload(),
        });
        if ("error" in res && res.error) {
          toast.error(res.error);
          resolve(false);
          return;
        }
        if (res.entry) {
          hydrate(res.entry);
          if (!silent) toast.success("Journal entry saved");
          void refreshLogs();
          resolve(true);
          return;
        }
        resolve(false);
      });
    });
  }

  function handlePost() {
    startTransition(async () => {
      if (!totals.balanced) {
        toast.error(
          `Entry is unbalanced. Debit ${totals.debit.toFixed(2)} ≠ Credit ${totals.credit.toFixed(2)}`
        );
        return;
      }
      const saved = await updateAccountingJournalEntry(entryId, {
        journal_id: journalId,
        entry_date: entryDate,
        reference,
        partner_name: partnerName || null,
        lines: buildLinesPayload(),
      });
      if ("error" in saved && saved.error) {
        toast.error(saved.error);
        return;
      }
      const res = await postAccountingJournalEntry(entryId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if (res.entry) {
        hydrate(res.entry);
        toast.success("Journal entry posted");
        void refreshLogs();
      }
    });
  }

  if (loading) return <AccountingFormSkeleton />;
  if (!detail) {
    return (
      <div className="p-6 text-sm text-secondary-muted">
        Journal entry not found.
      </div>
    );
  }

  const titleLabel =
    status === "draft" && !detail.lines.length
      ? detail.entry_number
      : detail.entry_number;

  return (
    <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden min-h-[calc(100vh-160px)] flex flex-col">
      {/* Action bar — Odoo: Post primary + status */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-1.5">
          {status === "draft" ? (
            <Button
              size="sm"
              className={btnPrimary}
              disabled={isPending || isAdminContext}
              onClick={handlePost}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Post"
              )}
            </Button>
          ) : null}
          {status === "draft" ? (
            <Button
              size="sm"
              variant="outline"
              className={btnSecondary}
              disabled={isPending || isAdminContext}
              onClick={() => void handleSave()}
            >
              Save
            </Button>
          ) : null}
          {status === "cancelled" && detail.is_manual ? (
            <Button
              size="sm"
              variant="outline"
              className={btnSecondary}
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const res = await resetAccountingJournalEntryToDraft(entryId);
                  if ("error" in res && res.error) toast.error(res.error);
                  else if (res.entry) {
                    hydrate(res.entry);
                    toast.success("Reset to draft");
                    void refreshLogs();
                  }
                })
              }
            >
              Reset to Draft
            </Button>
          ) : null}
          {status === "draft" ? (
            <Button
              size="sm"
              variant="outline"
              className={btnSecondary}
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const res = await cancelAccountingJournalEntry(entryId);
                  if ("error" in res && res.error) toast.error(res.error);
                  else if (res.entry) {
                    hydrate(res.entry);
                    toast.success("Cancelled");
                    void refreshLogs();
                  }
                })
              }
            >
              Cancel
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className={btnSecondary}
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const res = await duplicateAccountingJournalEntry(entryId);
                if ("error" in res && res.error) toast.error(res.error);
                else if (res.entry) {
                  toast.success("Duplicated");
                  router.push(`/accounting/journal-entries/${res.entry.id}`);
                }
              })
            }
          >
            Duplicate
          </Button>
        </div>
        <JournalStatusBar status={status} />
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Main form */}
        <div className="overflow-auto p-4 sm:p-6 space-y-5 border-b xl:border-b-0 xl:border-r border-slate-200">
          {/* Title + smart buttons */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-2xl sm:text-3xl font-semibold text-primary-dark tracking-tight leading-none">
              {titleLabel}
            </h1>
            <div className="flex flex-wrap gap-1.5">
              {detail.source_type === "customer_invoice" && detail.source_id ? (
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/accounting/invoices/${detail.source_id}`)
                  }
                  className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left hover:border-[#017e84]/40 min-w-[72px]"
                >
                  <div className="text-sm font-semibold text-[#017e84]">1</div>
                  <div className="text-[10px] text-secondary-muted">Invoice</div>
                </button>
              ) : null}
              {detail.source_type === "credit_note" && detail.source_id ? (
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/accounting/credit-notes/${detail.source_id}`)
                  }
                  className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left hover:border-[#017e84]/40 min-w-[72px]"
                >
                  <div className="text-sm font-semibold text-[#017e84]">1</div>
                  <div className="text-[10px] text-secondary-muted">
                    Credit Note
                  </div>
                </button>
              ) : null}
              {detail.source_type === "customer_payment" && detail.source_id ? (
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/accounting/payments/${detail.source_id}`)
                  }
                  className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left hover:border-[#017e84]/40 min-w-[72px]"
                >
                  <div className="text-sm font-semibold text-[#017e84]">1</div>
                  <div className="text-[10px] text-secondary-muted">Payment</div>
                </button>
              ) : null}
              {detail.source_type === "vendor_bill" && detail.source_id ? (
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/accounting/bills/${detail.source_id}`)
                  }
                  className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left hover:border-[#017e84]/40 min-w-[72px]"
                >
                  <div className="text-sm font-semibold text-[#017e84]">1</div>
                  <div className="text-[10px] text-secondary-muted">Bill</div>
                </button>
              ) : null}
              {detail.source_type === "vendor_refund" && detail.source_id ? (
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/accounting/vendor-refunds/${detail.source_id}`
                    )
                  }
                  className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left hover:border-[#017e84]/40 min-w-[72px]"
                >
                  <div className="text-sm font-semibold text-[#017e84]">1</div>
                  <div className="text-[10px] text-secondary-muted">
                    Vendor Refund
                  </div>
                </button>
              ) : null}
              {(detail.source_type === "asset_purchase" ||
                detail.source_type === "asset_disposal") &&
              detail.source_id ? (
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/accounting/assets/${detail.source_id}`)
                  }
                  className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left hover:border-[#017e84]/40 min-w-[72px]"
                >
                  <div className="text-sm font-semibold text-[#017e84]">1</div>
                  <div className="text-[10px] text-secondary-muted">Asset</div>
                </button>
              ) : null}
              {detail.source_type === "asset_depreciation" && detail.source_id ? (
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/accounting/review/depreciation-schedule?line=${detail.source_id}`
                    )
                  }
                  className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left hover:border-[#017e84]/40 min-w-[72px]"
                >
                  <div className="text-sm font-semibold text-[#017e84]">1</div>
                  <div className="text-[10px] text-secondary-muted">
                    Depreciation
                  </div>
                </button>
              ) : null}
              {detail.source_type === "loan_disbursement" && detail.source_id ? (
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/accounting/loans/${detail.source_id}`)
                  }
                  className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left hover:border-[#017e84]/40 min-w-[72px]"
                >
                  <div className="text-sm font-semibold text-[#017e84]">1</div>
                  <div className="text-[10px] text-secondary-muted">Loan</div>
                </button>
              ) : null}
              {detail.source_type === "loan_repayment" && detail.source_id ? (
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/accounting/loans/installment/${detail.source_id}`
                    )
                  }
                  className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left hover:border-[#017e84]/40 min-w-[72px]"
                >
                  <div className="text-sm font-semibold text-[#017e84]">1</div>
                  <div className="text-[10px] text-secondary-muted">Loan</div>
                </button>
              ) : null}
            </div>
          </div>

          {isAuto ? (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-sm px-2.5 py-1.5">
              Automatically generated from{" "}
              {detail.source_type?.replace(/_/g, " ")}{" "}
              {detail.source_number || ""}. Posted entries are read-only.
            </p>
          ) : null}

          {/* Odoo header fields: Reference | Accounting Date + Journal */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 max-w-3xl">
            <div>
              <Label className="text-xs text-secondary-muted font-normal">
                Reference
              </Label>
              <Input
                className={cn("mt-0.5", fieldUnderline)}
                value={reference}
                disabled={readOnly}
                onChange={(e) => setReference(e.target.value)}
                placeholder=""
              />
            </div>
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-secondary-muted font-normal">
                  Accounting Date
                </Label>
                <Input
                  type="date"
                  data-testid="journal-entry-date"
                  className={cn("mt-0.5", fieldUnderline)}
                  value={entryDate}
                  disabled={readOnly}
                  onChange={(e) => setEntryDate(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-secondary-muted font-normal">
                  Journal
                </Label>
                <Select
                  value={journalId}
                  onValueChange={setJournalId}
                  disabled={readOnly}
                >
                  <SelectTrigger
                    className={cn(
                      "mt-0.5 w-full",
                      fieldUnderline,
                      "h-9 [&>svg]:opacity-50"
                    )}
                  >
                    <SelectValue placeholder="Select journal" />
                  </SelectTrigger>
                  <SelectContent>
                    {journals.map((j) => (
                      <SelectItem key={j.id} value={j.id}>
                        {j.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-slate-200 flex gap-5 text-sm">
            {(
              [
                ["items", "Journal Items"],
                ["other", "Other Info"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={cn(
                  "pb-2 border-b-2 -mb-px transition-colors",
                  activeTab === id
                    ? "border-[#017e84] text-[#017e84] font-medium"
                    : "border-transparent text-secondary-muted hover:text-primary-dark"
                )}
                onClick={() => setActiveTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === "items" ? (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-slate-200 hover:bg-transparent">
                      <TableHead className="h-9 min-w-[200px] text-xs font-medium text-secondary-muted">
                        Account
                      </TableHead>
                      <TableHead className="h-9 min-w-[140px] text-xs font-medium text-secondary-muted">
                        Partner
                      </TableHead>
                      <TableHead className="h-9 min-w-[160px] text-xs font-medium text-secondary-muted">
                        Label
                      </TableHead>
                      <TableHead className="h-9 w-28 text-right text-xs font-medium text-secondary-muted">
                        Debit
                      </TableHead>
                      <TableHead className="h-9 w-28 text-right text-xs font-medium text-secondary-muted">
                        Credit
                      </TableHead>
                      <TableHead className="h-9 w-28 text-xs font-medium text-secondary-muted">
                        Tax Grids
                      </TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow
                        key={line.key}
                        className="border-b border-slate-100 hover:bg-transparent"
                      >
                        <TableCell className="align-middle py-1.5">
                          <Select
                            value={line.account_id || undefined}
                            onValueChange={(v) => {
                              const acc = accounts.find((a) => a.id === v);
                              updateLine(line.key, {
                                account_id: v,
                                label:
                                  line.label ||
                                  (acc ? `${acc.code} ${acc.name}` : ""),
                              });
                            }}
                            disabled={readOnly}
                          >
                            <SelectTrigger className="h-8 rounded-none border-0 shadow-none focus:ring-0 px-0">
                              <SelectValue placeholder="" />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts.map((a) => (
                                <SelectItem key={a.id} value={a.id}>
                                  {a.code} {a.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Input
                            className="h-8 rounded-none border-0 shadow-none focus-visible:ring-0 px-0"
                            value={line.partner_name}
                            disabled={readOnly}
                            onChange={(e) =>
                              updateLine(line.key, {
                                partner_name: e.target.value,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Input
                            className="h-8 rounded-none border-0 shadow-none focus-visible:ring-0 px-0"
                            value={line.label}
                            disabled={readOnly}
                            onChange={(e) =>
                              updateLine(line.key, { label: e.target.value })
                            }
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Input
                            className="h-8 rounded-none border-0 shadow-none focus-visible:ring-0 px-0 text-right tabular-nums"
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.debit}
                            disabled={readOnly}
                            onChange={(e) =>
                              updateLine(line.key, {
                                debit: e.target.value,
                                credit:
                                  parseFloat(e.target.value) > 0
                                    ? ""
                                    : line.credit,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Input
                            className="h-8 rounded-none border-0 shadow-none focus-visible:ring-0 px-0 text-right tabular-nums"
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.credit}
                            disabled={readOnly}
                            onChange={(e) =>
                              updateLine(line.key, {
                                credit: e.target.value,
                                debit:
                                  parseFloat(e.target.value) > 0
                                    ? ""
                                    : line.debit,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Input
                            className="h-8 rounded-none border-0 shadow-none focus-visible:ring-0 px-0"
                            value={line.tax_label}
                            disabled={readOnly}
                            onChange={(e) =>
                              updateLine(line.key, {
                                tax_label: e.target.value,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          {!readOnly ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-secondary-muted"
                              onClick={() =>
                                setLines((prev) =>
                                  prev.length <= 1
                                    ? prev
                                    : prev.filter((l) => l.key !== line.key)
                                )
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {!readOnly ? (
                <button
                  type="button"
                  className="text-sm text-[#017e84] hover:underline font-medium"
                  onClick={() => setLines((prev) => [...prev, newLine()])}
                >
                  Add a line
                </button>
              ) : null}

              <div className="flex justify-end pt-2">
                <div className="w-56 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-secondary-muted">Debit</span>
                    <span className="tabular-nums font-medium">
                      {formatMoney(totals.debit)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-secondary-muted">Credit</span>
                    <span className="tabular-nums font-medium">
                      {formatMoney(totals.credit)}
                    </span>
                  </div>
                  {!totals.balanced && status === "draft" ? (
                    <p className="text-xs text-red-600 pt-1">
                      Debit and Credit must be equal before posting.
                    </p>
                  ) : (
                    <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-primary-dark">
                      <span>Balance</span>
                      <span className="tabular-nums text-[#017e84]">
                        {formatMoney(0)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
              <div>
                <Label className="text-xs text-secondary-muted">Partner</Label>
                <Input
                  className="mt-1 h-9 rounded-sm"
                  value={partnerName}
                  disabled={readOnly}
                  onChange={(e) => setPartnerName(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-secondary-muted">
                  Organization
                </Label>
                <Input
                  className="mt-1 h-9 rounded-sm bg-slate-50"
                  value={detail.organization_name || "—"}
                  disabled
                />
              </div>
              <div>
                <Label className="text-xs text-secondary-muted">Currency</Label>
                <Input
                  className="mt-1 h-9 rounded-sm bg-slate-50"
                  value={detail.currency}
                  disabled
                />
              </div>
              <div>
                <Label className="text-xs text-secondary-muted">
                  Created By
                </Label>
                <Input
                  className="mt-1 h-9 rounded-sm bg-slate-50"
                  value={detail.created_by || "—"}
                  disabled
                />
              </div>
            </div>
          )}
        </div>

        {/* Chatter — Odoo-style */}
        <div className="min-h-[320px] xl:min-h-0 bg-slate-50/50 flex flex-col">
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-slate-200 bg-white">
            <Button
              size="sm"
              className={cn(
                "h-7 rounded-sm text-xs",
                chatterMode === "message"
                  ? btnPrimary
                  : "bg-[#017e84]/10 text-[#017e84] hover:bg-[#017e84]/20"
              )}
              onClick={() =>
                setChatterMode((m) => (m === "message" ? null : "message"))
              }
            >
              <MessageSquare className="h-3.5 w-3.5 mr-1" />
              Send message
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-sm text-xs border-slate-200"
              onClick={() =>
                setChatterMode((m) => (m === "note" ? null : "note"))
              }
            >
              <StickyNote className="h-3.5 w-3.5 mr-1" />
              Log note
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-sm text-xs border-slate-200"
              onClick={() =>
                setChatterMode((m) => (m === "activity" ? null : "activity"))
              }
            >
              <CalendarPlus className="h-3.5 w-3.5 mr-1" />
              Activity
            </Button>
            <div className="ml-auto flex items-center gap-1 text-secondary-muted">
              <Search className="h-3.5 w-3.5" />
              <Paperclip className="h-3.5 w-3.5" />
            </div>
          </div>

          {chatterMode ? (
            <div className="px-3 py-2 border-b border-slate-200 bg-white text-xs text-secondary-muted">
              {chatterMode === "message"
                ? "Messaging opens after the entry is saved. Use activity log below for history."
                : chatterMode === "note"
                  ? "Notes are recorded when you Save or Post the entry."
                  : "Schedule follow-ups from the source document when linked."}
            </div>
          ) : null}

          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            <div className="flex items-center gap-2 text-[11px] text-secondary-muted uppercase tracking-wide">
              <span className="flex-1 h-px bg-slate-200" />
              Today
              <span className="flex-1 h-px bg-slate-200" />
            </div>

            {logs.length === 0 ? (
              <div className="flex gap-2.5">
                <div className="h-7 w-7 rounded-full bg-[#017e84]/15 text-[#017e84] flex items-center justify-center text-xs font-semibold shrink-0">
                  {(detail.created_by || "U").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 pt-0.5">
                  <div className="text-sm font-medium text-primary-dark">
                    {detail.created_by || "User"}
                  </div>
                  <div className="text-sm text-secondary-muted">
                    Creating a new record...
                  </div>
                </div>
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex gap-2.5">
                  <div className="h-7 w-7 rounded-full bg-[#017e84]/15 text-[#017e84] flex items-center justify-center text-xs font-semibold shrink-0">
                    {(log.performed_by || "U").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <div className="text-sm font-medium text-primary-dark">
                      {log.performed_by || "System"}
                    </div>
                    <div className="text-sm text-secondary-muted capitalize">
                      {log.action.replace(/_/g, " ")}
                      {log.previous_status && log.new_status
                        ? ` (${log.previous_status} → ${log.new_status})`
                        : ""}
                    </div>
                    <div className="text-[11px] text-secondary-muted mt-0.5">
                      {new Date(log.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
