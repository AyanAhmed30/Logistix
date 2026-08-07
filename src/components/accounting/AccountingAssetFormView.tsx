"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookOpen,
  HelpCircle,
  Link2,
  MessageSquare,
  StickyNote,
  Trash2,
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  confirmAccountingAsset,
  disposeAccountingAsset,
  getAccountingAssetActivity,
  getAccountingAssetCategories,
  getAccountingAssetDetail,
  postDueAccountingAssetDepreciations,
  updateAccountingAsset,
  type AccountingAssetCategory,
  type AccountingAssetDetail,
  type AccountingAssetLog,
} from "@/app/actions/accounting/assets";
import {
  getAccountingJournals,
  getAccountingChartAccounts,
} from "@/app/actions/accounting/journal-entries";
import { formatMoney } from "@/lib/sales-quotation-form";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import { cn } from "@/lib/utils";

type Props = { assetId: string };

const STATUS_STEPS = [
  { id: "draft", label: "Draft" },
  { id: "running", label: "Running" },
] as const;

function AssetStatusBar({ status }: { status: string }) {
  if (status === "disposed") {
    return (
      <span className="inline-flex h-7 items-center rounded-sm border border-slate-300 bg-slate-100 px-2.5 text-xs font-semibold text-slate-700">
        Disposed
      </span>
    );
  }
  if (status === "fully_depreciated") {
    return (
      <span className="inline-flex h-7 items-center rounded-sm border border-sky-300 bg-sky-50 px-2.5 text-xs font-semibold text-sky-800">
        Fully Depreciated
      </span>
    );
  }

  const activeIndex = status === "running" ? 1 : 0;

  return (
    <div className="flex items-center shrink-0" role="list" aria-label="Asset status">
      {STATUS_STEPS.map((step, index) => {
        const active = index === activeIndex;
        const done = index < activeIndex;
        const isLast = index === STATUS_STEPS.length - 1;
        return (
          <div key={step.id} className="flex items-center" role="listitem">
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
              {step.label}
              {!isLast ? (
                <>
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -right-[7px] top-1/2 z-[1] h-0 w-0 -translate-y-1/2 border-y-[14px] border-y-transparent border-l-[7px]",
                      active
                        ? "border-l-[#017e84]"
                        : done
                          ? "border-l-[#e6f4f5]"
                          : "border-l-white"
                    )}
                  />
                  <span
                    aria-hidden
                    className="absolute -right-[8px] top-1/2 z-[0] h-0 w-0 -translate-y-1/2 border-y-[15px] border-y-transparent border-l-[8px] border-l-slate-200"
                  />
                </>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <span title={text} className="inline-flex text-[#017e84]/70 cursor-help ml-1">
      <HelpCircle className="h-3.5 w-3.5" />
    </span>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary-muted mb-3">
      {children}
    </p>
  );
}

function FormRow({
  label,
  tip,
  children,
}: {
  label: string;
  tip?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(120px,38%)_1fr] gap-x-3 items-center min-h-9 py-1">
      <div className="flex items-center text-sm text-secondary-muted">
        <span>{label}</span>
        {tip ? <Tip text={tip} /> : null}
      </div>
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

type BillLine = {
  id: string;
  date: string;
  journalEntry: string;
  accountId: string;
  label: string;
  debit: string;
  credit: string;
};

function newBillLine(partial?: Partial<BillLine>): BillLine {
  return {
    id: crypto.randomUUID(),
    date: "",
    journalEntry: "",
    accountId: "",
    label: "",
    debit: "",
    credit: "",
    ...partial,
  };
}

export function AccountingAssetFormView({ assetId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<AccountingAssetDetail | null>(null);
  const [categories, setCategories] = useState<AccountingAssetCategory[]>([]);
  const [journals, setJournals] = useState<{ id: string; name: string; code: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [logs, setLogs] = useState<AccountingAssetLog[]>([]);
  const [tab, setTab] = useState<"asset" | "bills">("asset");
  const [billLines, setBillLines] = useState<BillLine[]>([]);
  const loadedAssetIdRef = useRef<string | null>(null);
  const [chatterMode, setChatterMode] = useState<"message" | "note" | "activity" | null>(null);
  const [isPending, startTransition] = useTransition();
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [disposalDate, setDisposalDate] = useState("");
  const [disposalValue, setDisposalValue] = useState("0");

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [purchaseRef, setPurchaseRef] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState("");
  const [originalValue, setOriginalValue] = useState("0");
  const [salvageValue, setSalvageValue] = useState("0");
  const [depreciatedImport, setDepreciatedImport] = useState("0");
  const [method, setMethod] = useState("straight_line");
  const [period, setPeriod] = useState("monthly");
  const [lifeMonths, setLifeMonths] = useState("36");
  const [deprNumber, setDeprNumber] = useState("36");
  const [firstDeprDate, setFirstDeprDate] = useState("");
  const [journalId, setJournalId] = useState("");
  const [assetAccountId, setAssetAccountId] = useState("");
  const [deprAccountId, setDeprAccountId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");

  const updateBillLine = (id: string, patch: Partial<BillLine>) => {
    setBillLines((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addBillLine = () => {
    setBillLines((rows) => [
      ...rows,
      newBillLine({
        date: acquisitionDate || new Date().toISOString().slice(0, 10),
        accountId: assetAccountId,
        label: name || "Asset acquisition",
        debit: originalValue && Number(originalValue) > 0 ? originalValue : "",
      }),
    ]);
  };

  const load = useCallback(() => {
    setLoading(true);
    void Promise.all([
      getAccountingAssetDetail(assetId),
      getAccountingAssetCategories(),
      getAccountingJournals(),
      getAccountingChartAccounts(),
      getAccountingAssetActivity(assetId),
    ]).then(([det, cats, jrn, acc, act]) => {
      if ("error" in det && det.error) {
        toast.error(det.error);
        setDetail(null);
      } else if (det.asset) {
        const a = det.asset;
        setDetail(a);
        setName(a.name === "New Asset" ? "" : a.name);
        setCategoryId(a.category_id || "");
        setVendorName(a.vendor_name || "");
        setPurchaseRef(a.purchase_reference || "");
        setAcquisitionDate(a.acquisition_date || "");
        setOriginalValue(String(a.original_value || 0));
        setSalvageValue(String(a.salvage_value || 0));
        setDepreciatedImport(String(a.accumulated_depreciation || 0));
        setMethod(a.depreciation_method || "straight_line");
        setPeriod(a.method_period || "monthly");
        setLifeMonths(String(a.useful_life_months || 36));
        setDeprNumber(String(a.depreciation_number || 36));
        setFirstDeprDate(a.first_depreciation_date || a.acquisition_date || "");
        setJournalId(a.journal_id || "");
        setAssetAccountId(a.asset_account_id || "");
        setDeprAccountId(a.depreciation_account_id || "");
        setExpenseAccountId(a.expense_account_id || "");
        setDisposalDate(a.disposal_date || new Date().toISOString().slice(0, 10));
        setDisposalValue(String(a.book_value || 0));
        if (a.purchase_journal_entry_id) {
          setBillLines([
            newBillLine({
              id: `purchase-${a.purchase_journal_entry_id}`,
              date: a.acquisition_date || "",
              journalEntry: a.purchase_journal_entry_id,
              accountId: a.asset_account_id || "",
              label: a.name || "Asset acquisition",
              debit: String(a.original_value || 0),
              credit: "",
            }),
          ]);
        } else if (loadedAssetIdRef.current !== assetId) {
          setBillLines([]);
        }
        loadedAssetIdRef.current = assetId;
      }
      if (!("error" in cats)) setCategories(cats.categories || []);
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
      if (!("error" in act)) setLogs(act.logs || []);
      setLoading(false);
    });
  }, [assetId]);

  useEffect(() => {
    load();
  }, [load]);

  const isDraft = detail?.status === "draft";
  const isDisposed = detail?.status === "disposed";
  const canEdit = Boolean(detail) && !isDisposed;

  const bookValuePreview = useMemo(() => {
    const orig = parseFloat(originalValue) || 0;
    const accum =
      detail?.status === "draft"
        ? parseFloat(depreciatedImport) || 0
        : detail?.accumulated_depreciation || 0;
    return Math.max(0, Math.round((orig - accum) * 100) / 100);
  }, [originalValue, depreciatedImport, detail]);

  const postedEntries =
    (detail?.purchase_journal_entry_id ? 1 : 0) +
    (detail?.depreciation_je_count || 0) +
    (detail?.disposal_journal_entry_id ? 1 : 0);

  const relatedItems = billLines.length;

  function payload() {
    return {
      name: name.trim() || "New Asset",
      category_id: categoryId || null,
      vendor_name: vendorName || null,
      purchase_reference: purchaseRef || null,
      acquisition_date: acquisitionDate || undefined,
      original_value: parseFloat(originalValue) || 0,
      salvage_value: parseFloat(salvageValue) || 0,
      depreciation_method: method as "straight_line" | "declining_balance" | "manual",
      method_period: period as "monthly" | "yearly",
      useful_life_months: parseInt(lifeMonths, 10) || 36,
      depreciation_number: parseInt(deprNumber, 10) || 36,
      first_depreciation_date: firstDeprDate || acquisitionDate || null,
      journal_id: journalId || null,
      asset_account_id: assetAccountId || null,
      depreciation_account_id: deprAccountId || null,
      expense_account_id: expenseAccountId || null,
    };
  }

  function handleComputeDepreciation() {
    if (!canEdit) return;
    startTransition(async () => {
      const res = await updateAccountingAsset(assetId, payload());
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Depreciation schedule computed");
      if (res.asset) setDetail(res.asset);
      load();
    });
  }

  function handleConfirm() {
    startTransition(async () => {
      const saved = await updateAccountingAsset(assetId, payload());
      if ("error" in saved && saved.error) {
        toast.error(saved.error);
        return;
      }
      const res = await confirmAccountingAsset(assetId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Asset confirmed");
      load();
    });
  }

  function handlePostDue() {
    startTransition(async () => {
      const res = await postDueAccountingAssetDepreciations(assetId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Posted ${res.posted || 0} depreciation(s)`);
      load();
    });
  }

  function handleDispose() {
    startTransition(async () => {
      const res = await disposeAccountingAsset(assetId, {
        disposalDate,
        disposalValue: parseFloat(disposalValue) || 0,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Asset disposed");
      setDisposeOpen(false);
      load();
    });
  }

  if (loading) {
    return (
      <div className="p-4">
        <AccountingTableSkeleton rows={8} cols={4} />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-secondary-muted">Asset not found.</p>
        <Button
          variant="outline"
          size="sm"
          className={btnSecondary}
          onClick={() => router.push("/accounting/assets")}
        >
          Back to Assets
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)] bg-white">
      {/* Actions + status — Odoo style */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-1.5">
          {isDraft ? (
            <>
              <Button
                size="sm"
                className={btnPrimary}
                disabled={isPending}
                onClick={handleConfirm}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={btnSecondary}
                disabled={isPending}
                onClick={handleComputeDepreciation}
              >
                Compute Depreciation
              </Button>
            </>
          ) : null}
          {!isDraft && !isDisposed ? (
            <>
              <Button
                size="sm"
                className={btnPrimary}
                disabled={isPending}
                onClick={handlePostDue}
              >
                Post Due Depreciation
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={btnSecondary}
                disabled={isPending}
                onClick={handleComputeDepreciation}
              >
                Compute Depreciation
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={cn(btnSecondary, "text-red-700 border-red-200")}
                disabled={isPending}
                onClick={() => setDisposeOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Dispose
              </Button>
            </>
          ) : null}
        </div>
        <div className="ml-auto">
          <AssetStatusBar status={detail.status} />
        </div>
      </div>

      <div className="flex-1 grid xl:grid-cols-[minmax(0,1fr)_320px] min-h-0">
        {/* Sheet */}
        <div className="overflow-auto p-4 sm:p-6 space-y-5">
          {/* Smart buttons */}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="inline-flex min-w-[100px] flex-col items-center justify-center rounded-sm border border-slate-200 bg-slate-50/80 px-3 py-2 hover:bg-slate-50"
              onClick={() => setTab("bills")}
            >
              <Link2 className="h-4 w-4 text-[#017e84] mb-0.5" />
              <span className="text-base font-semibold tabular-nums text-primary-dark leading-none">
                {relatedItems}
              </span>
              <span className="text-[11px] text-secondary-muted mt-0.5">
                Related Items
              </span>
            </button>
            <button
              type="button"
              className="inline-flex min-w-[100px] flex-col items-center justify-center rounded-sm border border-slate-200 bg-slate-50/80 px-3 py-2 hover:bg-slate-50 disabled:opacity-50"
              disabled={postedEntries < 1}
              onClick={() => {
                if (detail.purchase_journal_entry_id) {
                  router.push(
                    `/accounting/journal-entries/${detail.purchase_journal_entry_id}`
                  );
                }
              }}
            >
              <BookOpen className="h-4 w-4 text-[#017e84] mb-0.5" />
              <span className="text-base font-semibold tabular-nums text-primary-dark leading-none">
                {postedEntries}
              </span>
              <span className="text-[11px] text-secondary-muted mt-0.5">
                Posted Entries
              </span>
            </button>
          </div>

          {/* Hero Asset Name — Odoo style */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-secondary-muted">Asset Name</p>
            <Input
              value={name}
              disabled={!canEdit}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Laptop iBook"
              className="h-auto border-0 border-b border-slate-200 rounded-none px-0 text-2xl sm:text-3xl font-bold text-primary-dark shadow-none focus-visible:ring-0 focus-visible:border-[#017e84] placeholder:text-slate-300"
            />
            {!isDraft ? (
              <p className="text-xs text-secondary-muted font-mono pt-1">
                {detail.asset_number}
              </p>
            ) : null}
          </div>

          {/* Tabs */}
          <div className="flex gap-4 border-b border-slate-200">
            {(
              [
                ["asset", "Asset"],
                ["bills", "Bills"],
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

          {tab === "asset" ? (
            <div className="grid lg:grid-cols-2 gap-x-10 gap-y-8">
              {/* ASSET VALUES */}
              <div>
                <SectionTitle>Asset Values</SectionTitle>
                <FormRow label="Asset Value">
                  <Input
                    value={originalValue}
                    disabled={!canEdit || !isDraft}
                    onChange={(e) => setOriginalValue(e.target.value)}
                    className={cn(fieldClass, "tabular-nums font-medium")}
                  />
                </FormRow>
                <FormRow label="Date">
                  <Input
                    type="date"
                    value={acquisitionDate}
                    disabled={!canEdit}
                    onChange={(e) => setAcquisitionDate(e.target.value)}
                    className={fieldClass}
                  />
                </FormRow>
                <FormRow
                  label="Fixed Asset Account"
                  tip="Balance sheet account for this fixed asset"
                >
                  <AccountSelect
                    value={assetAccountId}
                    disabled={!canEdit}
                    accounts={accounts}
                    onChange={setAssetAccountId}
                  />
                </FormRow>
                <FormRow label="Asset Group">
                  <select
                    value={categoryId}
                    disabled={!canEdit}
                    onChange={(e) => {
                      const id = e.target.value;
                      setCategoryId(id);
                      const cat = categories.find((c) => c.id === id);
                      if (cat && isDraft) {
                        setMethod(cat.depreciation_method);
                        setPeriod(cat.method_period);
                        setLifeMonths(String(cat.useful_life_months));
                        setDeprNumber(String(cat.useful_life_months));
                        if (cat.journal_id) setJournalId(cat.journal_id);
                        if (cat.asset_account_id) setAssetAccountId(cat.asset_account_id);
                        if (cat.depreciation_account_id) {
                          setDeprAccountId(cat.depreciation_account_id);
                        }
                        if (cat.expense_account_id) {
                          setExpenseAccountId(cat.expense_account_id);
                        }
                      }
                    }}
                    className={selectClass}
                  >
                    <option value=""> </option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </FormRow>
              </div>

              {/* CURRENT VALUES */}
              <div>
                <SectionTitle>Current Values</SectionTitle>
                <FormRow
                  label="Not Depreciable Value"
                  tip="Salvage / residual value at end of life"
                >
                  <Input
                    value={salvageValue}
                    disabled={!canEdit || !isDraft}
                    onChange={(e) => setSalvageValue(e.target.value)}
                    className={cn(fieldClass, "tabular-nums")}
                  />
                </FormRow>
                <FormRow label="Book Value" tip="Original cost minus accumulated depreciation">
                  <div className="h-8 flex items-center text-sm font-semibold tabular-nums text-primary-dark border-b border-transparent">
                    {formatMoney(isDraft ? bookValuePreview : detail.book_value)}
                  </div>
                </FormRow>
                <FormRow
                  label="Depreciated at import"
                  tip="Already depreciated amount when importing an existing asset"
                >
                  <Input
                    value={
                      isDraft
                        ? depreciatedImport
                        : String(detail.accumulated_depreciation || 0)
                    }
                    disabled={!canEdit || !isDraft}
                    onChange={(e) => setDepreciatedImport(e.target.value)}
                    className={cn(fieldClass, "tabular-nums")}
                  />
                </FormRow>
              </div>

              {/* DEPRECIATION METHOD */}
              <div>
                <SectionTitle>Depreciation Method</SectionTitle>
                <FormRow label="Depreciation Model">
                  <select
                    value={method}
                    disabled={!canEdit || !isDraft}
                    onChange={(e) => setMethod(e.target.value)}
                    className={selectClass}
                  >
                    <option value="straight_line">Straight Line</option>
                    <option value="declining_balance">Declining Balance</option>
                    <option value="manual">Manual</option>
                  </select>
                </FormRow>
                <FormRow label="Computation">
                  <select
                    value={period}
                    disabled={!canEdit || !isDraft}
                    onChange={(e) => setPeriod(e.target.value)}
                    className={selectClass}
                  >
                    <option value="monthly">Constant Periods (Monthly)</option>
                    <option value="yearly">Constant Periods (Yearly)</option>
                  </select>
                </FormRow>
                <FormRow label="Number of Depreciations">
                  <Input
                    value={deprNumber}
                    disabled={!canEdit || !isDraft}
                    onChange={(e) => {
                      setDeprNumber(e.target.value);
                      setLifeMonths(e.target.value);
                    }}
                    className={cn(fieldClass, "tabular-nums")}
                  />
                </FormRow>
                <FormRow label="First Depreciation">
                  <Input
                    type="date"
                    value={firstDeprDate}
                    disabled={!canEdit || !isDraft}
                    onChange={(e) => setFirstDeprDate(e.target.value)}
                    className={fieldClass}
                  />
                </FormRow>
              </div>

              {/* ACCOUNTING */}
              <div>
                <SectionTitle>Accounting</SectionTitle>
                <FormRow label="Vendor">
                  <Input
                    value={vendorName}
                    disabled={!canEdit}
                    onChange={(e) => setVendorName(e.target.value)}
                    className={fieldClass}
                    placeholder="Vendor name"
                  />
                </FormRow>
                <FormRow label="Bill Reference">
                  <Input
                    value={purchaseRef}
                    disabled={!canEdit}
                    onChange={(e) => setPurchaseRef(e.target.value)}
                    className={fieldClass}
                    placeholder="Vendor bill / PO reference"
                  />
                </FormRow>
                <FormRow
                  label="Depreciation Account"
                  tip="Accumulated depreciation (contra-asset)"
                >
                  <AccountSelect
                    value={deprAccountId}
                    disabled={!canEdit}
                    accounts={accounts}
                    onChange={setDeprAccountId}
                  />
                </FormRow>
                <FormRow label="Expense Account" tip="Depreciation expense P&L account">
                  <AccountSelect
                    value={expenseAccountId}
                    disabled={!canEdit}
                    accounts={accounts}
                    onChange={setExpenseAccountId}
                  />
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
            </div>
          ) : null}

          {tab === "bills" ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-slate-200 hover:bg-transparent">
                    <TableHead className="h-9 px-3 text-xs font-semibold text-secondary-muted w-[120px]">
                      Date
                    </TableHead>
                    <TableHead className="h-9 px-3 text-xs font-semibold text-secondary-muted min-w-[140px]">
                      Journal Entry
                    </TableHead>
                    <TableHead className="h-9 px-3 text-xs font-semibold text-secondary-muted min-w-[180px]">
                      Account
                    </TableHead>
                    <TableHead className="h-9 px-3 text-xs font-semibold text-secondary-muted min-w-[160px]">
                      Label
                    </TableHead>
                    <TableHead className="h-9 px-3 text-xs font-semibold text-secondary-muted text-right w-[110px]">
                      Debit
                    </TableHead>
                    <TableHead className="h-9 px-3 text-xs font-semibold text-secondary-muted text-right w-[110px]">
                      Credit
                    </TableHead>
                    <TableHead className="h-9 w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {billLines.map((line) => (
                    <TableRow
                      key={line.id}
                      className="border-b border-slate-100 hover:bg-slate-50/50"
                    >
                      <TableCell className="p-1.5">
                        <Input
                          type="date"
                          value={line.date}
                          disabled={!canEdit}
                          onChange={(e) =>
                            updateBillLine(line.id, { date: e.target.value })
                          }
                          className={cn(fieldClass, "h-8 border-0 shadow-none bg-transparent")}
                        />
                      </TableCell>
                      <TableCell className="p-1.5">
                        {line.journalEntry && detail.purchase_journal_entry_id === line.journalEntry ? (
                          <button
                            type="button"
                            className="px-2 text-sm text-[#017e84] hover:underline truncate max-w-[160px]"
                            onClick={() =>
                              router.push(
                                `/accounting/journal-entries/${line.journalEntry}`
                              )
                            }
                          >
                            {line.journalEntry.slice(0, 8)}…
                          </button>
                        ) : (
                          <Input
                            value={line.journalEntry}
                            disabled={!canEdit}
                            onChange={(e) =>
                              updateBillLine(line.id, {
                                journalEntry: e.target.value,
                              })
                            }
                            placeholder="—"
                            className={cn(
                              fieldClass,
                              "h-8 border-0 shadow-none bg-transparent"
                            )}
                          />
                        )}
                      </TableCell>
                      <TableCell className="p-1.5">
                        <select
                          value={line.accountId}
                          disabled={!canEdit}
                          onChange={(e) =>
                            updateBillLine(line.id, { accountId: e.target.value })
                          }
                          className={cn(
                            selectClass,
                            "h-8 border-0 shadow-none bg-transparent"
                          )}
                        >
                          <option value=""> </option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code ? `${a.code} ${a.name}` : a.name}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell className="p-1.5">
                        <Input
                          value={line.label}
                          disabled={!canEdit}
                          onChange={(e) =>
                            updateBillLine(line.id, { label: e.target.value })
                          }
                          className={cn(
                            fieldClass,
                            "h-8 border-0 shadow-none bg-transparent"
                          )}
                        />
                      </TableCell>
                      <TableCell className="p-1.5">
                        <Input
                          value={line.debit}
                          disabled={!canEdit}
                          onChange={(e) =>
                            updateBillLine(line.id, {
                              debit: e.target.value,
                              credit: e.target.value ? "" : line.credit,
                            })
                          }
                          className={cn(
                            fieldClass,
                            "h-8 border-0 shadow-none bg-transparent text-right tabular-nums"
                          )}
                        />
                      </TableCell>
                      <TableCell className="p-1.5">
                        <Input
                          value={line.credit}
                          disabled={!canEdit}
                          onChange={(e) =>
                            updateBillLine(line.id, {
                              credit: e.target.value,
                              debit: e.target.value ? "" : line.debit,
                            })
                          }
                          className={cn(
                            fieldClass,
                            "h-8 border-0 shadow-none bg-transparent text-right tabular-nums"
                          )}
                        />
                      </TableCell>
                      <TableCell className="p-1.5">
                        {canEdit ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-secondary-muted hover:text-red-600"
                            onClick={() =>
                              setBillLines((rows) =>
                                rows.filter((r) => r.id !== line.id)
                              )
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                  {canEdit ? (
                    <TableRow className="border-b border-slate-100 hover:bg-transparent">
                      <TableCell colSpan={7} className="px-3 py-2">
                        <button
                          type="button"
                          onClick={addBillLine}
                          className="text-sm text-[#017e84] hover:underline"
                        >
                          Add a line
                        </button>
                      </TableCell>
                    </TableRow>
                  ) : billLines.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={7}
                        className="px-3 py-8 text-center text-sm text-secondary-muted"
                      >
                        No bill lines
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {/* Empty spacer rows like Odoo */}
                  {Array.from({ length: Math.max(0, 4 - billLines.length) }).map(
                    (_, i) => (
                      <TableRow
                        key={`spacer-${i}`}
                        className="border-b border-slate-100 hover:bg-transparent"
                      >
                        <TableCell colSpan={7} className="h-9 px-3" />
                      </TableRow>
                    )
                  )}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </div>

        {/* Chatter — Odoo style */}
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
              Today
            </p>
            {logs.length === 0 ? (
              <div className="flex gap-2.5">
                <div className="h-8 w-8 rounded-full bg-[#017e84]/15 text-[#017e84] flex items-center justify-center text-xs font-bold shrink-0">
                  A
                </div>
                <div>
                  <p className="text-sm text-primary-dark">Creating a new record…</p>
                  <p className="text-[11px] text-secondary-muted mt-0.5">
                    {detail.asset_number}
                  </p>
                </div>
              </div>
            ) : (
              <ul className="space-y-4">
                {logs.map((l) => (
                  <li key={l.id} className="flex gap-2.5">
                    <div className="h-8 w-8 rounded-full bg-[#017e84]/15 text-[#017e84] flex items-center justify-center text-xs font-bold shrink-0">
                      {(l.performed_by || "A").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-primary-dark capitalize">
                        <span className="font-medium">{l.performed_by || "System"}</span>
                        {" — "}
                        {l.action.replace(/_/g, " ")}
                      </p>
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

      <Dialog open={disposeOpen} onOpenChange={setDisposeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dispose Asset</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-secondary-muted">
              Book value {formatMoney(detail.book_value)}. A disposal journal entry
              will be created.
            </p>
            <div className="space-y-1">
              <p className="text-xs text-secondary-muted">Disposal Date</p>
              <Input
                type="date"
                value={disposalDate}
                onChange={(e) => setDisposalDate(e.target.value)}
                className="h-9 rounded-sm"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-secondary-muted">Disposal Proceeds</p>
              <Input
                value={disposalValue}
                onChange={(e) => setDisposalValue(e.target.value)}
                className="h-9 rounded-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className={btnSecondary}
              onClick={() => setDisposeOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="h-8 rounded-sm bg-red-600 hover:bg-red-700 text-white"
              disabled={isPending}
              onClick={handleDispose}
            >
              Dispose
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccountSelect({
  value,
  disabled,
  accounts,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  accounts: { id: string; code: string; name: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={selectClass}
    >
      <option value=""> </option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.code} {a.name}
        </option>
      ))}
    </select>
  );
}
