"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Copy,
  Eye,
  FileMinus2,
  FileText,
  Loader2,
  Plus,
  Printer,
  Send,
  Trash2,
  Undo2,
  UserRound,
  Wallet,
  Bell,
  MailWarning,
} from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getAccountingInvoiceDetail,
  type AccountingInvoiceDetail,
  type AccountingInvoiceStatus,
} from "@/app/actions/accounting/invoices";
import {
  cancelAccountingInvoice,
  duplicateAccountingInvoice,
  getAccountingInvoicePdfPayload,
  logAccountingInvoicePreview,
  postAccountingInvoice,
  prepareAccountingInvoiceEmail,
  resetAccountingInvoiceToDraft,
  updateAccountingInvoice,
} from "@/app/actions/accounting/invoice-workflow";
import {
  registerAccountingPayment,
} from "@/app/actions/accounting/payments";
import { generateAccountingInvoicePdf } from "@/lib/accounting-invoice-pdf";
import {
  paymentStateLabel,
  type AccountingPaymentMethod,
} from "@/lib/accounting-payments";
import {
  computeDocumentTotals,
  computeLineAmounts,
  formatMoney,
  newLineDraft,
  type QuotationLineDraft,
} from "@/lib/sales-quotation-form";
import { AccountingInvoiceStatusBar } from "@/components/accounting/AccountingInvoiceStatusBar";
import { AccountingInvoiceChatter } from "@/components/accounting/AccountingInvoiceChatter";
import { AccountingPaymentHistory } from "@/components/accounting/AccountingPaymentHistory";
import { AccountingCreateCreditNoteDialog } from "@/components/accounting/AccountingCreateCreditNoteDialog";
import { AccountingActivitiesPanel } from "@/components/accounting/AccountingActivitiesPanel";
import { AccountingFormSkeleton } from "@/components/accounting/AccountingSkeleton";
import { scheduleAccountingReminder } from "@/app/actions/accounting/automation";
import { computeDueDateFromTerms } from "@/lib/accounting-due-dates";
import { useAccountingShortcuts } from "@/hooks/useAccountingShortcuts";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useDashboardAccess } from "@/contexts/DashboardAccessContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  invoiceId: string;
};

function linesFromDetail(detail: AccountingInvoiceDetail): QuotationLineDraft[] {
  if (!detail.lines.length) return [newLineDraft()];
  return detail.lines.map((l) =>
    newLineDraft({
      id: l.id,
      product_name: l.product_name,
      description: l.description || "",
      quantity: String(l.quantity),
      uom: l.uom || "Units",
      unit_price: String(l.unit_price),
      discount: String(l.discount),
      taxes: String(l.taxes),
    })
  );
}

