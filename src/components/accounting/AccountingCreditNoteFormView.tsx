"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  cancelAccountingCreditNote,
  getAccountingCreditNoteDetail,
  issueAccountingRefund,
  postAccountingCreditNote,
  resetAccountingCreditNoteToDraft,
  updateAccountingCreditNote,
  getAccountingRefundHistory,
  type AccountingCreditNoteDetail,
} from "@/app/actions/accounting/credit-notes";
import { getAccountingCustomerInvoices } from "@/app/actions/accounting/invoices";
import { getContactAutofillData, getContactById } from "@/app/actions/contacts";
import {
  CustomerPicker,
  type PickedCustomer,
} from "@/components/admin/quotations/CustomerPicker";
import { AccountingActivitiesPanel } from "@/components/accounting/AccountingActivitiesPanel";
import { AccountingFormSkeleton } from "@/components/accounting/AccountingSkeleton";
import { generateAccountingCreditNotePdf } from "@/lib/accounting-credit-note-pdf";
import {
  computeDocumentTotals,
  computeLineAmounts,
  formatContactAddress,
  formatMoney,
  lineAmountForTaxMode,
  newLineDraft,
  unitPriceForDisplay,
  unitPriceFromDisplay,
  type QuotationLineDraft,
} from "@/lib/sales-quotation-form";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { cn } from "@/lib/utils";

type Props = { creditNoteId: string };

const btnSecondary =
  "h-8 rounded-sm border-slate-200 bg-white font-normal text-primary-dark hover:bg-slate-50";
const btnPrimary =
  "h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white font-medium";

function linesFromDetail(detail: AccountingCreditNoteDetail): QuotationLineDraft[] {
  if (!detail.lines.length) return [newLineDraft()];
  return detail.lines.map((l) => ({
    key: l.id || `line-${l.sequence}`,
    id: l.id,
    product_id: null,
    product_name: l.product_name || "",
    description: l.description || "",
    quantity: String(l.quantity ?? 1),
    qty_delivered: "0",
    uom: l.uom || "Units",
    unit_price: String(l.unit_price ?? 0),
    discount: String(l.discount ?? 0),
    taxes: String(l.taxes ?? 0),
    account: "Sales",
  }));
}

