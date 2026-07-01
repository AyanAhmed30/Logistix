"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useTransition, useCallback } from "react";
import { toast } from "sonner";
import {
  getAllInquiriesForSalesAgent,
  updateInquiryForAccounting,
  getInquiryLogs,
  type LeadInquiryWithLead,
  type InquiryLog,
} from "@/app/actions/inquiries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileText,
  MessageSquare,
  ExternalLink,
  ImageIcon,
  Link2,
  Search,
  RefreshCcw,
  Package,
  ArrowLeft,
} from "lucide-react";
import jsPDF from "jspdf";
import {
  getConfirmationsForInquiry,
  getApprovedPricingForInquiryIds,
  type InquiryConfirmation,
} from "@/app/actions/inquiry_confirmations";
import { sendQuotation, createQuotation } from "@/app/actions/quotations";
import {
  formatFinalAnswer,
  type ApprovedInquiryPricing,
} from "@/lib/inquiry-calculator";
import { SalesAgentFinalRateCard } from "@/components/sales-agent/SalesAgentFinalRateCard";
import {
  classifyInquiryAttachment,
  collectInquiryAttachmentUrls,
} from "@/lib/inquiry-attachments";

function downloadPdfFile(filename: string, base64: string) {
  const link = document.createElement("a");
  link.href = `data:application/pdf;base64,${base64}`;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function formatPhoneForWhatsApp(raw: string): string {
  let digits = (raw || '').replace(/[^0-9]/g, '');
  // Convert local Pakistani 0XXXXXXXXXX to 92XXXXXXXXXX
  if (digits.startsWith('0') && digits.length === 11) {
    digits = '92' + digits.substring(1);
  }
  // Strip leading plus if present
  if (digits.startsWith('+')) digits = digits.substring(1);
  return digits;
}

function loadImageAsDataUrl(path: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg'));
      } else {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = path;
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatStatus(status: string) {
  switch (status) {
    case "pending": return "Pending";
    case "in_progress": return "In Progress";
    case "quotation_sent": return "Quotation Sent";
    case "completed": return "Completed";
    case "approved": return "Approved";
    case "rejected": return "Rejected";
    default: return status;
  }
}

function statusColor(status: string) {
  switch (status) {
    case "pending": return "bg-yellow-50 text-yellow-700 border-yellow-300";
    case "in_progress": return "bg-blue-50 text-blue-700 border-blue-300";
    case "quotation_sent": return "bg-green-50 text-green-700 border-green-300";
    case "completed": return "bg-slate-50 text-slate-700 border-slate-300";
    case "approved": return "bg-emerald-50 text-emerald-700 border-emerald-300";
    case "rejected": return "bg-red-50 text-red-700 border-red-300";
    default: return "";
  }
}

/**
 * Get the effective status for an inquiry by checking the latest confirmation status.
 * If a confirmation exists, its status takes priority over the lead_inquiries.status.
 */
function getEffectiveStatus(inquiry: LeadInquiryWithLead): string {
  const confs = inquiry.inquiry_confirmations;
  if (!confs || confs.length === 0) return inquiry.status;
  const sorted = [...confs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return sorted[0].status;
}

function formatLogAction(action: string) {
  switch (action) {
    case "created": return "Created";
    case "updated": return "Updated";
    case "deleted": return "Deleted";
    case "status_changed": return "Status Changed";
    default: return action;
  }
}

function getLogActionColor(action: string) {
  switch (action) {
    case "created": return "bg-green-100 text-green-700";
    case "updated": return "bg-blue-100 text-blue-700";
    case "deleted": return "bg-red-100 text-red-700";
    case "status_changed": return "bg-purple-100 text-purple-700";
    default: return "bg-slate-100 text-slate-700";
  }
}
function collectDetailImageUrls(
  inquiry: LeadInquiryWithLead,
  confirmations: InquiryConfirmation[] | null
) {
  const urls = new Set<string>();

  const addIfImage = (url?: string | null) => {
    if (!url?.trim()) return;
    const attachment = classifyInquiryAttachment(url.trim());
    if (attachment.kind === "image") {
      urls.add(attachment.url);
    }
  };

  const inquiryUrls = collectInquiryAttachmentUrls(
    inquiry.image_url,
    inquiry.additional_image_urls
  );
  inquiryUrls.forEach(addIfImage);

  const availableConfirmations = (confirmations ?? []) as InquiryConfirmation[];
  const approvedConfirmation =
    availableConfirmations.find((conf) => conf.status === "approved") ||
    availableConfirmations[0] ||
    null;

  if (approvedConfirmation) {
    const confirmationUrls = collectInquiryAttachmentUrls(
      approvedConfirmation.original_image_url,
      approvedConfirmation.sales_additional_image_urls || []
    );
    confirmationUrls.forEach(addIfImage);
    addIfImage(approvedConfirmation.additional_image_1_url);
    addIfImage(approvedConfirmation.additional_image_2_url);
  }

  return Array.from(urls);
}
// ─── Main Component ──────────────────────────────────────────────────

type ViewMode = "list" | "detail";

export function SalesAgentAccountingInquiriesPanel() {
  const [view, setView] = useState<ViewMode>("list");
  const [inquiries, setInquiries] = useState<LeadInquiryWithLead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<LeadInquiryWithLead | null>(null);
  const [, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState("");

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editProductName, setEditProductName] = useState("");
  const [editTotalWeight, setEditTotalWeight] = useState("");
  const [editCbm, setEditCbm] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<string>("");
  const [editLink, setEditLink] = useState("");
  const [confirmationDetails, setConfirmationDetails] = useState<InquiryConfirmation[] | null>(null);
  const [approvedPricing, setApprovedPricing] = useState<ApprovedInquiryPricing | null>(null);

  // Logs
  const [isSendingQuotation, setIsSendingQuotation] = useState(false);

  // ─── Data fetching ──────────────────────────────────────

  const fetchInquiries = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getAllInquiriesForSalesAgent() as {
        inquiries?: LeadInquiryWithLead[];
        error?: string;
      };
      if ("error" in result) {
        toast.error(result.error || "Unable to load inquiries");
        setInquiries([]);
      } else {
        setInquiries(result.inquiries || []);
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async (inquiryId: string) => {
    // Kept to maintain hook structure but no longer sets state
    await getInquiryLogs(inquiryId);
  }, []);

  const fetchConfirmationExtras = useCallback(async (inquiryId: string) => {
    setConfirmationDetails(null);
    setApprovedPricing(null);

    try {
      const [confirmationsResult, pricingResult] = await Promise.all([
        getConfirmationsForInquiry(inquiryId),
        getApprovedPricingForInquiryIds([inquiryId]),
      ]);

      if (!("error" in confirmationsResult)) {
        setConfirmationDetails(confirmationsResult.confirmations || []);
      }

      if (!("error" in pricingResult)) {
        setApprovedPricing(pricingResult.pricing?.[inquiryId] || null);
      }
    } catch {
      setConfirmationDetails(null);
      setApprovedPricing(null);
    }
  }, []);

  async function buildInquiryQuotationPdf(
    inquiry: LeadInquiryWithLead,
    pricing: ApprovedInquiryPricing
  ) {
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 20;
    let y = margin;

    // Header with logo
    const logoDataUrl = await loadImageAsDataUrl("/logo.jpg");
    if (logoDataUrl) {
      pdf.addImage(logoDataUrl, "JPEG", margin, y - 4, 24, 12);
    }
    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(0, 128, 128);
    pdf.text("LOGISTIX", margin + (logoDataUrl ? 28 : 0), y);

    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(0, 0, 0);
    pdf.text("Seamless, Strategic Logistics & Financing", pageWidth - margin, y, { align: "right" });
    y += 8;

    pdf.setFontSize(9);
    pdf.text("National Incubation Center, NED University, Karachi,", margin, y);
    y += 5;
    pdf.text("Karachi City, Sindh 75270", margin, y);
    y += 12;

    // Title
    pdf.setFontSize(20);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(0, 128, 128);
    pdf.text(`Quotation # ${pricing.quotation_number}`, pageWidth / 2, y, { align: "center" });
    y += 12;

    // Client info
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(0, 0, 0);
    pdf.text(`Customer: ${inquiry.leads?.name || "-"}`, margin, y);
    pdf.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth - margin, y, { align: "right" });
    y += 6;
    pdf.text(`Phone: ${inquiry.leads?.number || "-"}`, margin, y);
    pdf.text(`Lead ID: ${inquiry.leads?.lead_id_formatted || "-"}`, pageWidth - margin, y, { align: "right" });
    y += 12;

    // Inquiry details section
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text("Inquiry Details", margin, y);
    y += 8;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(`Product/Service: ${inquiry.product_name || "-"}`, margin, y);
    y += 6;
    if (inquiry.description) {
      const descLines = pdf.splitTextToSize(inquiry.description, pageWidth - 2 * margin);
      pdf.text(`Description:`, margin, y);
      y += 4;
      pdf.text(descLines, margin + 5, y);
      y += descLines.length * 4 + 2;
    }
    pdf.text(`Total Weight: ${inquiry.total_weight || "-"}`, margin, y);
    pdf.text(`CBM: ${inquiry.cbm || "-"}`, pageWidth / 2, y);
    y += 6;
    pdf.text(`Quantity: ${inquiry.quantity || "-"}`, margin, y);
    y += 12;

    // Pricing section with table
    pdf.setDrawColor(200);
    pdf.setLineWidth(0.5);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 6;

    pdf.setFont("helvetica", "bold");
    pdf.text("Final Rate", margin, y);
    pdf.text("Unit Price", pageWidth / 2, y);
    y += 5;
    pdf.setLineWidth(0.2);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 7;

    pdf.setFont("helvetica", "normal");
    const finalPriceStr = formatFinalAnswer(pricing.final_price);
    const unitPriceStr = `Rs. ${pricing.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const totalStr = `Rs. ${pricing.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    pdf.text(finalPriceStr, margin, y);
    pdf.text(unitPriceStr, pageWidth / 2, y);
    y += 10;
    pdf.line(margin, y, pageWidth - margin, y);
    y += 12;

    // Total amount highlighted
    pdf.setFontSize(13);
    pdf.setFont("helvetica", "bold");
    pdf.text("Total Amount:", pageWidth - margin - 50, y);
    pdf.setTextColor(0, 128, 128);
    pdf.text(totalStr, pageWidth - margin, y, { align: "right" });
    y += 20;

    // Notes if any
    if (pricing.notes) {
      pdf.setTextColor(0, 0, 0);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.text("Terms & Notes:", margin, y);
      y += 6;
      pdf.setFont("helvetica", "normal");
      const wrapped = pdf.splitTextToSize(pricing.notes, pageWidth - 2 * margin);
      pdf.text(wrapped, margin, y);
      y += wrapped.length * 5;
    }

    // Footer
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100, 100, 100);
    pdf.text("This quotation is valid for 30 days from the date of issue.", margin, pdf.internal.pageSize.getHeight() - 15);
    pdf.text(`Generated on: ${new Date().toLocaleString()}`, margin, pdf.internal.pageSize.getHeight() - 10);

    const dataUri = pdf.output("datauristring") as string;
    const base64 = dataUri.split(",")[1] || "";
    const filename = `quotation_${pricing.quotation_number}_${inquiry.leads?.lead_id_formatted || inquiry.id}.pdf`;
    return { pdfBase64: base64, filename };
  }

  async function handleSendQuotationToClient() {
    if (!selectedInquiry) return;
    if (!approvedPricing) {
      toast.error("Approved pricing is required to send a quotation.");
      return;
    }

    const phoneNumber = selectedInquiry.leads?.number?.trim();
    if (!phoneNumber) {
      toast.error("Client phone number is not available.");
      return;
    }

    setIsSendingQuotation(true);
    try {
      const { pdfBase64, filename } = await buildInquiryQuotationPdf(selectedInquiry, approvedPricing);
      const message = `Hello ${selectedInquiry.leads?.name || "Customer"},\nPlease find the approved quotation attached.\n\nQuotation #: ${approvedPricing.quotation_number}\nTotal Amount: Rs. ${approvedPricing.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      // Create a quotation record from the approved pricing so behavior matches QuotationPanel
      const createForm = new FormData();
      createForm.append('customer_name', selectedInquiry.leads?.name || 'Customer');
      createForm.append('product_service', selectedInquiry.product_name || selectedInquiry.description || 'Product');
      createForm.append('quantity', String(1));
      createForm.append('unit_price', String(approvedPricing.unit_price));
      createForm.append('taxes', String(0));
      createForm.append('uom', String('pcs'));
      createForm.append('expiration_date', String(''));
      createForm.append('payment_terms', String('Immediate'));
      // When creating from an inquiry, skip partner name matching to avoid
      // failures when no partner record exists for the lead's name.
      createForm.append('skip_partner_match', 'true');

      const createRes = await createQuotation(createForm as unknown as FormData);
      if ('error' in createRes) {
        toast.error(createRes.error || 'Failed to create quotation');
        return;
      }

      const createResData = createRes as { quotation?: { id: string }; id?: string };
      const newQuotation = createResData.quotation || createResData;
      const quotationId = newQuotation?.id;
      if (!quotationId) {
        toast.error('Failed to create quotation record');
        return;
      }

      // Send using existing sendQuotation flow so it updates status/logs consistently
      const formattedPhone = formatPhoneForWhatsApp(phoneNumber);

      const sendResult = await sendQuotation(quotationId, {
        phone_number: formattedPhone,
        whatsapp_message: message,
        pdf_base64: pdfBase64,
        pdf_filename: filename,
      });

      if ('error' in sendResult) {
        toast.error(sendResult.error || 'Failed to send quotation');
        return;
      }

      const sendMethod = 'quotation' in sendResult ? (sendResult as { send_method?: string }).send_method : '';
      // Debug: surface send method
      console.log('[sendQuotation] result:', sendResult);
      toast.info(`Send method: ${sendMethod || 'unknown'}`);

      if (sendMethod === 'whatsapp_web') {
        // Open WhatsApp Web as in QuotationPanel
        const cleanPhone = formatPhoneForWhatsApp(phoneNumber);
        const encodedMsg = encodeURIComponent(message);
        const waUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`;
        // Ensure user has the PDF for manual attach
        downloadPdfFile(filename, pdfBase64);
        window.open(waUrl, '_blank');
        toast.success('WhatsApp Web opened. The PDF was downloaded and the message opened in chat.');
      } else {
        toast.success('Quotation PDF sent on WhatsApp successfully.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send quotation.");
    } finally {
      setIsSendingQuotation(false);
    }
  }

  useEffect(() => {
    fetchInquiries();
  }, [fetchInquiries]);

  // ─── Filtered inquiries ─────────────────────────────────

  const filteredInquiries = inquiries.filter((inq) => {
    if (!searchQuery.trim()) return true;
    const s = searchQuery.toLowerCase();
    return (
      (inq.leads?.name || "").toLowerCase().includes(s) ||
      (inq.leads?.number || "").toLowerCase().includes(s) ||
      (inq.leads?.lead_id_formatted || "").toLowerCase().includes(s) ||
      (inq.product_name || "").toLowerCase().includes(s) ||
      (inq.description || "").toLowerCase().includes(s) ||
      getEffectiveStatus(inq).toLowerCase().includes(s)
    );
  });

  // ─── Navigation ─────────────────────────────────────────

  function openDetail(inquiry: LeadInquiryWithLead) {
    setSelectedInquiry(inquiry);
    setIsEditing(false);
    setView("detail");
    fetchLogs(inquiry.id);
    fetchConfirmationExtras(inquiry.id);
  }

  function backToList() {
    setView("list");
    setSelectedInquiry(null);
    setIsEditing(false);
    setConfirmationDetails(null);
    setApprovedPricing(null);
    fetchInquiries();
  }

  // ═══════════════════════════════════════════════════════════
  //  DETAIL VIEW
  // ═══════════════════════════════════════════════════════════

  if (view === "detail" && selectedInquiry) {
    const inq = selectedInquiry;
    const inquiryImageUrls = collectDetailImageUrls(inq, confirmationDetails);

    return (
      <div className="space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button onClick={backToList} className="text-teal-600 hover:underline flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Inquiries
          </button>
          <span className="text-slate-400">/</span>
          <span className="font-semibold text-slate-700">
            {inq.leads?.name || "Unknown Lead"}
          </span>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Badge variant="outline" className={`text-xs ${statusColor(getEffectiveStatus(inq))}`}>
            {formatStatus(getEffectiveStatus(inq))}
          </Badge>
        </div>

        {/* Main Content: Info + Logs Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Inquiry Info */}
          <div className="lg:col-span-2">
            <Card className="border shadow-sm">
              <CardContent className="p-6 space-y-5">
                {/* Lead Info Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Lead Name</label>
                    <div className="font-semibold text-slate-800 mt-0.5">
                      {inq.leads?.name || "-"}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Lead #</label>
                    <div className="font-semibold text-teal-700 mt-0.5">
                      #{inq.leads?.lead_id_formatted || "N/A"}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Phone</label>
                    <div className="text-slate-700 mt-0.5">{inq.leads?.number || "-"}</div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Sent At</label>
                    <div className="text-slate-700 mt-0.5 text-sm">
                      {inq.sent_at ? new Date(inq.sent_at).toLocaleString() : "-"}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Status</label>
                    {isEditing ? (
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                        className="mt-0.5 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="quotation_sent">Quotation Sent</option>
                        <option value="completed">Completed</option>
                      </select>
                    ) : (
                      <div className="mt-0.5">
                        <Badge variant="outline" className={`text-xs ${statusColor(getEffectiveStatus(inq))}`}>
                          {formatStatus(getEffectiveStatus(inq))}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>

                {/* Separator */}
                <div className="border-t" />

                {/* Product Details */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1">
                    <Package className="h-4 w-4" /> Product Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                    <div>
                      <label className="text-xs text-slate-500 font-medium">Product Name</label>
                      {isEditing ? (
                        <Input
                          value={editProductName}
                          onChange={(e) => setEditProductName(e.target.value)}
                          className="mt-0.5"
                          placeholder="Product name..."
                        />
                      ) : (
                        <div className="font-semibold text-slate-800 mt-0.5">
                          {inq.product_name || "-"}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 font-medium">Total Weight</label>
                      {isEditing ? (
                        <Input
                          value={editTotalWeight}
                          onChange={(e) => setEditTotalWeight(e.target.value)}
                          className="mt-0.5"
                          placeholder="e.g. 500 kg"
                        />
                      ) : (
                        <div className="text-slate-700 mt-0.5">{inq.total_weight || "-"}</div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 font-medium">CBM (Cubic Meter)</label>
                      {isEditing ? (
                        <Input
                          value={editCbm}
                          onChange={(e) => setEditCbm(e.target.value)}
                          className="mt-0.5"
                          placeholder="e.g. 12.5 m³"
                        />
                      ) : (
                        <div className="text-slate-700 mt-0.5">{inq.cbm || "-"}</div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 font-medium">Quantity</label>
                      {isEditing ? (
                        <Input
                          value={editQuantity}
                          onChange={(e) => setEditQuantity(e.target.value)}
                          className="mt-0.5"
                          placeholder="e.g. 1000 pcs"
                        />
                      ) : (
                        <div className="text-slate-700 mt-0.5">{inq.quantity || "-"}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Separator */}
                <div className="border-t" />

                {/* Approved Pricing */}
                {approvedPricing && (
                  <SalesAgentFinalRateCard finalRate={approvedPricing.final_price} />
                )}

                {inquiryImageUrls.length > 0 && (
                  <div>
                    <label className="text-xs text-slate-500 font-medium flex items-center gap-1">
                      <ImageIcon className="h-3.5 w-3.5" /> Images
                    </label>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {inquiryImageUrls.map((imageUrl, index) => (
                        <div key={`${imageUrl}-${index}`} className="border rounded-lg overflow-hidden bg-white">
                          <img
                            src={imageUrl}
                            alt={`Inquiry image ${index + 1}`}
                            className="w-full h-48 object-contain bg-slate-50"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Other Details (Description) */}
                <div>
                  <label className="text-xs text-slate-500 font-medium">Other Details</label>
                  {isEditing ? (
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={4}
                      className="mt-1"
                      placeholder="Other details..."
                    />
                  ) : (
                    <div className="mt-1 bg-slate-50 border rounded-lg p-3 text-sm whitespace-pre-wrap min-h-15">
                      {inq.description || "No details provided."}
                    </div>
                  )}
                </div>

                {/* Link (backward compatibility) */}
                {(inq.link_url || isEditing) && (
                  <div>
                    <label className="text-xs text-slate-500 font-medium flex items-center gap-1">
                      <Link2 className="h-3.5 w-3.5" /> Attached Link
                    </label>
                    {isEditing ? (
                      <Input
                        value={editLink}
                        onChange={(e) => setEditLink(e.target.value)}
                        className="mt-1"
                        placeholder="https://..."
                      />
                    ) : inq.link_url ? (
                      <a
                        href={inq.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 text-sm text-blue-600 hover:underline flex items-center gap-1"
                      >
                        {inq.link_url}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>

            {getEffectiveStatus(inq) === "approved" && approvedPricing && (
              <div className="mt-4 flex justify-end">
                <Button
                  size="sm"
                  onClick={handleSendQuotationToClient}
                  disabled={isSendingQuotation}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                >
                  {isSendingQuotation ? "Sending..." : "Send Quotation to Client"}
                </Button>
              </div>
            )}
          </div>

         
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  LIST VIEW
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-5 w-5 text-teal-600" />
          <h1 className="text-xl font-bold text-slate-800">My Inquiries</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search inquiries..."
              className="pl-9 w-60"
            />
          </div>
          <Button variant="outline" size="sm" onClick={fetchInquiries} disabled={isLoading}>
            <RefreshCcw className={`h-4 w-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <span className="text-sm text-slate-500">
            {filteredInquiries.length} record{filteredInquiries.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Table */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400">Loading inquiries...</div>
          ) : filteredInquiries.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              {searchQuery
                ? "No inquiries match your search."
                : "No inquiries found."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold">Lead #</TableHead>
                    <TableHead className="font-semibold">Lead Name</TableHead>
                    <TableHead className="font-semibold">Product Name</TableHead>
                    <TableHead className="font-semibold">Weight</TableHead>
                    <TableHead className="font-semibold">CBM</TableHead>
                    <TableHead className="font-semibold">Qty</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Sent At</TableHead>
                    <TableHead className="text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInquiries.map((inquiry) => (
                    <TableRow
                      key={inquiry.id}
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => openDetail(inquiry)}
                    >
                      <TableCell className="font-semibold text-teal-700">
                        #{inquiry.leads?.lead_id_formatted || "N/A"}
                      </TableCell>
                      <TableCell className="font-semibold text-slate-700">
                        {inquiry.leads?.name || "Unknown"}
                      </TableCell>
                      <TableCell className="text-slate-700 font-medium">
                        {inquiry.product_name || "-"}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {inquiry.total_weight || "-"}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {inquiry.cbm || "-"}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {inquiry.quantity || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${statusColor(getEffectiveStatus(inquiry))}`}>
                          {formatStatus(getEffectiveStatus(inquiry))}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {inquiry.sent_at ? new Date(inquiry.sent_at).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetail(inquiry);
                          }}
                        >
                          <FileText className="h-3.5 w-3.5 mr-1" /> View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