export function AccountingInvoiceFormView({ invoiceId }: Props) {
  const router = useRouter();
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const access = useDashboardAccess();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<AccountingInvoiceDetail | null>(null);
  const [status, setStatus] = useState<AccountingInvoiceStatus>("draft");
  const [paymentState, setPaymentState] = useState("not_paid");
  const [amountPaid, setAmountPaid] = useState(0);
  const [outstanding, setOutstanding] = useState(0);
  const [chatterKey, setChatterKey] = useState(0);
  const [paymentsKey, setPaymentsKey] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  // Form fields
  const [customerName, setCustomerName] = useState("");
  const [customerLeadId, setCustomerLeadId] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [billingAddress, setBillingAddress] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Immediate");
  const [salespersonName, setSalespersonName] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [lines, setLines] = useState<QuotationLineDraft[]>([newLineDraft()]);

  // Dialogs
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewKind, setPreviewKind] = useState<"email" | "pdf">("pdf");
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState({ to: "", subject: "", body: "" });
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<AccountingPaymentMethod>("bank_transfer");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [creditNoteOpen, setCreditNoteOpen] = useState(false);
  const [creditNoteMode, setCreditNoteMode] = useState<"full" | "partial">("full");
  const [dueDateManual, setDueDateManual] = useState(false);

  const isDraft = status === "draft";
  const isPosted = status === "posted";
  const isPaid = status === "paid" || paymentState === "paid";
  const isCancelled = status === "cancelled";
  const canRegisterPayment =
    (isPosted || status === "paid") &&
    !isCancelled &&
    outstanding > 0.004 &&
    !isAdminContext;
  const canCreateCreditNote =
    (isPosted || isPaid) && !isCancelled && !isAdminContext && Boolean(detail);
  const readOnly = !isDraft || isAdminContext;

  const totals = useMemo(() => computeDocumentTotals(lines), [lines]);

  const hydrate = useCallback((inv: AccountingInvoiceDetail) => {
    setDetail(inv);
    setStatus(inv.status);
    setPaymentState(inv.payment_state || "not_paid");
    setAmountPaid(inv.amount_paid || 0);
    setOutstanding(inv.amount_residual ?? inv.total_amount);
    setCustomerName(inv.customer_name || "");
    setCustomerLeadId(inv.customer_lead_id || "");
    setContactId(inv.contact_id);
    setBillingAddress(inv.billing_address || "");
    setShippingAddress(inv.shipping_address || "");
    setContactPerson(inv.contact_person_name || "");
    setEmail(inv.email || "");
    setPhone(inv.phone || "");
    setInvoiceDate(inv.invoice_date || "");
    setDueDate(inv.due_date || "");
    setPaymentTerms(inv.payment_terms || "Immediate");
    setSalespersonName(inv.salesperson_name || "");
    setInternalNotes(inv.notes || "");
    setCustomerNotes(inv.customer_notes || "");
    setLines(linesFromDetail(inv));
    setPaymentAmount(String(inv.amount_residual ?? inv.total_amount ?? 0));
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod("bank_transfer");
    setPaymentReference("");
    setPaymentNotes("");
    setPaymentError(null);
    setDueDateManual(false);
    window.dispatchEvent(
      new CustomEvent("accounting:document-title", {
        detail: { title: inv.invoice_number },
      })
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getAccountingInvoiceDetail(invoiceId);
    if ("error" in res && res.error) {
      toast.error(res.error);
      setDetail(null);
    } else if (res.invoice) {
      hydrate(res.invoice);
    }
    setLoading(false);
  }, [hydrate, invoiceId]);

  useEffect(() => {
    void load();
  }, [load, switchVersion]);

  function updateLine(key: string, patch: Partial<QuotationLineDraft>) {
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line))
    );
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  function buildPayload() {
    return {
      customer_name: customerName,
      contact_id: contactId,
      customer_lead_id: customerLeadId || null,
      billing_address: billingAddress || null,
      shipping_address: shippingAddress || null,
      contact_person_name: contactPerson || null,
      email: email || null,
      phone: phone || null,
      invoice_date: invoiceDate,
      due_date: dueDate || null,
      payment_terms: paymentTerms || "Immediate",
      salesperson_name: salespersonName || null,
      notes: internalNotes || null,
      customer_notes: customerNotes || null,
      lines: lines.map((line, idx) => {
        const amounts = computeLineAmounts(line);
        return {
          id: line.id,
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
    res: { invoice?: AccountingInvoiceDetail; error?: string },
    successMsg?: string
  ) {
    if (res.error) {
      toast.error(res.error);
      return false;
    }
    if (res.invoice) {
      hydrate(res.invoice);
      setChatterKey((k) => k + 1);
      setPaymentsKey((k) => k + 1);
      if (successMsg) toast.success(successMsg);
      return true;
    }
    return false;
  }

  function handleSave() {
    if (!isDraft) return;
    startTransition(async () => {
      const res = await updateAccountingInvoice(invoiceId, buildPayload());
      applyResult(res, "Invoice saved");
    });
  }

  function handlePost() {
    startTransition(async () => {
      if (isDraft) {
        const saved = await updateAccountingInvoice(invoiceId, buildPayload());
        if (saved.error) {
          toast.error(saved.error);
          return;
        }
      }
      const res = await postAccountingInvoice(invoiceId);
      applyResult(res, "Invoice posted");
    });
  }

  function handleCancel() {
    startTransition(async () => {
      const res = await cancelAccountingInvoice(invoiceId);
      applyResult(res, "Invoice cancelled");
    });
  }

  function handleResetToDraft() {
    if (amountPaid > 0.004) {
      toast.error("Cannot reset to draft while payments exist on this invoice.");
      return;
    }
    startTransition(async () => {
      const res = await resetAccountingInvoiceToDraft(invoiceId);
      applyResult(res, "Reset to draft");
    });
  }

  function handleDuplicate() {
    startTransition(async () => {
      const res = await duplicateAccountingInvoice(invoiceId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("invoiceId" in res && res.invoiceId) {
        toast.success("Draft invoice duplicated");
        router.push(`/accounting/invoices/${res.invoiceId}`);
      }
    });
  }

  async function runPdf(mode: "preview" | "print" | "download") {
    setPdfBusy(true);
    try {
      const payload = await getAccountingInvoicePdfPayload(invoiceId);
      if ("error" in payload && payload.error) {
        toast.error(payload.error);
        return;
      }
      const result = await generateAccountingInvoicePdf(payload.invoice!, {
        download: mode === "download",
        openPrintDialog: mode === "print",
        openInNewTab: mode !== "preview",
        generatedBy: access.username,
      });
      await logAccountingInvoicePreview(
        invoiceId,
        mode === "print" ? "print" : "pdf"
      );
      setChatterKey((k) => k + 1);
      if (mode === "preview") {
        setPdfDataUrl(result.dataUrl);
        setPreviewKind("pdf");
        setPreviewOpen(true);
      } else if (mode === "download") {
        toast.success("Invoice PDF downloaded");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate invoice PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  function handleSend() {
    startTransition(async () => {
      const payload = await getAccountingInvoicePdfPayload(invoiceId);
      if ("error" in payload && payload.error) {
        toast.error(payload.error);
        return;
      }
      // Generate PDF once for attach + preview
      const pdf = await generateAccountingInvoicePdf(payload.invoice!, {
        openInNewTab: false,
        generatedBy: access.username,
      });
      setPdfDataUrl(pdf.dataUrl);

      const res = await prepareAccountingInvoiceEmail(invoiceId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if (res.email) {
        setEmailDraft({
          to: res.email.to,
          subject: res.email.subject,
          body: res.email.body,
        });
        setPreviewKind("email");
        setPreviewOpen(true);
        setChatterKey((k) => k + 1);
      }
    });
  }

  function openPaymentDialog() {
    if (!detail) return;
    setPaymentAmount(String(outstanding || detail.amount_residual || 0));
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod("bank_transfer");
    setPaymentReference("");
    setPaymentNotes("");
    setPaymentError(null);
    setPaymentOpen(true);
  }

  function handleRegisterPayment() {
    if (paymentSubmitting || isPending) return;
    const amount = parseFloat(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError("Payment amount must be greater than zero");
      return;
    }
    if (amount - outstanding > 0.004) {
      setPaymentError(
        `Amount cannot exceed outstanding balance (${outstanding.toFixed(2)})`
      );
      return;
    }
    if (!paymentDate) {
      setPaymentError("Payment date is required");
      return;
    }

    setPaymentError(null);
    setPaymentSubmitting(true);
    const idempotencyKey = `${invoiceId}-${paymentDate}-${amount}-${paymentMethod}-${Date.now()}`;
    startTransition(async () => {
      try {
        const res = await registerAccountingPayment(invoiceId, {
          payment_date: paymentDate,
          amount,
          payment_method: paymentMethod,
          reference: paymentReference || null,
          notes: paymentNotes || null,
          idempotency_key: idempotencyKey,
        });
        if (applyResult(res, "Payment registered")) {
          setPaymentOpen(false);
        }
      } finally {
        setPaymentSubmitting(false);
      }
    });
  }

  const btnSecondary =
    "h-8 rounded-sm border-slate-200 bg-white font-normal text-primary-dark hover:bg-slate-50";
  const btnPrimary =
    "h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white font-medium";

  useAccountingShortcuts({
    enabled: Boolean(detail) && !loading,
    onSave: () => {
      if (isDraft && !isAdminContext) handleSave();
    },
    onPrint: () => {
      if (!isDraft && !isCancelled) void runPdf("print");
    },
    onEscape: () => {
      if (paymentOpen) setPaymentOpen(false);
      else if (previewOpen) setPreviewOpen(false);
      else if (creditNoteOpen) setCreditNoteOpen(false);
    },
  });

  if (loading) {
    return <AccountingFormSkeleton />;
  }

  if (!detail) {
    return (
      <div className="bg-white border border-slate-200 rounded-sm p-6 text-sm text-secondary-muted">
        Invoice not found.
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden min-h-[calc(100vh-160px)] flex flex-col">
      {/* Action row */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-1.5">
          {isDraft ? (
            <Button
              size="sm"
              className={btnPrimary}
              disabled={isPending || isAdminContext}
              onClick={handleSave}
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
            </Button>
          ) : null}
          {isDraft ? (
            <Button
              size="sm"
              className={btnPrimary}
              disabled={isPending || isAdminContext}
              onClick={handlePost}
            >
              Post
            </Button>
          ) : null}
          {(isPosted || isPaid) && !isCancelled ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className={btnSecondary}
                disabled={isPending}
                onClick={handleSend}
              >
                <Send className="h-3.5 w-3.5 mr-1" />
                Send
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={btnSecondary}
                disabled={pdfBusy}
                onClick={() => void runPdf("print")}
              >
                <Printer className="h-3.5 w-3.5 mr-1" />
                Print
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={btnSecondary}
                disabled={pdfBusy}
                onClick={() => void runPdf("preview")}
              >
                <Eye className="h-3.5 w-3.5 mr-1" />
                Preview PDF
              </Button>
            </>
          ) : null}
          {isDraft ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className={btnSecondary}
                disabled={pdfBusy}
                onClick={() => void runPdf("preview")}
              >
                Preview PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={btnSecondary}
                disabled={isPending}
                onClick={handleSend}
              >
                Send
              </Button>
            </>
          ) : null}
          {canRegisterPayment ? (
            <Button
              size="sm"
              className={btnPrimary}
              disabled={isPending || paymentSubmitting}
              onClick={openPaymentDialog}
            >
              <Wallet className="h-3.5 w-3.5 mr-1" />
              Register Payment
            </Button>
          ) : null}
          {(isPosted || isPaid) && outstanding > 0.004 && !isAdminContext ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className={btnSecondary}
                disabled={isPending}
                onClick={() => {
                  startTransition(async () => {
                    const res = await scheduleAccountingReminder({
                      invoiceId,
                      reminderType: "payment",
                      sendNow: true,
                    });
                    if ("error" in res && res.error) toast.error(res.error);
                    else {
                      toast.success("Payment reminder prepared");
                      setChatterKey((k) => k + 1);
                      if (res.email && typeof window !== "undefined") {
                        const mailto = `mailto:${encodeURIComponent(
                          res.email.to || ""
                        )}?subject=${encodeURIComponent(
                          res.email.subject || ""
                        )}&body=${encodeURIComponent(res.email.body || "")}`;
                        window.open(mailto, "_blank");
                      }
                    }
                  });
                }}
              >
                <Bell className="h-3.5 w-3.5 mr-1" />
                Payment Reminder
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={btnSecondary}
                disabled={isPending}
                onClick={() => {
                  startTransition(async () => {
                    const res = await scheduleAccountingReminder({
                      invoiceId,
                      reminderType: "overdue",
                      sendNow: true,
                    });
                    if ("error" in res && res.error) toast.error(res.error);
                    else {
                      toast.success("Overdue reminder prepared");
                      setChatterKey((k) => k + 1);
                      if (res.email && typeof window !== "undefined") {
                        const mailto = `mailto:${encodeURIComponent(
                          res.email.to || ""
                        )}?subject=${encodeURIComponent(
                          res.email.subject || ""
                        )}&body=${encodeURIComponent(res.email.body || "")}`;
                        window.open(mailto, "_blank");
                      }
                    }
                  });
                }}
              >
                <MailWarning className="h-3.5 w-3.5 mr-1" />
                Overdue Reminder
              </Button>
            </>
          ) : null}
          {(isDraft || isPosted) && !isPaid ? (
            <Button
              size="sm"
              variant="outline"
              className={btnSecondary}
              disabled={isPending || isAdminContext}
              onClick={handleCancel}
            >
              Cancel
            </Button>
          ) : null}
          {(isPosted || isCancelled) && !isPaid ? (
            <Button
              size="sm"
              variant="outline"
              className={btnSecondary}
              disabled={isPending || isAdminContext}
              onClick={handleResetToDraft}
            >
              Reset to Draft
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className={btnSecondary}
            disabled={isPending || isAdminContext}
            onClick={handleDuplicate}
          >
            <Copy className="h-3.5 w-3.5 mr-1" />
            Duplicate
          </Button>
          {canCreateCreditNote ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className={btnSecondary}
                disabled={isPending}
                onClick={() => {
                  setCreditNoteMode("full");
                  setCreditNoteOpen(true);
                }}
              >
                <FileMinus2 className="h-3.5 w-3.5 mr-1" />
                Credit Note
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={btnSecondary}
                disabled={isPending}
                onClick={() => {
                  setCreditNoteMode("partial");
                  setCreditNoteOpen(true);
                }}
              >
                <Undo2 className="h-3.5 w-3.5 mr-1" />
                Return / Partial
              </Button>
            </>
          ) : null}
        </div>
        <AccountingInvoiceStatusBar status={status} paymentState={paymentState} />
      </div>

      {/* Title + smart buttons */}
      <div className="px-3 sm:px-4 py-3 border-b border-slate-200 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-primary-dark">
            {detail.invoice_number}
          </h1>
          <p className="text-xs text-secondary-muted mt-0.5">
            Customer Invoice
            {customerLeadId ? (
              <span className="ml-2 font-mono">#{customerLeadId}</span>
            ) : null}
            {!isDraft && !isCancelled ? (
              <span className="ml-2">
                · {paymentStateLabel(paymentState)} · Outstanding{" "}
                <span className="font-semibold text-primary-dark">
                  {formatMoney(outstanding)}
                </span>
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {contactId ? (
            <button
              type="button"
              onClick={() => router.push(`/accounting/customers/${contactId}`)}
              className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left hover:border-[#017e84]/40 min-w-[72px]"
            >
              <div className="text-sm font-semibold text-[#017e84] leading-none">
                <UserRound className="h-4 w-4" />
              </div>
              <div className="text-[10px] text-secondary-muted mt-0.5">Customer</div>
            </button>
          ) : null}
          {detail.sales_order_id ? (
            <button
              type="button"
              onClick={() => router.push(`/sales/orders/${detail.sales_order_id}`)}
              className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left hover:border-[#017e84]/40 min-w-[72px]"
            >
              <div className="text-sm font-semibold text-[#017e84] leading-none">
                1
              </div>
              <div className="text-[10px] text-secondary-muted mt-0.5">Sales Order</div>
            </button>
          ) : null}
          {detail.sales_order_id ? (
            <button
              type="button"
              onClick={() =>
                router.push(`/sales/quotations/${detail.sales_order_id}`)
              }
              className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left hover:border-[#017e84]/40 min-w-[72px]"
            >
              <div className="text-sm font-semibold text-[#017e84] leading-none">
                <FileText className="h-4 w-4" />
              </div>
              <div className="text-[10px] text-secondary-muted mt-0.5">Quotation</div>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (canRegisterPayment) openPaymentDialog();
              else if (isPaid) toast.info("Invoice is fully paid.");
              else toast.info("Payments available when the invoice is Posted.");
            }}
            className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left hover:border-[#017e84]/40 min-w-[72px]"
          >
            <div className="text-sm font-semibold text-[#017e84] leading-none">
              {isPaid ? "✓" : amountPaid > 0 ? "…" : "0"}
            </div>
            <div className="text-[10px] text-secondary-muted mt-0.5">Payments</div>
          </button>
        </div>
      </div>

      <div className="flex-1 grid xl:grid-cols-[1fr_360px] min-h-0">
        <div className="p-3 sm:p-4 space-y-4 overflow-auto">
          {/* Customer + Invoice info */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-secondary-muted">
                Customer
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">Customer</Label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  disabled={readOnly}
                  className="h-8 rounded-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Customer ID</Label>
                <Input
                  value={customerLeadId}
                  readOnly
                  className="h-8 rounded-sm font-mono bg-slate-50"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Contact Person</Label>
                <Input
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  disabled={readOnly}
                  className="h-8 rounded-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={readOnly}
                    className="h-8 rounded-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={readOnly}
                    className="h-8 rounded-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Billing Address</Label>
                <Textarea
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                  disabled={readOnly}
                  className="min-h-[72px] rounded-sm text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Shipping Address</Label>
                <Textarea
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  disabled={readOnly}
                  className="min-h-[72px] rounded-sm text-sm"
                />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-secondary-muted">
                Invoice
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Invoice Date</Label>
                  <Input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => {
                      const next = e.target.value;
                      setInvoiceDate(next);
                      if (!dueDateManual && !readOnly) {
                        const auto = computeDueDateFromTerms(next, paymentTerms);
                        if (auto) setDueDate(auto);
                      }
                    }}
                    disabled={readOnly}
                    className="h-8 rounded-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Due Date</Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => {
                      setDueDateManual(true);
                      setDueDate(e.target.value);
                    }}
                    disabled={readOnly}
                    className="h-8 rounded-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Payment Terms</Label>
                <Input
                  value={paymentTerms}
                  onChange={(e) => {
                    const next = e.target.value;
                    setPaymentTerms(next);
                    if (!dueDateManual && !readOnly) {
                      const auto = computeDueDateFromTerms(invoiceDate, next);
                      if (auto) setDueDate(auto);
                    }
                  }}
                  disabled={readOnly}
                  className="h-8 rounded-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Salesperson</Label>
                <Input
                  value={salespersonName}
                  onChange={(e) => setSalespersonName(e.target.value)}
                  disabled={readOnly}
                  className="h-8 rounded-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Sales Order</Label>
                <Input
                  value={detail.sales_order_number || "—"}
                  readOnly
                  className="h-8 rounded-sm bg-slate-50"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Quotation</Label>
                <Input
                  value={detail.quotation_number || "—"}
                  readOnly
                  className="h-8 rounded-sm bg-slate-50"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Organization</Label>
                <Input
                  value={detail.organization_name || "—"}
                  readOnly
                  className="h-8 rounded-sm bg-slate-50"
                />
              </div>
            </div>
          </div>

          {/* Lines */}
          <div className="border border-slate-200 rounded-sm overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
              <p className="text-sm font-semibold text-primary-dark">Invoice Lines</p>
              {!readOnly ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs rounded-sm gap-1"
                  onClick={() => setLines((prev) => [...prev, newLineDraft()])}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add a line
                </Button>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-white">
                    <TableHead>Product</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-20">Qty</TableHead>
                    <TableHead className="w-24">UOM</TableHead>
                    <TableHead className="w-28">Unit Price</TableHead>
                    <TableHead className="w-20">Disc %</TableHead>
                    <TableHead className="w-20">Taxes %</TableHead>
                    <TableHead className="w-28 text-right">Total</TableHead>
                    {!readOnly ? <TableHead className="w-10" /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => {
                    const amounts = computeLineAmounts(line);
                    return (
                      <TableRow key={line.key}>
                        <TableCell>
                          <Input
                            value={line.product_name}
                            onChange={(e) =>
                              updateLine(line.key, { product_name: e.target.value })
                            }
                            disabled={readOnly}
                            className="h-8 rounded-sm"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={line.description}
                            onChange={(e) =>
                              updateLine(line.key, { description: e.target.value })
                            }
                            disabled={readOnly}
                            className="h-8 rounded-sm"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(line.key, { quantity: e.target.value })
                            }
                            disabled={readOnly}
                            className="h-8 rounded-sm"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={line.uom}
                            onChange={(e) =>
                              updateLine(line.key, { uom: e.target.value })
                            }
                            disabled={readOnly}
                            className="h-8 rounded-sm"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={line.unit_price}
                            onChange={(e) =>
                              updateLine(line.key, { unit_price: e.target.value })
                            }
                            disabled={readOnly}
                            className="h-8 rounded-sm"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={line.discount}
                            onChange={(e) =>
                              updateLine(line.key, { discount: e.target.value })
                            }
                            disabled={readOnly}
                            className="h-8 rounded-sm"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={line.taxes}
                            onChange={(e) =>
                              updateLine(line.key, { taxes: e.target.value })
                            }
                            disabled={readOnly}
                            className="h-8 rounded-sm"
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatMoney(amounts.total)}
                        </TableCell>
                        {!readOnly ? (
                          <TableCell>
                            <button
                              type="button"
                              className="text-slate-400 hover:text-red-600"
                              onClick={() => removeLine(line.key)}
                              aria-label="Remove line"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end px-4 py-3 border-t border-slate-200">
              <div className="w-full max-w-xs space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-secondary-muted">Untaxed Amount</span>
                  <span>{formatMoney(totals.untaxed)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary-muted">Taxes</span>
                  <span>{formatMoney(totals.tax)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
                  <span>Total</span>
                  <span>{formatMoney(totals.total)}</span>
                </div>
                {!isDraft ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-secondary-muted">Amount Paid</span>
                      <span>{formatMoney(amountPaid)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold text-[#017e84]">
                      <span>Outstanding</span>
                      <span>{formatMoney(outstanding)}</span>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {!isDraft ? (
            <AccountingPaymentHistory
              invoiceId={invoiceId}
              refreshKey={paymentsKey}
            />
          ) : null}

          <AccountingActivitiesPanel
            invoiceId={invoiceId}
            contactId={contactId || undefined}
          />

          {/* Notes */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Internal Notes</Label>
              <Textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                disabled={readOnly}
                placeholder="Visible only inside ERP"
                className="min-h-[88px] rounded-sm text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Customer Notes</Label>
              <Textarea
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                disabled={readOnly}
                placeholder="Appear on PDFs and emails"
                className="min-h-[88px] rounded-sm text-sm"
              />
            </div>
          </div>
        </div>

        <div className="border-t xl:border-t-0 xl:border-l border-slate-200 p-3 overflow-auto">
          <AccountingInvoiceChatter invoiceId={invoiceId} refreshKey={chatterKey} />
        </div>
      </div>

      {/* Email / PDF preview */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {previewKind === "email" ? "Send Invoice" : "PDF Preview"}
            </DialogTitle>
          </DialogHeader>
          {previewKind === "email" ? (
            <div className="space-y-3">
              <div className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Invoice PDF is generated and ready to attach. Email delivery
                automation expands in a later phase.
              </div>
              {pdfDataUrl ? (
                <p className="text-xs text-secondary-muted">
                  PDF attachment prepared ({detail.invoice_number}.pdf)
                </p>
              ) : null}
              <div className="space-y-1.5">
                <Label className="text-xs">To</Label>
                <Input value={emailDraft.to} readOnly className="h-8 rounded-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Subject</Label>
                <Input
                  value={emailDraft.subject}
                  onChange={(e) =>
                    setEmailDraft((d) => ({ ...d, subject: e.target.value }))
                  }
                  className="h-8 rounded-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Body</Label>
                <Textarea
                  value={emailDraft.body}
                  onChange={(e) =>
                    setEmailDraft((d) => ({ ...d, body: e.target.value }))
                  }
                  className="min-h-[200px] rounded-sm text-sm font-mono"
                />
              </div>
            </div>
          ) : pdfDataUrl ? (
            <iframe
              title="Invoice PDF"
              src={pdfDataUrl}
              className="w-full h-[70vh] rounded-sm border border-slate-200"
            />
          ) : (
            <p className="text-sm text-secondary-muted">Generating preview…</p>
          )}
          <DialogFooter>
            {previewKind === "email" ? (
              <Button
                className={btnPrimary}
                onClick={() => {
                  toast.success("Email draft ready — review and send from your mail client");
                  setPreviewOpen(false);
                }}
              >
                Close
              </Button>
            ) : (
              <Button
                variant="outline"
                className={btnSecondary}
                onClick={() => void runPdf("download")}
              >
                Download
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Register Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs space-y-1">
              <p>
                <span className="text-secondary-muted">Customer:</span>{" "}
                {customerName || "—"}
              </p>
              <p>
                <span className="text-secondary-muted">Customer ID:</span>{" "}
                <span className="font-mono">{customerLeadId || "—"}</span>
              </p>
              <p>
                <span className="text-secondary-muted">Invoice:</span>{" "}
                {detail.invoice_number}
              </p>
              <p>
                <span className="text-secondary-muted">Organization:</span>{" "}
                {detail.organization_name || "—"}
              </p>
              <p>
                <span className="text-secondary-muted">Total:</span>{" "}
                {formatMoney(detail.total_amount)}
              </p>
              <p className="font-semibold text-[#017e84]">
                Outstanding: {formatMoney(outstanding)}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Payment Date</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="h-8 rounded-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Amount</Label>
              <Input
                value={paymentAmount}
                onChange={(e) => {
                  setPaymentAmount(e.target.value);
                  setPaymentError(null);
                }}
                className="h-8 rounded-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Payment Method</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) =>
                  setPaymentMethod(v as AccountingPaymentMethod)
                }
              >
                <SelectTrigger className="h-8 rounded-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reference / Notes</Label>
              <Input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Reference"
                className="h-8 rounded-sm"
              />
              <Textarea
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Optional notes"
                className="min-h-[64px] rounded-sm text-sm"
              />
            </div>
            {paymentError ? (
              <p className="text-xs text-red-600">{paymentError}</p>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className={btnSecondary}
              onClick={() => setPaymentOpen(false)}
              disabled={paymentSubmitting}
            >
              Close
            </Button>
            <Button
              className={btnPrimary}
              disabled={isPending || paymentSubmitting}
              onClick={handleRegisterPayment}
            >
              {paymentSubmitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Confirm Payment"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detail ? (
        <AccountingCreateCreditNoteDialog
          open={creditNoteOpen}
          onOpenChange={setCreditNoteOpen}
          invoice={detail}
          mode={creditNoteMode}
        />
      ) : null}
    </div>
  );
}
