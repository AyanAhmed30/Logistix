"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Copy,
  Eye,
  Loader2,
  MoreHorizontal,
  Send,
  Settings2,
  Trash2,
  Undo2,
  Bell,
  MailWarning,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  searchSalesProductsForQuotation,
  type SalesProduct,
} from "@/app/actions/sales/products";
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
  getAccountingInvoicePayments,
} from "@/app/actions/accounting/payments";
import { generateAccountingInvoicePdf } from "@/lib/accounting-invoice-pdf";
import {
  paymentStateLabel,
  type AccountingPaymentMethod,
  type AccountingPaymentJournal,
} from "@/lib/accounting-payments";
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
import {
  CustomerPicker,
  type PickedCustomer,
} from "@/components/admin/quotations/CustomerPicker";
import {
  getContactById,
  getContactAutofillData,
} from "@/app/actions/contacts";
import { SalesProductLinePicker } from "@/components/sales/SalesProductLinePicker";

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
      account: l.account || "Sales",
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
  const [paymentJournal, setPaymentJournal] =
    useState<AccountingPaymentJournal>("bank");
  const [paymentMode, setPaymentMode] = useState<
    "withhold_and_pay" | "withhold_only" | "payment_only"
  >("payment_only");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentsCount, setPaymentsCount] = useState(0);
  const [paymentsSum, setPaymentsSum] = useState(0);
  const [creditNoteOpen, setCreditNoteOpen] = useState(false);
  const [creditNoteMode, setCreditNoteMode] = useState<"full" | "partial">("full");
  const [dueDateManual, setDueDateManual] = useState(false);
  const [activeTab, setActiveTab] = useState<"lines" | "other">("lines");
  const [taxMode, setTaxMode] = useState<"excl" | "incl">("excl");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogProducts, setCatalogProducts] = useState<SalesProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [visibleCols, setVisibleCols] = useState({
    account: true,
    quantity: true,
    price: true,
    taxes: true,
    amount: true,
  });

  const INCOME_ACCOUNTS = [
    "Sales",
    "Product Sales",
    "Service Revenue",
    "Other Income",
  ] as const;

  const isDraft = status === "draft";
  const isPosted = status === "posted";
  const isPaid = status === "paid" || paymentState === "paid";
  const isInPayment = paymentState === "in_payment";
  const isCancelled = status === "cancelled";
  const canRegisterPayment =
    (isPosted || status === "paid" || isInPayment) &&
    !isCancelled &&
    !isAdminContext &&
    (detail ? paymentsSum + 0.004 < (detail.total_amount || 0) : outstanding > 0.004);
  const canCreateCreditNote =
    (isPosted || isPaid || isInPayment) &&
    !isCancelled &&
    !isAdminContext &&
    Boolean(detail);
  const readOnly = !isDraft || isAdminContext;
  const showPostedActions = !isDraft && !isCancelled;

  const totals = useMemo(() => computeDocumentTotals(lines), [lines]);

  /** Draft Amount Due follows Tax Excl/Incl display (like line Amount); posted uses residual. */
  const amountDueDisplay = useMemo(() => {
    if (!isDraft) return outstanding;
    return taxMode === "incl" ? totals.total : totals.untaxed;
  }, [isDraft, outstanding, taxMode, totals.total, totals.untaxed]);

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

  useEffect(() => {
    if (!invoiceId || isDraft) {
      setPaymentsCount(0);
      setPaymentsSum(0);
      return;
    }
    let cancelled = false;
    void getAccountingInvoicePayments(invoiceId, { page: 1, pageSize: 50 }).then(
      (res) => {
        if (cancelled) return;
        if ("error" in res && res.error) {
          setPaymentsCount(0);
          setPaymentsSum(0);
          return;
        }
        setPaymentsCount(Number(res.total) || 0);
        const sum = (res.payments || []).reduce(
          (acc, p) => acc + (Number(p.amount) || 0),
          0
        );
        setPaymentsSum(Math.round(sum * 100) / 100);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [invoiceId, isDraft, paymentsKey]);

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
          account: line.account || "Sales",
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
    if (!customerName.trim() && !contactId) {
      toast.error("Customer is required");
      return;
    }
    startTransition(async () => {
      const res = await updateAccountingInvoice(invoiceId, buildPayload());
      applyResult(res, "Invoice saved");
    });
  }

  function handlePost() {
    startTransition(async () => {
      if (isDraft) {
        if (!customerName.trim() && !contactId) {
          toast.error("Customer is required before posting");
          return;
        }
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

    if ("contact" in contactRes && contactRes.contact) {
      const c = contactRes.contact;
      const address = formatContactAddress(c);
      setBillingAddress(address);
      setShippingAddress(address);
      if (c.email) setEmail(String(c.email));
      if (c.phone || c.mobile) setPhone(String(c.phone || c.mobile || ""));
      if (c.lead_id_formatted) setCustomerLeadId(String(c.lead_id_formatted));
      const children = c.children || [];
      const invoiceChild = children.find((ch) => ch.contact_kind === "invoice");
      const deliveryChild = children.find((ch) => ch.contact_kind === "delivery");
      if (invoiceChild) {
        setBillingAddress(formatContactAddress(invoiceChild) || address);
      }
      if (deliveryChild) {
        setShippingAddress(formatContactAddress(deliveryChild) || address);
      }
      const person = children.find(
        (ch) => ch.contact_kind === "contact" || ch.company_type === "person"
      );
      if (person?.name) setContactPerson(person.name);
    }

    if ("data" in autofill && autofill.data) {
      if (autofill.data.payment_terms) {
        const terms = String(autofill.data.payment_terms);
        setPaymentTerms(terms);
        if (!dueDateManual) {
          const auto = computeDueDateFromTerms(invoiceDate, terms);
          if (auto) setDueDate(auto);
        }
      }
    }
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
    const remaining = Math.max(
      0,
      Math.round(((detail.total_amount || 0) - paymentsSum) * 100) / 100
    );
    setPaymentAmount(String(remaining || outstanding || detail.amount_residual || 0));
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentJournal("bank");
    setPaymentMethod("bank_transfer");
    setPaymentMode("payment_only");
    setPaymentReference(detail.invoice_number || "");
    setPaymentNotes("");
    setPaymentError(null);
    setPaymentOpen(true);
  }

  function handleRegisterPayment() {
    if (paymentSubmitting || isPending) return;
    if (paymentMode === "withhold_only") {
      setPaymentError("Withhold Only is not available yet. Choose Payment Only.");
      return;
    }
    const amount = parseFloat(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError("Payment amount must be greater than zero");
      return;
    }
    const maxPayable = Math.max(
      0,
      Math.round(((detail?.total_amount || 0) - paymentsSum) * 100) / 100
    );
    if (amount - maxPayable > 0.004) {
      setPaymentError(
        `Amount cannot exceed remaining balance (${maxPayable.toFixed(2)})`
      );
      return;
    }
    if (!paymentDate) {
      setPaymentError("Payment date is required");
      return;
    }

    const method: AccountingPaymentMethod =
      paymentJournal === "cash" ? "cash" : paymentMethod;

    setPaymentError(null);
    setPaymentSubmitting(true);
    const idempotencyKey = `${invoiceId}-${paymentDate}-${amount}-${method}-${Date.now()}`;
    startTransition(async () => {
      try {
        const res = await registerAccountingPayment(invoiceId, {
          payment_date: paymentDate,
          amount,
          payment_method: method,
          reference: paymentReference || null,
          notes: paymentNotes || null,
          idempotency_key: idempotencyKey,
          journal: paymentJournal,
        });
        if (applyResult(res, "Payment created")) {
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
      {/* Odoo-style action + status row */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-slate-200 bg-slate-50/40">
        <div className="flex flex-wrap items-center gap-1.5">
          {isDraft ? (
            <Button
              size="sm"
              className={btnPrimary}
              disabled={isPending || isAdminContext}
              onClick={handlePost}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Confirm"
              )}
            </Button>
          ) : null}

          {showPostedActions ? (
            <>
              <Button
                size="sm"
                className={btnPrimary}
                disabled={isPending}
                onClick={handleSend}
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
              {canRegisterPayment ? (
                <Button
                  size="sm"
                  className={btnPrimary}
                  disabled={isPending || paymentSubmitting}
                  onClick={openPaymentDialog}
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
              {canCreateCreditNote ? (
                <Button
                  size="sm"
                  variant="outline"
                  className={btnSecondary}
                  onClick={() => {
                    setCreditNoteMode("full");
                    setCreditNoteOpen(true);
                  }}
                >
                  Credit Note
                </Button>
              ) : null}
              {(isPosted || isCancelled || isInPayment) && !isPaid ? (
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
            </>
          ) : null}

          {isDraft ? (
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 rounded-sm border-slate-200"
                aria-label="More actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {isDraft ? (
                <DropdownMenuItem
                  disabled={isPending || isAdminContext}
                  onClick={handleSave}
                >
                  Save
                </DropdownMenuItem>
              ) : null}
              {isDraft ? (
                <>
                  <DropdownMenuItem
                    disabled={pdfBusy}
                    onClick={() => void runPdf("preview")}
                  >
                    <Eye className="h-3.5 w-3.5 mr-2" />
                    Preview
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={isPending} onClick={handleSend}>
                    <Send className="h-3.5 w-3.5 mr-2" />
                    Send
                  </DropdownMenuItem>
                </>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={isPending || isAdminContext}
                onClick={handleDuplicate}
              >
                <Copy className="h-3.5 w-3.5 mr-2" />
                Duplicate
              </DropdownMenuItem>
              {canCreateCreditNote ? (
                <DropdownMenuItem
                  onClick={() => {
                    setCreditNoteMode("partial");
                    setCreditNoteOpen(true);
                  }}
                >
                  <Undo2 className="h-3.5 w-3.5 mr-2" />
                  Return / Partial
                </DropdownMenuItem>
              ) : null}
              {(isPosted || isPaid) && outstanding > 0.004 && !isAdminContext ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
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
                        }
                      });
                    }}
                  >
                    <Bell className="h-3.5 w-3.5 mr-2" />
                    Payment Reminder
                  </DropdownMenuItem>
                  <DropdownMenuItem
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
                        }
                      });
                    }}
                  >
                    <MailWarning className="h-3.5 w-3.5 mr-2" />
                    Overdue Reminder
                  </DropdownMenuItem>
                </>
              ) : null}
              {(isPosted || isPaid || isInPayment) && !isDraft ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={isPending || isAdminContext}
                    onClick={handleCancel}
                  >
                    Cancel
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <AccountingInvoiceStatusBar status={status} paymentState={paymentState} />
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

          {showPostedActions ? (
            <div className="flex flex-wrap items-stretch gap-2">
              <button
                type="button"
                className="inline-flex min-w-[88px] flex-col items-center justify-center rounded-sm border border-slate-200 bg-white px-3 py-2 text-center hover:bg-slate-50"
                onClick={() => {
                  router.push("/accounting/payments");
                }}
              >
                <span className="text-base font-semibold tabular-nums text-primary-dark">
                  {paymentsCount}
                </span>
                <span className="text-[11px] text-secondary-muted">Payments</span>
              </button>
              <button
                type="button"
                className="inline-flex min-w-[88px] flex-col items-center justify-center rounded-sm border border-slate-200 bg-white px-3 py-2 text-center hover:bg-slate-50"
                onClick={() => setActiveTab("other")}
              >
                <span className="text-base font-semibold text-primary-dark">—</span>
                <span className="text-[11px] text-secondary-muted">
                  Journal Items
                </span>
              </button>
            </div>
          ) : null}

          {/* Odoo sheet header */}
          <div>
            <p className="text-xs font-medium text-secondary-muted tracking-wide">
              Customer Invoice
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-primary-dark mt-0.5 leading-tight">
              {isDraft ? "Draft" : detail.invoice_number}
            </h1>
            {!isDraft ? (
              <p className="text-xs text-secondary-muted mt-1">
                {paymentStateLabel(paymentState)}
                {outstanding > 0.004 ? (
                  <>
                    {" "}
                    · Amount Due{" "}
                    <span className="font-semibold text-primary-dark">
                      {formatMoney(outstanding)}
                    </span>
                  </>
                ) : null}
              </p>
            ) : detail.invoice_number ? (
              <p className="text-xs text-secondary-muted mt-1 font-mono">
                {detail.invoice_number}
              </p>
            ) : null}
          </div>

          {/* Compact header fields — Customer | dates */}
          <div className="grid gap-x-8 gap-y-3 md:grid-cols-2 max-w-4xl">
            <div className="space-y-1">
              <Label className="text-xs text-secondary-muted font-normal">
                Customer
              </Label>
              {isDraft && !readOnly ? (
                <CustomerPicker
                  contactId={contactId}
                  customerName={customerName}
                  onSelect={(picked) => void handleCustomerSelect(picked)}
                  contactScope="customer"
                  placeholder="Search a name or Tax ID..."
                  inputClassName="h-9 rounded-sm border-0 border-b border-slate-200 shadow-none pr-0 focus-visible:ring-0 focus-visible:border-[#017e84]"
                />
              ) : (
                <Input
                  value={customerName}
                  disabled
                  className="h-9 rounded-sm border-0 border-b border-slate-200 shadow-none px-0 bg-transparent"
                />
              )}
              {customerLeadId ? (
                <p className="text-[11px] text-secondary-muted font-mono">
                  #{customerLeadId}
                </p>
              ) : null}
              {billingAddress ? (
                <p className="text-xs text-secondary-muted whitespace-pre-line mt-1 leading-relaxed">
                  {billingAddress}
                </p>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-secondary-muted font-normal">
                    Invoice Date
                  </Label>
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
                    className="h-9 rounded-sm border-0 border-b border-slate-200 shadow-none px-0 focus-visible:ring-0"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-secondary-muted font-normal">
                    Due Date
                  </Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => {
                      setDueDateManual(true);
                      setDueDate(e.target.value);
                    }}
                    disabled={readOnly}
                    className="h-9 rounded-sm border-0 border-b border-slate-200 shadow-none px-0 focus-visible:ring-0"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-secondary-muted font-normal">
                  Payment Terms
                </Label>
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
                  className="h-9 rounded-sm border-0 border-b border-slate-200 shadow-none px-0 focus-visible:ring-0"
                />
              </div>
            </div>
          </div>

          {/* Tabs + tax toggle */}
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
                  className={`pb-2 border-b-2 -mb-px transition-colors ${
                    activeTab === id
                      ? "border-[#017e84] text-[#017e84] font-medium"
                      : "border-transparent text-secondary-muted hover:text-primary-dark"
                  }`}
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
                  className={`h-6 px-2.5 rounded-sm transition-colors ${
                    taxMode === "excl"
                      ? "bg-[#017e84] text-white"
                      : "text-secondary-muted hover:bg-slate-50"
                  }`}
                  onClick={() => setTaxMode("excl")}
                >
                  Tax Excl.
                </button>
                <button
                  type="button"
                  className={`h-6 px-2.5 rounded-sm transition-colors ${
                    taxMode === "incl"
                      ? "bg-[#017e84] text-white"
                      : "text-secondary-muted hover:bg-slate-50"
                  }`}
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
                      {visibleCols.account ? (
                        <TableHead className="h-9 w-40 text-xs font-medium text-secondary-muted">
                          Account
                        </TableHead>
                      ) : null}
                      {visibleCols.quantity ? (
                        <TableHead className="h-9 w-24 text-xs font-medium text-secondary-muted">
                          Quantity
                        </TableHead>
                      ) : null}
                      {visibleCols.price ? (
                        <TableHead className="h-9 w-28 text-xs font-medium text-secondary-muted">
                          Price
                        </TableHead>
                      ) : null}
                      {visibleCols.taxes ? (
                        <TableHead className="h-9 w-24 text-xs font-medium text-secondary-muted">
                          Taxes
                        </TableHead>
                      ) : null}
                      {visibleCols.amount ? (
                        <TableHead className="h-9 w-28 text-right text-xs font-medium text-secondary-muted">
                          Amount
                        </TableHead>
                      ) : null}
                      <TableHead className="h-9 w-8 p-0 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center text-secondary-muted hover:text-[#017e84]"
                              aria-label="Optional columns"
                              title="Optional columns"
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            {(
                              [
                                ["account", "Account"],
                                ["quantity", "Quantity"],
                                ["price", "Price"],
                                ["taxes", "Taxes"],
                                ["amount", "Amount"],
                              ] as const
                            ).map(([key, label]) => (
                              <DropdownMenuCheckboxItem
                                key={key}
                                checked={visibleCols[key]}
                                onCheckedChange={(checked) =>
                                  setVisibleCols((prev) => ({
                                    ...prev,
                                    [key]: Boolean(checked),
                                  }))
                                }
                              >
                                {label}
                              </DropdownMenuCheckboxItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => {
                      const lineType =
                        line.display_type ||
                        (Number(line.quantity) === 0 &&
                        Number(line.unit_price) === 0
                          ? line.product_name === "Note"
                            ? "line_note"
                            : line.product_name === "Section" ||
                              line.product_name
                            ? "line_section"
                            : "product"
                          : "product");
                      const colSpan =
                        1 +
                        (visibleCols.account ? 1 : 0) +
                        (visibleCols.quantity ? 1 : 0) +
                        (visibleCols.price ? 1 : 0) +
                        (visibleCols.taxes ? 1 : 0) +
                        (visibleCols.amount ? 1 : 0);

                      if (lineType === "line_section" || lineType === "line_note") {
                        return (
                          <TableRow
                            key={line.key}
                            className={
                              lineType === "line_section"
                                ? "bg-slate-50/90"
                                : "bg-amber-50/40"
                            }
                          >
                            <TableCell colSpan={colSpan} className="py-1.5">
                              <Input
                                className={`h-8 rounded-sm border-slate-200 ${
                                  lineType === "line_section"
                                    ? "font-semibold"
                                    : "italic"
                                }`}
                                value={
                                  lineType === "line_note"
                                    ? line.description || line.product_name
                                    : line.product_name
                                }
                                disabled={readOnly}
                                placeholder={
                                  lineType === "line_section"
                                    ? "Section title"
                                    : "Note"
                                }
                                onChange={(e) =>
                                  updateLine(line.key, {
                                    product_name:
                                      lineType === "line_section"
                                        ? e.target.value
                                        : "Note",
                                    description: e.target.value,
                                    display_type: lineType,
                                    quantity: "0",
                                    unit_price: "0",
                                  })
                                }
                              />
                            </TableCell>
                            {!readOnly ? (
                              <TableCell className="py-1.5">
                                <button
                                  type="button"
                                  className="text-slate-300 hover:text-red-600 p-1"
                                  onClick={() => removeLine(line.key)}
                                  aria-label="Remove line"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </TableCell>
                            ) : (
                              <TableCell />
                            )}
                          </TableRow>
                        );
                      }

                      const taxPct = parseFloat(line.taxes) || 0;
                      const displayPrice = unitPriceForDisplay(
                        parseFloat(line.unit_price) || 0,
                        taxPct,
                        taxMode
                      );
                      const amountShown = lineAmountForTaxMode(line, taxMode);
                      return (
                        <TableRow
                          key={line.key}
                          className="border-b border-slate-100 hover:bg-slate-50/50"
                        >
                          <TableCell className="min-w-[200px] py-1.5 align-top">
                            {!readOnly ? (
                              <div className="space-y-1">
                                <SalesProductLinePicker
                                  valueName={line.product_name}
                                  disabled={readOnly}
                                  onSelect={(product, freeText) => {
                                    if (product) {
                                      updateLine(line.key, {
                                        product_id: product.id,
                                        product_name: product.name,
                                        description:
                                          product.description_sale ||
                                          product.description ||
                                          product.name,
                                        uom: product.uom || line.uom,
                                        unit_price: String(
                                          product.list_price || 0
                                        ),
                                        account: line.account || "Sales",
                                      });
                                    } else if (typeof freeText === "string") {
                                      updateLine(line.key, {
                                        product_id: null,
                                        product_name: freeText,
                                        description:
                                          line.description || freeText,
                                      });
                                    }
                                  }}
                                />
                                <Input
                                  value={line.description}
                                  onChange={(e) =>
                                    updateLine(line.key, {
                                      description: e.target.value,
                                    })
                                  }
                                  placeholder="Description"
                                  className="h-7 rounded-sm border-0 bg-transparent px-0 text-xs text-secondary-muted shadow-none focus-visible:ring-0"
                                />
                              </div>
                            ) : (
                              <div>
                                <p className="text-sm">
                                  {line.product_name || "—"}
                                </p>
                                {line.description ? (
                                  <p className="text-xs text-secondary-muted">
                                    {line.description}
                                  </p>
                                ) : null}
                              </div>
                            )}
                          </TableCell>
                          {visibleCols.account ? (
                            <TableCell className="py-1.5 align-top min-w-[140px]">
                              {readOnly ? (
                                <span className="text-sm">
                                  {line.account || "Sales"}
                                </span>
                              ) : (
                                <Select
                                  value={line.account || "Sales"}
                                  onValueChange={(v) =>
                                    updateLine(line.key, { account: v })
                                  }
                                >
                                  <SelectTrigger className="h-8 rounded-sm border-0 border-b border-transparent hover:border-slate-200 focus:border-[#017e84] shadow-none px-1">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {INCOME_ACCOUNTS.map((acc) => (
                                      <SelectItem key={acc} value={acc}>
                                        {acc}
                                      </SelectItem>
                                    ))}
                                    {line.account &&
                                    !(INCOME_ACCOUNTS as readonly string[]).includes(
                                      line.account
                                    ) ? (
                                      <SelectItem value={line.account}>
                                        {line.account}
                                      </SelectItem>
                                    ) : null}
                                  </SelectContent>
                                </Select>
                              )}
                            </TableCell>
                          ) : null}
                          {visibleCols.quantity ? (
                            <TableCell className="py-1.5 align-top">
                              <Input
                                value={line.quantity}
                                type="number"
                                min="0"
                                step="0.01"
                                onChange={(e) =>
                                  updateLine(line.key, {
                                    quantity: e.target.value,
                                  })
                                }
                                disabled={readOnly}
                                className="h-8 rounded-sm border-0 border-b border-transparent hover:border-slate-200 focus:border-[#017e84] shadow-none px-1 tabular-nums"
                              />
                            </TableCell>
                          ) : null}
                          {visibleCols.price ? (
                            <TableCell className="py-1.5 align-top">
                              <Input
                                key={`${line.key}-price-${taxMode}`}
                                value={displayPrice}
                                type="number"
                                min="0"
                                step="0.01"
                                onChange={(e) => {
                                  const raw = parseFloat(e.target.value);
                                  const excl = unitPriceFromDisplay(
                                    Number.isFinite(raw) ? raw : 0,
                                    taxPct,
                                    taxMode
                                  );
                                  updateLine(line.key, {
                                    unit_price: String(excl),
                                  });
                                }}
                                disabled={readOnly}
                                className="h-8 rounded-sm border-0 border-b border-transparent hover:border-slate-200 focus:border-[#017e84] shadow-none px-1 tabular-nums"
                                title={
                                  taxMode === "incl"
                                    ? "Unit price (tax included)"
                                    : "Unit price (tax excluded)"
                                }
                              />
                            </TableCell>
                          ) : null}
                          {visibleCols.taxes ? (
                            <TableCell className="py-1.5 align-top">
                              <Input
                                value={line.taxes}
                                type="number"
                                min="0"
                                step="0.01"
                                onChange={(e) => {
                                  const nextTax = e.target.value;
                                  const nextTaxPct = parseFloat(nextTax) || 0;
                                  // Tax Incl.: keep displayed (incl) price stable when tax % changes
                                  if (taxMode === "incl") {
                                    const keptDisplay = unitPriceForDisplay(
                                      parseFloat(line.unit_price) || 0,
                                      taxPct,
                                      "incl"
                                    );
                                    const newExcl = unitPriceFromDisplay(
                                      keptDisplay,
                                      nextTaxPct,
                                      "incl"
                                    );
                                    updateLine(line.key, {
                                      taxes: nextTax,
                                      unit_price: String(newExcl),
                                    });
                                  } else {
                                    updateLine(line.key, { taxes: nextTax });
                                  }
                                }}
                                disabled={readOnly}
                                className="h-8 rounded-sm border-0 border-b border-transparent hover:border-slate-200 focus:border-[#017e84] shadow-none px-1 tabular-nums"
                                title="Tax %"
                              />
                            </TableCell>
                          ) : null}
                          {visibleCols.amount ? (
                            <TableCell className="py-1.5 text-right font-medium tabular-nums text-sm align-top pt-3">
                              {formatMoney(amountShown)}
                            </TableCell>
                          ) : null}
                          <TableCell className="py-1.5 align-top">
                            {!readOnly ? (
                              <button
                                type="button"
                                className="text-slate-300 hover:text-red-600 p-1"
                                onClick={() => removeLine(line.key)}
                                aria-label="Remove line"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {!readOnly ? (
                <div className="flex flex-wrap gap-4 text-sm">
                  <button
                    type="button"
                    className="text-[#017e84] hover:underline font-medium"
                    onClick={() =>
                      setLines((prev) => [...prev, newLineDraft()])
                    }
                  >
                    Add a line
                  </button>
                  <button
                    type="button"
                    className="text-[#017e84] hover:underline font-medium"
                    onClick={() =>
                      setLines((prev) => [
                        ...prev,
                        newLineDraft({
                          product_name: "Section",
                          description: "",
                          quantity: "0",
                          unit_price: "0",
                          display_type: "line_section",
                        }),
                      ])
                    }
                  >
                    Add a section
                  </button>
                  <button
                    type="button"
                    className="text-[#017e84] hover:underline font-medium"
                    onClick={() =>
                      setLines((prev) => [
                        ...prev,
                        newLineDraft({
                          product_name: "Note",
                          description: "",
                          quantity: "0",
                          unit_price: "0",
                          display_type: "line_note",
                        }),
                      ])
                    }
                  >
                    Add a note
                  </button>
                  <button
                    type="button"
                    className="text-[#017e84] hover:underline font-medium"
                    onClick={() => {
                      setCatalogOpen(true);
                      setCatalogQuery("");
                      setCatalogLoading(true);
                      void searchSalesProductsForQuotation("", 40).then(
                        (res) => {
                          setCatalogLoading(false);
                          if ("products" in res) {
                            setCatalogProducts(res.products || []);
                          } else {
                            setCatalogProducts([]);
                          }
                        }
                      );
                    }}
                  >
                    Catalog
                  </button>
                </div>
              ) : null}

              {/* Terms + totals */}
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

              {!isDraft ? (
                <AccountingPaymentHistory
                  invoiceId={invoiceId}
                  refreshKey={paymentsKey}
                />
              ) : null}
            </div>
          ) : (
            <div className="space-y-4 max-w-2xl">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-secondary-muted">
                    Contact Person
                  </Label>
                  <Input
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    disabled={readOnly}
                    className="h-9 rounded-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-secondary-muted">
                    Salesperson
                  </Label>
                  <Input
                    value={salespersonName}
                    onChange={(e) => setSalespersonName(e.target.value)}
                    disabled={readOnly}
                    className="h-9 rounded-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-secondary-muted">Email</Label>
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={readOnly}
                    className="h-9 rounded-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-secondary-muted">Phone</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={readOnly}
                    className="h-9 rounded-sm"
                  />
                </div>
              </div>
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
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-secondary-muted">
                    Sales Order
                  </Label>
                  <Input
                    value={detail.sales_order_number || "—"}
                    readOnly
                    className="h-9 rounded-sm bg-slate-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-secondary-muted">
                    Quotation
                  </Label>
                  <Input
                    value={detail.quotation_number || "—"}
                    readOnly
                    className="h-9 rounded-sm bg-slate-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-secondary-muted">
                    Organization
                  </Label>
                  <Input
                    value={detail.organization_name || "—"}
                    readOnly
                    className="h-9 rounded-sm bg-slate-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-secondary-muted">
                    Customer ID
                  </Label>
                  <Input
                    value={customerLeadId || "—"}
                    readOnly
                    className="h-9 rounded-sm bg-slate-50 font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-secondary-muted">
                  Internal Notes
                </Label>
                <Textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  disabled={readOnly}
                  placeholder="Visible only inside ERP"
                  className="min-h-[72px] rounded-sm text-sm"
                />
              </div>
              {contactId ? (
                <button
                  type="button"
                  className="text-sm text-[#017e84] hover:underline"
                  onClick={() =>
                    router.push(`/accounting/customers/${contactId}`)
                  }
                >
                  Open customer card
                </button>
              ) : null}
              <AccountingActivitiesPanel
                invoiceId={invoiceId}
                contactId={contactId || undefined}
              />
            </div>
          )}
        </div>

        <div className="border-t xl:border-t-0 xl:border-l border-slate-200 bg-slate-50/30 overflow-auto">
          <AccountingInvoiceChatter
            invoiceId={invoiceId}
            refreshKey={chatterKey}
          />
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

      {/* Pay wizard (Odoo-style) */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
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
                  name="payment-mode"
                  className="accent-[#017e84]"
                  checked={paymentMode === id}
                  onChange={() => setPaymentMode(id)}
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
                  value={paymentJournal}
                  onValueChange={(v) => {
                    const j = v as AccountingPaymentJournal;
                    setPaymentJournal(j);
                    setPaymentMethod(j === "cash" ? "cash" : "bank_transfer");
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
                <p className="h-8 flex items-center text-sm text-secondary-muted">
                  —
                </p>
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
                    value={paymentAmount}
                    onChange={(e) => {
                      setPaymentAmount(e.target.value);
                      setPaymentError(null);
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
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="h-8 rounded-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-secondary-muted">Memo</Label>
                <Input
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="Payment memo"
                  className="h-8 rounded-sm"
                />
              </div>
            </div>
          </div>

          {paymentError ? (
            <p className="text-xs text-red-600">{paymentError}</p>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              className={btnPrimary}
              disabled={isPending || paymentSubmitting}
              onClick={handleRegisterPayment}
            >
              {paymentSubmitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Create Payment"
              )}
            </Button>
            <Button
              variant="outline"
              className={btnSecondary}
              onClick={() => setPaymentOpen(false)}
              disabled={paymentSubmitting}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={catalogOpen}
        onOpenChange={(open) => {
          setCatalogOpen(open);
          if (!open) {
            setCatalogQuery("");
            setCatalogProducts([]);
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Product Catalog</DialogTitle>
          </DialogHeader>
          <Input
            value={catalogQuery}
            placeholder="Search products…"
            className="h-9 rounded-sm"
            onChange={(e) => {
              const q = e.target.value;
              setCatalogQuery(q);
              setCatalogLoading(true);
              window.setTimeout(() => {
                void searchSalesProductsForQuotation(q, 40).then((res) => {
                  setCatalogLoading(false);
                  if ("products" in res) setCatalogProducts(res.products || []);
                  else setCatalogProducts([]);
                });
              }, 200);
            }}
          />
          <div className="flex-1 overflow-y-auto border border-slate-200 rounded-sm min-h-[240px]">
            {catalogLoading ? (
              <div className="flex items-center justify-center gap-2 p-6 text-sm text-secondary-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : catalogProducts.length === 0 ? (
              <p className="p-6 text-sm text-secondary-muted text-center">
                No products found.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {catalogProducts.map((product) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2.5 hover:bg-[#017e84]/5 flex items-center justify-between gap-3"
                      onClick={() => {
                        setLines((prev) => {
                          const empty = prev.find(
                            (l) =>
                              !(l.display_type && l.display_type !== "product") &&
                              !String(l.product_name || "").trim()
                          );
                          const draft = newLineDraft({
                            product_id: product.id,
                            product_name: product.name,
                            description:
                              product.description_sale ||
                              product.description ||
                              product.name,
                            uom: product.uom || "Units",
                            unit_price: String(product.list_price || 0),
                            account: "Sales",
                          });
                          if (empty) {
                            return prev.map((l) =>
                              l.key === empty.key ? { ...draft, key: l.key } : l
                            );
                          }
                          return [...prev, draft];
                        });
                        toast.success(`Added ${product.name}`);
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-primary-dark truncate">
                          {product.name}
                        </span>
                        {product.default_code ? (
                          <span className="block text-[11px] text-secondary-muted font-mono">
                            {product.default_code}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-sm tabular-nums text-secondary-muted shrink-0">
                        {formatMoney(Number(product.list_price) || 0)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className={btnSecondary}
              onClick={() => setCatalogOpen(false)}
            >
              Close
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
