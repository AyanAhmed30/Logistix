"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  getAllInvoices,
  getAllInvoicesForSalesAgent,
  getInvoiceById,
  createManualInvoice,
  updateInvoice,
  deleteInvoice,
  confirmInvoice,
  postInvoice,
  cancelInvoice,
  getInvoiceLogs,
  logInvoicePrint,
  addInvoiceLogNote,
  addInvoiceMessage,
  addInvoiceActivity,
  getCurrentInvoiceUsername,
  type Invoice,
  type InvoiceStatus,
  type InvoiceLog,
} from "@/app/actions/invoices";
import { getSalespersonOptions, searchCustomerContacts } from "@/app/actions/contacts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  Trash2,
  Edit2,
  CheckCircle,
  History,
  Printer,
  Search,
  Upload,
  ChevronDown,
  Plus,
  X,
} from "lucide-react";
import jsPDF from "jspdf";
import { Badge } from "@/components/ui/badge";

function formatStatus(status: InvoiceStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "approved":
      return "Approved";
    case "confirmed":
      return "Confirmed";
    case "posted":
      return "Posted";
    case "partially_paid":
      return "Partially Paid";
    case "paid":
      return "Paid";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function formatPaymentStatus(status: string): string {
  switch (status) {
    case "unpaid":
      return "Unpaid";
    case "paid":
      return "Paid";
    case "partial":
      return "Partial";
    default:
      return status;
  }
}

function getStatusBadgeVariant(status: InvoiceStatus): "default" | "secondary" | "outline" {
  switch (status) {
    case "draft":
      return "outline";
    case "approved":
      return "secondary";
    case "confirmed":
      return "secondary";
    case "posted":
      return "secondary";
    case "partially_paid":
      return "secondary";
    case "paid":
      return "default";
    case "cancelled":
      return "outline";
    default:
      return "outline";
  }
}

type InvoiceFormState = {
  id?: string;
  invoice_number: string;
  customer_name: string;
  product_service: string;
  quantity: string;
  unit_price: string;
  total_amount: string;
  invoice_date: string;
  due_date: string;
};

type InvoiceLineType = "line" | "section" | "note";
type InvoiceLine = {
  id: string;
  type: InvoiceLineType;
  label: string;
  quantity: string;
  unit_price: string;
  taxes: string;
};

const PAYMENT_TERMS_OPTIONS = [
  "Immediate Payment",
  "15 Days",
  "21 Days",
  "30 Days",
  "45 Days",
  "End of Following Month",
  "10 Days after End of Next Month",
  "30% Now, Balance 60 Days",
  "Search more...",
];
const INCOTERM_OPTIONS = [
  "[EXW] EX WORKS",
  "[FCA] FREE CARRIER",
  "[FAS] FREE ALONGSIDE SHIP",
  "[FOB] FREE ON BOARD",
  "[CFR] COST AND FREIGHT",
  "[CIF] COST, INSURANCE AND FREIGHT",
  "[CPT] CARRIAGE PAID TO",
  "[CIP] CARRIAGE AND INSURANCE PAID TO",
  "Search more...",
];
const AUTO_POST_OPTIONS = ["No", "At Date", "Monthly", "Quarterly"];

export type InvoicePanelInitialPayload = {
  invoiceId?: string | null;
  token?: number;
};

export function InvoicePanel({
  salesAgentMode = false,
  initialPayload,
}: {
  salesAgentMode?: boolean;
  initialPayload?: InvoicePanelInitialPayload | null;
} = {}) {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<InvoiceStatus>("draft");
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [logs, setLogs] = useState<InvoiceLog[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [detailTab, setDetailTab] = useState<"invoice_lines" | "other_info" | "logs">("invoice_lines");
  const [topTab, setTopTab] = useState<"dashboard" | "customers" | "vendors">("dashboard");
  const [customersMenuOpen, setCustomersMenuOpen] = useState(false);
  const [vendorsMenuOpen, setVendorsMenuOpen] = useState(false);
  const [bankDialogOpen, setBankDialogOpen] = useState(false);
  const [recipientBankDialogOpen, setRecipientBankDialogOpen] = useState(false);
  const [fiscalPositionDialogOpen, setFiscalPositionDialogOpen] = useState(false);
  const [chatterTab, setChatterTab] = useState<"message" | "note" | "activity">("activity");
  const [showComposer, setShowComposer] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [activitySummary, setActivitySummary] = useState("To-Do");
  const [activityDueDate, setActivityDueDate] = useState("");
  const [activityNote, setActivityNote] = useState("");
  const [showAddBankFields, setShowAddBankFields] = useState(false);
  const [bankSearchQuery, setBankSearchQuery] = useState("");
  const [bankForm, setBankForm] = useState({
    accountNumber: "",
    bankName: "",
    swiftCode: "",
  });
  const [formState, setFormState] = useState<InvoiceFormState>({
    invoice_number: "",
    customer_name: "",
    product_service: "",
    quantity: "",
    unit_price: "",
    total_amount: "",
    invoice_date: "",
    due_date: "",
  });
  const [paymentTerms, setPaymentTerms] = useState("Immediate Payment");
  const [customerOptions, setCustomerOptions] = useState<
    Array<{ id: string; name: string; email: string | null; phone: string | null }>
  >([]);
  const [salespersonOptions, setSalespersonOptions] = useState<Array<{ id: string; name: string; email: string | null }>>([]);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [otherInfo, setOtherInfo] = useState({
    customer_reference: "",
    salesperson: "",
    recipient_bank: "",
    payment_reference: "",
    delivery_date: "",
    incoterm: "",
    incoterm_location: "",
    fiscal_position: "",
    payment_method: "",
    auto_post: "No",
  });
  const [recipientBankForm, setRecipientBankForm] = useState({
    account_number: "",
    clearing_number: "",
    bic_swift: "",
    holder_name: "",
    bank_name: "",
    bank_street_1: "",
    bank_street_2: "",
    bank_city: "",
    bank_state: "",
    bank_zip: "",
    bank_country: "",
  });
  const [fiscalPositionName, setFiscalPositionName] = useState("");
  const [fiscalPositionDetectAutomatically, setFiscalPositionDetectAutomatically] = useState(false);
  const [fiscalPositionForeignTaxId, setFiscalPositionForeignTaxId] = useState("");
  const [fiscalPositionCountry, setFiscalPositionCountry] = useState("");
  const [fiscalPositionLegalNotes, setFiscalPositionLegalNotes] = useState("");

  useEffect(() => {
    fetchInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    function handleWindowClick() {
      setCustomersMenuOpen(false);
      setVendorsMenuOpen(false);
    }
    window.addEventListener("click", handleWindowClick);
    return () => window.removeEventListener("click", handleWindowClick);
  }, []);

  useEffect(() => {
    if (!formOpen) return;
    searchCustomerContacts("").then((res) => {
      Promise.resolve().then(() => {
        if ("contacts" in res && res.contacts) {
          setCustomerOptions(
            res.contacts.map((c) => ({
              id: c.id,
              name: c.name,
              email: c.email,
              phone: c.phone,
            }))
          );
        }
      });
    });
    getSalespersonOptions().then((res) => {
      Promise.resolve().then(() => {
        if ("salespersons" in res && res.salespersons) {
          setSalespersonOptions(res.salespersons);
        }
      });
    });
  }, [formOpen]);

  useEffect(() => {
    if (!formOpen || !!formState.id) return;
    getCurrentInvoiceUsername().then((res) => {
      Promise.resolve().then(() => {
        if ("username" in res && res.username) {
          setOtherInfo((p) => ({ ...p, salesperson: res.username || "" }));
        }
      });
    });
  }, [formOpen, formState.id]);

  // Cross-module "open invoice" support:
  // when we receive an invoice id from Quotation/Contact flows,
  // jump to the right status tab and open the edit/detail dialog.
  useEffect(() => {
    if (!initialPayload?.token || !initialPayload.invoiceId) return;
    getInvoiceById(initialPayload.invoiceId).then((res) => {
      Promise.resolve().then(() => {
        if ("error" in res && res.error) {
          toast.error(res.error);
          return;
        }
        if ("invoice" in res && res.invoice) {
          setActiveTab(res.invoice.invoice_status);
          openEdit(res.invoice);
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPayload?.token]);

  async function fetchInvoices() {
    setIsLoading(true);
    try {
      const result = salesAgentMode
        ? await getAllInvoicesForSalesAgent(activeTab)
        : await getAllInvoices(activeTab);
      if ("error" in result) {
        toast.error(result.error || "Unable to load invoices");
        setInvoices([]);
      } else {
        setInvoices(result.invoices || []);
      }
    } catch {
      toast.error("An unexpected error occurred while loading invoices");
      setInvoices([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function openEdit(invoice: Invoice) {
    setFormState({
      id: invoice.id,
      invoice_number: invoice.invoice_number || "",
      customer_name: invoice.customer_name,
      product_service: invoice.product_service,
      quantity: String(invoice.quantity),
      unit_price: String(invoice.unit_price),
      total_amount: String(invoice.total_amount),
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date || "",
    });
    setLines([
      {
        id: `line-${invoice.id}`,
        type: "line",
        label: invoice.product_service || "",
        quantity: String(invoice.quantity ?? ""),
        unit_price: String(invoice.unit_price ?? ""),
        taxes: "18",
      },
    ]);
    setPaymentTerms("Immediate Payment");
    setOtherInfo({
      customer_reference: "",
      salesperson: invoice.created_by || "",
      recipient_bank: "",
      payment_reference: "",
      delivery_date: "",
      incoterm: "",
      incoterm_location: "",
      fiscal_position: "",
      payment_method: "",
      auto_post: "No",
    });
    setDetailTab("invoice_lines");
    const logsResult = await getInvoiceLogs(invoice.id);
    if ("logs" in logsResult && logsResult.logs) {
      setLogs(logsResult.logs);
    } else {
      setLogs([]);
    }
    setFormOpen(true);
  }

  function handleFormChange<K extends keyof InvoiceFormState>(key: K, value: string) {
    setFormState((prev) => {
      const updated = { ...prev, [key]: value };
      // Auto-calculate total_amount if quantity or unit_price changes
      if (key === "quantity" || key === "unit_price") {
        const qty = parseFloat(updated.quantity) || 0;
        const price = parseFloat(updated.unit_price) || 0;
        updated.total_amount = (qty * price).toFixed(2);
      }
      return updated;
    });
  }

  function addLine(type: InvoiceLineType) {
    setLines((prev) => [
      ...prev,
      {
        id: `${type}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        type,
        label: "",
        quantity: type === "line" ? "1" : "",
        unit_price: "",
        taxes: type === "line" ? "18" : "",
      },
    ]);
  }

  function updateLine(id: string, key: keyof InvoiceLine, value: string) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [key]: value } : l)));
  }

  const productLines = useMemo(
    () => lines.filter((l) => l.type === "line"),
    [lines]
  );
  const computedTotal = useMemo(() => {
    return productLines.reduce((sum, l) => {
      const qty = Number(l.quantity || 0);
      const price = Number(l.unit_price || 0);
      const tax = Number(l.taxes || 0);
      const lineAmount = qty * price * (1 + tax / 100);
      return sum + (Number.isFinite(lineAmount) ? lineAmount : 0);
    }, 0);
  }, [productLines]);

  useEffect(() => {
    if (!formOpen) return;
    setFormState((prev) => ({
      ...prev,
      total_amount: computedTotal > 0 ? computedTotal.toFixed(2) : prev.total_amount,
      quantity:
        productLines.length > 0 ? String(Number(productLines[0].quantity || 0)) : prev.quantity,
      unit_price:
        productLines.length > 0 ? String(Number(productLines[0].unit_price || 0)) : prev.unit_price,
      product_service:
        productLines.length > 0 ? productLines[0].label || prev.product_service : prev.product_service,
    }));
  }, [computedTotal, productLines, formOpen]);

  function closeInvoiceEditor() {
    setFormOpen(false);
    setFormState({
      invoice_number: "",
      customer_name: "",
      product_service: "",
      quantity: "",
      unit_price: "",
      total_amount: "",
      invoice_date: "",
      due_date: "",
    });
    setLines([]);
    setMessageInput("");
    setNoteInput("");
    setChatterTab("activity");
    setShowComposer(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData();

    if (formState.id) {
      fd.set("id", formState.id);
    }
    fd.set("invoice_number", formState.invoice_number.trim());

    if (!formState.customer_name.trim()) {
      toast.error("Customer is required");
      return;
    }
    if (productLines.length === 0) {
      toast.error("Add at least one invoice line");
      return;
    }

    const first = productLines[0];
    const qty = Number(first.quantity || 0);
    const unit = Number(first.unit_price || 0);
    if (qty <= 0 || unit <= 0) {
      toast.error("Quantity and unit price must be greater than zero");
      return;
    }

    fd.set("customer_name", formState.customer_name.trim());
    fd.set("product_service", first.label.trim() || "Invoice line");
    fd.set("quantity", String(qty));
    fd.set("unit_price", String(unit));
    fd.set("total_amount", String(computedTotal > 0 ? computedTotal : qty * unit));
    fd.set("invoice_date", formState.invoice_date);
    fd.set("due_date", formState.due_date || "");

    startTransition(async () => {
      const result = formState.id
        ? await updateInvoice(fd)
        : await createManualInvoice(fd);

      if ("error" in result) {
        toast.error(result.error || "Unable to save invoice");
        return;
      }

      toast.success(formState.id ? "Invoice updated" : "Invoice created", {
        className: "bg-green-500 text-white border-green-500",
      });
      closeInvoiceEditor();
      await fetchInvoices();
      router.refresh();
    });
  }

  async function refreshCurrentInvoiceLogs() {
    if (!formState.id) return;
    const logsResult = await getInvoiceLogs(formState.id);
    if ("logs" in logsResult && logsResult.logs) setLogs(logsResult.logs);
  }

  async function handleSendMessage() {
    if (!formState.id) {
      toast.error("Save invoice first, then send message.");
      return;
    }
    if (!messageInput.trim()) {
      toast.error("Message cannot be empty.");
      return;
    }
    startTransition(async () => {
      const res = await addInvoiceMessage(formState.id!, messageInput);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      setMessageInput("");
      await refreshCurrentInvoiceLogs();
      toast.success("Message posted");
    });
  }

  async function handleLogNote() {
    if (!formState.id) {
      toast.error("Save invoice first, then log note.");
      return;
    }
    if (!noteInput.trim()) {
      toast.error("Note cannot be empty.");
      return;
    }
    startTransition(async () => {
      const res = await addInvoiceLogNote(formState.id!, noteInput);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      setNoteInput("");
      await refreshCurrentInvoiceLogs();
      toast.success("Internal note logged");
    });
  }

  async function handleSaveActivity() {
    if (!formState.id) {
      toast.error("Save invoice first, then schedule activity.");
      return;
    }
    if (!activitySummary.trim()) {
      toast.error("Activity summary is required.");
      return;
    }
    startTransition(async () => {
      const detail = activityNote.trim() ? `${activitySummary}: ${activityNote}` : activitySummary;
      const res = await addInvoiceActivity(formState.id!, detail, activityDueDate || null);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      setActivityModalOpen(false);
      setActivityNote("");
      setActivitySummary("To-Do");
      await refreshCurrentInvoiceLogs();
      toast.success("Activity scheduled");
    });
  }

  function confirmDelete(invoice: Invoice) {
    setDeleteTarget(invoice);
    setDeleteOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    startTransition(async () => {
      const result = await deleteInvoice(deleteTarget.id);
      if ("error" in result) {
        toast.error(result.error || "Unable to delete invoice");
        return;
      }
      toast.success("Invoice deleted", {
        className: "bg-green-500 text-white border-green-500",
      });
      setDeleteOpen(false);
      setDeleteTarget(null);
      await fetchInvoices();
      router.refresh();
    });
  }

  async function handleConfirmInvoice(invoice: Invoice) {
    startTransition(async () => {
      const result = await confirmInvoice(invoice.id);
      if ("error" in result) {
        toast.error(result.error || "Unable to confirm invoice");
        return;
      }
      toast.success("Invoice confirmed", {
        className: "bg-green-500 text-white border-green-500",
      });
      await fetchInvoices();
      router.refresh();
    });
  }

  async function handlePostInvoice(invoice: Invoice) {
    startTransition(async () => {
      const result = await postInvoice(invoice.id);
      if ("error" in result) {
        toast.error(result.error || "Unable to post invoice");
        return;
      }
      toast.success("Invoice posted with journal entry", {
        className: "bg-green-500 text-white border-green-500",
      });
      await fetchInvoices();
      router.refresh();
    });
  }

  async function handleCancelInvoice(invoice: Invoice) {
    startTransition(async () => {
      const result = await cancelInvoice(invoice.id);
      if ("error" in result) {
        toast.error(result.error || "Unable to cancel invoice");
        return;
      }
      toast.success("Invoice cancelled", {
        className: "bg-green-500 text-white border-green-500",
      });
      await fetchInvoices();
      router.refresh();
    });
  }

  async function openLogs(invoice: Invoice) {
    setLogsOpen(true);
    const result = await getInvoiceLogs(invoice.id);
    if ("error" in result) {
      toast.error(result.error || "Unable to load logs");
      setLogs([]);
    } else {
      setLogs(result.logs || []);
    }
  }

  async function handlePrintInvoice(invoice: Invoice) {
    startTransition(async () => {
      // Log the print action
      await logInvoicePrint(invoice.id);
      
      // Generate and download PDF
      downloadInvoicePdf(invoice);
    });
  }

  function downloadInvoicePdf(invoice: Invoice) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = margin;

    // Header: Company name (top-left)
    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.setTextColor(0, 128, 128); // Teal color
    doc.text("LOGISTIX", margin, y);
    
    // Tagline (top-right)
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(
      "Seamless, Strategic Logistics & Financing",
      pageWidth - margin,
      y,
      { align: "right" }
    );
    y += 8;

    // Company contact details (under logo)
    doc.setFontSize(9);
    const addressLines = [
      "National Incubation Center, NED University, Karachi,",
      "Karachi City, Sindh 75270",
    ];
    addressLines.forEach((line) => {
      doc.text(line, margin, y);
      y += 5;
    });
    y += 10;

    // Document Title: INVOICE
    doc.setFontSize(18);
    doc.setFont(undefined, "bold");
    doc.setTextColor(0, 128, 128);
    doc.text("INVOICE", pageWidth / 2, y, { align: "center" });
    y += 10;

    // Invoice Number and Date
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(`Invoice Number: ${invoice.invoice_number}`, margin, y);
    const invoiceDate = new Date(invoice.invoice_date).toLocaleDateString();
    doc.text(`Invoice Date: ${invoiceDate}`, pageWidth - margin, y, { align: "right" });
    y += 12;

    // Customer Details Section
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text("Customer Details:", margin, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text(`Customer Name: ${invoice.customer_name}`, margin + 5, y);
    y += 6;
    doc.text("Customer Contact: [To be filled]", margin + 5, y);
    y += 10;

    // Horizontal line
    doc.setDrawColor(200);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // Product/Service Table Header
    doc.setFontSize(10);
    doc.setFont(undefined, "bold");
    const descX = margin;
    const qtyX = margin + 90;
    const unitX = margin + 130;
    const totalX = pageWidth - margin;
    
    doc.text("Product/Service", descX, y);
    doc.text("Quantity", qtyX, y);
    doc.text("Unit Price", unitX, y);
    doc.text("Total Amount", totalX, y, { align: "right" });
    y += 6;

    // Table line
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    y += 7;

    // Product/Service Row
    doc.setFont(undefined, "normal");
    doc.text(invoice.product_service, descX, y);
    doc.text(String(invoice.quantity), qtyX, y);
    doc.text(`Rs. ${invoice.unit_price.toFixed(2)}`, unitX, y);
    doc.text(`Rs. ${invoice.total_amount.toFixed(2)}`, totalX, y, { align: "right" });
    y += 10;

    // Bottom line
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // Total Amount (right-aligned)
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("Total Amount:", pageWidth - margin - 50, y);
    doc.text(`Rs. ${invoice.total_amount.toFixed(2)}`, totalX, y, { align: "right" });
    y += 12;

    // Payment Status and Invoice Status
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text(`Payment Status: ${formatPaymentStatus(invoice.payment_status)}`, margin, y);
    y += 6;
    doc.text(`Invoice Status: ${formatStatus(invoice.invoice_status)}`, margin, y);
    y += 15;

    // Footer Notes
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text("Payment Terms: Net 30 days", margin, y);
    y += 5;
    doc.text("Please make payment to the account details provided.", margin, y);
    y += 5;
    doc.text(`Generated on: ${new Date().toLocaleString()}`, margin, y);

    // Save PDF
    doc.save(`invoice-${invoice.invoice_number}.pdf`);
  }

  const filteredInvoices = useMemo(() => {
    const base = invoices.filter((i) => i.invoice_status === activeTab);
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return base;
    return base.filter((i) =>
      [
        i.invoice_number,
        i.customer_name,
        i.product_service,
        i.created_by,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [invoices, activeTab, searchQuery]);

  useEffect(() => {
    if (!formOpen || !formState.id) return;
    getInvoiceLogs(formState.id).then((res) => {
      Promise.resolve().then(() => {
        if ("logs" in res && res.logs) setLogs(res.logs);
      });
    });
  }, [formOpen, formState.id]);

  return (
    <div className="space-y-6 text-white [&_*]:!text-white">
      {!formOpen && (
        <>
      {/* Odoo-like dark invoicing dashboard header + cards */}
      <div className="bg-[#1f2435] border border-[#30364a] rounded-lg p-3 md:p-4 space-y-4 text-slate-100">
        <div className="flex items-center gap-2 text-xl font-semibold">Invoicing</div>

        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setTopTab("dashboard")}
            className={`px-3 py-1.5 rounded-md border ${
              topTab === "dashboard"
                ? "border-cyan-500 text-cyan-300 bg-[#25304a]"
                : "border-transparent text-slate-200 hover:text-white"
            }`}
          >
            Dashboard
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCustomersMenuOpen((v) => !v);
                setVendorsMenuOpen(false);
                setTopTab("customers");
              }}
              className={`px-3 py-1.5 rounded-md border inline-flex items-center gap-1 ${
                topTab === "customers"
                  ? "border-cyan-500 text-cyan-300 bg-[#25304a]"
                  : "border-transparent text-slate-200 hover:text-white"
              }`}
            >
              Customers <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {customersMenuOpen && (
              <div
                className="absolute z-20 mt-1 w-44 rounded-md border border-[#5a6176] bg-[#3b3f4f] py-1 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                {["Invoices", "Credit Notes", "Payments", "Products", "Customers"].map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="w-full px-4 py-1.5 text-left text-slate-100 hover:bg-[#4c5263] text-sm"
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setVendorsMenuOpen((v) => !v);
                setCustomersMenuOpen(false);
                setTopTab("vendors");
              }}
              className={`px-3 py-1.5 rounded-md border inline-flex items-center gap-1 ${
                topTab === "vendors"
                  ? "border-cyan-500 text-cyan-300 bg-[#25304a]"
                  : "border-transparent text-slate-200 hover:text-white"
              }`}
            >
              Vendors <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {vendorsMenuOpen && (
              <div
                className="absolute z-20 mt-1 w-44 rounded-md border border-[#5a6176] bg-[#3b3f4f] py-1 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                {["Bills", "Refunds", "Payments", "Products", "Vendors"].map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="w-full px-4 py-1.5 text-left text-slate-100 hover:bg-[#4c5263] text-sm"
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-2xl font-semibold">Dashboard</div>
          <div className="relative w-full max-w-lg">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="pl-8 bg-[#22283a] border-[#3f475e] text-slate-100 placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          <Card className="bg-[#232a3d] border-[#3a4157] rounded-none">
            <CardContent className="p-4">
              <div className="text-cyan-400 text-3xl leading-none font-semibold">Sales</div>
              <p className="text-slate-300 mt-1 text-base">Get Paid online. Send electronic invoices.</p>
              <div className="mt-3">
                <button
                  type="button"
                  className="bg-[#8c4f82] hover:bg-[#9a5d8f] text-white font-semibold text-base px-4 py-1.5 rounded-md"
                  onClick={() => {
                    setFormState({
                      id: undefined,
                      invoice_number: "",
                      customer_name: "",
                      product_service: "",
                      quantity: "1",
                      unit_price: "0",
                      total_amount: "0",
                      invoice_date: new Date().toISOString().split("T")[0],
                      due_date: new Date().toISOString().split("T")[0],
                    });
                    setLines([
                      {
                        id: `line-${Date.now()}`,
                        type: "line",
                        label: "",
                        quantity: "1",
                        unit_price: "",
                        taxes: "18",
                      },
                    ]);
                    setPaymentTerms("Immediate Payment");
                    setOtherInfo({
                      customer_reference: "",
                      salesperson: "",
                      recipient_bank: "",
                      payment_reference: "",
                      delivery_date: "",
                      incoterm: "",
                      incoterm_location: "",
                      fiscal_position: "",
                      payment_method: "",
                      auto_post: "No",
                    });
                    setLogs([]);
                    setDetailTab("invoice_lines");
                    setFormOpen(true);
                  }}
                >
                  New
                </button>
              </div>
              <div className="mt-4 grid grid-cols-6 gap-3 h-32 items-end">
                {[70, 52, 30, 9, 56, 60].map((h, i) => (
                  <div
                    key={i}
                    className="bg-[#666c7f]/50 border border-[#6c7388]/20"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#232a3d] border-[#3a4157] rounded-none">
            <CardContent className="p-4">
              <div className="text-cyan-400 text-3xl leading-none font-semibold">Purchases</div>
              <p className="text-slate-300 mt-1 text-base">purchases@lodfg1.odoo.com</p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  className="bg-[#8c4f82] hover:bg-[#9a5d8f] text-white font-semibold text-base px-4 py-1.5 rounded-md inline-flex items-center"
                >
                  <Upload className="h-4 w-4 mr-1" /> Upload
                </button>
                <button
                  type="button"
                  className="bg-[#4b5165] hover:bg-[#575f76] text-white font-semibold text-base px-4 py-1.5 rounded-md"
                >
                  New
                </button>
                <div className="ml-auto flex items-center gap-6 text-base">
                  <span className="text-cyan-400">1 To Validate</span>
                  <span className="text-slate-100">500.00 Rs.</span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-6 gap-3 h-32 items-end">
                {[38, 68, 44, 16, 40, 34].map((h, i) => (
                  <div
                    key={i}
                    className="bg-[#666c7f]/50 border border-[#6c7388]/20"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-[#232a3d] border-[#3a4157] rounded-none">
          <CardContent className="p-4">
            <div className="text-cyan-400 text-3xl leading-none font-semibold">Bank</div>
            <p className="text-slate-300 mt-1 text-base">Connect your bank. Match invoices automatically.</p>

            <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-1.5">
              {[
                "Search over 26 000 banks",
                "Standard",
                "Belfius",
                "ING",
                "KBC",
                "CBC",
                "CHASE",
                "CaixaBank",
                "Crelan",
                "BNP Paribas",
              ].map((bank, i) => (
                <button
                  key={bank}
                  type="button"
                  onClick={() => {
                    if (i === 0) {
                      setBankDialogOpen(true);
                    }
                  }}
                  className={`h-24 border rounded-sm text-base font-medium ${
                    i === 0
                      ? "bg-[#8c4f82] text-white border-[#8c4f82]"
                      : "bg-[#666c7f] text-slate-900 border-[#50576f]"
                  }`}
                >
                  {bank}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b overflow-x-auto">
        <Button
          variant={activeTab === "draft" ? "default" : "ghost"}
          onClick={() => setActiveTab("draft")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeTab === "draft" ? "default" : "outline"}
        >
          <span className="sidebar-text">Draft</span>
        </Button>
        <Button
          variant={activeTab === "approved" ? "default" : "ghost"}
          onClick={() => setActiveTab("approved")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeTab === "approved" ? "default" : "outline"}
        >
          <span className="sidebar-text">Approved</span>
        </Button>
        <Button
          variant={activeTab === "partially_paid" ? "default" : "ghost"}
          onClick={() => setActiveTab("partially_paid")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeTab === "partially_paid" ? "default" : "outline"}
        >
          <span className="sidebar-text">Partially Paid</span>
        </Button>
        <Button
          variant={activeTab === "posted" ? "default" : "ghost"}
          onClick={() => setActiveTab("posted")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeTab === "posted" ? "default" : "outline"}
        >
          <span className="sidebar-text">Posted</span>
        </Button>
        <Button
          variant={activeTab === "cancelled" ? "default" : "ghost"}
          onClick={() => setActiveTab("cancelled")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeTab === "cancelled" ? "default" : "outline"}
        >
          <span className="sidebar-text">Cancelled</span>
        </Button>
        <Button
          variant={activeTab === "paid" ? "default" : "ghost"}
          onClick={() => setActiveTab("paid")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeTab === "paid" ? "default" : "outline"}
        >
          <span className="sidebar-text">Paid</span>
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-secondary-muted">
              Loading invoices...
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="py-16 text-center text-secondary-muted">
              No invoices found in this stage.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice Number</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product/Service</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Total Amount</TableHead>
                    <TableHead>Invoice Date</TableHead>
                    <TableHead>Payment Status</TableHead>
                    <TableHead>Invoice Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-semibold">
                        {invoice.invoice_number}
                      </TableCell>
                      <TableCell>{invoice.customer_name}</TableCell>
                      <TableCell>{invoice.product_service}</TableCell>
                      <TableCell>{invoice.quantity}</TableCell>
                      <TableCell className="font-semibold">
                        Rs. {invoice.total_amount.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {new Date(invoice.invoice_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {formatPaymentStatus(invoice.payment_status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(invoice.invoice_status)}>
                          {formatStatus(invoice.invoice_status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePrintInvoice(invoice)}
                            title="Print Invoice"
                            disabled={isPending}
                          >
                            <Printer className="h-4 w-4 mr-1" />
                            Print
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openLogs(invoice)}
                            title="View History"
                          >
                            <History className="h-4 w-4" />
                          </Button>
                          {invoice.invoice_status === "draft" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEdit(invoice)}
                              >
                                <Edit2 className="h-4 w-4 mr-1" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleConfirmInvoice(invoice)}
                                disabled={isPending}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Confirm Invoice
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCancelInvoice(invoice)}
                                disabled={isPending}
                              >
                                Cancel
                              </Button>
                            </>
                          )}
                          {invoice.invoice_status === "approved" && (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handlePostInvoice(invoice)}
                                disabled={isPending}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Post Invoice
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCancelInvoice(invoice)}
                                disabled={isPending}
                              >
                                Cancel
                              </Button>
                            </>
                          )}
                          {invoice.invoice_status === "posted" && (
                            <span className="text-xs text-secondary-muted">
                              Reconcile through Payments tab
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => confirmDelete(invoice)}
                            disabled={isPending}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
        </>
      )}

      {/* Full-screen Invoice Editor (replaces modal) */}
      {formOpen && (
        <div className="bg-[#1f2435] border border-[#30364a] rounded-lg overflow-hidden [&_*]:!text-white">
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-3">
              <div className="lg:col-span-2 border-r border-[#30364a]">
                <div className="p-4 border-b border-[#30364a] flex items-center justify-between bg-[#191e2d]">
                  <div className="flex items-center gap-2">
                    <Button
                      type="submit"
                      size="sm"
                      className="bg-[#8c4f82] hover:bg-[#9a5d8f] text-white"
                      disabled={isPending}
                    >
                      Confirm
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={closeInvoiceEditor}
                    >
                      Cancel
                    </Button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline">Draft</Badge>
                    <Badge variant="secondary">Posted</Badge>
                  </div>
                </div>

                <div className="p-5 space-y-5 text-slate-100">
                  <div>
                    <div className="text-xs text-slate-200">Customer Invoice</div>
                    <Input
                      value={formState.invoice_number}
                      onChange={(e) => handleFormChange("invoice_number", e.target.value)}
                      placeholder="e.g. INV/2026/00001"
                      className="mt-2 h-14 text-4xl font-semibold bg-[#1f2435] border-[#3f475e] text-slate-200"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="customer_name">Customer *</Label>
                      <select
                        id="customer_name"
                        name="customer_name"
                        value={formState.customer_name}
                        onChange={(e) => handleFormChange("customer_name", e.target.value)}
                        required
                        className="h-10 w-full rounded-md border border-[#3f475e] bg-[#1f2435] px-3 text-slate-100"
                      >
                        <option value="">Search a name or Tax ID...</option>
                        {customerOptions.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                            {c.phone ? ` (${c.phone})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="invoice_date">Invoice Date *</Label>
                      <Input
                        id="invoice_date"
                        name="invoice_date"
                        type="date"
                        value={formState.invoice_date}
                        onChange={(e) => handleFormChange("invoice_date", e.target.value)}
                        required
                        className="bg-[#1f2435] border-[#3f475e] text-slate-100"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="due_date">Due Date</Label>
                      <Input
                        id="due_date"
                        name="due_date"
                        type="date"
                        value={formState.due_date}
                        onChange={(e) => handleFormChange("due_date", e.target.value)}
                        className="bg-[#1f2435] border-[#3f475e] text-slate-100"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Payment Terms</Label>
                      <select
                        value={paymentTerms}
                        onChange={(e) => setPaymentTerms(e.target.value)}
                        className="h-10 w-full rounded-md border border-[#3f475e] bg-[#1f2435] px-3 text-slate-100"
                      >
                        {PAYMENT_TERMS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="flex gap-2 border-b border-[#30364a]">
                      <button
                        type="button"
                        className={`px-3 py-2 text-sm border-b-2 ${
                          detailTab === "invoice_lines"
                            ? "border-[#c45fb4] text-[#d781c6] font-medium"
                            : "border-transparent text-slate-400"
                        }`}
                        onClick={() => setDetailTab("invoice_lines")}
                      >
                        Invoice Lines
                      </button>
                      <button
                        type="button"
                        className={`px-3 py-2 text-sm border-b-2 ${
                          detailTab === "other_info"
                            ? "border-[#c45fb4] text-[#d781c6] font-medium"
                            : "border-transparent text-slate-400"
                        }`}
                        onClick={() => setDetailTab("other_info")}
                      >
                        Other Info
                      </button>
                    </div>

                    {detailTab === "invoice_lines" ? (
                      <div className="pt-4 space-y-3 border border-[#30364a] rounded-sm">
                        <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-[#30364a] text-sm font-semibold text-slate-100">
                          <div className="col-span-5">Label</div>
                          <div className="col-span-2">Price</div>
                          <div className="col-span-2">Taxes</div>
                          <div className="col-span-3 text-right">Amount</div>
                        </div>
                        <div className="px-4 py-2 flex items-center gap-5 text-cyan-400 text-sm">
                          <button type="button" onClick={() => addLine("line")} className="hover:underline">
                            Add a line
                          </button>
                          <button type="button" onClick={() => addLine("section")} className="hover:underline">
                            Add a section
                          </button>
                          <button type="button" onClick={() => addLine("note")} className="hover:underline">
                            Add a note
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              addLine("line");
                              const preset = {
                                label: "Catalog Product",
                                quantity: "1",
                                unit_price: "1000",
                                taxes: "18",
                              };
                              setLines((prev) => {
                                const copy = [...prev];
                                const idx = copy.length - 1;
                                if (idx >= 0) copy[idx] = { ...copy[idx], ...preset };
                                return copy;
                              });
                            }}
                            className="hover:underline"
                          >
                            Catalog
                          </button>
                        </div>
                        <div className="border-t border-[#30364a]" />
                        {lines.length === 0 ? (
                          <div className="px-4 py-8 text-sm text-slate-400">No lines yet.</div>
                        ) : (
                          lines.map((line) => {
                            if (line.type === "section") {
                              return (
                                <div key={line.id} className="px-4 py-2 border-t border-[#30364a]">
                                  <Input
                                    value={line.label}
                                    onChange={(e) => updateLine(line.id, "label", e.target.value)}
                                    placeholder="Section title"
                                    className="bg-[#1f2435] border-[#3f475e] text-slate-100"
                                  />
                                </div>
                              );
                            }
                            if (line.type === "note") {
                              return (
                                <div key={line.id} className="px-4 py-2 border-t border-[#30364a]">
                                  <Input
                                    value={line.label}
                                    onChange={(e) => updateLine(line.id, "label", e.target.value)}
                                    placeholder="Note"
                                    className="bg-[#1f2435] border-[#3f475e] text-slate-100"
                                  />
                                </div>
                              );
                            }
                            const amount =
                              (Number(line.quantity || 0) *
                                Number(line.unit_price || 0) *
                                (1 + Number(line.taxes || 0) / 100)) || 0;
                            return (
                              <div key={line.id} className="grid grid-cols-12 gap-2 px-4 py-2 border-t border-[#30364a]">
                                <div className="col-span-5">
                                  <Input
                                    value={line.label}
                                    onChange={(e) => updateLine(line.id, "label", e.target.value)}
                                    placeholder="Product / Service"
                                    className="bg-[#1f2435] border-[#3f475e] text-slate-100"
                                  />
                                </div>
                                <div className="col-span-2 flex gap-1">
                                  <Input
                                    value={line.quantity}
                                    onChange={(e) => updateLine(line.id, "quantity", e.target.value)}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="bg-[#1f2435] border-[#3f475e] text-slate-100"
                                  />
                                  <Input
                                    value={line.unit_price}
                                    onChange={(e) => updateLine(line.id, "unit_price", e.target.value)}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="bg-[#1f2435] border-[#3f475e] text-slate-100"
                                  />
                                </div>
                                <div className="col-span-2">
                                  <Input
                                    value={line.taxes}
                                    onChange={(e) => updateLine(line.id, "taxes", e.target.value)}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="bg-[#1f2435] border-[#3f475e] text-slate-100"
                                  />
                                </div>
                                <div className="col-span-3 text-right text-slate-100 py-2">
                                  {amount.toFixed(2)}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    ) : (
                      <div className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-200">
                        <div className="space-y-3">
                          <div className="font-semibold text-xs text-slate-200">INVOICE</div>
                          <div>
                            <Label className="text-xs">Customer Reference</Label>
                            <Input
                              value={otherInfo.customer_reference}
                              onChange={(e) => setOtherInfo((p) => ({ ...p, customer_reference: e.target.value }))}
                              className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Salesperson</Label>
                            <select
                              value={otherInfo.salesperson}
                              onChange={(e) => setOtherInfo((p) => ({ ...p, salesperson: e.target.value }))}
                              className="mt-1 h-10 w-full rounded-md border border-[#3f475e] bg-[#1f2435] px-3 text-slate-100"
                            >
                              <option value="">Select salesperson</option>
                              {salespersonOptions.map((sp) => (
                                <option key={sp.id} value={sp.name}>
                                  {sp.name}
                                  {sp.email ? ` (${sp.email})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <Label className="text-xs">Recipient Bank</Label>
                            <div className="mt-1">
                              <select
                                value={otherInfo.recipient_bank}
                                onChange={(e) => {
                                  const next = e.target.value;
                                  if (next === "create") {
                                    setRecipientBankDialogOpen(true);
                                    return;
                                  }
                                  setOtherInfo((p) => ({ ...p, recipient_bank: next }));
                                }}
                                className="h-10 w-full rounded-md border border-[#3f475e] bg-[#1f2435] px-3 text-slate-100"
                              >
                                <option value="">Select Recipient Bank</option>
                                {recipientBankForm.holder_name && (
                                  <option value={recipientBankForm.holder_name}>{recipientBankForm.holder_name}</option>
                                )}
                                <option value="create">Create...</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs">Payment Reference</Label>
                            <Input
                              value={otherInfo.payment_reference}
                              onChange={(e) => setOtherInfo((p) => ({ ...p, payment_reference: e.target.value }))}
                              className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Delivery Date</Label>
                            <Input
                              type="date"
                              value={otherInfo.delivery_date}
                              onChange={(e) => setOtherInfo((p) => ({ ...p, delivery_date: e.target.value }))}
                              className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100"
                            />
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="font-semibold text-xs text-slate-200">ACCOUNTING</div>
                          <div>
                            <Label className="text-xs">Incoterm</Label>
                            <select
                              value={otherInfo.incoterm}
                              onChange={(e) => setOtherInfo((p) => ({ ...p, incoterm: e.target.value }))}
                              className="mt-1 h-10 w-full rounded-md border border-[#3f475e] bg-[#1f2435] px-3 text-slate-100"
                            >
                              <option value="">Define a default in the settings</option>
                              {INCOTERM_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <Label className="text-xs">Incoterm Location</Label>
                            <Input
                              value={otherInfo.incoterm_location}
                              onChange={(e) => setOtherInfo((p) => ({ ...p, incoterm_location: e.target.value }))}
                              className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Fiscal Position</Label>
                            <Input
                              value={otherInfo.fiscal_position}
                              onChange={(e) => setOtherInfo((p) => ({ ...p, fiscal_position: e.target.value }))}
                              className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Payment Method</Label>
                            <Input
                              value={otherInfo.payment_method}
                              onChange={(e) => setOtherInfo((p) => ({ ...p, payment_method: e.target.value }))}
                              className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Auto-post</Label>
                            <select
                              value={otherInfo.auto_post}
                              onChange={(e) => setOtherInfo((p) => ({ ...p, auto_post: e.target.value }))}
                              className="mt-1 h-10 w-full rounded-md border border-[#3f475e] bg-[#1f2435] px-3 text-slate-100"
                            >
                              {AUTO_POST_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-[#191e2d]">
                <div className="flex gap-1 mb-3">
                  <Button
                    type="button"
                    size="sm"
                    className={chatterTab === "message" ? "bg-[#8c4f82] hover:bg-[#9a5d8f] text-white" : "bg-[#4b5165] hover:bg-[#596077] text-white border-[#4b5165]"}
                    variant="default"
                    onClick={() => {
                      setChatterTab("message");
                      setShowComposer(true);
                    }}
                  >
                    Send message
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className={chatterTab === "note" ? "bg-[#8c4f82] hover:bg-[#9a5d8f] text-white" : "bg-[#4b5165] hover:bg-[#596077] text-white border-[#4b5165]"}
                    variant="default"
                    onClick={() => {
                      setChatterTab("note");
                      setShowComposer(true);
                    }}
                  >
                    Log note
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className={chatterTab === "activity" ? "bg-[#8c4f82] hover:bg-[#9a5d8f] text-white" : "bg-[#4b5165] hover:bg-[#596077] text-white border-[#4b5165]"}
                    variant="default"
                    onClick={() => {
                      setChatterTab("activity");
                      setShowComposer(false);
                      setActivityModalOpen(true);
                    }}
                  >
                    Activity
                  </Button>
                </div>
                {showComposer && chatterTab === "message" && (
                  <div className="mb-3 space-y-2">
                    <Input
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      placeholder="Write a message..."
                      className="bg-[#1f2435] border-[#3f475e] text-slate-100"
                    />
                    <Button type="button" size="sm" onClick={handleSendMessage} disabled={isPending}>
                      Send
                    </Button>
                  </div>
                )}
                {showComposer && chatterTab === "note" && (
                  <div className="mb-3 space-y-2">
                    <Input
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      placeholder="Log an internal note..."
                      className="bg-[#1f2435] border-[#3f475e] text-slate-100"
                    />
                    <Button type="button" size="sm" onClick={handleLogNote} disabled={isPending}>
                      Log
                    </Button>
                  </div>
                )}
                <div className="max-h-[520px] overflow-y-auto pr-1">
                  {logs.length === 0 ? (
                    <div className="text-sm text-slate-100 mt-3">No activity yet.</div>
                  ) : (
                    logs.map((log, idx) => {
                      const currentDate = new Date(log.performed_at).toDateString();
                      const previousDate = idx > 0 ? new Date(logs[idx - 1].performed_at).toDateString() : null;
                      const showDateDivider = currentDate !== previousDate;
                      const dateLabel =
                        currentDate === new Date().toDateString()
                          ? "Today"
                          : new Date(log.performed_at).toLocaleDateString();
                      const actor = log.performed_by || "User";
                      const actorInitial = actor.charAt(0).toUpperCase();

                      return (
                      <div key={log.id} className="text-slate-100">
                        {showDateDivider && (
                          <div className="my-3 flex items-center gap-2">
                            <div className="h-px flex-1 bg-[#30364a]" />
                            <span className="text-xs text-slate-400">{dateLabel}</span>
                            <div className="h-px flex-1 bg-[#30364a]" />
                          </div>
                        )}
                        <div className="flex items-start gap-2 py-1">
                          <div className="mt-0.5 h-7 w-7 rounded-md bg-orange-500 text-white text-xs font-semibold flex items-center justify-center">
                            {actorInitial}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm text-slate-400">
                              <span className="font-semibold">{actor}</span>{" "}
                              {new Date(log.performed_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                            </div>
                            <div className="font-medium mt-0.5 text-white">
                              {((log.details as { chatter_kind?: string; message?: string; note?: string; summary?: string } | null)?.chatter_kind === "message" &&
                                (log.details as { message?: string }).message) ||
                                ((log.details as { chatter_kind?: string; message?: string; note?: string; summary?: string } | null)?.chatter_kind === "note" &&
                                  (log.details as { note?: string }).note) ||
                                ((log.details as { chatter_kind?: string; message?: string; note?: string; summary?: string } | null)?.chatter_kind === "activity" &&
                                  (log.details as { summary?: string }).summary) ||
                                (log.action === "created" ? "Invoice Created" : log.action.replaceAll("_", " "))}
                            </div>
                          </div>
                        </div>
                      </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Add Bank Account Modal (Bank card first tile) */}
      <Dialog open={bankDialogOpen} onOpenChange={setBankDialogOpen}>
        <DialogContent className="sm:max-w-[760px] p-0 overflow-hidden bg-[#242a3b] border border-[#3a4157] text-white [&_*]:!text-white">
          <DialogHeader className="px-6 py-5 border-b border-[#3a4157]">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-3xl font-semibold">Add a Bank Account</DialogTitle>
              <button
                type="button"
                onClick={() => setBankDialogOpen(false)}
                className="text-slate-400 hover:text-slate-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </DialogHeader>

          <div className="px-6 py-5 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={bankSearchQuery}
                onChange={(e) => setBankSearchQuery(e.target.value)}
                placeholder="Search for an account or a bank institution..."
                className="pl-9 bg-[#242a3b] border-[#4a5268] text-slate-100 placeholder:text-slate-400"
              />
            </div>

            <div className="border border-[#3a4157] rounded-md">
              <button
                type="button"
                onClick={() => setShowAddBankFields((v) => !v)}
                className="w-full flex items-center gap-2 px-4 py-3 hover:bg-[#2b3246] text-left"
              >
                <Plus className="h-4 w-4" />
                <span className="font-medium">Add new bank</span>
              </button>

              {showAddBankFields && (
                <div className="px-4 pb-4 space-y-3 border-t border-[#3a4157]">
                  <p className="text-sm text-slate-300 pt-3">
                    You can import your bank statements in various formats, including CSV, CAMT, OFX, and CODA, or enter them manually.
                  </p>
                  <div>
                    <Label className="text-xs text-slate-200">Account Number</Label>
                    <Input
                      value={bankForm.accountNumber}
                      onChange={(e) => setBankForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
                      placeholder="e.g. BE15485113667630"
                      className="mt-1 bg-[#242a3b] border-[#4a5268] text-slate-100"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-200">Bank</Label>
                    <Input
                      value={bankForm.bankName}
                      onChange={(e) => setBankForm((prev) => ({ ...prev, bankName: e.target.value }))}
                      placeholder="e.g. My Super Bank"
                      className="mt-1 bg-[#242a3b] border-[#4a5268] text-slate-100"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-200">SWIFT Code</Label>
                    <Input
                      value={bankForm.swiftCode}
                      onChange={(e) => setBankForm((prev) => ({ ...prev, swiftCode: e.target.value }))}
                      placeholder="e.g GEBABEBB"
                      className="mt-1 bg-[#242a3b] border-[#4a5268] text-slate-100"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-[#3a4157] flex justify-start gap-2">
            <Button
              type="button"
              className="bg-[#8c4f82] hover:bg-[#9a5d8f] text-white"
              onClick={() => {
                setBankDialogOpen(false);
                setShowAddBankFields(false);
                setBankForm({ accountNumber: "", bankName: "", swiftCode: "" });
              }}
            >
              Connect
            </Button>
            <Button type="button" variant="outline" onClick={() => setBankDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={recipientBankDialogOpen} onOpenChange={setRecipientBankDialogOpen}>
        <DialogContent className="sm:max-w-[880px] p-0 overflow-hidden bg-[#242a3b] border border-[#3a4157] text-white [&_*]:!text-white">
          <DialogHeader className="px-5 py-4 border-b border-[#3a4157]">
            <DialogTitle>Create Recipient Bank</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Account Number</Label><Input value={recipientBankForm.account_number} onChange={(e) => setRecipientBankForm((p) => ({ ...p, account_number: e.target.value }))} className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100" /></div>
              <div><Label>Clearing Number</Label><Input value={recipientBankForm.clearing_number} onChange={(e) => setRecipientBankForm((p) => ({ ...p, clearing_number: e.target.value }))} className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100" /></div>
              <div><Label>BIC/SWIFT</Label><Input value={recipientBankForm.bic_swift} onChange={(e) => setRecipientBankForm((p) => ({ ...p, bic_swift: e.target.value }))} className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100" /></div>
              <div><Label>Holder Name</Label><Input value={recipientBankForm.holder_name} onChange={(e) => setRecipientBankForm((p) => ({ ...p, holder_name: e.target.value }))} className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100" /></div>
            </div>
            <div className="border-t border-[#3a4157] pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Bank Name</Label><Input value={recipientBankForm.bank_name} onChange={(e) => setRecipientBankForm((p) => ({ ...p, bank_name: e.target.value }))} className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100" /></div>
              <div><Label>Street</Label><Input value={recipientBankForm.bank_street_1} onChange={(e) => setRecipientBankForm((p) => ({ ...p, bank_street_1: e.target.value }))} className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100" /></div>
              <div><Label>Street 2</Label><Input value={recipientBankForm.bank_street_2} onChange={(e) => setRecipientBankForm((p) => ({ ...p, bank_street_2: e.target.value }))} className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100" /></div>
              <div><Label>City</Label><Input value={recipientBankForm.bank_city} onChange={(e) => setRecipientBankForm((p) => ({ ...p, bank_city: e.target.value }))} className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100" /></div>
              <div><Label>State</Label><Input value={recipientBankForm.bank_state} onChange={(e) => setRecipientBankForm((p) => ({ ...p, bank_state: e.target.value }))} className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100" /></div>
              <div><Label>ZIP</Label><Input value={recipientBankForm.bank_zip} onChange={(e) => setRecipientBankForm((p) => ({ ...p, bank_zip: e.target.value }))} className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100" /></div>
              <div><Label>Country</Label><Input value={recipientBankForm.bank_country} onChange={(e) => setRecipientBankForm((p) => ({ ...p, bank_country: e.target.value }))} className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100" /></div>
            </div>
          </div>
          <DialogFooter className="px-5 py-4 border-t border-[#3a4157]">
            <Button type="button" className="bg-[#8c4f82] hover:bg-[#9a5d8f] text-white" onClick={() => {
              setOtherInfo((p) => ({ ...p, recipient_bank: recipientBankForm.holder_name || recipientBankForm.bank_name }));
              setRecipientBankDialogOpen(false);
            }}>Save</Button>
            <Button type="button" variant="outline" onClick={() => setRecipientBankDialogOpen(false)}>Discard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fiscalPositionDialogOpen} onOpenChange={setFiscalPositionDialogOpen}>
        <DialogContent className="sm:max-w-[920px] p-0 overflow-hidden bg-[#242a3b] border border-[#3a4157] text-white [&_*]:!text-white">
          <DialogHeader className="px-6 py-4 border-b border-[#3a4157]">
            <DialogTitle>Create Fiscal Position</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label>Fiscal Position</Label>
                <Input
                  value={fiscalPositionName}
                  onChange={(e) => setFiscalPositionName(e.target.value)}
                  className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100"
                />
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Detect Automatically</Label>
                  <input
                    type="checkbox"
                    checked={fiscalPositionDetectAutomatically}
                    onChange={(e) => setFiscalPositionDetectAutomatically(e.target.checked)}
                    className="h-4 w-4 rounded border border-[#3f475e] bg-[#1f2435]"
                  />
                </div>
                <div>
                  <Label>Foreign Tax ID</Label>
                  <Input
                    value={fiscalPositionForeignTaxId}
                    onChange={(e) => setFiscalPositionForeignTaxId(e.target.value)}
                    className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100"
                  />
                </div>
                <div>
                  <Label>Country</Label>
                  <Input
                    value={fiscalPositionCountry}
                    onChange={(e) => setFiscalPositionCountry(e.target.value)}
                    className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100"
                  />
                </div>
              </div>
            </div>
            <div className="mt-6">
              <Label>Legal Notes</Label>
              <textarea
                value={fiscalPositionLegalNotes}
                onChange={(e) => setFiscalPositionLegalNotes(e.target.value)}
                placeholder="Legal Notes..."
                className="mt-1 min-h-[82px] w-full rounded-md border border-[#3f475e] bg-[#1f2435] px-3 py-2 text-slate-100 outline-none"
              />
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-[#3a4157] justify-start">
            <Button type="button" className="bg-[#8c4f82] hover:bg-[#9a5d8f] text-white" onClick={() => {
              if (fiscalPositionName.trim()) setOtherInfo((p) => ({ ...p, fiscal_position: fiscalPositionName.trim() }));
              setFiscalPositionDialogOpen(false);
              setFiscalPositionName("");
              setFiscalPositionDetectAutomatically(false);
              setFiscalPositionForeignTaxId("");
              setFiscalPositionCountry("");
              setFiscalPositionLegalNotes("");
            }}>Create</Button>
            <Button type="button" variant="outline" onClick={() => setFiscalPositionDialogOpen(false)}>Discard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={activityModalOpen} onOpenChange={setActivityModalOpen}>
        <DialogContent className="sm:max-w-[920px] p-0 overflow-hidden bg-[#242a3b] border border-[#3a4157] text-slate-100">
          <DialogHeader className="px-6 py-4 border-b border-[#3a4157]">
            <DialogTitle>Schedule Activity</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-4 space-y-3">
            <div className="flex items-center gap-2">
              {["To-Do", "Email", "Call", "Meeting", "Document"].map((item) => (
                <Button key={item} type="button" size="sm" variant={activitySummary === item ? "default" : "secondary"} onClick={() => setActivitySummary(item)}>
                  {item}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <Label>Summary</Label>
                <Input value={activitySummary} onChange={(e) => setActivitySummary(e.target.value)} className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100" />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={activityDueDate} onChange={(e) => setActivityDueDate(e.target.value)} className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100" />
              </div>
            </div>
            <div>
              <Label>Log a note</Label>
              <Input value={activityNote} onChange={(e) => setActivityNote(e.target.value)} className="mt-1 bg-[#1f2435] border-[#3f475e] text-slate-100" />
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-[#3a4157]">
            <Button type="button" className="bg-[#8c4f82] hover:bg-[#9a5d8f] text-white" onClick={handleSaveActivity} disabled={isPending}>Save</Button>
            <Button type="button" variant="secondary" onClick={() => {
              handleSaveActivity();
            }} disabled={isPending}>Mark Done</Button>
            <Button type="button" variant="outline" onClick={() => setActivityModalOpen(false)}>Discard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Invoice</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this invoice? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
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

      {/* Activity Logs Modal */}
      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Activity History</DialogTitle>
            <DialogDescription>
              Complete activity log for this invoice
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {logs.length === 0 ? (
              <div className="py-8 text-center text-secondary-muted">
                No activity logs found.
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => {
                  const details = log.details as 
                    | { previous?: { quantity?: unknown; unit_price?: unknown; total_amount?: unknown }; new?: { quantity?: unknown; unit_price?: unknown; total_amount?: unknown } }
                    | { quantity?: unknown; unit_price?: unknown; total_amount?: unknown }
                    | null;
                  const hasChanges =
                    log.action === "updated" &&
                    details &&
                    'previous' in details &&
                    'new' in details &&
                    details.previous &&
                    details.new;
                  const isCreatedDetails = log.action === "created" && details && !('previous' in details);

                  return (
                    <div
                      key={log.id}
                      className="border-l-2 border-slate-300 pl-4 py-2 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">
                          {log.action === "created" && "Created"}
                          {log.action === "updated" && "Updated"}
                          {log.action === "deleted" && "Deleted"}
                          {log.action === "status_changed" && "Status Changed"}
                          {log.action === "payment_registered" && "Payment Registered"}
                          {log.action === "printed" && "Invoice Printed"}
                        </span>
                        <span className="text-xs text-secondary-muted">
                          {new Date(log.performed_at).toLocaleString()}
                        </span>
                      </div>
                      {log.action === "status_changed" && (
                        <div className="text-sm text-secondary-muted">
                          {log.previous_status && (
                            <span>
                              From: <strong>{formatStatus(log.previous_status as InvoiceStatus)}</strong>
                            </span>
                          )}
                          {log.previous_status && log.new_status && " → "}
                          {log.new_status && (
                            <span>
                              To: <strong>{formatStatus(log.new_status as InvoiceStatus)}</strong>
                            </span>
                          )}
                        </div>
                      )}
                      {log.action === "payment_registered" && (
                        <div className="text-sm text-secondary-muted">
                          Payment registered - Invoice marked as Paid
                        </div>
                      )}
                      {hasChanges && details && details.previous && details.new && (
                        <div className="text-sm space-y-1 mt-2">
                          {(details.previous.quantity !== details.new.quantity ||
                            details.previous.unit_price !== details.new.unit_price ||
                            details.previous.total_amount !== details.new.total_amount) && (
                            <div className="bg-slate-50 p-2 rounded space-y-1">
                              {details.previous.quantity !== details.new.quantity && (
                                <div className="text-xs">
                                  <span className="text-secondary-muted">Quantity: </span>
                                  <span className="line-through text-red-600">
                                    {String(details.previous.quantity ?? '')}
                                  </span>
                                  {" → "}
                                  <span className="text-green-600 font-semibold">
                                    {String(details.new.quantity ?? '')}
                                  </span>
                                </div>
                              )}
                              {details.previous.unit_price !== details.new.unit_price && (
                                <div className="text-xs">
                                  <span className="text-secondary-muted">Unit Price: </span>
                                  <span className="line-through text-red-600">
                                    Rs. {parseFloat(String(details.previous.unit_price ?? '0')).toFixed(2)}
                                  </span>
                                  {" → "}
                                  <span className="text-green-600 font-semibold">
                                    Rs. {parseFloat(String(details.new.unit_price ?? '0')).toFixed(2)}
                                  </span>
                                </div>
                              )}
                              {details.previous.total_amount !== details.new.total_amount && (
                                <div className="text-xs">
                                  <span className="text-secondary-muted">Total Amount: </span>
                                  <span className="line-through text-red-600">
                                    Rs. {parseFloat(String(details.previous.total_amount ?? '0')).toFixed(2)}
                                  </span>
                                  {" → "}
                                  <span className="text-green-600 font-semibold">
                                    Rs. {parseFloat(String(details.new.total_amount ?? '0')).toFixed(2)}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {isCreatedDetails && (
                        <div className="text-xs text-secondary-muted space-y-0.5 mt-1">
                          <div>Quantity: {String((details as { quantity?: unknown; unit_price?: unknown; total_amount?: unknown }).quantity ?? '')}</div>
                          <div>Unit Price: Rs. {parseFloat(String((details as { quantity?: unknown; unit_price?: unknown; total_amount?: unknown }).unit_price ?? '0')).toFixed(2)}</div>
                          <div>Total Amount: Rs. {parseFloat(String((details as { quantity?: unknown; unit_price?: unknown; total_amount?: unknown }).total_amount ?? '0')).toFixed(2)}</div>
                        </div>
                      )}
                      <div className="text-xs text-secondary-muted">
                        By: {log.performed_by}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
