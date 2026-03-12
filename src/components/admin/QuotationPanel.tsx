"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  createQuotation,
  deleteQuotation,
  getAllQuotations,
  updateQuotation,
  sendQuotation,
  confirmOrder,
  getQuotationLogs,
  logQuotationPrint,
  addQuotationLogNote,
  addQuotationActivity,
  type Quotation,
  type QuotationStatus,
  type QuotationLog,
} from "@/app/actions/quotations";
import {
  createInvoiceFromSalesOrder,
  getInvoiceByQuotationId,
  type Invoice,
} from "@/app/actions/invoices";
import { Card, CardContent } from "@/components/ui/card";
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
  PlusCircle,
  Trash2,
  Edit2,
  Send,
  CheckCircle,
  FileText,
  ExternalLink,
  Printer,
  ArrowLeft,
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  Phone,
  StickyNote,
  CalendarClock,
  Clock,
} from "lucide-react";
import jsPDF from "jspdf";
import { Badge } from "@/components/ui/badge";

// ─── Types ───────────────────────────────────────────────────────────

type ViewMode = "list" | "detail";

type QuotationFormState = {
  customer_name: string;
  product_service: string;
  quantity: string;
  unit_price: string;
  taxes: string;
  uom: string;
  expiration_date: string;
  payment_terms: string;
};

const UOM_OPTIONS = [
  { value: "kg", label: "kg (Kilogram)" },
  { value: "m³", label: "m³ (Cubic Meter)" },
  { value: "pcs / u", label: "pcs / u (Pieces / Units)" },
  { value: "pairs (2u)", label: "pairs (2u)" },
] as const;

const emptyForm: QuotationFormState = {
  customer_name: "",
  product_service: "",
  quantity: "",
  unit_price: "",
  taxes: "17",
  uom: "pcs / u",
  expiration_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  payment_terms: "Immediate",
};

// ─── Helpers ─────────────────────────────────────────────────────────

function formatStatus(status: QuotationStatus): string {
  switch (status) {
    case "quotation": return "Quotation";
    case "quotation_sent": return "Quotation Sent";
    case "sales_order": return "Sales Order";
    default: return status;
  }
}

function getStatusBadgeColor(status: QuotationStatus): string {
  switch (status) {
    case "quotation": return "bg-emerald-100 text-emerald-800 border-emerald-300";
    case "quotation_sent": return "bg-green-100 text-green-800 border-green-400";
    case "sales_order": return "bg-purple-100 text-purple-800 border-purple-300";
    default: return "";
  }
}

function computeAmounts(quantity: string, unitPrice: string, taxes: string) {
  const qty = parseFloat(quantity) || 0;
  const price = parseFloat(unitPrice) || 0;
  const taxRate = parseFloat(taxes) || 0;
  const untaxed = qty * price;
  const tax = untaxed * (taxRate / 100);
  const total = untaxed + tax;
  return { untaxed, tax, total, taxRate };
}

function getQAmounts(q: Quotation) {
  const untaxed = q.quantity * q.unit_price;
  const taxRate = q.taxes || 0;
  const tax = untaxed * (taxRate / 100);
  const total = untaxed + tax;
  return { untaxed, tax, total, taxRate };
}

// ─── Status Stepper Component ────────────────────────────────────────