function CreditNoteStatusBar({
  status,
}: {
  status: string;
  amountRefunded?: number;
}) {
  const active = status === "cancelled" ? -1 : status === "draft" ? 0 : 1;
  const steps = [
    { id: "draft", label: "Draft" },
    { id: "posted", label: "Posted" },
  ] as const;

  if (status === "cancelled") {
    return (
      <span className="inline-flex h-7 items-center rounded-sm border border-slate-300 bg-slate-100 px-2.5 text-xs font-semibold text-slate-700">
        Cancelled
      </span>
    );
  }

  return (
    <div className="flex items-center shrink-0 overflow-x-auto" role="list">
      {steps.map((step, index) => {
        const isActive = index === active;
        const done = index < active;
        const isLast = index === steps.length - 1;
        return (
          <div key={step.id} className="flex items-center" role="listitem">
            <span
              className={cn(
                "relative inline-flex h-7 items-center px-3.5 text-xs font-semibold whitespace-nowrap border",
                index === 0 ? "rounded-l-sm" : "border-l-0",
                isLast ? "rounded-r-sm" : "",
                isActive
                  ? "bg-[#017e84] text-white border-[#017e84] z-[2]"
                  : done
                    ? "bg-[#e6f4f5] text-[#017e84] border-[#017e84]/40"
                    : "bg-white text-slate-400 border-slate-200"
              )}
            >
              {step.label}
              {!isLast ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute -right-[7px] top-1/2 z-[1] h-0 w-0 -translate-y-1/2 border-y-[14px] border-y-transparent border-l-[7px]",
                    isActive
                      ? "border-l-[#017e84]"
                      : done
                        ? "border-l-[#e6f4f5]"
                        : "border-l-white"
                  )}
                />
              ) : null}
              {!isLast ? (
                <span
                  aria-hidden
                  className="absolute -right-[8px] top-1/2 z-[0] h-0 w-0 -translate-y-1/2 border-y-[15px] border-y-transparent border-l-[8px] border-l-slate-200"
                />
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function AccountingCreditNoteFormView({ creditNoteId }: Props) {
  const router = useRouter();
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const [detail, setDetail] = useState<AccountingCreditNoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [taxMode, setTaxMode] = useState<"excl" | "incl">("excl");
  const [activeTab, setActiveTab] = useState<"lines" | "other">("lines");

  const [customerName, setCustomerName] = useState("");
  const [customerLeadId, setCustomerLeadId] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [billingAddress, setBillingAddress] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [creditNoteDate, setCreditNoteDate] = useState("");
  const [reason, setReason] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);
  const [relatedInvoices, setRelatedInvoices] = useState<
    { id: string; invoice_number: string; total_amount: number }[]
  >([]);
  const [lines, setLines] = useState<QuotationLineDraft[]>([newLineDraft()]);

  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundDate, setRefundDate] = useState("");
  const [refundMethod, setRefundMethod] = useState<
    "cash" | "bank_transfer" | "cheque"
  >("bank_transfer");
  const [refundJournal, setRefundJournal] = useState<"bank" | "cash">("bank");
  const [refundMode, setRefundMode] = useState<
    "withhold_and_pay" | "withhold_only" | "payment_only"
  >("payment_only");
  const [refundReference, setRefundReference] = useState("");
  const [refundNotes, setRefundNotes] = useState("");
  const [refundError, setRefundError] = useState<string | null>(null);
  const [paymentsSum, setPaymentsSum] = useState(0);

  const hydrate = useCallback((cn: AccountingCreditNoteDetail) => {
    setDetail(cn);
    setCustomerName(cn.customer_name || "");
    setCustomerLeadId(cn.customer_lead_id || "");
    setContactId(cn.contact_id);
    setBillingAddress(cn.billing_address || "");
    setShippingAddress(cn.shipping_address || "");
    setContactPerson(cn.contact_person_name || "");
    setEmail(cn.email || "");
    setPhone(cn.phone || "");
    setCreditNoteDate(cn.credit_note_date || "");
    setReason(cn.reason || "");
    setCustomerNotes(cn.customer_notes || "");
    setInternalNotes(cn.notes || "");
    setInvoiceId(cn.invoice_id);
    setInvoiceNumber(cn.invoice_number);
    setLines(linesFromDetail(cn));
    const remaining = Math.max(
      0,
      (cn.total_amount || 0) - (cn.amount_refunded || 0)
    );
    setRefundAmount(String(remaining));
    setRefundDate(new Date().toISOString().slice(0, 10));
    setRefundJournal("bank");
    setRefundMethod("bank_transfer");
    setRefundMode("payment_only");
    setRefundReference(cn.credit_note_number || "");
    setRefundNotes("");
    setRefundError(null);
    window.dispatchEvent(
      new CustomEvent("accounting:document-title", {
        detail: { title: cn.credit_note_number },
      })
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getAccountingCreditNoteDetail(creditNoteId);
    if ("error" in res && res.error) {
      toast.error(res.error);
      setDetail(null);
    } else if (res.creditNote) {
      hydrate(res.creditNote);
    }
    setLoading(false);
  }, [creditNoteId, hydrate]);

  useEffect(() => {
    void load();
  }, [load, switchVersion]);

  useEffect(() => {
    if (!contactId) {
      setRelatedInvoices([]);
      return;
    }
    let cancelled = false;
    void getAccountingCustomerInvoices({
      page: 1,
      pageSize: 40,
      status: "posted",
    }).then((res) => {
      if (cancelled) return;
      const rows = (res.invoices || [])
        .filter((inv) => inv.customer_name && contactId)
        .filter((inv) => {
          // Prefer matching by lead id / name when contact filter isn't on list API
          return (
            inv.customer_lead_id === customerLeadId ||
            inv.customer_name === customerName
          );
        })
        .map((inv) => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          total_amount: inv.total_amount,
        }));
      setRelatedInvoices(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [contactId, customerLeadId, customerName]);

  const status = detail?.status || "draft";
  const paymentState = detail?.payment_state || "not_paid";
  const isDraft = status === "draft";
  const isPosted = status === "posted";
  const isCancelled = status === "cancelled";
  const isInPayment = paymentState === "in_payment";
  const readOnly = !isDraft || isAdminContext;
  const remaining = Math.max(
    0,
    (detail?.total_amount || 0) - Math.max(detail?.amount_refunded || 0, paymentsSum)
  );
  const canPay =
    isPosted &&
    !isCancelled &&
    !isAdminContext &&
    paymentsSum + 0.004 < (detail?.total_amount || 0) &&
    paymentState !== "paid";
  const showPostedActions = !isDraft && !isCancelled;
  const totals = useMemo(() => computeDocumentTotals(lines), [lines]);
  const amountDueDisplay = useMemo(() => {
    if (!isDraft && detail) {
      if (detail.payment_state === "in_payment") return detail.total_amount;
      return Math.max(0, detail.total_amount - (detail.amount_refunded || 0));
    }
    return taxMode === "incl" ? totals.total : totals.untaxed;
  }, [detail, isDraft, taxMode, totals.total, totals.untaxed]);

  useEffect(() => {
    if (!creditNoteId || status === "draft") {
      setPaymentsSum(0);
      return;
    }
    let cancelled = false;
    void getAccountingRefundHistory({ page: 1, pageSize: 50 }).then((res) => {
      if (cancelled) return;
      if ("error" in res && res.error) {
        setPaymentsSum(0);
        return;
      }
      const mine = (res.refunds || []).filter(
        (r) => r.credit_note_id === creditNoteId
      );
      const sum = mine.reduce((a, r) => a + (Number(r.amount) || 0), 0);
      setPaymentsSum(Math.round(sum * 100) / 100);
    });
    return () => {
      cancelled = true;
    };
  }, [creditNoteId, status, paymentState, detail?.amount_refunded]);

  function updateLine(key: string, patch: Partial<QuotationLineDraft>) {
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line))
    );
  }

  function removeLine(key: string) {
    setLines((prev) =>
      prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)
    );
  }

  function buildPayload() {
    return {
      customer_name: customerName,
      contact_id: contactId,
      customer_lead_id: customerLeadId || null,
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      reason: reason || null,
      credit_note_date: creditNoteDate,
      billing_address: billingAddress || null,
      shipping_address: shippingAddress || null,
      contact_person_name: contactPerson || null,
      email: email || null,
      phone: phone || null,
      notes: internalNotes || null,
      customer_notes: customerNotes || null,
      refund_type: (invoiceId ? "partial" : "partial") as "full" | "partial",
      lines: lines.map((line, idx) => {
        const amounts = computeLineAmounts(line);
        return {
          id: line.id ?? undefined,
          sequence: (idx + 1) * 10,
          product_name: line.product_name,
          description: line.description || null,
          quantity: parseFloat(line.quantity) || 0,
          uom: line.uom || "Units",
          unit_price: parseFloat(line.unit_price) || 0,
          discount: parseFloat(line.discount) || 0,
          taxes: parseFloat(line.taxes) || 0,
          line_total: amounts.total,
        };
      }),
    };
  }

  function applyResult(
    res: { creditNote?: AccountingCreditNoteDetail; error?: string },
    successMsg?: string
  ) {
    if (res.error) {
      toast.error(res.error);
      return false;
    }
    if (res.creditNote) {
      hydrate(res.creditNote);
      if (successMsg) toast.success(successMsg);
      return true;
    }
    return false;
  }

  function handleSave() {
    if (!isDraft) return;
    startTransition(async () => {
      const res = await updateAccountingCreditNote(creditNoteId, buildPayload());
      applyResult(res, "Credit note saved");
    });
  }

  function handleConfirm() {
    startTransition(async () => {
      if (isDraft) {
        if (!customerName.trim() && !contactId) {
          toast.error("Customer is required before confirming");
          return;
        }
        const saved = await updateAccountingCreditNote(
          creditNoteId,
          buildPayload()
        );
        if (saved.error) {
          toast.error(saved.error);
          return;
        }
      }
      const res = await postAccountingCreditNote(creditNoteId);
      applyResult(res, "Credit note posted");
    });
  }

  function handleCancel() {
    startTransition(async () => {
      const res = await cancelAccountingCreditNote(creditNoteId);
      applyResult(res, "Credit note cancelled");
    });
  }

  function handleResetToDraft() {
    startTransition(async () => {
      const res = await resetAccountingCreditNoteToDraft(creditNoteId);
      applyResult(res, "Reset to draft");
    });
  }

  async function handleCustomerSelect(picked: PickedCustomer) {
    setContactId(picked.contact_id);
    setCustomerName(picked.name);
    setCustomerLeadId(picked.lead_id_formatted || "");
    setEmail(picked.email || "");
    setPhone(picked.phone || "");
    if (picked.name) setContactPerson(picked.name);

    const [contactRes, autofill] = await Promise.all([
      getContactById(picked.contact_id),
      getContactAutofillData(picked.contact_id),
    ]);
    if (contactRes.contact) {
      const c = contactRes.contact;
      const addr = formatContactAddress({
        street: c.street,
        street2: c.street2,
        city: c.city,
        state: c.state,
        zip: c.zip,
        country: c.country,
      });
      if (addr) {
        setBillingAddress(addr);
        setShippingAddress(addr);
      }
    }
    if (autofill && "payment_terms" in autofill === false) {
      // no-op — autofill may vary
    }
    void autofill;
  }

  async function runPdf(mode: "preview" | "print" | "download") {
    if (!detail) return;
    setPdfBusy(true);
    try {
      if (isDraft) {
        await updateAccountingCreditNote(creditNoteId, buildPayload());
        const fresh = await getAccountingCreditNoteDetail(creditNoteId);
        if (fresh.creditNote) hydrate(fresh.creditNote);
        if (fresh.creditNote) {
          await generateAccountingCreditNotePdf(fresh.creditNote, {
            openInNewTab: mode === "preview",
            openPrintDialog: mode === "print",
            download: mode === "download",
          });
        }
      } else {
        await generateAccountingCreditNotePdf(detail, {
          openInNewTab: mode === "preview",
          openPrintDialog: mode === "print",
          download: mode === "download",
        });
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not generate credit note PDF"
      );
    } finally {
      setPdfBusy(false);
    }
  }

  function openPayDialog() {
    if (!detail) return;
    const rem = Math.max(
      0,
      Math.round(((detail.total_amount || 0) - paymentsSum) * 100) / 100
    );
    setRefundAmount(String(rem));
    setRefundDate(new Date().toISOString().slice(0, 10));
    setRefundJournal("bank");
    setRefundMethod("bank_transfer");
    setRefundMode("payment_only");
    setRefundReference(detail.credit_note_number || "");
    setRefundError(null);
    setRefundOpen(true);
  }

  function handleRefund() {
    if (refundMode === "withhold_only") {
      setRefundError("Withhold Only is not available yet. Choose Payment Only.");
      return;
    }
    const amount = Number(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setRefundError("Payment amount must be greater than zero");
      return;
    }
    const maxPayable = Math.max(
      0,
      Math.round(((detail?.total_amount || 0) - paymentsSum) * 100) / 100
    );
    if (amount - maxPayable > 0.004) {
      setRefundError(
        `Amount cannot exceed remaining credit (${maxPayable.toFixed(2)})`
      );
      return;
    }
    setRefundError(null);
    startTransition(async () => {
      const res = await issueAccountingRefund({
        creditNoteId,
        amount,
        refund_date: refundDate || undefined,
        payment_method: refundJournal === "cash" ? "cash" : refundMethod,
        reference: refundReference || undefined,
        notes: refundNotes || undefined,
        journal: refundJournal,
      });
      if ("error" in res && res.error) {
        setRefundError(res.error);
        toast.error(res.error);
      } else {
        toast.success("Payment created");
        setRefundOpen(false);
        if (res.creditNote) hydrate(res.creditNote);
        else void load();
      }
    });
  }

  if (loading) return <AccountingFormSkeleton />;
  if (!detail) {
    return (
      <div className="p-4 text-sm text-secondary-muted">
        Credit note not found.{" "}
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-sm ml-2"
          onClick={() => router.push("/accounting/credit-notes")}
        >
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden min-h-[calc(100vh-160px)] flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-slate-200 bg-slate-50/40">
        <div className="flex flex-wrap items-center gap-1.5">
          {isDraft ? (
            <>
              <Button
                size="sm"
                className={btnPrimary}
                disabled={isPending || isAdminContext}
                onClick={handleConfirm}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={btnSecondary}
                disabled={isPending || isAdminContext}
                onClick={handleSave}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={btnSecondary}
                disabled={isPending || isAdminContext}
                onClick={handleCancel}
              >
                Cancel
              </Button>
            </>
          ) : null}

          {showPostedActions ? (
            <>
              <Button
                size="sm"
                className={btnPrimary}
                disabled={isPending}
                onClick={() => toast.message("Email preview coming soon")}
              >
                Send
              </Button>
              <Button
                size="sm"
                className={btnPrimary}
                disabled={pdfBusy}
                onClick={() => void runPdf("print")}
              >
                Print
              </Button>
              {canPay ? (
                <Button
                  size="sm"
                  className={btnPrimary}
                  disabled={isPending}
                  onClick={openPayDialog}
                >
                  Pay
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                className={btnSecondary}
                disabled={pdfBusy}
                onClick={() => void runPdf("preview")}
              >
                Preview
              </Button>
              {(detail.amount_refunded || 0) < 0.004 &&
              paymentState !== "paid" &&
              !isAdminContext ? (
                <Button
                  size="sm"
                  variant="outline"
                  className={btnSecondary}
                  disabled={isPending}
                  onClick={handleResetToDraft}
                >
                  Reset to Draft
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
        <CreditNoteStatusBar status={status} />
      </div>

      <div className="flex-1 grid xl:grid-cols-[minmax(0,1fr)_340px] min-h-0">
        <div className="p-4 sm:p-5 space-y-5 overflow-auto relative">
          {isInPayment ? (
            <div
              className="pointer-events-none absolute right-6 top-8 z-10 select-none"
              aria-hidden
            >
              <div className="rotate-12 rounded-sm border-2 border-emerald-500 bg-emerald-500/10 px-4 py-1.5 text-sm font-bold tracking-wide text-emerald-600 shadow-sm">
                IN PAYMENT
              </div>
            </div>
          ) : null}

          {!isDraft ? (
            <div className="flex flex-wrap gap-2">
              {detail.contact_id ? (
                <Link
                  href={`/accounting/customers/${detail.contact_id}`}
                  className="inline-flex min-w-[88px] flex-col items-center justify-center rounded-sm border border-slate-200 bg-white px-3 py-2 text-center hover:bg-slate-50"
                >
                  <span className="text-[11px] text-secondary-muted">
                    Customer
                  </span>
                </Link>
              ) : null}
              {detail.invoice_id ? (
                <Link
                  href={`/accounting/invoices/${detail.invoice_id}`}
                  className="inline-flex min-w-[88px] flex-col items-center justify-center rounded-sm border border-slate-200 bg-white px-3 py-2 text-center hover:bg-slate-50"
                >
                  <span className="text-[11px] text-secondary-muted">
                    Related Invoice
                  </span>
                </Link>
              ) : null}
            </div>
          ) : null}

          <div>
            <p className="text-xs font-medium text-secondary-muted tracking-wide">
              Customer Credit Note
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-primary-dark mt-0.5 leading-tight">
              {isDraft ? detail.credit_note_number || "Draft" : detail.credit_note_number}
            </h1>
          </div>

          <div className="grid gap-x-8 gap-y-3 md:grid-cols-2 max-w-4xl">
            <div className="space-y-1">
              <Label className="text-xs text-secondary-muted font-normal">
                Customer
              </Label>
              {readOnly ? (
                <p className="text-sm font-medium text-primary-dark min-h-8 flex items-center">
                  {customerName || "—"}
                </p>
              ) : (
                <CustomerPicker
                  contactId={contactId}
                  customerName={customerName}
                  onSelect={(p) => void handleCustomerSelect(p)}
                  contactScope="customer"
                  placeholder="Search a name or Tax ID..."
                  inputClassName="!pl-9 pr-0 h-8 rounded-sm border-0 border-b border-slate-200 shadow-none focus-visible:ring-0"
                />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-secondary-muted font-normal">
                Invoice Date
              </Label>
              <Input
                type="date"
                value={creditNoteDate}
                onChange={(e) => setCreditNoteDate(e.target.value)}
                disabled={readOnly}
                className="h-8 rounded-sm border-0 border-b border-slate-200 shadow-none focus-visible:ring-0 px-0"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-secondary-muted font-normal">
                Related Invoice
              </Label>
              {readOnly ? (
                <p className="text-sm min-h-8 flex items-center">
                  {invoiceId && invoiceNumber ? (
                    <Link
                      href={`/accounting/invoices/${invoiceId}`}
                      className="text-[#017e84] hover:underline"
                    >
                      {invoiceNumber}
                    </Link>
                  ) : (
                    "—"
                  )}
                </p>
              ) : (
                <Select
                  value={invoiceId || "__none__"}
                  onValueChange={(v) => {
                    if (v === "__none__") {
                      setInvoiceId(null);
                      setInvoiceNumber(null);
                      return;
                    }
                    const found = relatedInvoices.find((i) => i.id === v);
                    setInvoiceId(v);
                    setInvoiceNumber(found?.invoice_number || null);
                  }}
                >
                  <SelectTrigger className="h-8 rounded-sm border-0 border-b border-slate-200 shadow-none">
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {relatedInvoices.map((inv) => (
                      <SelectItem key={inv.id} value={inv.id}>
                        {inv.invoice_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-secondary-muted font-normal">
                Journal
              </Label>
              <p className="text-sm min-h-8 flex items-center text-primary-dark">
                Sales
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200">
            <div className="flex gap-4 text-sm">
              {(
                [
                  ["lines", "Invoice Lines"],
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
            {activeTab === "lines" ? (
              <div className="flex items-center gap-0.5 mb-1.5 rounded-sm border border-slate-200 p-0.5 text-xs">
                <button
                  type="button"
                  className={cn(
                    "h-6 px-2.5 rounded-sm transition-colors",
                    taxMode === "excl"
                      ? "bg-[#017e84] text-white"
                      : "text-secondary-muted hover:bg-slate-50"
                  )}
                  onClick={() => setTaxMode("excl")}
                >
                  Tax Excl.
                </button>
                <button
                  type="button"
                  className={cn(
                    "h-6 px-2.5 rounded-sm transition-colors",
                    taxMode === "incl"
                      ? "bg-[#017e84] text-white"
                      : "text-secondary-muted hover:bg-slate-50"
                  )}
                  onClick={() => setTaxMode("incl")}
                >
                  Tax Incl.
                </button>
              </div>
            ) : null}
          </div>

          {activeTab === "lines" ? (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-slate-200 hover:bg-transparent">
                      <TableHead className="h-9 text-xs font-medium text-secondary-muted">
                        Product
                      </TableHead>
                      <TableHead className="h-9 w-24 text-xs font-medium text-secondary-muted">
                        Quantity
                      </TableHead>
                      <TableHead className="h-9 w-28 text-xs font-medium text-secondary-muted">
                        Price
                      </TableHead>
                      <TableHead className="h-9 w-24 text-xs font-medium text-secondary-muted">
                        Taxes
                      </TableHead>
                      <TableHead className="h-9 w-28 text-xs font-medium text-secondary-muted text-right">
                        Amount
                      </TableHead>
                      {!readOnly ? <TableHead className="w-10" /> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => {
                      const taxPct = parseFloat(line.taxes) || 0;
                      const amountShown = lineAmountForTaxMode(line, taxMode);
                      return (
                        <TableRow key={line.key} className="border-slate-100">
                          <TableCell className="align-top py-2">
                            <Input
                              value={line.product_name}
                              disabled={readOnly}
                              onChange={(e) =>
                                updateLine(line.key, {
                                  product_name: e.target.value,
                                })
                              }
                              placeholder="Product"
                              className="h-8 rounded-sm border-slate-200 text-sm"
                            />
                          </TableCell>
                          <TableCell className="align-top py-2">
                            <Input
                              value={line.quantity}
                              disabled={readOnly}
                              onChange={(e) =>
                                updateLine(line.key, {
                                  quantity: e.target.value,
                                })
                              }
                              className="h-8 rounded-sm border-slate-200 text-sm tabular-nums"
                            />
                          </TableCell>
                          <TableCell className="align-top py-2">
                            <Input
                              key={`${line.key}-price-${taxMode}`}
                              defaultValue={String(
                                unitPriceForDisplay(
                                  parseFloat(line.unit_price) || 0,
                                  taxPct,
                                  taxMode
                                )
                              )}
                              disabled={readOnly}
                              onBlur={(e) => {
                                const display = parseFloat(e.target.value) || 0;
                                const excl = unitPriceFromDisplay(
                                  display,
                                  taxPct,
                                  taxMode
                                );
                                updateLine(line.key, {
                                  unit_price: String(excl),
                                });
                              }}
                              className="h-8 rounded-sm border-slate-200 text-sm tabular-nums"
                            />
                          </TableCell>
                          <TableCell className="align-top py-2">
                            <Input
                              value={line.taxes}
                              disabled={readOnly}
                              onChange={(e) =>
                                updateLine(line.key, { taxes: e.target.value })
                              }
                              className="h-8 rounded-sm border-slate-200 text-sm tabular-nums"
                              placeholder="%"
                            />
                          </TableCell>
                          <TableCell className="align-top py-2 text-right text-sm tabular-nums font-medium">
                            {formatMoney(amountShown)}
                          </TableCell>
                          {!readOnly ? (
                            <TableCell className="align-top py-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-secondary-muted"
                                onClick={() => removeLine(line.key)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {!readOnly ? (
                <div className="flex flex-wrap gap-3 text-sm">
                  <button
                    type="button"
                    className="text-[#017e84] hover:underline inline-flex items-center gap-1"
                    onClick={() => setLines((prev) => [...prev, newLineDraft()])}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add a line
                  </button>
                </div>
              ) : null}

              <div className="flex flex-col sm:flex-row gap-6 pt-2 justify-between">
                <div className="flex-1 max-w-md space-y-1">
                  <Label className="text-xs text-secondary-muted font-normal">
                    Terms and Conditions
                  </Label>
                  <Textarea
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                    disabled={readOnly}
                    placeholder="Terms and Conditions"
                    className="min-h-[88px] rounded-sm border-slate-200 text-sm"
                  />
                </div>
                <div className="w-full sm:w-64 space-y-1.5 text-sm shrink-0">
                  <div className="flex justify-between">
                    <span className="text-secondary-muted">Untaxed Amount</span>
                    <span className="tabular-nums">
                      {formatMoney(totals.untaxed)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-secondary-muted">Taxes</span>
                    <span className="tabular-nums">
                      {formatMoney(totals.tax)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
                    <span>Total</span>
                    <span className="tabular-nums">
                      {formatMoney(totals.total)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-secondary-muted">Amount Due</span>
                    <span className="tabular-nums font-medium">
                      {formatMoney(amountDueDisplay)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 max-w-3xl">
              <div className="space-y-1">
                <Label className="text-xs text-secondary-muted">
                  Billing Address
                </Label>
                <Textarea
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                  disabled={readOnly}
                  className="min-h-[72px] rounded-sm text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-secondary-muted">
                  Shipping Address
                </Label>
                <Textarea
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  disabled={readOnly}
                  className="min-h-[72px] rounded-sm text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-secondary-muted">
                  Contact Person
                </Label>
                <Input
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  disabled={readOnly}
                  className="h-8 rounded-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-secondary-muted">Reason</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={readOnly}
                  className="h-8 rounded-sm"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs text-secondary-muted">
                  Internal Notes
                </Label>
                <Textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  disabled={readOnly}
                  className="min-h-[72px] rounded-sm text-sm"
                />
              </div>
            </div>
          )}
        </div>

        <aside className="border-t xl:border-t-0 xl:border-l border-slate-200 bg-slate-50/30 overflow-auto p-3 space-y-3">
          <AccountingActivitiesPanel
            invoiceId={invoiceId || undefined}
            contactId={contactId || undefined}
          />
          <div className="rounded-sm border border-slate-200 bg-white p-3 text-xs text-secondary-muted space-y-1">
            <p className="font-medium text-primary-dark text-sm">Activity</p>
            <p>Credit note {detail.credit_note_number}</p>
            <p className="capitalize">Status: {status}</p>
            {detail.organization_name ? (
              <p>Org: {detail.organization_name}</p>
            ) : null}
          </div>
        </aside>
      </div>

      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Pay</DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap gap-4 pb-2 border-b border-slate-100">
            {(
              [
                ["withhold_and_pay", "Withhold and Pay"],
                ["withhold_only", "Withhold Only"],
                ["payment_only", "Payment Only"],
              ] as const
            ).map(([id, label]) => (
              <label
                key={id}
                className="inline-flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="radio"
                  name="cn-payment-mode"
                  className="accent-[#017e84]"
                  checked={refundMode === id}
                  onChange={() => setRefundMode(id)}
                />
                {label}
              </label>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 pt-1">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-secondary-muted">Journal</Label>
                <Select
                  value={refundJournal}
                  onValueChange={(v) => {
                    const j = v as "bank" | "cash";
                    setRefundJournal(j);
                    setRefundMethod(j === "cash" ? "cash" : "bank_transfer");
                  }}
                >
                  <SelectTrigger className="h-8 rounded-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-secondary-muted">
                  Payment Method
                </Label>
                <p className="h-8 flex items-center text-sm text-primary-dark">
                  Manual Payment
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-secondary-muted">
                  Recipient Bank Account
                </Label>
                <Input
                  placeholder="Account Number"
                  className="h-8 rounded-sm"
                  disabled
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-secondary-muted">Amount</Label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-secondary-muted">
                    Rs.
                  </span>
                  <Input
                    value={refundAmount}
                    onChange={(e) => {
                      setRefundAmount(e.target.value);
                      setRefundError(null);
                    }}
                    className="h-8 rounded-sm pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-secondary-muted">
                  Payment Date
                </Label>
                <Input
                  type="date"
                  value={refundDate}
                  onChange={(e) => setRefundDate(e.target.value)}
                  className="h-8 rounded-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-secondary-muted">Memo</Label>
                <Input
                  value={refundReference}
                  onChange={(e) => setRefundReference(e.target.value)}
                  className="h-8 rounded-sm"
                />
              </div>
            </div>
          </div>

          {refundError ? (
            <p className="text-xs text-red-600">{refundError}</p>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              className={btnPrimary}
              disabled={isPending}
              onClick={handleRefund}
            >
              Create Payment
            </Button>
            <Button
              variant="outline"
              className={btnSecondary}
              onClick={() => setRefundOpen(false)}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
