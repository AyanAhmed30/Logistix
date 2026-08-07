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
  HelpCircle,
  Link2,
  MessageSquare,
  StickyNote,
  Wallet,
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
  cancelAccountingLoan,
  closeAccountingLoan,
  confirmAccountingLoan,
  getAccountingLoanActivity,
  getAccountingLoanDetail,
  payAccountingLoanInstallment,
  updateAccountingLoan,
  type AccountingLoanDetail,
  type AccountingLoanLog,
} from "@/app/actions/accounting/loans";
import {
  getAccountingJournals,
  getAccountingChartAccounts,
} from "@/app/actions/accounting/journal-entries";
import { formatMoney } from "@/lib/sales-quotation-form";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import { cn } from "@/lib/utils";

type Props = { loanId: string };

const STATUS_STEPS = [
  { id: "draft", label: "Draft" },
  { id: "active", label: "Active" },
  { id: "partially_paid", label: "Partially Paid" },
  { id: "fully_paid", label: "Fully Paid" },
] as const;

function LoanStatusBar({ status }: { status: string }) {
  if (status === "closed") {
    return (
      <span className="inline-flex h-7 items-center rounded-sm border border-slate-300 bg-slate-100 px-2.5 text-xs font-semibold text-slate-700">
        Closed
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className="inline-flex h-7 items-center rounded-sm border border-red-200 bg-red-50 px-2.5 text-xs font-semibold text-red-700">
        Cancelled
      </span>
    );
  }

  const order = ["draft", "active", "partially_paid", "fully_paid"];
  let activeIndex = order.indexOf(status);
  if (activeIndex < 0) activeIndex = 0;
  if (status === "active") activeIndex = 1;

  return (
    <div className="flex items-center shrink-0" role="list" aria-label="Loan status">
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
              style={{ clipPath: index === 0 ? undefined : undefined }}
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

function Tip({ text }: { text: string }) {
  return (
    <span title={text} className="ml-1 inline-flex text-slate-400">
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

export function AccountingLoanFormView({ loanId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<AccountingLoanDetail | null>(null);
  const [journals, setJournals] = useState<{ id: string; name: string; code: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [logs, setLogs] = useState<AccountingLoanLog[]>([]);
  const [tab, setTab] = useState<"loan" | "installments" | "amortization">("loan");
  const [chatterMode, setChatterMode] = useState<"message" | "note" | "activity" | null>(null);
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [lenderName, setLenderName] = useState("");
  const [loanType, setLoanType] = useState("bank_loan");
  const [direction, setDirection] = useState("borrowed");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [principal, setPrincipal] = useState("0");
  const [interestRate, setInterestRate] = useState("0");
  const [interestMethod, setInterestMethod] = useState("reducing_balance");
  const [startDate, setStartDate] = useState("");
  const [firstInstallmentDate, setFirstInstallmentDate] = useState("");
  const [totalInstallments, setTotalInstallments] = useState("12");
  const [frequency, setFrequency] = useState("monthly");
  const [journalId, setJournalId] = useState("");
  const [liabilityAccountId, setLiabilityAccountId] = useState("");
  const [interestExpenseAccountId, setInterestExpenseAccountId] = useState("");
  const [interestPayableAccountId, setInterestPayableAccountId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    void Promise.all([
      getAccountingLoanDetail(loanId),
      getAccountingJournals(),
      getAccountingChartAccounts(),
      getAccountingLoanActivity(loanId),
    ]).then(([det, jrn, acc, act]) => {
      if ("error" in det && det.error) {
        toast.error(det.error);
        setDetail(null);
      } else if (det.loan) {
        const a = det.loan;
        setDetail(a);
        setName(a.name === "New Loan" ? "" : a.name);
        setLenderName(a.lender_name || "");
        setLoanType(a.loan_type || "bank_loan");
        setDirection(a.direction || "borrowed");
        setReferenceNumber(a.reference_number || "");
        setPrincipal(String(a.principal_amount || 0));
        setInterestRate(String(a.interest_rate || 0));
        setInterestMethod(a.interest_method || "reducing_balance");
        setStartDate(a.start_date || "");
        setFirstInstallmentDate(a.first_installment_date || a.start_date || "");
        setTotalInstallments(String(a.total_installments || 12));
        setFrequency(a.installment_frequency || "monthly");
        setJournalId(a.journal_id || "");
        setLiabilityAccountId(a.liability_account_id || "");
        setInterestExpenseAccountId(a.interest_expense_account_id || "");
        setInterestPayableAccountId(a.interest_payable_account_id || "");
        setBankAccountId(a.bank_account_id || "");
        setPaymentAccountId(a.payment_account_id || "");
        setNotes(a.notes || "");
      }
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
  }, [loanId]);

  useEffect(() => {
    load();
  }, [load]);

  const isDraft = detail?.status === "draft";
  const isClosed = detail?.status === "closed" || detail?.status === "cancelled";
  const canEdit = Boolean(detail) && !isClosed;
  const canPay =
    detail &&
    ["active", "partially_paid"].includes(detail.status);

  function payload(rebuild = true) {
    return {
      name: name.trim() || "New Loan",
      lender_name: lenderName || null,
      loan_type: loanType,
      direction,
      reference_number: referenceNumber || null,
      principal_amount: parseFloat(principal) || 0,
      interest_rate: parseFloat(interestRate) || 0,
      interest_method: interestMethod,
      start_date: startDate,
      first_installment_date: firstInstallmentDate || null,
      total_installments: parseInt(totalInstallments, 10) || 12,
      installment_frequency: frequency,
      journal_id: journalId || null,
      liability_account_id: liabilityAccountId || null,
      interest_expense_account_id: interestExpenseAccountId || null,
      interest_payable_account_id: interestPayableAccountId || null,
      bank_account_id: bankAccountId || null,
      payment_account_id: paymentAccountId || null,
      notes: notes || null,
      rebuild_schedule: rebuild,
    };
  }

  function handleSaveAndCompute() {
    if (!canEdit) return;
    startTransition(async () => {
      const res = await updateAccountingLoan(loanId, payload(true));
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Installment schedule computed");
      if (res.loan) setDetail(res.loan);
      setTab("installments");
      load();
    });
  }

  function handleConfirm() {
    startTransition(async () => {
      const saved = await updateAccountingLoan(loanId, payload(true));
      if ("error" in saved && saved.error) {
        toast.error(saved.error);
        return;
      }
      const res = await confirmAccountingLoan(loanId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Loan confirmed");
      load();
    });
  }

  function handlePay(installmentId: string) {
    startTransition(async () => {
      const res = await payAccountingLoanInstallment(installmentId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Installment paid");
      load();
    });
  }

  function handleClose() {
    startTransition(async () => {
      const res = await closeAccountingLoan(loanId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Loan closed");
      load();
    });
  }

  function handleCancel() {
    startTransition(async () => {
      const res = await cancelAccountingLoan(loanId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Loan cancelled");
      load();
    });
  }

  if (loading) {
    return <AccountingTableSkeleton rows={8} cols={4} />;
  }

  if (!detail) {
    return (
      <div className="p-8 text-center text-sm text-secondary-muted">
        Loan not found.{" "}
        <button
          type="button"
          className="text-[#017e84] hover:underline"
          onClick={() => router.push("/accounting/loans")}
        >
          Back to list
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-2">
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
                onClick={handleSaveAndCompute}
              >
                Compute Schedule
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={cn(btnSecondary, "text-red-700 border-red-200")}
                disabled={isPending}
                onClick={handleCancel}
              >
                Cancel
              </Button>
            </>
          ) : null}
          {canPay ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className={btnSecondary}
                disabled={isPending}
                onClick={handleSaveAndCompute}
              >
                Save
              </Button>
              {detail.status === "fully_paid" ||
              detail.remaining_balance <= 0.01 ? (
                <Button
                  size="sm"
                  className={btnPrimary}
                  disabled={isPending}
                  onClick={handleClose}
                >
                  Close Loan
                </Button>
              ) : null}
            </>
          ) : null}
          {detail.status === "fully_paid" ? (
            <Button
              size="sm"
              className={btnPrimary}
              disabled={isPending}
              onClick={handleClose}
            >
              Close Loan
            </Button>
          ) : null}
        </div>
        <div className="ml-auto">
          <LoanStatusBar status={detail.status} />
        </div>
      </div>

      <div className="flex-1 grid xl:grid-cols-[minmax(0,1fr)_320px] min-h-0">
        <div className="overflow-auto p-4 sm:p-6 space-y-5">
          {/* Smart buttons */}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="inline-flex min-w-[100px] flex-col items-center justify-center rounded-sm border border-slate-200 bg-slate-50/80 px-3 py-2 hover:bg-slate-50"
              onClick={() => setTab("installments")}
            >
              <Wallet className="h-4 w-4 text-[#017e84] mb-0.5" />
              <span className="text-base font-semibold tabular-nums text-primary-dark leading-none">
                {detail.installment_count}
              </span>
              <span className="text-[11px] text-secondary-muted mt-0.5">
                Installments
              </span>
            </button>
            <button
              type="button"
              className="inline-flex min-w-[100px] flex-col items-center justify-center rounded-sm border border-slate-200 bg-slate-50/80 px-3 py-2 hover:bg-slate-50"
              onClick={() => setTab("installments")}
            >
              <Link2 className="h-4 w-4 text-[#017e84] mb-0.5" />
              <span className="text-base font-semibold tabular-nums text-primary-dark leading-none">
                {detail.paid_count}
              </span>
              <span className="text-[11px] text-secondary-muted mt-0.5">
                Payments
              </span>
            </button>
            <button
              type="button"
              className="inline-flex min-w-[100px] flex-col items-center justify-center rounded-sm border border-slate-200 bg-slate-50/80 px-3 py-2 hover:bg-slate-50 disabled:opacity-50"
              disabled={detail.je_count < 1}
              onClick={() => {
                if (detail.disbursement_journal_entry_id) {
                  router.push(
                    `/accounting/journal-entries/${detail.disbursement_journal_entry_id}`
                  );
                }
              }}
            >
              <BookOpen className="h-4 w-4 text-[#017e84] mb-0.5" />
              <span className="text-base font-semibold tabular-nums text-primary-dark leading-none">
                {detail.je_count}
              </span>
              <span className="text-[11px] text-secondary-muted mt-0.5">
                Journal Entries
              </span>
            </button>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-secondary-muted">Loan Name</p>
            <Input
              value={name}
              disabled={!canEdit}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bank Term Loan 2026"
              className="h-auto border-0 border-b border-slate-200 rounded-none px-0 text-2xl sm:text-3xl font-bold text-primary-dark shadow-none focus-visible:ring-0 focus-visible:border-[#017e84] placeholder:text-slate-300"
            />
            <p className="text-xs text-secondary-muted font-mono pt-1">
              {detail.loan_number}
            </p>
          </div>

          {/* Outstanding summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border border-slate-200 rounded-sm p-3 bg-slate-50/40">
            <div>
              <p className="text-[11px] text-secondary-muted">Original</p>
              <p className="text-sm font-semibold tabular-nums">
                {formatMoney(detail.principal_amount)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-secondary-muted">Total Paid</p>
              <p className="text-sm font-semibold tabular-nums">
                {formatMoney(detail.principal_paid + detail.interest_paid)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-secondary-muted">Remaining Principal</p>
              <p className="text-sm font-semibold tabular-nums">
                {formatMoney(detail.remaining_principal)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-secondary-muted">Outstanding</p>
              <p className="text-sm font-semibold tabular-nums text-[#017e84]">
                {formatMoney(detail.remaining_balance)}
              </p>
            </div>
          </div>

          <div className="flex gap-4 border-b border-slate-200">
            {(
              [
                ["loan", "Loan"],
                ["installments", "Installments"],
                ["amortization", "Amortization"],
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

          {tab === "loan" ? (
            <div className="grid lg:grid-cols-2 gap-x-10 gap-y-8">
              <div>
                <SectionTitle>Basic Information</SectionTitle>
                <FormRow label="Lender / Bank">
                  <Input
                    value={lenderName}
                    disabled={!canEdit}
                    onChange={(e) => setLenderName(e.target.value)}
                    className={fieldClass}
                    placeholder="Bank or lender name"
                  />
                </FormRow>
                <FormRow label="Loan Type">
                  <select
                    value={loanType}
                    disabled={!canEdit || !isDraft}
                    onChange={(e) => setLoanType(e.target.value)}
                    className={selectClass}
                  >
                    <option value="bank_loan">Bank Loan</option>
                    <option value="vehicle_loan">Vehicle Loan</option>
                    <option value="equipment_loan">Equipment Loan</option>
                    <option value="business_loan">Business Loan</option>
                    <option value="mortgage">Mortgage</option>
                    <option value="internal_loan">Internal Loan</option>
                    <option value="other">Other</option>
                  </select>
                </FormRow>
                <FormRow label="Direction" tip="Borrowed = company borrows; Issued = company lends">
                  <select
                    value={direction}
                    disabled={!canEdit || !isDraft}
                    onChange={(e) => setDirection(e.target.value)}
                    className={selectClass}
                  >
                    <option value="borrowed">Borrowed (Liability)</option>
                    <option value="issued">Issued (Receivable)</option>
                  </select>
                </FormRow>
                <FormRow label="Reference">
                  <Input
                    value={referenceNumber}
                    disabled={!canEdit}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className={fieldClass}
                    placeholder="Bank reference / contract #"
                  />
                </FormRow>
                <FormRow label="Organization">
                  <Input
                    value={detail.organization_name || "—"}
                    disabled
                    className={fieldClass}
                  />
                </FormRow>
              </div>

              <div>
                <SectionTitle>Financial Information</SectionTitle>
                <FormRow label="Principal Amount">
                  <Input
                    value={principal}
                    disabled={!canEdit || !isDraft}
                    onChange={(e) => setPrincipal(e.target.value)}
                    className={cn(fieldClass, "tabular-nums font-medium")}
                  />
                </FormRow>
                <FormRow label="Interest Rate (%)">
                  <Input
                    value={interestRate}
                    disabled={!canEdit || !isDraft}
                    onChange={(e) => setInterestRate(e.target.value)}
                    className={cn(fieldClass, "tabular-nums")}
                  />
                </FormRow>
                <FormRow label="Interest Method">
                  <select
                    value={interestMethod}
                    disabled={!canEdit || !isDraft}
                    onChange={(e) => setInterestMethod(e.target.value)}
                    className={selectClass}
                  >
                    <option value="reducing_balance">Reducing Balance</option>
                    <option value="fixed">Fixed Interest</option>
                  </select>
                </FormRow>
                <FormRow label="Start Date">
                  <Input
                    type="date"
                    value={startDate}
                    disabled={!canEdit || !isDraft}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={fieldClass}
                  />
                </FormRow>
                <FormRow label="First Installment">
                  <Input
                    type="date"
                    value={firstInstallmentDate}
                    disabled={!canEdit || !isDraft}
                    onChange={(e) => setFirstInstallmentDate(e.target.value)}
                    className={fieldClass}
                  />
                </FormRow>
                <FormRow label="Total Installments">
                  <Input
                    value={totalInstallments}
                    disabled={!canEdit || !isDraft}
                    onChange={(e) => setTotalInstallments(e.target.value)}
                    className={cn(fieldClass, "tabular-nums")}
                  />
                </FormRow>
                <FormRow label="Frequency">
                  <select
                    value={frequency}
                    disabled={!canEdit || !isDraft}
                    onChange={(e) => setFrequency(e.target.value)}
                    className={selectClass}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </FormRow>
              </div>

              <div>
                <SectionTitle>Accounting</SectionTitle>
                <FormRow label="Loan Liability Account">
                  <AccountSelect
                    value={liabilityAccountId}
                    disabled={!canEdit}
                    accounts={accounts}
                    onChange={setLiabilityAccountId}
                  />
                </FormRow>
                <FormRow label="Interest Expense Account">
                  <AccountSelect
                    value={interestExpenseAccountId}
                    disabled={!canEdit}
                    accounts={accounts}
                    onChange={setInterestExpenseAccountId}
                  />
                </FormRow>
                <FormRow label="Interest Payable Account">
                  <AccountSelect
                    value={interestPayableAccountId}
                    disabled={!canEdit}
                    accounts={accounts}
                    onChange={setInterestPayableAccountId}
                  />
                </FormRow>
                <FormRow label="Bank / Cash Account">
                  <AccountSelect
                    value={bankAccountId}
                    disabled={!canEdit}
                    accounts={accounts}
                    onChange={setBankAccountId}
                  />
                </FormRow>
                <FormRow label="Payment Account">
                  <AccountSelect
                    value={paymentAccountId}
                    disabled={!canEdit}
                    accounts={accounts}
                    onChange={setPaymentAccountId}
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

              <div>
                <SectionTitle>Notes</SectionTitle>
                <textarea
                  value={notes}
                  disabled={!canEdit}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={6}
                  className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm text-primary-dark focus:outline-none focus:border-[#017e84]"
                  placeholder="Internal notes…"
                />
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[11px] text-secondary-muted">End Date</p>
                    <p className="font-medium">{detail.end_date || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-secondary-muted">Installment Amount</p>
                    <p className="font-medium tabular-nums">
                      {formatMoney(detail.monthly_installment)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-secondary-muted">Total Interest</p>
                    <p className="font-medium tabular-nums">
                      {formatMoney(detail.total_interest)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-secondary-muted">Total Payable</p>
                    <p className="font-medium tabular-nums">
                      {formatMoney(detail.total_payable)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "installments" ? (
            <div className="border border-slate-200 rounded-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>#</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Principal</TableHead>
                    <TableHead className="text-right">Interest</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.installments.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center text-sm text-secondary-muted py-10"
                      >
                        Click <strong>Compute Schedule</strong> to generate installments.
                      </TableCell>
                    </TableRow>
                  ) : (
                    detail.installments.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-sm tabular-nums">
                          {row.sequence}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {row.due_date}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {formatMoney(row.principal_amount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {formatMoney(row.interest_amount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-medium">
                          {formatMoney(row.total_amount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {formatMoney(row.closing_balance)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold capitalize",
                              row.status === "paid"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : "bg-amber-50 text-amber-800 border-amber-200"
                            )}
                          >
                            {row.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            {row.journal_entry_id ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 rounded-sm text-[#017e84]"
                                onClick={() =>
                                  router.push(
                                    `/accounting/journal-entries/${row.journal_entry_id}`
                                  )
                                }
                              >
                                <BookOpen className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                            {row.status === "pending" && canPay ? (
                              <Button
                                size="sm"
                                className={cn(btnPrimary, "h-7 text-xs")}
                                disabled={isPending}
                                onClick={() => handlePay(row.id)}
                              >
                                Pay
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          ) : null}

          {tab === "amortization" ? (
            <div className="border border-slate-200 rounded-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>#</TableHead>
                    <TableHead>Payment Date</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Principal Paid</TableHead>
                    <TableHead className="text-right">Interest Paid</TableHead>
                    <TableHead className="text-right">Closing</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.installments.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-sm text-secondary-muted py-10"
                      >
                        No amortization schedule yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    detail.installments.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-sm tabular-nums">
                          {row.sequence}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {row.paid_date || row.due_date}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {formatMoney(row.opening_balance)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {formatMoney(row.principal_amount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {formatMoney(row.interest_amount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-medium">
                          {formatMoney(row.closing_balance)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </div>

        {/* Chatter */}
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
                  L
                </div>
                <div>
                  <p className="text-sm text-primary-dark">Creating a new record…</p>
                  <p className="text-[11px] text-secondary-muted mt-0.5">
                    {detail.loan_number}
                  </p>
                </div>
              </div>
            ) : (
              <ul className="space-y-4">
                {logs.map((l) => (
                  <li key={l.id} className="flex gap-2.5">
                    <div className="h-8 w-8 rounded-full bg-[#017e84]/15 text-[#017e84] flex items-center justify-center text-xs font-bold shrink-0">
                      {(l.performed_by || "L").charAt(0).toUpperCase()}
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
