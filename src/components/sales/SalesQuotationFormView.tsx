"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Copy,
  Download,
  FileText,
  History,
  Loader2,
  MoreHorizontal,
  Plus,
  Printer,
  Trash2,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CustomerPicker,
  type PickedCustomer,
} from "@/components/admin/quotations/CustomerPicker";
import { SalesQuotationStatusBar } from "@/components/sales/SalesQuotationStatusBar";
import { SalesQuotationChatter } from "@/components/sales/SalesQuotationChatter";
import { SalesProductLinePicker } from "@/components/sales/SalesProductLinePicker";
import { SalesPageSkeleton } from "@/components/sales/SalesSkeleton";
import { getSalesQuotationPdfPayload } from "@/app/actions/sales/quotation-pdf";
import { generateSalesQuotationPdf } from "@/lib/sales-quotation-pdf";
import {
  cancelSalesQuotation,
  confirmSalesQuotation,
  createSalesQuotation,
  duplicateSalesQuotation,
  getSalesQuotationDetail,
  getSalesQuotationPrefillFromOpportunity,
  getSalesQuotationVersions,
  lockSalesQuotation,
  logSalesQuotationPreview,
  markSalesQuotationCustomerReview,
  markSalesQuotationSent,
  setSalesOrderDeliveryStatus,
  updateSalesQuotation,
  type SalesQuotationDetail,
  type SalesQuotationVersion,
} from "@/app/actions/sales/quotation-form";
import {
  getSalesEmailTemplates,
  prepareSalesQuotationEmail,
  scheduleSalesQuotationFollowUp,
  type SalesEmailTemplate,
} from "@/app/actions/sales/automation";
import {
  createAccountingInvoiceFromOrder,
  getAccountingInvoiceIdForOrder,
} from "@/app/actions/accounting/invoices";
import {
  getContactById,
  getContactAutofillData,
  getSalespersonOptions,
  type ContactWithRelations,
} from "@/app/actions/contacts";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import {
  searchSalesProductsForQuotation,
  type SalesProduct,
} from "@/app/actions/sales/products";
import {
  computeDocumentTotals,
  formatContactAddress,
  formatMoney,
  inferLineDisplayType,
  isProductLine,
  lineAmountForTaxMode,
  newLineDraft,
  unitPriceForDisplay,
  unitPriceFromDisplay,
  type QuotationLineDraft,
} from "@/lib/sales-quotation-form";
import {
  computeOrderDeliveryFulfillment,
  deliveryFulfillmentBadgeClass,
  SALES_DELIVERY_FULFILLMENT_LABELS,
  validateDeliveredQuantity,
} from "@/lib/sales-delivery-status";

type Props = {
  quotationId: string | null;
  /** When opened from Sales Orders routes */
  documentKind?: "quotation" | "order";
  /** Opened from Orders to Invoice — Odoo Create Invoice action bar */
  fromToInvoice?: boolean;
};