function StatusStepper({ currentStatus }: { currentStatus: QuotationStatus }) {
  const steps: { key: QuotationStatus; label: string }[] = [
    { key: "quotation", label: "Quotation" },
    { key: "quotation_sent", label: "Quotation Sent" },
    { key: "sales_order", label: "Sales Order" },
  ];

  const currentIdx = steps.findIndex((s) => s.key === currentStatus);

  return (
    <div className="flex items-center">
      {steps.map((step, idx) => {
        const isActive = idx === currentIdx;
        const isPast = idx < currentIdx;
        const isFirst = idx === 0;
        const isLast = idx === steps.length - 1;

        return (
          <div key={step.key} className="flex items-center">
            <div
              className={`
                relative px-4 py-1.5 text-xs font-semibold whitespace-nowrap
                ${isActive
                  ? "bg-teal-600 text-white"
                  : isPast
                    ? "bg-teal-100 text-teal-800"
                    : "bg-slate-100 text-slate-500"
                }
                ${isFirst ? "rounded-l-md" : ""}
                ${isLast ? "rounded-r-md" : ""}
              `}
            >
              {step.label}
            </div>
            {!isLast && (
              <div className={`w-0 h-0 border-t-[14px] border-b-[14px] border-l-[8px] ${
                idx < currentIdx
                  ? "border-t-transparent border-b-transparent border-l-teal-100"
                  : idx === currentIdx
                    ? "border-t-transparent border-b-transparent border-l-teal-600"
                    : "border-t-transparent border-b-transparent border-l-slate-100"
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Log Content Renderer ────────────────────────────────────────────

function renderLogContent(log: QuotationLog) {
  const d = log.details as Record<string, unknown> | null;

  if (log.action === "created") {
    return <p className="text-sm text-slate-500">Creating a new record...</p>;
  }

  if (log.action === "printed") {
    return <p className="text-sm text-slate-500">Quotation Printed</p>;
  }

  if (log.action === "log_note" && d) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-1">
        <div className="flex items-center gap-1.5 mb-1">
          <StickyNote className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-xs font-semibold text-amber-700">Internal Note</span>
        </div>
        <p className="text-sm whitespace-pre-wrap text-slate-700">
          {String(d.note || "")}
        </p>
      </div>
    );
  }

  if (log.action === "activity" && d) {
    const dueDate = d.due_date ? new Date(String(d.due_date)) : null;
    const isPast = dueDate && dueDate < new Date();
    return (
      <div className={`border rounded-lg p-3 mt-1 ${isPast ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-200"}`}>
        <div className="flex items-center gap-1.5 mb-1">
          <CalendarClock className={`h-3.5 w-3.5 ${isPast ? "text-red-600" : "text-blue-600"}`} />
          <span className={`text-xs font-semibold ${isPast ? "text-red-700" : "text-blue-700"}`}>
            Reminder / Task
          </span>
          {dueDate && (
            <span className={`text-xs ml-auto ${isPast ? "text-red-500" : "text-blue-500"}`}>
              Due: {dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          )}
        </div>
        <p className="text-sm whitespace-pre-wrap text-slate-700">
          {String(d.summary || "")}
        </p>
      </div>
    );
  }

  if (log.action === "status_changed") {
    const isWhatsApp = d && d.send_method === "whatsapp";

    if (isWhatsApp) {
      return (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-1 space-y-1">
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-green-600" />
            <span className="text-xs font-semibold text-green-700">Sent via WhatsApp</span>
          </div>
          {typeof d.phone_number === "string" && d.phone_number && (
            <p className="text-xs text-green-700">
              To: {d.phone_number}
            </p>
          )}
          {typeof d.whatsapp_message === "string" && d.whatsapp_message && (
            <div className="text-sm whitespace-pre-wrap text-slate-700 mt-1">
              {d.whatsapp_message}
            </div>
          )}
        </div>
      );
    }

    // Legacy email-based sends (backwards compatibility)
    const hasMessage = d && typeof d.message_subject === "string" && d.message_subject;
    if (hasMessage) {
      return (
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 mt-1 space-y-1">
          <p className="text-xs text-teal-700 italic">
            Subject: {String(d.message_subject)}
          </p>
          {typeof d.message_body === "string" && d.message_body && (
            <div className="text-sm whitespace-pre-wrap text-slate-700">
              {d.message_body}
            </div>
          )}
        </div>
      );
    }

    if (log.new_status === "sales_order") {
      return <p className="text-sm text-slate-500">Sales Order created</p>;
    }

    return (
      <p className="text-sm text-slate-500">
        Status changed to {formatStatus(log.new_status as QuotationStatus)}
      </p>
    );
  }

  if (log.action === "updated" && d) {
    const prev = d.previous as Record<string, unknown> | undefined;
    const next = d.new as Record<string, unknown> | undefined;

    if (prev && next) {
      const changes: { field: string; oldVal: string; newVal: string }[] = [];

      if (prev.total_amount !== next.total_amount) {
        changes.push({
          field: "Total",
          oldVal: `${parseFloat(String(prev.total_amount || 0)).toFixed(2)} Rs.`,
          newVal: `${parseFloat(String(next.total_amount || 0)).toFixed(2)} Rs.`,
        });
      }
      if (prev.quantity !== next.quantity) {
        changes.push({
          field: "Quantity",
          oldVal: String(prev.quantity ?? ""),
          newVal: String(next.quantity ?? ""),
        });
      }
      if (prev.unit_price !== next.unit_price) {
        changes.push({
          field: "Unit Price",
          oldVal: `${parseFloat(String(prev.unit_price || 0)).toFixed(2)} Rs.`,
          newVal: `${parseFloat(String(next.unit_price || 0)).toFixed(2)} Rs.`,
        });
      }
      if (prev.customer_name !== next.customer_name) {
        changes.push({
          field: "Customer",
          oldVal: String(prev.customer_name ?? ""),
          newVal: String(next.customer_name ?? ""),
        });
      }
      if (prev.product_service !== next.product_service) {
        changes.push({
          field: "Product/Service",
          oldVal: String(prev.product_service ?? ""),
          newVal: String(next.product_service ?? ""),
        });
      }
      if (prev.taxes !== next.taxes) {
        changes.push({
          field: "Taxes",
          oldVal: `${parseFloat(String(prev.taxes || 0)).toFixed(0)}%`,
          newVal: `${parseFloat(String(next.taxes || 0)).toFixed(0)}%`,
        });
      }

      if (changes.length > 0) {
        return (
          <div className="space-y-1 mt-1">
            {changes.map((c, i) => (
              <div key={i} className="text-sm">
                <span className="text-slate-400">{c.oldVal}</span>
                <span className="mx-1.5 text-slate-400">→</span>
                <span className="font-semibold text-teal-700">{c.newVal}</span>
                <span className="text-xs text-slate-400 ml-1.5">({c.field})</span>
              </div>
            ))}
          </div>
        );
      }
    }
  }

  return null;
}

// ─── PDF Generator ───────────────────────────────────────────────────

function generateQuotationPdf(q: Quotation) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = margin;

  const qNum = q.quotation_number || `QT-${q.id.substring(0, 8).toUpperCase()}`;
  const amounts = getQAmounts(q);

  // Header
  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.setTextColor(0, 128, 128);
  doc.text("LOGISTIX", margin, y);

  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  doc.setTextColor(0, 0, 0);
  doc.text("Seamless, Strategic Logistics & Financing", pageWidth - margin, y, { align: "right" });
  y += 8;

  doc.setFontSize(9);
  doc.text("National Incubation Center, NED University, Karachi,", margin, y);
  y += 5;
  doc.text("Karachi City, Sindh 75270", margin, y);
  y += 12;

  // Title
  doc.setFontSize(20);
  doc.setFont(undefined, "bold");
  doc.setTextColor(0, 128, 128);
  doc.text(`Quotation # ${qNum}`, pageWidth / 2, y, { align: "center" });
  y += 12;

  // Info
  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  doc.setTextColor(0, 0, 0);
  doc.text(`Customer: ${q.customer_name}`, margin, y);
  doc.text(`Date: ${new Date(q.created_at).toLocaleDateString()}`, pageWidth - margin, y, { align: "right" });
  y += 6;
  if (q.expiration_date) {
    doc.text(`Expiration: ${new Date(q.expiration_date).toLocaleDateString()}`, margin, y);
  }
  doc.text(`Payment Terms: ${q.payment_terms || "Immediate"}`, pageWidth - margin, y, { align: "right" });
  y += 10;

  // Table header
  doc.setDrawColor(200);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  doc.setFont(undefined, "bold");
  const cols = { desc: margin, qty: margin + 65, uom: margin + 90, price: margin + 115, tax: margin + 143, amt: pageWidth - margin };
  doc.text("Product/Service", cols.desc, y);
  doc.text("Quantity", cols.qty, y);
  doc.text("UOM", cols.uom, y);
  doc.text("Unit Price", cols.price, y);
  doc.text("Taxes", cols.tax, y);
  doc.text("Amount", cols.amt, y, { align: "right" });
  y += 5;
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;

  // Table row
  doc.setFont(undefined, "normal");
  doc.text(q.product_service, cols.desc, y);
  doc.text(q.quantity.toFixed(2), cols.qty, y);
  doc.text(q.uom || "pcs / u", cols.uom, y);
  doc.text(q.unit_price.toFixed(2), cols.price, y);
  doc.text(`${q.taxes || 0}%`, cols.tax, y);
  doc.text(`${amounts.untaxed.toFixed(2)} Rs.`, cols.amt, y, { align: "right" });
  y += 10;
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // Amounts
  doc.text("Untaxed Amount:", pageWidth - margin - 55, y);
  doc.setFont(undefined, "bold");
  doc.text(`${amounts.untaxed.toFixed(2)} Rs.`, pageWidth - margin, y, { align: "right" });
  y += 6;

  if (amounts.taxRate > 0) {
    doc.setFont(undefined, "normal");
    doc.text(`Tax ${amounts.taxRate}%:`, pageWidth - margin - 55, y);
    doc.setFont(undefined, "bold");
    doc.text(`${amounts.tax.toFixed(2)} Rs.`, pageWidth - margin, y, { align: "right" });
    y += 6;
  }

  doc.setFontSize(13);
  doc.setFont(undefined, "bold");
  doc.text("Total:", pageWidth - margin - 55, y + 2);
  doc.setTextColor(0, 128, 128);
  doc.text(`${amounts.total.toFixed(2)} Rs.`, pageWidth - margin, y + 2, { align: "right" });
  y += 20;

  // Footer
  doc.setFontSize(8);
  doc.setFont(undefined, "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("This quotation is valid for 30 days from the date of issue.", margin, y);
  y += 5;
  doc.text(`Generated on: ${new Date().toLocaleString()}`, margin, y);

  doc.save(`Quotation - ${qNum}.pdf`);
}

// ─── Main Component ──────────────────────────────────────────────────

export function QuotationPanel() {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("list");
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [isNewMode, setIsNewMode] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [formState, setFormState] = useState<QuotationFormState>(emptyForm);
  const [searchQuery, setSearchQuery] = useState("");
  const [logs, setLogs] = useState<QuotationLog[]>([]);
  const [invoiceMap, setInvoiceMap] = useState<Record<string, Invoice>>({});

  // Send modal (WhatsApp)
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendPhoneNumber, setSendPhoneNumber] = useState("");
  const [sendWhatsAppMessage, setSendWhatsAppMessage] = useState("");

  // Delete modal
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Quotation | null>(null);

  // Right panel active tab
  const [activeRightTab, setActiveRightTab] = useState<"send_message" | "log_note" | "activity">("send_message");

  // Log Note
  const [logNoteText, setLogNoteText] = useState("");

  // Activity / Reminder
  const [activitySummary, setActivitySummary] = useState("");
  const [activityDueDate, setActivityDueDate] = useState("");

  // ─── Computed values ─────────────────────────────────────
  const amounts = computeAmounts(formState.quantity, formState.unit_price, formState.taxes);

  const filteredQuotations = quotations.filter((q) => {
    if (!searchQuery.trim()) return true;
    const search = searchQuery.toLowerCase();
    return (
      (q.quotation_number || "").toLowerCase().includes(search) ||
      q.customer_name.toLowerCase().includes(search) ||
      q.product_service.toLowerCase().includes(search) ||
      q.created_by.toLowerCase().includes(search)
    );
  });

  const currentIndex = selectedQuotation
    ? filteredQuotations.findIndex((q) => q.id === selectedQuotation.id)
    : -1;

  // ─── Data fetching ───────────────────────────────────────

  const fetchQuotations = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getAllQuotations();
      if ("error" in result) {
        toast.error(result.error || "Unable to load quotations");
        setQuotations([]);
      } else {
        setQuotations(result.quotations || []);
      }
    } catch {
      toast.error("An unexpected error occurred while loading quotations");
      setQuotations([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async (quotationId: string) => {
    const result = await getQuotationLogs(quotationId);
    if ("error" in result) {
      setLogs([]);
    } else {
      setLogs(result.logs || []);
    }
  }, []);

  const fetchInvoiceForQuotation = useCallback(async (quotationId: string) => {
    const result = await getInvoiceByQuotationId(quotationId);
    if ("invoice" in result && result.invoice) {
      setInvoiceMap((prev) => ({ ...prev, [quotationId]: result.invoice! }));
    }
  }, []);

  useEffect(() => {
    fetchQuotations();
  }, [fetchQuotations]);

  // ─── Navigation ──────────────────────────────────────────

  function openDetail(quotation: Quotation) {
    setSelectedQuotation(quotation);
    setIsNewMode(false);
    setIsEditMode(false);
    setView("detail");
    fetchLogs(quotation.id);
    if (quotation.status === "sales_order") {
      fetchInvoiceForQuotation(quotation.id);
    }
  }

  function openNew() {
    setSelectedQuotation(null);
    setIsNewMode(true);
    setIsEditMode(true);
    setFormState({ ...emptyForm });
    setLogs([]);
    setView("detail");
  }

  function backToList() {
    setView("list");
    setSelectedQuotation(null);
    setIsNewMode(false);
    setIsEditMode(false);
    setFormState(emptyForm);
    setLogs([]);
    fetchQuotations();
  }

  function navigatePrev() {
    if (currentIndex > 0) {
      openDetail(filteredQuotations[currentIndex - 1]);
    }
  }

  function navigateNext() {
    if (currentIndex < filteredQuotations.length - 1) {
      openDetail(filteredQuotations[currentIndex + 1]);
    }
  }

  function startEdit() {
    if (!selectedQuotation) return;
    const q = selectedQuotation;
    setFormState({
      customer_name: q.customer_name,
      product_service: q.product_service,
      quantity: String(q.quantity),
      unit_price: String(q.unit_price),
      taxes: String(q.taxes || 0),
      uom: q.uom || "pcs / u",
      expiration_date: q.expiration_date || "",
      payment_terms: q.payment_terms || "Immediate",
    });
    setIsEditMode(true);
  }

  // ─── Form handlers ──────────────────────────────────────

  function handleFormChange(key: keyof QuotationFormState, value: string) {
    setFormState((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!formState.customer_name.trim() || !formState.product_service.trim()) {
      toast.error("Customer name and product/service are required");
      return;
    }
    const qty = parseFloat(formState.quantity);
    const price = parseFloat(formState.unit_price);
    if (isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) {
      toast.error("Quantity and unit price must be greater than zero");
      return;
    }

    const fd = new FormData();
    if (selectedQuotation?.id) fd.set("id", selectedQuotation.id);
    fd.set("customer_name", formState.customer_name.trim());
    fd.set("product_service", formState.product_service.trim());
    fd.set("quantity", formState.quantity);
    fd.set("unit_price", formState.unit_price);
    fd.set("taxes", formState.taxes);
    fd.set("uom", formState.uom);
    fd.set("expiration_date", formState.expiration_date);
    fd.set("payment_terms", formState.payment_terms);

    startTransition(async () => {
      const action = selectedQuotation?.id ? updateQuotation : createQuotation;
      const result = await action(fd);

      if ("error" in result) {
        toast.error(result.error || "Failed to save quotation");
        return;
      }

      toast.success(isNewMode ? "Quotation created" : "Quotation updated");
      const q = result.quotation as Quotation;
      setSelectedQuotation(q);
      setIsNewMode(false);
      setIsEditMode(false);
      fetchLogs(q.id);
      fetchQuotations();
      router.refresh();
    });
  }

  // ─── Send handlers ──────────────────────────────────────

  /**
   * Convert a local Pakistani number to international format.
   * 03001234567 → 923001234567
   * 923001234567 → 923001234567 (already international)
   * +923001234567 → 923001234567
   */
  function formatPhoneForWhatsApp(raw: string): string {
    let digits = raw.replace(/[^0-9]/g, "");
    // Pakistani local number starting with 0 (e.g. 03001234567)
    if (digits.startsWith("0") && digits.length === 11) {
      digits = "92" + digits.substring(1);
    }
    return digits;
  }

  function openSendModal() {
    if (!selectedQuotation) return;
    const q = selectedQuotation;
    const qNum = q.quotation_number || "New";
    const amounts = getQAmounts(q);
    setSendPhoneNumber("");
    setSendWhatsAppMessage(
      `*Quotation: ${qNum}*\n\n` +
      `Dear ${q.customer_name},\n\n` +
      `Here are the quotation details:\n` +
      `Product/Service: ${q.product_service}\n` +
      `Quantity: ${q.quantity} ${q.uom || "pcs / u"}\n` +
      `Unit Price: Rs. ${q.unit_price.toFixed(2)}\n` +
      (q.taxes > 0 ? `Tax: ${q.taxes}%\n` : "") +
      `*Total Amount: Rs. ${amounts.total.toFixed(2)}*\n\n` +
      `Do not hesitate to contact us if you have any questions.\n\n` +
      `Thank you for your business!`
    );
    setSendModalOpen(true);
  }

  async function handleSend() {
    if (!selectedQuotation) return;

    if (!sendPhoneNumber.trim()) {
      toast.error("Please enter the customer's WhatsApp number");
      return;
    }

    // Format the phone number (auto-convert 03xx → 923xx)
    const phone = formatPhoneForWhatsApp(sendPhoneNumber);
    if (!phone || phone.length < 10) {
      toast.error("Please enter a valid WhatsApp number (e.g. 03001234567 or 923001234567)");
      return;
    }

    if (!sendWhatsAppMessage.trim()) {
      toast.error("Message cannot be empty");
      return;
    }

    // First: open WhatsApp Web IMMEDIATELY (preserves user-gesture for popup)
    const encodedMsg = encodeURIComponent(sendWhatsAppMessage);
    const waUrl = `https://web.whatsapp.com/send?phone=${phone}&text=${encodedMsg}`;
    window.open(waUrl, "_blank");

    // Close modal and show success
    setSendModalOpen(false);
    toast.success("WhatsApp Web opened — the message is ready, just press Send!");

    // Then: update status + log on the server in background
    startTransition(async () => {
      const result = await sendQuotation(selectedQuotation.id, {
        phone_number: phone,
        whatsapp_message: sendWhatsAppMessage,
      });

      if ("error" in result) {
        toast.error(result.error || "Failed to update quotation status");
        return;
      }

      const res = result as { quotation: Quotation };
      const q = res.quotation;
      setSelectedQuotation(q);
      fetchLogs(q.id);
      fetchQuotations();
      router.refresh();
    });
  }

  // ─── Log Note handler ──────────────────────────────────

  async function handleAddLogNote() {
    if (!selectedQuotation || !logNoteText.trim()) {
      toast.error("Please enter a note");
      return;
    }

    startTransition(async () => {
      const result = await addQuotationLogNote(selectedQuotation.id, logNoteText);
      if ("error" in result) {
        toast.error(result.error || "Failed to add note");
        return;
      }
      toast.success("Note added");
      setLogNoteText("");
      setActiveRightTab("send_message");
      fetchLogs(selectedQuotation.id);
    });
  }

  // ─── Activity handler ──────────────────────────────────

  async function handleAddActivity() {
    if (!selectedQuotation || !activitySummary.trim()) {
      toast.error("Please enter an activity or reminder");
      return;
    }

    startTransition(async () => {
      const result = await addQuotationActivity(
        selectedQuotation.id,
        activitySummary,
        activityDueDate || null
      );
      if ("error" in result) {
        toast.error(result.error || "Failed to add activity");
        return;
      }
      toast.success("Activity added");
      setActivitySummary("");
      setActivityDueDate("");
      setActiveRightTab("send_message");
      fetchLogs(selectedQuotation.id);
    });
  }

  // ─── Print handler ──────────────────────────────────────

  async function handlePrint() {
    if (!selectedQuotation) return;
    startTransition(async () => {
      await logQuotationPrint(selectedQuotation.id);
      generateQuotationPdf(selectedQuotation);
      fetchLogs(selectedQuotation.id);
    });
  }

  // ─── Confirm handler ───────────────────────────────────

  async function handleConfirm() {
    if (!selectedQuotation) return;
    startTransition(async () => {
      const result = await confirmOrder(selectedQuotation.id);
      if ("error" in result) {
        toast.error(result.error || "Failed to confirm order");
        return;
      }
      toast.success("Sales Order confirmed!");
      const q = result.quotation as Quotation;
      setSelectedQuotation(q);
      fetchLogs(q.id);
      fetchQuotations();
      router.refresh();
    });
  }

  // ─── Create Invoice handler ────────────────────────────

  async function handleCreateInvoice() {
    if (!selectedQuotation) return;
    startTransition(async () => {
      const result = await createInvoiceFromSalesOrder(selectedQuotation.id);
      if ("error" in result) {
        toast.error(result.error || "Unable to create invoice");
        return;
      }
      toast.success("Invoice created successfully");
      fetchInvoiceForQuotation(selectedQuotation.id);
      router.refresh();
    });
  }

  // ─── Delete handlers ───────────────────────────────────

  function confirmDelete(quotation: Quotation) {
    setDeleteTarget(quotation);
    setDeleteOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteQuotation(deleteTarget.id);
      if ("error" in result) {
        toast.error(result.error || "Unable to delete quotation");
        return;
      }
      toast.success("Quotation deleted");
      setDeleteOpen(false);
      setDeleteTarget(null);
      if (view === "detail") backToList();
      else fetchQuotations();
      router.refresh();
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  DETAIL VIEW
  // ═══════════════════════════════════════════════════════════════════

  if (view === "detail") {
    const q = selectedQuotation;
    const qAmounts = q ? getQAmounts(q) : { untaxed: 0, tax: 0, total: 0, taxRate: 0 };

    return (
      <div className="space-y-4">
        {/* ─── Top navigation bar ─────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={backToList}
              className="text-teal-600 hover:underline flex items-center gap-1"
            >
              <ArrowLeft className="h-4 w-4" />
              Quotations
            </button>
            <span className="text-slate-400">/</span>
            <span className="font-semibold text-slate-700">
              {q?.quotation_number || "New"}
            </span>
          </div>
          {q && !isNewMode && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>
                {currentIndex + 1} / {filteredQuotations.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={navigatePrev}
                disabled={currentIndex <= 0}
                className="h-7 w-7 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={navigateNext}
                disabled={currentIndex >= filteredQuotations.length - 1}
                className="h-7 w-7 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* ─── Action buttons + Status stepper ────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {isNewMode || isEditMode ? (
              <>
                <Button
                  onClick={handleSave}
                  disabled={isPending}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                  size="sm"
                >
                  {isPending ? "Saving..." : isNewMode ? "Save" : "Save"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditMode(false);
                    if (isNewMode) backToList();
                  }}
                >
                  Discard
                </Button>
              </>
            ) : (
              <>
                {q?.status === "quotation" && (
                  <>
                    <Button
                      size="sm"
                      onClick={openSendModal}
                      className="bg-teal-600 hover:bg-teal-700 text-white"
                    >
                      <Send className="h-3.5 w-3.5 mr-1" /> Send
                    </Button>
                    <Button variant="outline" size="sm" onClick={handlePrint} disabled={isPending}>
                      <Printer className="h-3.5 w-3.5 mr-1" /> Print
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleConfirm} disabled={isPending}>
                      <CheckCircle className="h-3.5 w-3.5 mr-1" /> Confirm
                    </Button>
                  </>
                )}
                {q?.status === "quotation_sent" && (
                  <>
                    <Button
                      size="sm"
                      onClick={handleConfirm}
                      disabled={isPending}
                      className="bg-teal-600 hover:bg-teal-700 text-white"
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1" /> Confirm
                    </Button>
                    <Button variant="outline" size="sm" onClick={handlePrint} disabled={isPending}>
                      <Printer className="h-3.5 w-3.5 mr-1" /> Print
                    </Button>
                    <Button variant="outline" size="sm" onClick={openSendModal}>
                      <Send className="h-3.5 w-3.5 mr-1" /> Send
                    </Button>
                  </>
                )}
                {q?.status === "sales_order" && (
                  <>
                    <Button variant="outline" size="sm" onClick={handlePrint} disabled={isPending}>
                      <Printer className="h-3.5 w-3.5 mr-1" /> Print
                    </Button>
                    {invoiceMap[q.id] ? (
                      <Button variant="outline" size="sm" onClick={() => toast.info(`Invoice: ${invoiceMap[q.id].invoice_number}`)}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> View Invoice
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={handleCreateInvoice}
                        disabled={isPending}
                        className="bg-teal-600 hover:bg-teal-700 text-white"
                      >
                        <FileText className="h-3.5 w-3.5 mr-1" /> Create Invoice
                      </Button>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {q && !isNewMode && <StatusStepper currentStatus={q.status} />}
        </div>

        {/* ─── Main content: Form + Activity ──────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Form area */}
          <div className="lg:col-span-2">
            <Card className="border shadow-sm">
              <CardContent className="p-6 space-y-6">
                {/* Title */}
                <h1 className="text-2xl font-bold text-slate-800">
                  {q?.quotation_number || "New"}
                </h1>

                {/* Customer / Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                  {/* Left column */}
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-slate-500 font-medium">Customer</Label>
                      {isEditMode ? (
                        <Input
                          value={formState.customer_name}
                          onChange={(e) => handleFormChange("customer_name", e.target.value)}
                          placeholder="Type to find a customer..."
                          className="mt-1"
                        />
                      ) : (
                        <div className="font-semibold mt-1 text-slate-800">
                          {q?.customer_name || "-"}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right column */}
                  <div className="space-y-3">
                    <div className="flex items-start gap-6">
                      <div className="flex-1">
                        <Label className="text-xs text-slate-500 font-medium">
                          Expiration
                        </Label>
                        {isEditMode ? (
                          <Input
                            type="date"
                            value={formState.expiration_date}
                            onChange={(e) => handleFormChange("expiration_date", e.target.value)}
                            className="mt-1"
                          />
                        ) : (
                          <div className="mt-1 text-sm text-slate-700">
                            {q?.expiration_date
                              ? new Date(q.expiration_date).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })
                              : "-"}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500 font-medium">
                        Payment Terms
                      </Label>
                      {isEditMode ? (
                        <Input
                          value={formState.payment_terms}
                          onChange={(e) => handleFormChange("payment_terms", e.target.value)}
                          className="mt-1"
                        />
                      ) : (
                        <div className="mt-1 text-sm text-slate-700">
                          {q?.payment_terms || "Immediate"}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Separator */}
                <div className="border-t" />

                {/* Order Lines / Other Info Tabs */}
                <div>
                  <div className="flex gap-6 mb-4 border-b">
                    <span className="text-sm font-semibold text-teal-700 border-b-2 border-teal-600 pb-2 cursor-pointer">
                      Order Lines
                    </span>
                    <span className="text-sm text-slate-400 pb-2 cursor-pointer hover:text-slate-600">
                      Other Info
                    </span>
                  </div>

                  {/* Product Table */}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead className="font-semibold">Product</TableHead>
                          <TableHead className="text-right font-semibold">Quantity</TableHead>
                          <TableHead className="text-center font-semibold">UOM</TableHead>
                          <TableHead className="text-right font-semibold">Unit Price</TableHead>
                          <TableHead className="text-center font-semibold">Taxes</TableHead>
                          <TableHead className="text-right font-semibold">Amount</TableHead>
                          {isEditMode && <TableHead className="w-10" />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isEditMode ? (
                          <TableRow>
                            <TableCell>
                              <Input
                                value={formState.product_service}
                                onChange={(e) =>
                                  handleFormChange("product_service", e.target.value)
                                }
                                placeholder="Enter product/service"
                                className="min-w-[150px]"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={formState.quantity}
                                onChange={(e) => handleFormChange("quantity", e.target.value)}
                                className="text-right w-24"
                                step="0.01"
                                min="0"
                              />
                            </TableCell>
                            <TableCell>
                              <select
                                value={formState.uom}
                                onChange={(e) => handleFormChange("uom", e.target.value)}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              >
                                {UOM_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={formState.unit_price}
                                onChange={(e) => handleFormChange("unit_price", e.target.value)}
                                className="text-right w-28"
                                step="0.01"
                                min="0"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                <Input
                                  type="number"
                                  value={formState.taxes}
                                  onChange={(e) => handleFormChange("taxes", e.target.value)}
                                  className="text-center w-16"
                                  min="0"
                                  max="100"
                                />
                                <span className="text-xs text-slate-500">%</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-semibold whitespace-nowrap">
                              {amounts.untaxed.toFixed(2)} Rs.
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() =>
                                  setFormState((prev) => ({
                                    ...prev,
                                    product_service: "",
                                    quantity: "",
                                    unit_price: "",
                                  }))
                                }
                              >
                                <Trash2 className="h-4 w-4 text-red-400" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ) : q?.product_service ? (
                          <TableRow>
                            <TableCell className="text-slate-800">{q.product_service}</TableCell>
                            <TableCell className="text-right">{q.quantity.toFixed(2)}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="text-xs">
                                {q.uom || "pcs / u"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">{q.unit_price.toFixed(2)}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="text-xs">
                                {q.taxes || 0}%
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {qAmounts.untaxed.toFixed(2)} Rs.
                            </TableCell>
                          </TableRow>
                        ) : (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="text-center text-slate-400 py-6 text-sm"
                            >
                              No products added yet.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Add a product link */}
                  {isEditMode && !formState.product_service && (
                    <div className="flex gap-4 mt-2 pl-4 text-sm">
                      <button
                        className="text-teal-600 hover:underline"
                        onClick={() => {
                          /* product field is already shown in edit mode */
                        }}
                      >
                        Add a product
                      </button>
                    </div>
                  )}
                </div>

                {/* Terms and conditions */}
                <div className="text-sm text-slate-400 italic pt-4">
                  Terms and conditions...
                </div>

                {/* Amount Summary */}
                <div className="flex justify-end border-t pt-4">
                  <div className="space-y-2 text-right min-w-[250px]">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Untaxed Amount:</span>
                      <span className="font-semibold">
                        {isEditMode
                          ? amounts.untaxed.toFixed(2)
                          : qAmounts.untaxed.toFixed(2)}{" "}
                        Rs.
                      </span>
                    </div>
                    {(isEditMode ? parseFloat(formState.taxes) > 0 : (q?.taxes || 0) > 0) && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">
                          Tax {isEditMode ? formState.taxes : q?.taxes || 0}%:
                        </span>
                        <span className="font-semibold">
                          {isEditMode
                            ? amounts.tax.toFixed(2)
                            : qAmounts.tax.toFixed(2)}{" "}
                          Rs.
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-base border-t pt-2">
                      <span className="font-bold">Total:</span>
                      <span className="font-bold text-lg text-teal-700">
                        {isEditMode
                          ? amounts.total.toFixed(2)
                          : qAmounts.total.toFixed(2)}{" "}
                        Rs.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Edit & Delete buttons (always visible in read mode) */}
                {!isNewMode && !isEditMode && q && (
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={startEdit}>
                      <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => confirmDelete(q)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Activity Panel */}
          {q && !isNewMode && (
            <div className="lg:col-span-1 space-y-3">
              {/* Tab buttons */}
              <div className="flex gap-1 flex-wrap">
                <Button
                  size="sm"
                  className={`text-xs h-7 px-3 ${
                    activeRightTab === "send_message"
                      ? "bg-orange-500 hover:bg-orange-600 text-white"
                      : ""
                  }`}
                  variant={activeRightTab === "send_message" ? "default" : "outline"}
                  onClick={() => setActiveRightTab("send_message")}
                >
                  Send message
                </Button>
                <Button
                  size="sm"
                  className={`text-xs h-7 px-3 ${
                    activeRightTab === "log_note"
                      ? "bg-amber-500 hover:bg-amber-600 text-white"
                      : ""
                  }`}
                  variant={activeRightTab === "log_note" ? "default" : "outline"}
                  onClick={() => setActiveRightTab("log_note")}
                >
                  Log note
                </Button>
                <Button
                  size="sm"
                  className={`text-xs h-7 px-3 ${
                    activeRightTab === "activity"
                      ? "bg-blue-500 hover:bg-blue-600 text-white"
                      : ""
                  }`}
                  variant={activeRightTab === "activity" ? "default" : "outline"}
                  onClick={() => setActiveRightTab("activity")}
                >
                  Activity
                </Button>
              </div>

              {/* Log Note Input */}
              {activeRightTab === "log_note" && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <StickyNote className="h-4 w-4 text-amber-600" />
                    <span className="text-xs font-semibold text-amber-700">Add Internal Note</span>
                  </div>
                  <Textarea
                    value={logNoteText}
                    onChange={(e) => setLogNoteText(e.target.value)}
                    placeholder='e.g. "Customer asked for a 5% discount."'
                    rows={3}
                    className="bg-white text-sm resize-none"
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => {
                        setLogNoteText("");
                        setActiveRightTab("send_message");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="bg-amber-500 hover:bg-amber-600 text-white text-xs h-7"
                      onClick={handleAddLogNote}
                      disabled={isPending || !logNoteText.trim()}
                    >
                      {isPending ? "Adding..." : "Add Note"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Activity / Reminder Input */}
              {activeRightTab === "activity" && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <CalendarClock className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-semibold text-blue-700">Schedule Activity / Reminder</span>
                  </div>
                  <Textarea
                    value={activitySummary}
                    onChange={(e) => setActivitySummary(e.target.value)}
                    placeholder='e.g. "Call the customer tomorrow."'
                    rows={2}
                    className="bg-white text-sm resize-none"
                  />
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-blue-500" />
                    <Label className="text-xs text-blue-600">Due Date</Label>
                    <Input
                      type="date"
                      value={activityDueDate}
                      onChange={(e) => setActivityDueDate(e.target.value)}
                      className="bg-white text-sm h-8 flex-1"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => {
                        setActivitySummary("");
                        setActivityDueDate("");
                        setActiveRightTab("send_message");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="bg-blue-500 hover:bg-blue-600 text-white text-xs h-7"
                      onClick={handleAddActivity}
                      disabled={isPending || !activitySummary.trim()}
                    >
                      {isPending ? "Adding..." : "Schedule"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Activity Feed */}
              <div className="space-y-4 max-h-[calc(100vh-420px)] overflow-y-auto pr-1">
                {logs.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">
                    No activity yet.
                  </p>
                ) : (
                  <>
                    <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                      Activity History
                    </div>
                    {logs.map((log) => (
                      <div key={log.id} className="flex gap-3">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center font-semibold text-xs shrink-0 mt-0.5 ${
                          log.action === "log_note"
                            ? "bg-amber-100 text-amber-800"
                            : log.action === "activity"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-teal-100 text-teal-800"
                        }`}>
                          {(log.performed_by || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-slate-700">
                              {log.performed_by}
                            </span>
                            {log.action === "status_changed" &&
                              log.details &&
                              (log.details as Record<string, unknown>).send_method === "whatsapp" && (
                                <Phone className="h-3 w-3 text-green-600 inline" />
                              )}
                            <span className="text-xs text-slate-400">
                              {new Date(log.performed_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {" · "}
                              {new Date(log.performed_at).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                          {renderLogContent(log)}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ─── Send via WhatsApp Modal ─────────────────────────── */}
        <Dialog open={sendModalOpen} onOpenChange={setSendModalOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-green-600" />
                <span>Send Quotation via WhatsApp</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Label className="w-28 text-right text-sm text-slate-500 shrink-0">
                  WhatsApp No.
                </Label>
                <Input
                  value={sendPhoneNumber}
                  onChange={(e) => setSendPhoneNumber(e.target.value)}
                  placeholder="e.g. 03001234567"
                  className="flex-1"
                />
              </div>
              {/* Live preview of formatted number */}
              {sendPhoneNumber.trim() && (
                <div className="pl-[7.5rem] text-xs">
                  <span className="text-slate-400">Will send to: </span>
                  <span className="font-semibold text-green-700">
                    +{formatPhoneForWhatsApp(sendPhoneNumber)}
                  </span>
                  {sendPhoneNumber.replace(/[^0-9]/g, "").startsWith("0") && (
                    <span className="text-blue-500 ml-2">(auto-converted to international format)</span>
                  )}
                </div>
              )}
              {!sendPhoneNumber.trim() && (
                <div className="text-xs text-slate-400 pl-[7.5rem]">
                  Enter the customer&apos;s number (e.g. 03001234567 or 923001234567)
                </div>
              )}
              <div>
                <Label className="text-sm text-slate-500 mb-1 block">Message</Label>
                <Textarea
                  value={sendWhatsAppMessage}
                  onChange={(e) => setSendWhatsAppMessage(e.target.value)}
                  rows={10}
                  className="resize-none font-mono text-sm"
                />
              </div>
              <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 p-2 rounded-md">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span>
                  WhatsApp Web will open with this message pre-filled in the chat. Just press <strong>Enter</strong> or click <strong>Send</strong> to deliver it.
                </span>
              </div>
            </div>
            <DialogFooter className="justify-start gap-2 sm:justify-start">
              <Button
                onClick={handleSend}
                disabled={isPending || !sendPhoneNumber.trim() || !sendWhatsAppMessage.trim()}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Phone className="h-3.5 w-3.5 mr-1" />
                {isPending ? "Opening WhatsApp..." : "Send to WhatsApp"}
              </Button>
              <Button variant="outline" onClick={() => setSendModalOpen(false)} disabled={isPending}>
                Discard
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Delete Modal ───────────────────────────────────── */}
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Quotation</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-500">
              Are you sure you want to delete this quotation? This action cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
                {isPending ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  //  LIST VIEW
  // ═══════════════════════════════════════════════════════════════════

  // Compute total of all displayed quotations
  const displayTotal = filteredQuotations.reduce((sum, q) => sum + q.total_amount, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button
            onClick={openNew}
            className="bg-pink-600 hover:bg-pink-700 text-white"
            size="sm"
          >
            New
          </Button>
          <h1 className="text-xl font-bold text-slate-800">Quotations</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="pl-9 w-60"
            />
          </div>
          <span className="text-sm text-slate-500">
            {filteredQuotations.length} record{filteredQuotations.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Table */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400">Loading quotations...</div>
          ) : filteredQuotations.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              {searchQuery ? "No quotations match your search." : "No quotations found. Click New to create one."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold">Number</TableHead>
                    <TableHead className="font-semibold">Creation Date</TableHead>
                    <TableHead className="font-semibold">Customer</TableHead>
                    <TableHead className="font-semibold">Salesperson</TableHead>
                    <TableHead className="text-center font-semibold">UOM</TableHead>
                    <TableHead className="text-right font-semibold">Total</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQuotations.map((q) => (
                    <TableRow
                      key={q.id}
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => openDetail(q)}
                    >
                      <TableCell className="font-semibold text-teal-700">
                        {q.quotation_number || `QT-${q.id.substring(0, 8)}`}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {new Date(q.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="text-slate-800">{q.customer_name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-purple-100 flex items-center justify-center text-purple-800 text-xs font-semibold">
                            {(q.created_by || "?").charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm text-slate-600">{q.created_by}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-xs">
                          {q.uom || "pcs / u"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-slate-800">
                        {q.total_amount.toFixed(2)} Rs.
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${getStatusBadgeColor(q.status)}`}
                        >
                          {formatStatus(q.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {/* Footer total */}
              <div className="flex justify-end px-6 py-3 border-t bg-slate-50">
                <span className="font-bold text-slate-800">
                  {displayTotal.toFixed(2)} Rs.
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Modal (from list) */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Quotation</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            Are you sure you want to delete this quotation? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