type ChildOption = { id: string; name: string; kind: string; address: string };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysIso(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function SalesQuotationFormView({
  quotationId,
  documentKind = "quotation",
  fromToInvoice = false,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const opportunityIdParam = searchParams.get("opportunityId");
  const { isAdminContext, switchVersion } = useAdminOrganization();
  const [isPending, startTransition] = useTransition();
  const isOrderView = documentKind === "order" || fromToInvoice;

  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<SalesQuotationDetail | null>(null);
  const [versions, setVersions] = useState<SalesQuotationVersion[]>([]);
  const [salespeople, setSalespeople] = useState<
    { id: string; name: string }[]
  >([]);

  const [contactId, setContactId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [contactPersonId, setContactPersonId] = useState<string | null>(null);
  const [deliveryAddressId, setDeliveryAddressId] = useState<string | null>(
    null
  );
  const [invoiceAddressId, setInvoiceAddressId] = useState<string | null>(null);
  const [salespersonId, setSalespersonId] = useState<string | null>(null);
  const [salesTeam, setSalesTeam] = useState("");
  const [customerReference, setCustomerReference] = useState("");
  const [pricelist, setPricelist] = useState("");
  const [fiscalPosition, setFiscalPosition] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Immediate");
  const [quotationDate, setQuotationDate] = useState(todayIso());
  const [expirationDate, setExpirationDate] = useState(plusDaysIso(30));
  const [internalNotes, setInternalNotes] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [opportunityId, setOpportunityId] = useState<string | null>(null);
  const [opportunityName, setOpportunityName] = useState<string | null>(null);
  const [lines, setLines] = useState<QuotationLineDraft[]>([newLineDraft()]);
  const [childOptions, setChildOptions] = useState<ChildOption[]>([]);
  const [activeTab, setActiveTab] = useState<"lines" | "other">("lines");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewKind, setPreviewKind] = useState<"email" | "pdf">("pdf");
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chatterKey, setChatterKey] = useState(0);
  const [emailTemplates, setEmailTemplates] = useState<SalesEmailTemplate[]>(
    []
  );
  const [emailTemplateKey, setEmailTemplateKey] = useState("send_quotation");
  const [emailDraft, setEmailDraft] = useState<{
    subject: string;
    body: string;
  } | null>(null);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpType, setFollowUpType] = useState<
    "call" | "email" | "meeting" | "follow_up"
  >("follow_up");
  const [followUpSummary, setFollowUpSummary] = useState("");
  const [followUpDue, setFollowUpDue] = useState(plusDaysIso(3));
  const [linkedInvoiceId, setLinkedInvoiceId] = useState<string | null>(null);
  const [taxMode, setTaxMode] = useState<"excl" | "incl">("excl");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogProducts, setCatalogProducts] = useState<SalesProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  /** Soft-persisted id after first save — avoids remounting via router.replace. */
  const [persistedId, setPersistedId] = useState<string | null>(quotationId);

  useEffect(() => {
    setPersistedId(quotationId);
  }, [quotationId]);

  const recordId = quotationId || persistedId;

  const status = detail?.status || "quotation";
  const statusUi = detail?.status_ui || "draft";
  const isLocked = Boolean(detail?.is_locked);
  const readOnly =
    Boolean(recordId) && (isLocked || status === "cancelled");

  const totals = useMemo(() => computeDocumentTotals(lines), [lines]);

  const deliveryFulfillment = useMemo(
    () =>
      computeOrderDeliveryFulfillment(
        lines.map((line) => ({
          quantity: parseFloat(line.quantity) || 0,
          qty_delivered: parseFloat(line.qty_delivered) || 0,
          isProduct: isProductLine(line),
        }))
      ),
    [lines]
  );

  const deliveredValidationError = useMemo(() => {
    for (const line of lines) {
      if (!isProductLine(line)) continue;
      const err = validateDeliveredQuantity(
        parseFloat(line.quantity) || 0,
        parseFloat(line.qty_delivered) || 0
      );
      if (err) return err;
    }
    return null;
  }, [lines]);

  const personOptions = useMemo(
    () =>
      childOptions.filter(
        (c) => c.kind === "contact" || c.kind === "person"
      ),
    [childOptions]
  );
  const deliveryOptions = useMemo(
    () => childOptions.filter((c) => c.kind === "delivery" || c.kind === "contact" || c.kind === "person"),
    [childOptions]
  );
  const invoiceOptions = useMemo(
    () =>
      childOptions.filter(
        (c) => c.kind === "invoice" || c.kind === "contact" || c.kind === "person"
      ),
    [childOptions]
  );

  const applyContactChildren = useCallback((contact: ContactWithRelations) => {
    const children = contact.children || [];
    const options: ChildOption[] = [
      {
        id: contact.id,
        name: `${contact.name} (Company)`,
        kind: "contact",
        address: formatContactAddress(contact),
      },
      ...children.map((child) => ({
        id: child.id,
        name: child.name,
        kind: child.contact_kind || (child.company_type === "person" ? "person" : "contact"),
        address: formatContactAddress(child),
      })),
    ];
    setChildOptions(options);

    const persons = children.filter(
      (c) => c.contact_kind === "contact" || c.company_type === "person"
    );
    const delivery = children.find((c) => c.contact_kind === "delivery");
    const invoice = children.find((c) => c.contact_kind === "invoice");

    setContactPersonId((prev) => prev || persons[0]?.id || null);
    setDeliveryAddressId((prev) => prev || delivery?.id || contact.id);
    setInvoiceAddressId((prev) => prev || invoice?.id || contact.id);
  }, []);

  const loadCustomerRelations = useCallback(
    async (id: string, opts?: { autofill?: boolean }) => {
      const res = await getContactById(id);
      if ("contact" in res && res.contact) {
        applyContactChildren(res.contact);
      }
      if (opts?.autofill) {
        const autofill = await getContactAutofillData(id);
        if ("data" in autofill && autofill.data) {
          if (autofill.data.payment_terms) {
            setPaymentTerms(autofill.data.payment_terms);
          }
          if (autofill.data.pricelist) setPricelist(autofill.data.pricelist);
          if (autofill.data.salesperson_id) {
            setSalespersonId(autofill.data.salesperson_id);
          }
        }
      }
    },
    [applyContactChildren]
  );

  const hydrateFromDetail = useCallback((q: SalesQuotationDetail) => {
    setDetail(q);
    setContactId(q.contact_id);
    setCustomerName(q.customer_name);
    setContactPersonId(q.contact_person_id);
    setDeliveryAddressId(q.delivery_address_id);
    setInvoiceAddressId(q.invoice_address_id);
    setSalespersonId(q.salesperson_id);
    setSalesTeam(q.sales_team || "");
    setCustomerReference(q.customer_reference || "");
    setPricelist(q.pricelist || "");
    setFiscalPosition(q.fiscal_position || "");
    setPaymentTerms(q.payment_terms || "Immediate");
    setQuotationDate(q.quotation_date || todayIso());
    setExpirationDate(q.expiration_date || plusDaysIso(30));
    setInternalNotes(q.internal_notes || "");
    setCustomerNotes(q.customer_notes || "");
    setOpportunityId(q.opportunity_id);
    setOpportunityName(q.opportunity_name || null);
    setLines(
      q.lines.length
        ? q.lines.map((line) =>
            newLineDraft({
              key: line.id,
              id: line.id.startsWith("legacy-") ? null : line.id,
              product_id: line.product_id,
              product_name: line.product_name,
              description: line.description || "",
              quantity: String(line.quantity),
              qty_delivered: String(line.qty_delivered ?? 0),
              uom: line.uom,
              unit_price: String(line.unit_price),
              discount: String(line.discount),
              taxes: String(line.taxes),
              display_type: inferLineDisplayType({
                product_name: line.product_name,
                description: line.description,
                quantity: line.quantity,
                unit_price: line.unit_price,
              }),
            })
          )
        : [newLineDraft()]
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void (async () => {
      const sp = await getSalespersonOptions();
      if (!cancelled && "salespersons" in sp) {
        setSalespeople(
          (sp.salespersons || []).map((o) => ({ id: o.id, name: o.name }))
        );
      }

      if (quotationId) {
        const res = await getSalesQuotationDetail(quotationId);
        if (cancelled) return;
        if ("error" in res && res.error) {
          toast.error(res.error);
          setLoading(false);
          return;
        }
        if ("quotation" in res && res.quotation) {
          hydrateFromDetail(res.quotation);
          if (res.quotation.contact_id) {
            await loadCustomerRelations(res.quotation.contact_id);
          }
          const ver = await getSalesQuotationVersions(quotationId);
          if ("versions" in ver) setVersions(ver.versions ?? []);
        }
      } else if (opportunityIdParam) {
        const pre = await getSalesQuotationPrefillFromOpportunity(
          opportunityIdParam
        );
        if (cancelled) return;
        if ("error" in pre && pre.error) {
          toast.error(pre.error);
        } else if ("prefill" in pre && pre.prefill) {
          const p = pre.prefill;
          setOpportunityId(p.opportunity_id);
          setOpportunityName(p.opportunity_name);
          setContactId(p.contact_id);
          setCustomerName(p.customer_name);
          setContactPersonId(p.contact_person_id);
          setSalespersonId(p.salesperson_id);
          setSalesTeam(p.sales_team || "");
          if (p.expected_revenue > 0) {
            setLines([
              newLineDraft({
                product_name: p.opportunity_name || "Opportunity",
                description: p.opportunity_name || "",
                quantity: "1",
                unit_price: String(p.expected_revenue),
              }),
            ]);
          }
          if (p.contact_id) {
            await loadCustomerRelations(p.contact_id, { autofill: true });
          }
        }
      }

      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    quotationId,
    opportunityIdParam,
    switchVersion,
    hydrateFromDetail,
    loadCustomerRelations,
  ]);

  useEffect(() => {
    void getSalesEmailTemplates().then((res) => {
      if ("templates" in res && res.templates) {
        setEmailTemplates(res.templates);
      }
    });
  }, [switchVersion]);

  useEffect(() => {
    if (!recordId || status !== "sales_order") {
      setLinkedInvoiceId(null);
      return;
    }
    void getAccountingInvoiceIdForOrder(recordId).then((res) => {
      if ("invoiceId" in res) setLinkedInvoiceId(res.invoiceId ?? null);
    });
  }, [recordId, status, switchVersion, chatterKey]);

  function handleCustomerPicked(customer: PickedCustomer) {
    setContactId(customer.contact_id);
    setCustomerName(customer.name);
    void loadCustomerRelations(customer.contact_id, { autofill: true });
  }

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
      contact_id: contactId,
      customer_name: customerName,
      contact_person_id: contactPersonId,
      delivery_address_id: deliveryAddressId,
      invoice_address_id: invoiceAddressId,
      salesperson_id: salespersonId,
      sales_team: salesTeam || null,
      customer_reference: customerReference || null,
      pricelist: pricelist || null,
      fiscal_position: fiscalPosition || null,
      payment_terms: paymentTerms,
      quotation_date: quotationDate,
      expiration_date: expirationDate,
      internal_notes: internalNotes || null,
      customer_notes: customerNotes || null,
      opportunity_id: opportunityId,
      lines: lines.map((line, index) => ({
        id: line.id,
        product_id: line.product_id || null,
        sequence: (index + 1) * 10,
        product_name: line.product_name,
        description: line.description || line.product_name,
        quantity: parseFloat(line.quantity) || 0,
        qty_delivered: parseFloat(line.qty_delivered) || 0,
        uom: line.uom,
        unit_price: parseFloat(line.unit_price) || 0,
        discount: parseFloat(line.discount) || 0,
        taxes: parseFloat(line.taxes) || 0,
        display_type: line.display_type || inferLineDisplayType(line),
      })),
    };
  }

  function save() {
    void ensureSaved();
  }

  /** Save (create/update) and return quotation id — used by Send / Confirm like Odoo. */
  async function ensureSaved(): Promise<string | null> {
    if (isAdminContext) {
      toast.info("Select a specific organization to save quotations.");
      return null;
    }
    if (readOnly) {
      toast.error("This quotation is read-only.");
      return null;
    }

    if (deliveredValidationError) {
      toast.error(deliveredValidationError);
      return null;
    }

    const payload = buildPayload();
    const res = recordId
      ? await updateSalesQuotation(recordId, payload)
      : await createSalesQuotation(payload);

    if ("error" in res && res.error) {
      toast.error(res.error);
      return null;
    }
    if ("quotation" in res && res.quotation) {
      hydrateFromDetail(res.quotation);
      setPersistedId(res.quotation.id);
      setChatterKey((k) => k + 1);
      // Stay mounted — do not touch window.history (breaks Next.js App Router hooks).
      const ver = await getSalesQuotationVersions(res.quotation.id);
      if ("versions" in ver) setVersions(ver.versions ?? []);
      return res.quotation.id;
    }
    return null;
  }

  useEffect(() => {
    function onSaveShortcut() {
      if (!readOnly) void ensureSaved().then((id) => {
        if (id) toast.success("Saved");
      });
    }
    window.addEventListener("sales:shortcut-save", onSaveShortcut);
    return () =>
      window.removeEventListener("sales:shortcut-save", onSaveShortcut);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, quotationId, detail, lines, contactId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!readOnly) {
          void ensureSaved().then((id) => {
            if (id) toast.success("Saved");
          });
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, quotationId, detail, lines, contactId]);

  function runWorkflow(
    action: () => Promise<{ quotation?: SalesQuotationDetail; error?: string }>,
    _options?: { redirectToOrder?: boolean }
  ) {
    startTransition(async () => {
      const res = await action();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.quotation) {
        hydrateFromDetail(res.quotation);
        setChatterKey((k) => k + 1);
        toast.success("Updated");
      }
    });
  }

  function openPreview(kind: "email" | "pdf") {
    if (kind === "pdf") {
      void runPdf("preview");
      return;
    }
    setPreviewKind(kind);
    setPreviewOpen(true);
    if (quotationId) {
      void (async () => {
        const res = await prepareSalesQuotationEmail(
          quotationId,
          emailTemplateKey
        );
        if ("email" in res && res.email) {
          setEmailDraft({ subject: res.email.subject, body: res.email.body });
        } else if ("error" in res && res.error) {
          toast.error(res.error);
        }
        void logSalesQuotationPreview(quotationId, kind);
      })();
    }
  }

  async function submitFollowUp() {
    if (!quotationId) return;
    const summary = followUpSummary.trim();
    if (!summary) {
      toast.error("Follow-up summary is required");
      return;
    }
    startTransition(async () => {
      const res = await scheduleSalesQuotationFollowUp({
        quotationId,
        type: followUpType,
        dueAt: followUpDue,
        summary,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.crm_activity_id
          ? "Follow-up scheduled (CRM activity created)"
          : "Follow-up reminder scheduled"
      );
      setFollowUpOpen(false);
      setFollowUpSummary("");
      setChatterKey((k) => k + 1);
    });
  }

  async function runPdf(mode: "preview" | "download" | "print") {
    if (!quotationId && !detail?.id) {
      toast.info("Save the quotation before generating a PDF.");
      return;
    }
    const id = quotationId || detail?.id;
    if (!id) return;
    setPdfBusy(true);
    try {
      const res = await getSalesQuotationPdfPayload(id);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if (!("payload" in res) || !res.payload) {
        toast.error("Failed to build PDF");
        return;
      }
      const generated = await generateSalesQuotationPdf(res.payload, {
        download: mode === "download",
        openPrintDialog: mode === "print",
      });
      setPdfDataUrl(generated.dataUrl);
      if (mode === "preview") {
        setPreviewKind("pdf");
        setPreviewOpen(true);
      }
      void logSalesQuotationPreview(id, mode === "print" ? "print" : "pdf");
      if (mode === "download") toast.success("PDF downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF generation failed");
    } finally {
      setPdfBusy(false);
    }
  }

  useEffect(() => {
    if (!fromToInvoice || !detail?.quotation_number) return;
    window.dispatchEvent(
      new CustomEvent("sales:document-title", {
        detail: { title: detail.quotation_number },
      })
    );
  }, [fromToInvoice, detail?.quotation_number]);

  const isSalesOrderDoc =
    status === "sales_order" || (isOrderView && statusUi === "confirmed");

  useEffect(() => {
    if (!isSalesOrderDoc || !recordId) return;
    // Warm invoice route / existing invoice link for instant Create Invoice.
    if (linkedInvoiceId) {
      router.prefetch(`/accounting/invoices/${linkedInvoiceId}`);
    } else {
      router.prefetch("/accounting/invoices");
    }
  }, [isSalesOrderDoc, recordId, linkedInvoiceId, router]);

  if (loading) {
    return (
      <div className="p-4">
        <SalesPageSkeleton rows={8} />
      </div>
    );
  }

  const title = detail?.quotation_number || (isOrderView ? "Sales Order" : "New");

  const canSend =
    !isSalesOrderDoc &&
    (!recordId ||
      status === "quotation" ||
      status === "quotation_sent" ||
      status === "customer_review" ||
      status === "expired");

  const canConfirm =
    !isSalesOrderDoc &&
    (!recordId ||
      status === "quotation" ||
      status === "quotation_sent" ||
      status === "customer_review" ||
      status === "expired");

  const showCancel =
    Boolean(recordId) && status !== "cancelled" && !isLocked;

  async function handleCreateInvoice() {
    if (!recordId) return;
    if (linkedInvoiceId) {
      router.prefetch(`/accounting/invoices/${linkedInvoiceId}`);
      router.push(`/accounting/invoices/${linkedInvoiceId}`);
      return;
    }
    startTransition(async () => {
      const res = await createAccountingInvoiceFromOrder(recordId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("invoiceId" in res && res.invoiceId) {
        setLinkedInvoiceId(res.invoiceId);
        toast.success(
          res.alreadyExists ? "Opening existing invoice" : "Draft invoice created"
        );
        const href = `/accounting/invoices/${res.invoiceId}`;
        router.prefetch(href);
        // SPA client navigation only — never full browser reload.
        router.push(href);
      }
    });
  }

  async function handleSend() {
    startTransition(async () => {
      const id = recordId || (await ensureSaved());
      if (!id) return;
      const res = await prepareSalesQuotationEmail(id, emailTemplateKey);
      if ("email" in res && res.email) {
        setEmailDraft({ subject: res.email.subject, body: res.email.body });
        setPreviewKind("email");
        setPreviewOpen(true);
      }
      const sent = await markSalesQuotationSent(id);
      if (sent.error) {
        toast.error(sent.error);
        return;
      }
      if (sent.quotation) {
        hydrateFromDetail(sent.quotation);
        setChatterKey((k) => k + 1);
      }
      toast.success("Marked as sent");
    });
  }

  async function handleConfirm() {
    startTransition(async () => {
      const id = recordId || (await ensureSaved());
      if (!id) return;
      const res = await confirmSalesQuotation(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.quotation) {
        // In-place status update (Odoo-style) — no route remount / browser reload.
        hydrateFromDetail(res.quotation);
        setPersistedId(res.quotation.id);
        setChatterKey((k) => k + 1);
        toast.success("Sales Order confirmed");
      }
    });
  }

  async function handleDownload() {
    const id = recordId || detail?.id;
    if (!id) {
      startTransition(async () => {
        const savedId = await ensureSaved();
        if (savedId) void runPdf("download");
      });
      return;
    }
    void runPdf("download");
  }

  async function handlePreview() {
    const id = recordId || detail?.id;
    if (!id) {
      startTransition(async () => {
        const savedId = await ensureSaved();
        if (savedId) openPreview("pdf");
      });
      return;
    }
    openPreview("pdf");
  }

  const btnSecondary =
    "h-8 rounded-sm border-slate-200 bg-white font-normal text-primary-dark hover:bg-slate-50";
  const btnPrimary =
    "h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white font-medium";

  return (
    <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden min-h-[calc(100vh-160px)] flex flex-col">
      {/* Odoo-style action row */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-1.5">
          {isSalesOrderDoc ? (
            <>
              <Button
                size="sm"
                className={btnPrimary}
                disabled={isPending || isAdminContext || !recordId}
                onClick={() => void handleCreateInvoice()}
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : linkedInvoiceId ? (
                  "View Invoice"
                ) : (
                  "Create Invoice"
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={btnSecondary}
                disabled={isPending}
                onClick={() => void handleSend()}
              >
                Send
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={btnSecondary}
                disabled={pdfBusy || isPending}
                onClick={() => void handlePreview()}
              >
                Preview
              </Button>
              {showCancel ? (
                <Button
                  size="sm"
                  variant="outline"
                  className={btnSecondary}
                  disabled={isPending}
                  onClick={() =>
                    recordId &&
                    runWorkflow(() => cancelSalesQuotation(recordId))
                  }
                >
                  Cancel
                </Button>
              ) : null}
            </>
          ) : (
            <>
              {!readOnly ? (
                <Button
                  size="sm"
                  className={btnPrimary}
                  disabled={isPending || isAdminContext}
                  onClick={() =>
                    void ensureSaved().then((id) => {
                      if (id) toast.success("Quotation saved as Draft");
                    })
                  }
                >
                  Save
                </Button>
              ) : null}

              {canSend ? (
                <Button
                  size="sm"
                  variant="outline"
                  className={btnSecondary}
                  disabled={isPending || isAdminContext}
                  onClick={() => void handleSend()}
                >
                  Send
                </Button>
              ) : null}

              <Button
                size="sm"
                variant="outline"
                className={btnSecondary}
                disabled={pdfBusy || isPending}
                onClick={() => void handleDownload()}
              >
                Download
              </Button>

              {canConfirm ? (
                <Button
                  size="sm"
                  variant="outline"
                  className={btnSecondary}
                  disabled={isPending || isAdminContext}
                  onClick={() => void handleConfirm()}
                >
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Confirm"
                  )}
                </Button>
              ) : null}

              <Button
                size="sm"
                variant="outline"
                className={btnSecondary}
                disabled={pdfBusy || isPending}
                onClick={() => void handlePreview()}
              >
                Preview
              </Button>

              {showCancel ? (
                <Button
                  size="sm"
                  variant="outline"
                  className={btnSecondary}
                  disabled={isPending}
                  onClick={() =>
                    recordId &&
                    runWorkflow(() => cancelSalesQuotation(recordId))
                  }
                >
                  Cancel
                </Button>
              ) : null}
            </>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className={`${btnSecondary} px-2`}
                aria-label="More actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {!readOnly ? (
                <DropdownMenuItem
                  onClick={() =>
                    void ensureSaved().then((id) => {
                      if (id) toast.success("Saved");
                    })
                  }
                >
                  Save
                </DropdownMenuItem>
              ) : null}
              {quotationId && status === "sales_order" ? (
                <DropdownMenuItem
                  onClick={() =>
                    runWorkflow(() => lockSalesQuotation(quotationId, !isLocked))
                  }
                >
                  {isLocked ? "Unlock" : "Lock"}
                </DropdownMenuItem>
              ) : null}
              {quotationId && status === "quotation_sent" ? (
                <DropdownMenuItem
                  onClick={() =>
                    runWorkflow(() =>
                      markSalesQuotationCustomerReview(quotationId)
                    )
                  }
                >
                  Mark Customer Review
                </DropdownMenuItem>
              ) : null}
              {quotationId &&
              status !== "cancelled" &&
              status !== "sales_order" ? (
                <DropdownMenuItem
                  onClick={() => {
                    setFollowUpSummary("Follow up with customer");
                    setFollowUpOpen(true);
                  }}
                >
                  Schedule Follow-up
                </DropdownMenuItem>
              ) : null}
              {quotationId ? (
                <DropdownMenuItem onClick={() => setHistoryOpen(true)}>
                  <History className="h-3.5 w-3.5 mr-2" />
                  History
                </DropdownMenuItem>
              ) : null}
              {quotationId ? (
                <DropdownMenuItem
                  disabled={isAdminContext}
                  onClick={() => {
                    startTransition(async () => {
                      const res = await duplicateSalesQuotation(quotationId);
                      if ("error" in res && res.error) {
                        toast.error(res.error);
                        return;
                      }
                      if ("quotation" in res && res.quotation) {
                        toast.success("Duplicated");
                        router.push(`/sales/quotations/${res.quotation.id}`);
                      }
                    });
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-2" />
                  Duplicate
                </DropdownMenuItem>
              ) : null}
              {!isSalesOrderDoc ? (
                <DropdownMenuItem
                  disabled={pdfBusy}
                  onClick={() => void handleDownload()}
                >
                  Download PDF
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  disabled={pdfBusy}
                  onClick={() => void handleDownload()}
                >
                  Download PDF
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  router.push(
                    fromToInvoice
                      ? "/sales/to-invoice"
                      : isOrderView
                        ? "/sales/orders"
                        : "/sales/quotations"
                  )
                }
              >
                Back to list
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <SalesQuotationStatusBar
          statusUi={statusUi}
          isLocked={isLocked}
          mode={isSalesOrderDoc ? "order" : "quotation"}
          deliveryStatus={detail?.delivery_status || "waiting"}
        />
      </div>

      {/* Title + compact smart buttons (Odoo sheet header) */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 sm:px-5 pt-4 pb-2">
        <h1 className="text-2xl sm:text-3xl font-semibold text-primary-dark tracking-tight leading-none">
          {title}
        </h1>
        {quotationId ? (
          <div className="flex flex-wrap gap-1.5">
            {opportunityId ? (
              <button
                type="button"
                onClick={() =>
                  router.push(`/crm/opportunities/${opportunityId}`)
                }
                className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left hover:border-[#017e84]/40 min-w-[72px]"
              >
                <div className="text-sm font-semibold text-[#017e84] leading-none">
                  1
                </div>
                <div className="text-[10px] text-secondary-muted mt-0.5">
                  Opportunity
                </div>
              </button>
            ) : null}
            {contactId ? (
              <button
                type="button"
                onClick={() => router.push(`/sales/customers/${contactId}`)}
                className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left hover:border-[#017e84]/40 min-w-[72px]"
              >
                <div className="text-sm font-semibold text-[#017e84] leading-none">
                  <UserRound className="h-4 w-4" />
                </div>
                <div className="text-[10px] text-secondary-muted mt-0.5">
                  Customer
                </div>
              </button>
            ) : null}
            {status === "sales_order" || isOrderView ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => void handleCreateInvoice()}
                className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left hover:border-[#017e84]/40 min-w-[72px]"
              >
                <div className="text-sm font-semibold text-[#017e84] leading-none">
                  {linkedInvoiceId ? 1 : 0}
                </div>
                <div className="text-[10px] text-secondary-muted mt-0.5">
                  Invoice
                </div>
              </button>
            ) : null}
            {isOrderView || status === "sales_order" ? (
              <button
                type="button"
                onClick={() =>
                  router.push(`/sales/quotations/${quotationId}`)
                }
                className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left hover:border-[#017e84]/40 min-w-[72px]"
              >
                <div className="text-sm font-semibold text-[#017e84] leading-none">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="text-[10px] text-secondary-muted mt-0.5">
                  Quotation
                </div>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Form + Chatter */}
      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-auto p-3 sm:p-5 space-y-5 border-b xl:border-b-0 xl:border-r border-slate-200">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-secondary-muted">Customer</Label>
            <CustomerPicker
              contactId={contactId}
              customerName={customerName}
              onSelect={handleCustomerPicked}
              disabled={readOnly}
              inputClassName="h-9 rounded-none border-0 border-b border-[#017e84] bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
            {(
              deliveryOptions.find((o) => o.id === deliveryAddressId)
                ?.address ||
              childOptions.find((o) => o.id === contactId)?.address ||
              null
            ) ? (
              <p className="text-xs text-secondary-muted whitespace-pre-line pt-0.5">
                {deliveryOptions.find((o) => o.id === deliveryAddressId)
                  ?.address ||
                  childOptions.find((o) => o.id === contactId)?.address}
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            {isSalesOrderDoc ? (
              <>
                <div>
                  <Label className="text-xs text-secondary-muted">
                    Order Date
                  </Label>
                  <Input
                    type="date"
                    className="mt-1 h-9 rounded-sm"
                    value={quotationDate}
                    disabled={readOnly}
                    onChange={(e) => setQuotationDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs text-secondary-muted">
                    Payment Terms
                  </Label>
                  <Input
                    className="mt-1 h-9 rounded-sm"
                    value={paymentTerms}
                    disabled={readOnly}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs text-secondary-muted">
                    Promised Delivery
                  </Label>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Input
                      type="date"
                      className="h-9 rounded-sm w-auto min-w-[10.5rem] flex-1"
                      value={expirationDate}
                      disabled={readOnly}
                      onChange={(e) => setExpirationDate(e.target.value)}
                    />
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${deliveryFulfillmentBadgeClass(
                        deliveryFulfillment
                      )}`}
                      title="Based on Delivered vs Quantity on order lines"
                    >
                      {SALES_DELIVERY_FULFILLMENT_LABELS[deliveryFulfillment]}
                    </span>
                  </div>
                  {deliveredValidationError ? (
                    <p className="mt-1 text-xs text-red-600">
                      {deliveredValidationError}
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label className="text-xs text-secondary-muted">
                    Expiration
                  </Label>
                  <Input
                    type="date"
                    className="mt-1 h-9 rounded-sm"
                    value={expirationDate}
                    disabled={readOnly}
                    onChange={(e) => setExpirationDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs text-secondary-muted">
                    Payment Terms
                  </Label>
                  <Input
                    className="mt-1 h-9 rounded-sm"
                    value={paymentTerms}
                    disabled={readOnly}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tabs + tax mode */}
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200">
          <div className="flex gap-4 text-sm">
            {(
              [
                ["lines", "Order Lines"],
                ["other", "Other Info"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`pb-2 border-b-2 -mb-px ${
                  activeTab === id
                    ? "border-[#017e84] text-[#017e84] font-medium"
                    : "border-transparent text-secondary-muted"
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
                    <TableHead className="min-w-[220px] h-9 text-xs font-medium text-secondary-muted">
                      Description
                    </TableHead>
                    <TableHead className="w-24 h-9 text-xs font-medium text-secondary-muted">
                      Quantity
                    </TableHead>
                    {isSalesOrderDoc ? (
                      <>
                        <TableHead className="w-24 text-right h-9 text-xs font-medium text-secondary-muted">
                          Delivered
                        </TableHead>
                        <TableHead className="w-24 text-right h-9 text-xs font-medium text-secondary-muted">
                          Invoiced
                        </TableHead>
                      </>
                    ) : null}
                    <TableHead className="w-28 h-9 text-xs font-medium text-secondary-muted">
                      Unit Price
                    </TableHead>
                    <TableHead className="w-28 h-9 text-xs font-medium text-secondary-muted">
                      Taxes
                    </TableHead>
                    <TableHead className="w-28 text-right h-9 text-xs font-medium text-secondary-muted">
                      Amount
                    </TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => {
                    const lineType = line.display_type || inferLineDisplayType(line);
                    const colSpan = isSalesOrderDoc ? 6 : 4;
                    if (lineType === "line_section") {
                      return (
                        <TableRow key={line.key} className="bg-slate-50/90">
                          <TableCell colSpan={colSpan} className="whitespace-normal py-2">
                            <Input
                              className="h-9 font-semibold border-slate-200 bg-white"
                              value={line.product_name}
                              placeholder="Section title"
                              disabled={readOnly}
                              onChange={(e) =>
                                updateLine(line.key, {
                                  product_name: e.target.value,
                                  description: e.target.value,
                                  display_type: "line_section",
                                })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            {!readOnly ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-secondary-muted"
                                onClick={() => removeLine(line.key)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    }
                    if (lineType === "line_note") {
                      return (
                        <TableRow key={line.key} className="bg-amber-50/50">
                          <TableCell colSpan={colSpan} className="whitespace-normal py-2">
                            <Input
                              className="h-9 italic border-amber-200 bg-white"
                              value={line.description || line.product_name}
                              placeholder="Note..."
                              disabled={readOnly}
                              onChange={(e) =>
                                updateLine(line.key, {
                                  description: e.target.value,
                                  product_name: "Note",
                                  display_type: "line_note",
                                })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            {!readOnly ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-secondary-muted"
                                onClick={() => removeLine(line.key)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    }
                    const qtyNum = parseFloat(line.quantity) || 0;
                    const invoicedQty = linkedInvoiceId ? qtyNum : 0;
                    const taxPct = parseFloat(line.taxes) || 0;
                    const displayPrice = unitPriceForDisplay(
                      parseFloat(line.unit_price) || 0,
                      taxPct,
                      taxMode
                    );
                    const amountShown = lineAmountForTaxMode(line, taxMode);
                    return (
                      <TableRow key={line.key}>
                        <TableCell className="whitespace-normal align-top">
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
                            className="h-8 rounded-sm mt-1 border-0 border-b border-slate-200 shadow-none focus-visible:ring-0 px-0"
                            value={line.description}
                            disabled={readOnly}
                            placeholder="Description"
                            onChange={(e) =>
                              updateLine(line.key, {
                                description: e.target.value,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8 rounded-sm text-[#017e84] tabular-nums"
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.quantity}
                            disabled={readOnly}
                            onChange={(e) =>
                              updateLine(line.key, {
                                quantity: e.target.value,
                              })
                            }
                          />
                        </TableCell>
                        {isSalesOrderDoc ? (
                          <>
                            <TableCell>
                              <Input
                                className="h-8 rounded-sm text-right tabular-nums text-[#017e84]"
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.qty_delivered}
                                disabled={readOnly}
                                aria-invalid={
                                  !!validateDeliveredQuantity(
                                    qtyNum,
                                    parseFloat(line.qty_delivered) || 0
                                  )
                                }
                                onChange={(e) => {
                                  updateLine(line.key, {
                                    qty_delivered: e.target.value,
                                  });
                                }}
                                onBlur={(e) => {
                                  const delivered =
                                    parseFloat(e.target.value) || 0;
                                  const err = validateDeliveredQuantity(
                                    qtyNum,
                                    delivered
                                  );
                                  if (err) toast.error(err);
                                  if (delivered < 0) {
                                    updateLine(line.key, {
                                      qty_delivered: "0",
                                    });
                                  }
                                }}
                              />
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm text-[#017e84]">
                              {invoicedQty.toFixed(2)}
                            </TableCell>
                          </>
                        ) : null}
                        <TableCell>
                          <Input
                            key={`${line.key}-price-${taxMode}`}
                            className="h-8 rounded-sm tabular-nums"
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={displayPrice}
                            disabled={readOnly}
                            onBlur={(e) => {
                              const next = unitPriceFromDisplay(
                                parseFloat(e.target.value) || 0,
                                taxPct,
                                taxMode
                              );
                              updateLine(line.key, {
                                unit_price: String(next),
                              });
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          {readOnly && taxPct > 0 ? (
                            <span className="inline-flex items-center rounded-sm border border-[#017e84]/30 bg-[#017e84]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#017e84]">
                              GST {taxPct}%
                            </span>
                          ) : taxPct > 0 ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center rounded-sm border border-[#017e84]/30 bg-[#017e84]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#017e84]">
                                GST {taxPct}%
                              </span>
                              <Input
                                className="h-7 rounded-sm text-[11px]"
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.taxes}
                                disabled={readOnly}
                                onChange={(e) =>
                                  updateLine(line.key, {
                                    taxes: e.target.value,
                                  })
                                }
                              />
                            </div>
                          ) : (
                            <Input
                              className="h-8 rounded-sm"
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.taxes}
                              disabled={readOnly}
                              placeholder="Tax %"
                              onChange={(e) =>
                                updateLine(line.key, {
                                  taxes: e.target.value,
                                })
                              }
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                          {formatMoney(amountShown)}
                        </TableCell>
                        <TableCell>
                          {!readOnly ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-secondary-muted"
                              onClick={() => removeLine(line.key)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {!readOnly ? (
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <button
                  type="button"
                  className="text-[#017e84] hover:underline font-medium"
                  onClick={() => setLines((prev) => [...prev, newLineDraft()])}
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
                        display_type: "line_section",
                        product_name: "",
                        description: "",
                        quantity: "0",
                        unit_price: "0",
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
                        display_type: "line_note",
                        product_name: "Note",
                        description: "",
                        quantity: "0",
                        unit_price: "0",
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
                    void searchSalesProductsForQuotation("", 40).then((res) => {
                      setCatalogLoading(false);
                      if ("products" in res) {
                        setCatalogProducts(res.products || []);
                      } else {
                        setCatalogProducts([]);
                      }
                    });
                  }}
                >
                  Catalog
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
                  placeholder="Terms and conditions..."
                  className="min-h-[88px] rounded-sm border-slate-200 text-sm"
                />
              </div>
              <div className="w-full sm:w-64 space-y-1.5 text-sm shrink-0">
                <div className="flex justify-between">
                  <span className="text-secondary-muted">Untaxed Amount</span>
                  <span className="tabular-nums font-medium">
                    {formatMoney(totals.untaxed)}
                  </span>
                </div>
                {totals.tax > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-secondary-muted">
                      General Sales Tax
                    </span>
                    <span className="tabular-nums font-medium">
                      {formatMoney(totals.tax)}
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-secondary-muted">Taxes</span>
                    <span className="tabular-nums font-medium">
                      {formatMoney(totals.tax)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-[#017e84]">
                  <span>Total</span>
                  <span className="tabular-nums">
                    {formatMoney(totals.total)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "other" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
            {!isSalesOrderDoc ? (
              <div>
                <Label className="text-xs text-secondary-muted">
                  Quotation Date
                </Label>
                <Input
                  type="date"
                  className="mt-1 h-9 rounded-sm"
                  value={quotationDate}
                  disabled={readOnly}
                  onChange={(e) => setQuotationDate(e.target.value)}
                />
              </div>
            ) : null}
            <div>
              <Label className="text-xs text-secondary-muted">
                Contact Person
              </Label>
              <Select
                value={contactPersonId || undefined}
                onValueChange={(v) => setContactPersonId(v)}
                disabled={readOnly || !contactId}
              >
                <SelectTrigger className="mt-1 h-9 rounded-sm">
                  <SelectValue placeholder="Select contact person" />
                </SelectTrigger>
                <SelectContent>
                  {personOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-secondary-muted">
                Delivery Address
              </Label>
              <Select
                value={deliveryAddressId || undefined}
                onValueChange={(v) => setDeliveryAddressId(v)}
                disabled={readOnly || !contactId}
              >
                <SelectTrigger className="mt-1 h-9 rounded-sm">
                  <SelectValue placeholder="Delivery address" />
                </SelectTrigger>
                <SelectContent>
                  {deliveryOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.name}
                      {opt.address ? ` — ${opt.address}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-secondary-muted">
                Invoice Address
              </Label>
              <Select
                value={invoiceAddressId || undefined}
                onValueChange={(v) => setInvoiceAddressId(v)}
                disabled={readOnly || !contactId}
              >
                <SelectTrigger className="mt-1 h-9 rounded-sm">
                  <SelectValue placeholder="Invoice address" />
                </SelectTrigger>
                <SelectContent>
                  {invoiceOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.name}
                      {opt.address ? ` — ${opt.address}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-secondary-muted">Salesperson</Label>
              <Select
                value={salespersonId || undefined}
                onValueChange={(v) => setSalespersonId(v)}
                disabled={readOnly}
              >
                <SelectTrigger className="mt-1 h-9 rounded-sm">
                  <SelectValue placeholder="Select salesperson" />
                </SelectTrigger>
                <SelectContent>
                  {salespeople.map((sp) => (
                    <SelectItem key={sp.id} value={sp.id}>
                      {sp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-secondary-muted">Sales Team</Label>
              <Input
                className="mt-1 h-9 rounded-sm"
                value={salesTeam}
                disabled={readOnly}
                onChange={(e) => setSalesTeam(e.target.value)}
                placeholder="e.g. Direct Sales"
              />
            </div>
            {isSalesOrderDoc && quotationId ? (
              <div>
                <Label className="text-xs text-secondary-muted">
                  Delivery Status
                </Label>
                <Select
                  value={detail?.delivery_status || "waiting"}
                  disabled={readOnly || isPending}
                  onValueChange={(v) => {
                    runWorkflow(() =>
                      setSalesOrderDeliveryStatus(
                        quotationId,
                        v as "waiting" | "ready" | "delivered"
                      )
                    );
                  }}
                >
                  <SelectTrigger className="mt-1 h-9 rounded-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="waiting">Waiting</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div>
              <Label className="text-xs text-secondary-muted">
                Customer Reference
              </Label>
              <Input
                className="mt-1 h-9 rounded-sm"
                value={customerReference}
                disabled={readOnly}
                onChange={(e) => setCustomerReference(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-secondary-muted">Pricelist</Label>
              <Input
                className="mt-1 h-9 rounded-sm"
                value={pricelist}
                disabled={readOnly}
                onChange={(e) => setPricelist(e.target.value)}
                placeholder="Public Pricelist"
              />
            </div>
            <div>
              <Label className="text-xs text-secondary-muted">
                Fiscal Position
              </Label>
              <Input
                className="mt-1 h-9 rounded-sm"
                value={fiscalPosition}
                disabled={readOnly}
                onChange={(e) => setFiscalPosition(e.target.value)}
                placeholder="Placeholder"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs text-secondary-muted">
                Internal Notes
              </Label>
              <Textarea
                className="mt-1 min-h-[100px] rounded-sm"
                value={internalNotes}
                disabled={readOnly}
                onChange={(e) => setInternalNotes(e.target.value)}
              />
            </div>
          </div>
        ) : null}
        </div>

        <div className="min-h-[520px] xl:min-h-0 bg-slate-50/40">
          <SalesQuotationChatter
            key={chatterKey}
            quotationId={recordId || detail?.id || null}
          />
        </div>
      </div>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#017e84]" />
              {previewKind === "email" ? "Email Preview" : "PDF Preview"}
            </DialogTitle>
          </DialogHeader>
          {previewKind === "pdf" && pdfDataUrl ? (
            <div className="space-y-3">
              <iframe
                title="Quotation PDF"
                src={pdfDataUrl}
                className="w-full h-[70vh] rounded-sm border border-slate-200"
              />
              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  variant="outline"
                  onClick={() => void runPdf("download")}
                  disabled={pdfBusy}
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void runPdf("print")}
                  disabled={pdfBusy}
                >
                  <Printer className="h-4 w-4 mr-1.5" />
                  Print
                </Button>
                <Button variant="outline" onClick={() => setPreviewOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              {emailTemplates.length > 0 ? (
                <div>
                  <Label className="text-xs text-secondary-muted">
                    Email Template
                  </Label>
                  <Select
                    value={emailTemplateKey}
                    onValueChange={(v) => {
                      setEmailTemplateKey(v);
                      if (quotationId) {
                        void prepareSalesQuotationEmail(quotationId, v).then(
                          (res) => {
                            if ("email" in res && res.email) {
                              setEmailDraft({
                                subject: res.email.subject,
                                body: res.email.body,
                              });
                            }
                          }
                        );
                      }
                    }}
                  >
                    <SelectTrigger className="mt-1 h-9 rounded-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {emailTemplates.map((t) => (
                        <SelectItem key={t.template_key} value={t.template_key}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div>
                <Label className="text-xs text-secondary-muted">Subject</Label>
                <p className="mt-1 font-medium text-primary-dark">
                  {emailDraft?.subject || title}
                </p>
              </div>
              <div className="rounded-sm border border-slate-200 bg-slate-50 p-3 whitespace-pre-wrap text-secondary-muted max-h-64 overflow-y-auto">
                {emailDraft?.body ||
                  `Customer: ${customerName || "—"}\nTotal: ${formatMoney(totals.total)}${
                    customerNotes ? `\n\n${customerNotes}` : ""
                  }`}
              </div>
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-sm px-2 py-1.5">
                Email delivery is prepared via templates; SMTP remains a
                placeholder for future integration.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPreviewOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={followUpOpen} onOpenChange={setFollowUpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Follow-up</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-secondary-muted">Type</Label>
              <Select
                value={followUpType}
                onValueChange={(v) =>
                  setFollowUpType(
                    v as "call" | "email" | "meeting" | "follow_up"
                  )
                }
              >
                <SelectTrigger className="mt-1 h-9 rounded-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Call Customer</SelectItem>
                  <SelectItem value="email">Send Email</SelectItem>
                  <SelectItem value="meeting">Schedule Meeting</SelectItem>
                  <SelectItem value="follow_up">Follow-up</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-secondary-muted">Due</Label>
              <Input
                type="date"
                className="mt-1 h-9 rounded-sm"
                value={followUpDue}
                onChange={(e) => setFollowUpDue(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-secondary-muted">Summary</Label>
              <Textarea
                className="mt-1 rounded-sm"
                rows={3}
                value={followUpSummary}
                onChange={(e) => setFollowUpSummary(e.target.value)}
                placeholder="e.g. Call customer about quotation"
              />
            </div>
            <p className="text-[11px] text-secondary-muted">
              Reuses CRM Activities when this quotation is linked to an
              opportunity.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFollowUpOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-[#017e84] hover:bg-[#016970] text-white"
              disabled={isPending}
              onClick={() => void submitFollowUp()}
            >
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version history */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto space-y-2">
            {versions.length === 0 ? (
              <p className="text-sm text-secondary-muted">
                No revisions saved yet. Save the quotation to create history.
              </p>
            ) : (
              versions.map((v) => (
                <div
                  key={v.id}
                  className="rounded-sm border border-slate-200 px-3 py-2 text-sm"
                >
                  <div className="font-medium">Revision {v.revision}</div>
                  <div className="text-xs text-secondary-muted">
                    {v.status || "—"} · {v.created_by || "—"} ·{" "}
                    {v.created_at
                      ? new Date(v.created_at).toLocaleString()
                      : "—"}
                  </div>
                </div>
              ))
            )}
          </div>
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
                              !(
                                l.display_type && l.display_type !== "product"
                              ) && !String(l.product_name || "").trim()
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
                          });
                          if (empty) {
                            return prev.map((l) =>
                              l.key === empty.key
                                ? { ...draft, key: l.key }
                                : l
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
              className="rounded-sm"
              onClick={() => setCatalogOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
