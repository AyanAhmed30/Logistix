"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useTransition, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus,
  X,
  Send,
  FileText,
  ImageIcon,
  History,
  CheckCircle2,
  Inbox,
  ArrowLeft,
  List,
  Activity,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Lead } from "@/app/actions/leads";
import {
  saveInquiry,
  sendInquiryToAccounting,
  getInquiriesForLead,
  deleteInquiryForSalesAgent,
  getInquiryLogs,
  recordInquiryViewed,
  updateInquiryForAccounting,
  getQuotationsForInquiry,
  getLatestQuotationPricingByInquiryIds,
  uploadInquiryAttachment,
  getLeadChatMessages,
  sendLeadChatMessage,
  type LeadInquiry,
  type InquiryLog,
  type InquiryQuotation,
  type LeadChatMessage,
} from "@/app/actions/inquiries";
import {
  getApprovedPricingForInquiryIds,
  getConfirmationsForInquiry,
} from "@/app/actions/inquiry_confirmations";
import {
  CALCULATOR_FIELD_LABELS,
  computeCalculatorTotals,
} from "@/lib/inquiry-calculator";
import { classifyInquiryAttachment } from "@/lib/inquiry-attachments";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type LeadInquiryWorkspaceTab = "create" | "view" | "status";
type MainTab = LeadInquiryWorkspaceTab;

const HIDDEN_INQUIRY_LOG_KEYS = new Set(["version_number", "inquiry_version"]);

function visibleLogKeys(keys: string[]) {
  return keys.filter((k) => !HIDDEN_INQUIRY_LOG_KEYS.has(k));
}

function salesInquiryIsApproved(inq: LeadInquiry, approvedFallbackId: string | null) {
  const approvedConfirmation = (inq.inquiry_confirmations || []).some((c) => c.status === "approved");
  return (
    inq.approval_status === "approved" || inq.id === approvedFallbackId || approvedConfirmation
  );
}

function inquiryIsUnsentDraft(inq: LeadInquiry | null | undefined) {
  if (!inq?.id) return false;
  return !inq.sent_to_accounting && inq.approval_status !== "sent";
}

function resolveSaveInquiryOptions(
  inquiry: LeadInquiry | null,
  mode: "create" | "view",
  layout: "dialog" | "page",
  mainTab: MainTab
) {
  const isCreateFlow = mode === "create" || (layout === "page" && mainTab === "create");
  if (!isCreateFlow) {
    return { inquiryId: inquiry?.id, forceNewInquiry: false };
  }
  if (inquiryIsUnsentDraft(inquiry)) {
    return { inquiryId: inquiry!.id, forceNewInquiry: false };
  }
  return { inquiryId: undefined, forceNewInquiry: true };
}

function resetCreateInquiryFormState(setters: {
  setInquiry: (value: LeadInquiry | null) => void;
  setSelectedInquiryId: (value: string) => void;
  setProductName: (value: string) => void;
  setTotalWeight: (value: string) => void;
  setCbm: (value: string) => void;
  setQuantity: (value: string) => void;
  setImageDataList: (value: string[]) => void;
  setOtherDetails: (value: string) => void;
  setInquiryLogs: (value: InquiryLog[]) => void;
  setBaselineDraftState: (value: {
    product_name: string;
    total_weight: string;
    cbm: string;
    quantity: string;
    description: string;
    image_count: number;
  }) => void;
}) {
  setters.setInquiry(null);
  setters.setSelectedInquiryId("");
  setters.setProductName("");
  setters.setTotalWeight("");
  setters.setCbm("");
  setters.setQuantity("");
  setters.setImageDataList([]);
  setters.setOtherDetails("");
  setters.setInquiryLogs([]);
  setters.setBaselineDraftState({
    product_name: "",
    total_weight: "",
    cbm: "",
    quantity: "",
    description: "",
    image_count: 0,
  });
}

function pickPrimaryQuotation(quotations: InquiryQuotation[]): InquiryQuotation | null {
  if (!quotations.length) return null;
  const sent = quotations.find((q) => q.sent_to_agent);
  if (sent) return sent;
  return quotations.reduce((best, q) => (q.version > best.version ? q : best), quotations[0]);
}

function formatInquiryMoney(n: number) {
  return `Rs. ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getInquiryPricingForDisplay(
  inq: LeadInquiry,
  pricingByInquiryId: Record<
    string,
    { quotation_number: string; unit_price: number; total_amount: number; notes: string | null }
  >
) {
  const fromState = pricingByInquiryId[inq.id];
  if (fromState) return fromState;

  const totals = computeCalculatorTotals(inq.calculator_values, {
    weightKg: inq.total_weight,
    quantity: inq.quantity,
    cbm: inq.cbm,
  });
  if (!totals) return null;

  return {
    quotation_number: "APPROVED",
    unit_price: totals.unitPrice,
    total_amount: totals.totalAmount,
    notes: null,
  };
}

function isDecimalString(value: string) {
  if (!value.trim()) return true;
  return /^(?:\d+|\d+\.\d+|\d*\.\d+)$/.test(value.trim());
}

function buildApprovedInquiryDetailText(
  inq: LeadInquiry, 
  quotations: InquiryQuotation[], 
  pricingData?: { quotation_number: string; unit_price: number; total_amount: number; notes: string | null },
  calculatorValues?: Record<string, unknown>
): string {
  const lines: string[] = [];
  lines.push("INQUIRY");
  lines.push(`Product: ${inq.product_name?.trim() || "—"}`);
  if (inq.total_weight?.trim()) lines.push(`Total weight (kg): ${inq.total_weight}`);
  if (inq.quantity?.trim()) lines.push(`Quantity: ${inq.quantity}`);
  if (inq.cbm?.trim()) lines.push(`CBM: ${inq.cbm}`);
  if (inq.description?.trim()) {
    lines.push("");
    lines.push("Other details:");
    lines.push(inq.description.trim());
  }
  
  const q = pickPrimaryQuotation(quotations);
  lines.push("");
  lines.push("FINAL RATES (FROM ADMIN)");
  
  if (calculatorValues && Object.keys(calculatorValues).length > 0) {
    const totals = computeCalculatorTotals(calculatorValues, {
      weightKg: inq.total_weight,
      quantity: inq.quantity,
      cbm: inq.cbm,
    });

    if (totals && totals.totalAmount > 0) {
      lines.push(`Product / service: ${inq.product_name?.trim() || "—"}`);
      lines.push(`Quantity: ${inq.quantity || "1"}`);
      lines.push(`Unit price: ${formatInquiryMoney(totals.unitPrice)}`);
      lines.push(`Total amount: ${formatInquiryMoney(totals.totalAmount)}`);
      lines.push(`Sum of taxes: ${formatInquiryMoney(totals.sumOfAllTaxes)}`);
      lines.push(`Final answer (per kg): ${totals.finalAnswer.toFixed(6)}`);
      if (totals.costPerWeight > 0 && inq.total_weight?.trim()) {
        lines.push(`Rate per kg: ${totals.costPerWeight.toFixed(6)}`);
      }

      lines.push("");
      lines.push("RATE BREAKDOWN:");
      for (const [k, v] of Object.entries(calculatorValues)) {
        if (v !== null && v !== undefined && String(v).trim() !== "" && String(v) !== "0") {
          const label = CALCULATOR_FIELD_LABELS[k] || k.replace(/_/g, " ");
          lines.push(`${label}: ${v}`);
        }
      }
      return lines.join("\n");
    }
  }
  
  // Fallback to existing logic for pricing data and quotations
  if (pricingData) {
    lines.push(`Quotation #: ${pricingData.quotation_number}`);
    lines.push(`Product / service: ${inq.product_name?.trim() || "—"}`);
    lines.push(`Quantity: ${inq.quantity || "1"}`);
    lines.push(`Unit price: ${formatInquiryMoney(pricingData.unit_price)}`);
    lines.push(`Total: ${formatInquiryMoney(pricingData.total_amount)}`);
    if (pricingData.notes?.trim()) {
      lines.push("");
      lines.push("Admin notes:");
      lines.push(pricingData.notes.trim());
    }
  } else if (q) {
    lines.push(`Quotation #: ${q.quotation_number}`);
    lines.push(`Product / service: ${q.product_service?.trim() || "—"}`);
    lines.push(`Quantity: ${q.quantity}`);
    lines.push(`Unit price: ${formatInquiryMoney(q.unit_price)}`);
    lines.push(`Total: ${formatInquiryMoney(q.total_amount)}`);
    if (q.notes?.trim()) {
      lines.push("");
      lines.push("Admin notes:");
      lines.push(q.notes.trim());
    }
  } else {
    lines.push("✅ Inquiry has been approved by admin!");
    lines.push("");
    lines.push("🔄 Pricing information is being processed.");
    lines.push("📋 You will receive detailed rates soon.");
    lines.push("");
    lines.push("💡 Contact Operations team if you need immediate pricing information.");
  }
  
  if (inq.calculator_values && Object.keys(inq.calculator_values).length > 0) {
    lines.push("");
    lines.push("OPERATIONS CALCULATOR");
    for (const [k, v] of Object.entries(inq.calculator_values)) {
      lines.push(`${k}: ${v}`);
    }
  }
  return lines.join("\n");
}

export function LeadInquiryWorkspace({
  lead,
  mode = "create",
  active,
  layout,
  onRequestClose,
  initialMainTab,
  initialInquiryId,
  allowInquiry = true,
  boardStatus,
}: {
  lead: Lead | null;
  mode?: "create" | "view";
  active: boolean;
  layout: "dialog" | "page";
  onRequestClose?: () => void;
  /** When set on the lead detail page, selects this sidebar tab once on load. */
  initialMainTab?: MainTab;
  initialInquiryId?: string;
  /** Whether to allow Send Inquiry workflow based on board status */
  allowInquiry?: boolean;
  /** The board status from which this lead was accessed */
  boardStatus?: string;
}) {
  const router = useRouter();
  const inquiryImageInputId = "sales-inquiry-image-input";
  const [inquiry, setInquiry] = useState<LeadInquiry | null>(null);
  const [productName, setProductName] = useState("");
  const [totalWeight, setTotalWeight] = useState("");
  const [cbm, setCbm] = useState("");
  const [quantity, setQuantity] = useState("");
  const [imageDataList, setImageDataList] = useState<string[]>([]);
  const [otherDetails, setOtherDetails] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmationStatus, setConfirmationStatus] = useState<'none' | 'approved'>('none');
  const [leadInquiries, setLeadInquiries] = useState<LeadInquiry[]>([]);
  const [approvedInquiryId, setApprovedInquiryId] = useState<string | null>(null);
  const [selectedInquiryId, setSelectedInquiryId] = useState<string>(initialInquiryId || "");
  const [inquiryLogs, setInquiryLogs] = useState<InquiryLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isViewEditing, setIsViewEditing] = useState(false);
  const [baselineDraftState, setBaselineDraftState] = useState<{
    product_name: string;
    total_weight: string;
    cbm: string;
    quantity: string;
    description: string;
    image_count: number;
  }>({
    product_name: "",
    total_weight: "",
    cbm: "",
    quantity: "",
    description: "",
    image_count: 0,
  });

  const [mainTab, setMainTab] = useState<MainTab>(() => {
    // If Create tab is requested but not allowed, default to View tab
    if (initialMainTab === "create" && !allowInquiry) {
      return "view";
    }
    return initialMainTab ?? (allowInquiry ? "create" : "view");
  });
  const [approvedDetailOpen, setApprovedDetailOpen] = useState(false);
  const [approvedDetailLoading, setApprovedDetailLoading] = useState(false);
  const [approvedDetailText, setApprovedDetailText] = useState("");
  const [approvedDetailTitle, setApprovedDetailTitle] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pricingByInquiryId, setPricingByInquiryId] = useState<
    Record<string, { quotation_number: string; unit_price: number; total_amount: number; notes: string | null }>
  >({});
  const [chatMessages, setChatMessages] = useState<LeadChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);

  const fetchInquiryData = useCallback(async () => {
    if (!lead) return;
    setIsLoading(true);
    try {
      // Fetch only core inquiry data first so dialog can render quickly.
      const inquiryListResult = await getInquiriesForLead(lead.id);

      if ("error" in inquiryListResult) {
        setLeadInquiries([]);
        setApprovedInquiryId(null);
        setInquiry(null);
        setProductName("");
        setTotalWeight("");
        setCbm("");
        setQuantity("");
        setImageDataList([]);
        setOtherDetails("");
        setConfirmationStatus("none");
      } else {
        const list = inquiryListResult.inquiries || [];
        const nextApprovedFallback =
          ("approvedInquiryId" in inquiryListResult ? inquiryListResult.approvedInquiryId : null) || null;
        setLeadInquiries(list);
        const approvedInquiryIds = list
          .filter((x) => salesInquiryIsApproved(x, nextApprovedFallback))
          .map((x) => x.id);
        if (approvedInquiryIds.length > 0) {
          const [quotationPricingResult, confirmationPricingResult] = await Promise.all([
            getLatestQuotationPricingByInquiryIds(approvedInquiryIds),
            getApprovedPricingForInquiryIds(approvedInquiryIds),
          ]);
          const mergedPricing: Record<
            string,
            { quotation_number: string; unit_price: number; total_amount: number; notes: string | null }
          > = {};
          if (!("error" in quotationPricingResult)) {
            Object.assign(mergedPricing, quotationPricingResult.pricing || {});
          }
          if (!("error" in confirmationPricingResult)) {
            for (const [inquiryId, pricing] of Object.entries(confirmationPricingResult.pricing || {})) {
              if (!mergedPricing[inquiryId]) {
                mergedPricing[inquiryId] = pricing;
              }
            }
          }
          setPricingByInquiryId(mergedPricing);
        } else {
          setPricingByInquiryId({});
        }
        setApprovedInquiryId(nextApprovedFallback);

        const skipFormHydration = layout === "page" && mainTab === "create";

        if (skipFormHydration) {
          return;
        }

        const selected = selectedInquiryId
          ? list.find((x) => x.id === selectedInquiryId) || null
          : null;
        const current =
          mode === "create"
            ? (selected || list[0] || null)
            : (selected || list[0] || null);

        setSelectedInquiryId(current?.id || "");
        setInquiry(current);
        setProductName(current?.product_name || "");
        setTotalWeight(current?.total_weight || "");
        setCbm(current?.cbm || "");
        setQuantity(current?.quantity || "");
        const primaryImage = current?.image_url || "";
        const additionalImages = Array.isArray(current?.additional_image_urls)
          ? current.additional_image_urls.filter((url) => typeof url === "string" && url.trim().length > 0)
          : [];
        setImageDataList(primaryImage ? [primaryImage, ...additionalImages] : additionalImages);
        setOtherDetails(current?.description || "");
        setBaselineDraftState({
          product_name: current?.product_name || "",
          total_weight: current?.total_weight || "",
          cbm: current?.cbm || "",
          quantity: current?.quantity || "",
          description: current?.description || "",
          image_count: (primaryImage ? 1 : 0) + additionalImages.length,
        });

        const pickedWithConfirmations = (current || null) as (LeadInquiry & {
          inquiry_confirmations?: { status: string }[];
        }) | null;
        const hasApproved = !!pickedWithConfirmations && (pickedWithConfirmations.inquiry_confirmations || []).some((c) => c.status === "approved");
        setConfirmationStatus(hasApproved ? "approved" : "none");

        if (current?.id) {
          void recordInquiryViewed(current.id);
          await fetchLogsForInquiry(current.id);
        } else {
          setInquiryLogs([]);
        }
      }

    } catch {
      toast.error("Failed to load inquiry data");
    } finally {
      setIsLoading(false);
    }
  }, [lead, selectedInquiryId, mode, layout, mainTab]);

  useEffect(() => {
    if (active && lead && layout === "page" && mainTab === "create") {
      setInquiry(null);
      setSelectedInquiryId("");
      setProductName("");
      setTotalWeight("");
      setCbm("");
      setQuantity("");
      setImageDataList([]);
      setOtherDetails("");
      setInquiryLogs([]);
      setIsViewEditing(true);
      setConfirmationStatus("none");
      setBaselineDraftState({
        product_name: "",
        total_weight: "",
        cbm: "",
        quantity: "",
        description: "",
        image_count: 0,
      });
    }
  }, [active, lead, layout, mainTab]);

  useEffect(() => {
    if (active && lead) {
      fetchInquiryData();
    } else {
      setInquiry(null);
      setProductName("");
      setTotalWeight("");
      setCbm("");
      setQuantity("");
      setImageDataList([]);
      setOtherDetails("");
      setIsDragging(false);
      setConfirmationStatus('none');
      setLeadInquiries([]);
      setApprovedInquiryId(null);
      setSelectedInquiryId("");
      setInquiryLogs([]);
      setIsViewEditing(false);
      setMainTab("create");
      setApprovedDetailOpen(false);
      setApprovedDetailLoading(false);
      setApprovedDetailText("");
      setApprovedDetailTitle("");
      setPricingByInquiryId({});
      setChatMessages([]);
      setChatInput("");
      setIsSendingChat(false);
      setBaselineDraftState({
        product_name: "",
        total_weight: "",
        cbm: "",
        quantity: "",
        description: "",
        image_count: 0,
      });
    }
  }, [active, lead, fetchInquiryData]);

  const readImageAsDataUrl = useCallback((file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.readAsDataURL(file);
    });
  }, []);

  // Handle all file types (images and documents)
  const handleFiles = useCallback(async (files: File[]) => {
    if (!lead?.id) {
      toast.error("Lead must be saved before uploading attachments.");
      return;
    }

    const allowedTypes = [
      "image/",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
      "text/csv",
    ];

    const validFiles = files.filter((file) => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`"${file.name}" is larger than 5MB`);
        return false;
      }

      const isAllowedType = allowedTypes.some(
        (type) =>
          file.type.startsWith(type) ||
          (type === "application/msword" && file.name.toLowerCase().endsWith(".doc")) ||
          (type === "application/vnd.ms-excel" && file.name.toLowerCase().endsWith(".xls"))
      );

      if (!isAllowedType) {
        toast.error(`"${file.name}" is not a supported file type`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    try {
      const uploadedUrls: string[] = [];
      for (const file of validFiles) {
        const uploadResult = await uploadInquiryAttachment(lead.id, file);
        if ("error" in uploadResult || !uploadResult.url) {
          if (file.type.startsWith("image/")) {
            uploadedUrls.push(await readImageAsDataUrl(file));
          } else {
            toast.error(`Failed to upload "${file.name}": ${uploadResult.error || "Unknown error"}`);
          }
          continue;
        }
        uploadedUrls.push(uploadResult.url);
      }

      if (uploadedUrls.length === 0) return;

      setImageDataList((prev) => [...prev, ...uploadedUrls]);

      const documentCount = validFiles.filter((f) => !f.type.startsWith("image/")).length;
      const imageCount = validFiles.filter((f) => f.type.startsWith("image/")).length;

      if (documentCount > 0 && imageCount > 0) {
        toast.success(`Uploaded ${imageCount} image(s) and ${documentCount} document(s)`);
      } else if (documentCount > 0) {
        toast.success(`Uploaded ${documentCount} document(s)`);
      } else {
        toast.success(`Uploaded ${imageCount} image(s)`);
      }
    } catch {
      toast.error("Failed to process selected files");
    }
  }, [lead?.id, readImageAsDataUrl]);

  // Global paste handler for Ctrl+V image paste
  useEffect(() => {
    if (!active) return;
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            void handleFiles([file]);
          }
          break;
        }
      }
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [active, handleFiles]);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      void handleFiles(Array.from(files));
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) {
      void handleFiles(Array.from(files));
    }
    // Reset input so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeImage(index: number) {
    setImageDataList((prev) => prev.filter((_, i) => i !== index));
  }

  function isImageData(data: string): boolean {
    return classifyInquiryAttachment(data).kind === "image";
  }

  function getAttachmentDisplayInfo(data: string) {
    const info = classifyInquiryAttachment(data);
    if (info.kind === "image") return null;
    if (info.kind === "legacy_meta") {
      return {
        name: info.filename,
        size: 0,
        type: info.mimeType || "file",
        legacyMissing: true,
        url: null as string | null,
      };
    }
    return {
      name: info.filename,
      size: 0,
      type: info.mimeType || "file",
      legacyMissing: false,
      url: info.url,
    };
  }

  // Helper function to get file icon based on type
  function getFileIcon(type: string): string {
    if (type.includes('pdf')) return '📄';
    if (type.includes('word') || type.includes('document')) return '📝';
    if (type.includes('excel') || type.includes('sheet')) return '📊';
    if (type.includes('text')) return '📃';
    return '📎';
  }

  function isIntegerString(value: string) {
    return /^\d+$/.test(value);
  }

  function toDigitsOnly(value: string) {
    return value.replace(/\D/g, "");
  }

  function toDecimalInput(value: string) {
    let next = value.replace(/[^0-9.]/g, "");
    const firstDot = next.indexOf(".");
    if (firstDot !== -1) {
      next = next.slice(0, firstDot + 1) + next.slice(firstDot + 1).replace(/\./g, "");
    }
    return next;
  }

  function formatLogAction(action: string) {
    switch (action) {
      case "created":
        return "Created";
      case "updated":
        return "Updated";
      case "status_changed":
        return "Status Changed";
      case "send_for_confirmation":
        return "Sent for Confirmation";
      case "image_uploaded":
        return "Image Uploaded";
      case "calculator_updated":
        return "Calculator Updated";
      case "lead_management_form_updated":
        return "Lead Management Updated";
      default:
        return action.replace(/_/g, " ");
    }
  }

  function fieldLabel(key: string) {
    const labels: Record<string, string> = {
      product_name: "Product",
      total_weight: "Total Weight (kg)",
      cbm: "CBM",
      quantity: "Quantity",
      description: "Other Details",
      image_url: "Image",
      additional_image_urls: "Additional Images",
      sent_to_accounting: "Sent to Accounting",
      sent_at: "Sent At",
      status: "Status",
    };
    return labels[key] || key.replace(/_/g, " ");
  }

  function valueText(value: unknown) {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "string") {
      if (value.includes("T") && !Number.isNaN(new Date(value).getTime())) {
        return new Date(value).toLocaleString();
      }
      return value;
    }
    if (typeof value === "number") return String(value);
    if (Array.isArray(value)) return value.length > 0 ? `${value.length} item(s)` : "-";
    return "Updated";
  }

  async function fetchLogsForInquiry(inquiryId: string) {
    setIsLoadingLogs(true);
    try {
      const result = await getInquiryLogs(inquiryId);
      if ("error" in result) {
        setInquiryLogs([]);
      } else {
        setInquiryLogs(result.logs || []);
      }
    } catch {
      setInquiryLogs([]);
    } finally {
      setIsLoadingLogs(false);
    }
  }

  async function fetchChatForInquiry(leadId: string, inquiryId: string) {
    try {
      const result = await getLeadChatMessages(leadId, inquiryId);
      if ("error" in result) {
        setChatMessages([]);
      } else {
        setChatMessages(result.messages || []);
      }
    } catch {
      setChatMessages([]);
    }
  }

  const handleSelectInquiry = useCallback(
    (inquiryItem: LeadInquiry) => {
      setIsViewEditing(false);
      setSelectedInquiryId(inquiryItem.id);
      setInquiry(inquiryItem);
      setProductName(inquiryItem.product_name || "");
      setTotalWeight(inquiryItem.total_weight || "");
      setCbm(inquiryItem.cbm || "");
      setQuantity(inquiryItem.quantity || "");
      const primaryImage = inquiryItem.image_url || "";
      const additionalImages = Array.isArray(inquiryItem.additional_image_urls)
        ? inquiryItem.additional_image_urls.filter((url) => typeof url === "string" && url.trim().length > 0)
        : [];
      setImageDataList(primaryImage ? [primaryImage, ...additionalImages] : additionalImages);
      setOtherDetails(inquiryItem.description || "");
      setBaselineDraftState({
        product_name: inquiryItem.product_name || "",
        total_weight: inquiryItem.total_weight || "",
        cbm: inquiryItem.cbm || "",
        quantity: inquiryItem.quantity || "",
        description: inquiryItem.description || "",
        image_count: (primaryImage ? 1 : 0) + additionalImages.length,
      });
      const hasApproved = salesInquiryIsApproved(inquiryItem, approvedInquiryId);
      setConfirmationStatus(hasApproved ? "approved" : "none");
      void recordInquiryViewed(inquiryItem.id);
      void fetchLogsForInquiry(inquiryItem.id);
      void fetchChatForInquiry(inquiryItem.lead_id, inquiryItem.id);
    },
    [approvedInquiryId]
  );

  useEffect(() => {
    if (!inquiry?.id || !lead?.id) return;
    void fetchChatForInquiry(lead.id, inquiry.id);
    const timer = setInterval(() => {
      void fetchChatForInquiry(lead.id, inquiry.id);
    }, 5000);
    return () => clearInterval(timer);
  }, [inquiry?.id, lead?.id]);

  async function handleSendChatMessage() {
    if (!inquiry?.id || !lead?.id) return;
    if (!chatInput.trim()) return;
    setIsSendingChat(true);
    try {
      const result = await sendLeadChatMessage(lead.id, chatInput, inquiry.id);
      if ("error" in result) {
        toast.error(result.error || "Failed to send message.");
      } else {
        setChatInput("");
        await fetchChatForInquiry(lead.id, inquiry.id);
      }
    } finally {
      setIsSendingChat(false);
    }
  }

  const openApprovedInquiryDetail = useCallback(
    async (inq: LeadInquiry) => {
      if (!salesInquiryIsApproved(inq, approvedInquiryId)) return;
      const label = inq.product_name?.trim() || "Inquiry";
      setApprovedDetailTitle(`${label} — approved`);
      setApprovedDetailOpen(true);
      setApprovedDetailLoading(true);
      setApprovedDetailText("");
      
      try {
        let calculatorValues: Record<string, unknown> | undefined;
        
        // First, check if calculator values exist in the inquiry itself
        if (inq.calculator_values && typeof inq.calculator_values === 'object' && Object.keys(inq.calculator_values).length > 0) {
          calculatorValues = inq.calculator_values as Record<string, unknown>;
        } else {
          // Try to get calculator values from inquiry confirmation  
          const confirmationResult = await getConfirmationsForInquiry(inq.id);
          
          if (!("error" in confirmationResult) && confirmationResult.confirmations.length > 0) {
            // Find the approved confirmation with calculator values
            const approvedConfirmation = confirmationResult.confirmations.find(
              (conf: { status: string; calculator_values?: Record<string, unknown> }) => conf.status === 'approved'
            );
            
            if (approvedConfirmation && approvedConfirmation.calculator_values) {
              calculatorValues = approvedConfirmation.calculator_values;
            }
          }
        }
        
        let pricingData:
          | { quotation_number: string; unit_price: number; total_amount: number; notes: string | null }
          | undefined = pricingByInquiryId[inq.id];
        
        // If no pricing data in state, try to fetch it specifically for this inquiry
        if (!pricingData) {
          const [quotationPricingResult, confirmationPricingResult] = await Promise.all([
            getLatestQuotationPricingByInquiryIds([inq.id]),
            getApprovedPricingForInquiryIds([inq.id]),
          ]);
          pricingData =
            (!("error" in quotationPricingResult) ? quotationPricingResult.pricing?.[inq.id] : undefined) ||
            (!("error" in confirmationPricingResult) ? confirmationPricingResult.pricing?.[inq.id] : undefined);
          if (pricingData) {
            setPricingByInquiryId((prev) => ({ ...prev, [inq.id]: pricingData! }));
          }
        }
        
        // Display with calculator values prioritized
        if (calculatorValues || pricingData) {
          setApprovedDetailLoading(false);
          setApprovedDetailText(buildApprovedInquiryDetailText(inq, [], pricingData, calculatorValues));
          return;
        }
        
        // Fallback to API call if still no data available
        const result = await getQuotationsForInquiry(inq.id);
        setApprovedDetailLoading(false);
        if ("error" in result) {
          toast.error(result.error);
          setApprovedDetailText(
            `${buildApprovedInquiryDetailText(inq, [], undefined, undefined)}\n\n---\nCould not load quotation: ${result.error}`
          );
          return;
        }
        setApprovedDetailText(buildApprovedInquiryDetailText(inq, result.quotations || [], undefined, undefined));
      } catch {
        setApprovedDetailLoading(false);
        toast.error("Failed to load inquiry details");
        setApprovedDetailText(buildApprovedInquiryDetailText(inq, [], undefined, undefined));
      }
    },
    [approvedInquiryId, pricingByInquiryId]
  );

  useEffect(() => {
    if (layout !== "page" || mode !== "view" || mainTab !== "view") return;
    if (leadInquiries.length === 0) return;
    if (selectedInquiryId && leadInquiries.some((x) => x.id === selectedInquiryId)) return;
    handleSelectInquiry(leadInquiries[0]);
  }, [layout, mode, mainTab, leadInquiries, selectedInquiryId, handleSelectInquiry]);

  function handleSaveInquiry() {
    if (!lead) return;
    if (!productName.trim()) {
      toast.error("Please add a product name.");
      return;
    }
    if (totalWeight.trim() && !isIntegerString(totalWeight.trim())) {
      toast.error("Total Weight (kg) must be an integer.");
      return;
    }
    if (quantity.trim() && !isIntegerString(quantity.trim())) {
      toast.error("Quantity must be an integer.");
      return;
    }
    if (cbm.trim() && !isDecimalString(cbm.trim())) {
      toast.error("CBM (Cubic Meter) must be a valid number (e.g. 1.5).");
      return;
    }
    startTransition(async () => {
      const saveOptions = resolveSaveInquiryOptions(inquiry, mode, layout, mainTab);
      const result = await saveInquiry(lead.id, {
        product_name: productName,
        total_weight: totalWeight,
        cbm,
        quantity,
        image_url: imageDataList[0] || null,
        additional_image_urls: imageDataList.slice(1),
        description: otherDetails,
      }, saveOptions.inquiryId, {
        forceNewInquiry: saveOptions.forceNewInquiry,
      });
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Inquiry saved successfully");
        if (result.inquiry) {
          setInquiry(result.inquiry);
          setSelectedInquiryId(result.inquiry.id);
          setLeadInquiries((prev) => {
            const filtered = prev.filter((x) => x.id !== result.inquiry!.id);
            return [result.inquiry!, ...filtered];
          });
          const primaryImage = result.inquiry.image_url || "";
          const additionalImages = Array.isArray(result.inquiry.additional_image_urls)
            ? result.inquiry.additional_image_urls.filter((url) => typeof url === "string" && url.trim().length > 0)
            : [];
          setBaselineDraftState({
            product_name: result.inquiry.product_name || "",
            total_weight: result.inquiry.total_weight || "",
            cbm: result.inquiry.cbm || "",
            quantity: result.inquiry.quantity || "",
            description: result.inquiry.description || "",
            image_count: (primaryImage ? 1 : 0) + additionalImages.length,
          });
          await fetchLogsForInquiry(result.inquiry.id);
        }
      }
    });
  }

  function handleSendInquiry() {
    if (!lead) return;
    if (!productName.trim()) {
      toast.error("Please add a product name before sending.");
      return;
    }
    if (totalWeight.trim() && !isIntegerString(totalWeight.trim())) {
      toast.error("Total Weight (kg) must be an integer.");
      return;
    }
    if (quantity.trim() && !isIntegerString(quantity.trim())) {
      toast.error("Quantity must be an integer.");
      return;
    }
    if (cbm.trim() && !isDecimalString(cbm.trim())) {
      toast.error("CBM (Cubic Meter) must be a valid number (e.g. 1.5).");
      return;
    }
    startTransition(async () => {
      const saveOptions = resolveSaveInquiryOptions(inquiry, mode, layout, mainTab);
      // Save first
      const saveResult = await saveInquiry(lead.id, {
        product_name: productName,
        total_weight: totalWeight,
        cbm,
        quantity,
        image_url: imageDataList[0] || null,
        additional_image_urls: imageDataList.slice(1),
        description: otherDetails,
      }, saveOptions.inquiryId, {
        forceNewInquiry: saveOptions.forceNewInquiry,
      });
      if ("error" in saveResult) {
        toast.error(saveResult.error);
        return;
      }
      // Then send to Accounting + Operations
      const inquiryToSendId = saveResult.inquiry?.id || inquiry?.id;
      if (!inquiryToSendId) {
        toast.error("Unable to determine inquiry to send");
        return;
      }
      const result = await sendInquiryToAccounting(inquiryToSendId);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Inquiry sent to Accounting & Operations!");
        if (result.inquiry) {
          setLeadInquiries((prev) => {
            const filtered = prev.filter((x) => x.id !== result.inquiry!.id);
            return [result.inquiry!, ...filtered];
          });
          if (layout === "page" && mainTab === "create") {
            resetCreateInquiryFormState({
              setInquiry,
              setSelectedInquiryId,
              setProductName,
              setTotalWeight,
              setCbm,
              setQuantity,
              setImageDataList,
              setOtherDetails,
              setInquiryLogs,
              setBaselineDraftState,
            });
          } else {
            setInquiry(result.inquiry);
            const primaryImage = result.inquiry.image_url || "";
            const additionalImages = Array.isArray(result.inquiry.additional_image_urls)
              ? result.inquiry.additional_image_urls.filter((url) => typeof url === "string" && url.trim().length > 0)
              : [];
            setBaselineDraftState({
              product_name: result.inquiry.product_name || "",
              total_weight: result.inquiry.total_weight || "",
              cbm: result.inquiry.cbm || "",
              quantity: result.inquiry.quantity || "",
              description: result.inquiry.description || "",
              image_count: (primaryImage ? 1 : 0) + additionalImages.length,
            });
            await fetchLogsForInquiry(result.inquiry.id);
          }
        }
        // Close the modal after a successful send so the workflow can continue.
        onRequestClose?.();
      }
    });
  }

  function handleStartViewEdit() {
    if (!inquiry) return;
    setIsViewEditing(true);
  }

  function handleCancelViewEdit() {
    if (!inquiry) {
      setIsViewEditing(false);
      return;
    }
    setProductName(inquiry.product_name || "");
    setTotalWeight(inquiry.total_weight || "");
    setCbm(inquiry.cbm || "");
    setQuantity(inquiry.quantity || "");
    const primaryImage = inquiry.image_url || "";
    const additionalImages = Array.isArray(inquiry.additional_image_urls)
      ? inquiry.additional_image_urls.filter((url) => typeof url === "string" && url.trim().length > 0)
      : [];
    setImageDataList(primaryImage ? [primaryImage, ...additionalImages] : additionalImages);
    setOtherDetails(inquiry.description || "");
    setIsViewEditing(false);
  }

  function handleSaveViewEdit() {
    if (!inquiry) return;
    if (!productName.trim()) {
      toast.error("Please add a product name.");
      return;
    }
    if (totalWeight.trim() && !isIntegerString(totalWeight.trim())) {
      toast.error("Total Weight (kg) must be an integer.");
      return;
    }
    if (quantity.trim() && !isIntegerString(quantity.trim())) {
      toast.error("Quantity must be an integer.");
      return;
    }
    if (cbm.trim() && !isDecimalString(cbm.trim())) {
      toast.error("CBM (Cubic Meter) must be a valid number (e.g. 1.5).");
      return;
    }

    startTransition(async () => {
      const result = await updateInquiryForAccounting(inquiry.id, {
        product_name: productName,
        total_weight: totalWeight,
        cbm,
        quantity,
        image_url: imageDataList[0] || null,
        additional_image_urls: imageDataList.slice(1),
        description: otherDetails,
      });
      if ("error" in result) {
        toast.error(result.error || "Unable to update inquiry");
        return;
      }
      toast.success("Inquiry updated");
      setIsViewEditing(false);
      await fetchInquiryData();
      await fetchLogsForInquiry(inquiry.id);
    });
  }

  const isFormValid = productName.trim().length > 0;
  const canEditForm =
    mode === "create" || isViewEditing || (layout === "page" && mainTab === "create");
  const liveUnsavedEntries = useMemo(() => {
    if (!canEditForm) return [] as Array<{ key: string; label: string; oldValue: string; newValue: string }>;
    const pairs = [
      { key: "product_name", label: "Product", oldValue: baselineDraftState.product_name, newValue: productName },
      { key: "total_weight", label: "Total Weight (kg)", oldValue: baselineDraftState.total_weight, newValue: totalWeight },
      { key: "cbm", label: "CBM", oldValue: baselineDraftState.cbm, newValue: cbm },
      { key: "quantity", label: "Quantity", oldValue: baselineDraftState.quantity, newValue: quantity },
      { key: "description", label: "Other Details", oldValue: baselineDraftState.description, newValue: otherDetails },
      { key: "image_count", label: "Images", oldValue: String(baselineDraftState.image_count), newValue: String(imageDataList.length) },
    ];
    return pairs
      .filter((p) => (p.oldValue || "") !== (p.newValue || ""))
      .map((p) => ({
        key: p.key,
        label: p.label,
        oldValue: p.key === "image_count" ? `${p.oldValue} image(s)` : (p.oldValue || "-"),
        newValue: p.key === "image_count" ? `${p.newValue} image(s)` : (p.newValue || "-"),
      }));
  }, [canEditForm, baselineDraftState, productName, totalWeight, cbm, quantity, otherDetails, imageDataList.length]);

  const approvedRows = useMemo(
    () => leadInquiries.filter((inq) => salesInquiryIsApproved(inq, approvedInquiryId)),
    [leadInquiries, approvedInquiryId]
  );

  async function handleDeleteInquiry() {
    if (!inquiry?.id) return;
    setIsDeleting(true);
    const result = await deleteInquiryForSalesAgent(inquiry.id);
    setIsDeleting(false);
    if ("error" in result) {
      toast.error(result.error || "Unable to delete inquiry.");
      return;
    }
    toast.success("Inquiry deleted");
    setDeleteDialogOpen(false);
    setInquiry(null);
    setSelectedInquiryId("");
    setInquiryLogs([]);
    await fetchInquiryData();
  }

  const statusTabInquiries = useMemo(
    () =>
      [...leadInquiries].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    [leadInquiries]
  );

  if (!lead) return null;

  const tabbedPage = layout === "page" && mode === "view";
  const isCreateFlow = mode === "create" || (tabbedPage && mainTab === "create");

  const renderInquiryLogsPanel = (compact?: boolean) => (
    <div
      className={`rounded-sm border border-slate-200 bg-white space-y-3 ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
        <History className="h-3.5 w-3.5" />
        Inquiry activity log
      </h3>
      <div className={`overflow-y-auto pr-1 space-y-2 ${compact ? "max-h-48" : "max-h-[70vh]"}`}>
        {liveUnsavedEntries.length > 0 && (
          <Card className="p-2.5 rounded-sm border-amber-200 bg-amber-50/50">
            <div className="space-y-1.5">
              {liveUnsavedEntries.map((entry) => (
                <div key={entry.key} className="text-[11px] rounded border border-amber-100 bg-white p-2">
                  <div className="font-medium text-slate-700">{entry.label}</div>
                  <div className="text-teal-700">
                    <span className="font-medium">{entry.newValue}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
        {isLoadingLogs ? (
          <p className="text-xs text-secondary-muted">Loading logs...</p>
        ) : inquiryLogs.length === 0 ? (
          <p className="text-xs text-secondary-muted">
            {isCreateFlow ? "No logs yet. Logs will appear after save/send." : "No logs available for this inquiry."}
          </p>
        ) : (
          inquiryLogs.map((log) => {
            const previous = (log.previous_values || {}) as Record<string, unknown>;
            const current = (log.new_values || {}) as Record<string, unknown>;
            const changedKeys = visibleLogKeys(
              Array.from(new Set([...Object.keys(previous), ...Object.keys(current)]))
            );

            return (
              <Card key={log.id} className="p-2.5 rounded-sm border-slate-200 bg-slate-50/50">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-primary-dark">{log.performed_by}</span>
                  <span className="text-[10px] text-secondary-muted">
                    {new Date(log.performed_at).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="mt-1">
                  <Badge variant="outline" className="text-[10px] h-5 bg-white border-slate-200 text-slate-700">
                    {formatLogAction(log.action)}
                  </Badge>
                </div>
                {isCreateFlow && Object.keys(current).length > 0 ? (
                  <div className="mt-2 space-y-1.5">
                    {Object.entries(current)
                      .filter(([key]) => !HIDDEN_INQUIRY_LOG_KEYS.has(key))
                      .map(([key, value]) => (
                      <div key={`${log.id}-${key}`} className="text-[11px] rounded border border-slate-100 bg-white p-2">
                        <div className="font-medium text-slate-700">{fieldLabel(key)}</div>
                        <div className="text-teal-700">
                          <span className="font-medium">{valueText(value)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : changedKeys.length > 0 ? (
                  <div className="mt-2 space-y-1.5">
                    {changedKeys.map((key) => (
                      <div key={`${log.id}-${key}`} className="text-[11px] rounded border border-slate-100 bg-slate-50 p-2">
                        <div className="font-medium text-slate-700">{fieldLabel(key)}</div>
                        {previous[key] !== undefined && (
                          <div className="text-slate-500">
                            Old: <span className="line-through">{valueText(previous[key])}</span>
                          </div>
                        )}
                        <div className="text-teal-700">
                          New: <span className="font-medium">{valueText(current[key])}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-slate-500">Activity recorded.</p>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );

  const renderFormColumn = (opts: { showInquiryList: boolean }) => (
    <div className="space-y-6">
      {opts.showInquiryList && mode === "view" && leadInquiries.length > 0 && (
        <Card className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Available Inquiries</h3>
            <p className="text-xs text-gray-600 mt-1">Select an inquiry to view or edit</p>
          </div>
          <div className="p-4">
            <div className="flex flex-wrap gap-2">
              {leadInquiries.map((inq) => {
                const isApproved = salesInquiryIsApproved(inq, approvedInquiryId);
                return (
                  <Button
                    key={inq.id}
                    type="button"
                    variant={selectedInquiryId === inq.id ? "default" : "outline"}
                    size="sm"
                    className="h-9 text-sm rounded-lg font-medium"
                    onClick={() => handleSelectInquiry(inq)}
                  >
                    {inq.product_name?.trim() || "Inquiry"}
                    {isApproved ? " · Approved" : ""}
                  </Button>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {inquiry &&
        ((mode === "view" && !tabbedPage) || (tabbedPage && mainTab === "view")) && (
        <div className="flex justify-end gap-3">
          {isViewEditing ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleCancelViewEdit} disabled={isPending} className="h-10 px-4 rounded-lg">
                Cancel
              </Button>
              <Button type="button" size="sm" className="h-10 px-4 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white" onClick={handleSaveViewEdit} disabled={isPending}>
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleStartViewEdit} className="h-10 px-4 rounded-lg">
                Edit
              </Button>
              <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)} className="h-10 px-4 rounded-lg">
                Delete
              </Button>
            </>
          )}
        </div>
      )}

      {confirmationStatus === "approved" && (
        <Card className="bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-200 rounded-xl overflow-hidden">
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-900">Inquiry Approved</p>
              <p className="text-xs text-emerald-700 mt-1">This inquiry has been approved by the admin. You may proceed with next steps.</p>
            </div>
          </div>
        </Card>
      )}

      {mode === "view" && inquiry?.sent_to_accounting && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="bg-emerald-100 text-emerald-800 border-0 rounded-full px-3 py-1 text-xs font-semibold">
            Sent to Accounting
          </Badge>
          <Badge className="bg-blue-100 text-blue-800 border-0 rounded-full px-3 py-1 text-xs font-semibold">
            Sent to Operations
          </Badge>
          {inquiry.sent_at && (
            <span className="text-xs text-gray-500 font-medium">on {new Date(inquiry.sent_at).toLocaleString()}</span>
          )}
        </div>
      )}

      {/* Product Information Section */}
      <Card className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Product Information</h3>
          <p className="text-xs text-gray-600 mt-1">Provide details about the product you&rsquo;re inquiring about</p>
        </div>
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-900 flex items-center gap-1">
              Product Name <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="e.g. Steel pipes, cotton fabric, electronics components..."
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              disabled={!canEditForm}
              className="h-11 rounded-lg border-gray-200 bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-900">Total Weight</label>
              <div className="relative">
                <Input
                  placeholder="500"
                  value={totalWeight}
                  inputMode={canEditForm ? "numeric" : "text"}
                  pattern={canEditForm ? "[0-9]*" : undefined}
                  onChange={(e) => setTotalWeight(canEditForm ? toDigitsOnly(e.target.value) : e.target.value)}
                  disabled={!canEditForm}
                  className="h-11 rounded-lg border-gray-200 bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 pr-12"
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-500 font-medium">kg</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-900">Total CBM</label>
              <div className="relative">
                <Input
                  placeholder="12.5"
                  value={cbm}
                  inputMode={canEditForm ? "decimal" : "text"}
                  pattern={canEditForm ? "^[0-9]*\\.?[0-9]*$" : undefined}
                  onChange={(e) => setCbm(canEditForm ? toDecimalInput(e.target.value) : e.target.value)}
                  disabled={!canEditForm}
                  className="h-11 rounded-lg border-gray-200 bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 pr-12"
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-500 font-medium">CBM</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-900">Quantity</label>
              <Input
                placeholder="1000"
                value={quantity}
                inputMode={canEditForm ? "numeric" : "text"}
                pattern={canEditForm ? "[0-9]*" : undefined}
                onChange={(e) => setQuantity(canEditForm ? toDigitsOnly(e.target.value) : e.target.value)}
                disabled={!canEditForm}
                className="h-11 rounded-lg border-gray-200 bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Attachments Section */}
      <Card className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Attachments
          </h3>
          <p className="text-xs text-gray-600 mt-1">Upload images or documents to support your inquiry</p>
        </div>
        <div className="p-4">
          {canEditForm ? (
            <div
              className={`border-2 border-dashed rounded-xl p-6 transition-all duration-200 ${
                isDragging 
                  ? "border-blue-400 bg-blue-50" 
                  : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {imageDataList.length === 0 ? (
                <label htmlFor={inquiryImageInputId} className="block cursor-pointer text-center">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-gray-400" />
                  </div>
                  <p className="text-base font-semibold text-gray-700 mb-2">
                    {isDragging ? "Drop files here..." : "Upload Files & Documents"}
                  </p>
                  <p className="text-sm text-gray-500 mb-4">
                    Drag and drop files here, or click to browse
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 mb-4">
                    <Badge className="bg-blue-100 text-blue-700 border-0 px-3 py-1 text-xs font-semibold">📷 Images</Badge>
                    <Badge className="bg-green-100 text-green-700 border-0 px-3 py-1 text-xs font-semibold">📄 PDF</Badge>
                    <Badge className="bg-purple-100 text-purple-700 border-0 px-3 py-1 text-xs font-semibold">📝 Word</Badge>
                    <Badge className="bg-orange-100 text-orange-700 border-0 px-3 py-1 text-xs font-semibold">📊 Excel</Badge>
                    <Badge className="bg-gray-100 text-gray-700 border-0 px-3 py-1 text-xs">Max 5MB each</Badge>
                  </div>
                  <p className="text-xs text-gray-400">
                    Paste with <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">Ctrl+V</kbd>
                  </p>
                </label>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {imageDataList.map((fileData, idx) => {
                      const isImage = isImageData(fileData);
                      const docInfo = !isImage ? getAttachmentDisplayInfo(fileData) : null;
                      
                      return (
                        <div key={`${fileData.slice(0, 30)}-${idx}`} className="relative group">
                          <div className="aspect-square border-2 border-gray-200 rounded-lg p-2 bg-white flex items-center justify-center">
                            {isImage ? (
                              <img
                                src={fileData}
                                alt={`Image ${idx + 1}`}
                                className="w-full h-full rounded-md object-cover"
                              />
                            ) : docInfo ? (
                              <div className="text-center p-2 w-full">
                                <div className="text-4xl mb-2">
                                  {getFileIcon(docInfo.type)}
                                </div>
                                <div className="text-xs font-semibold text-gray-700 truncate mb-1">
                                  {docInfo.name}
                                </div>
                                {docInfo.legacyMissing ? (
                                  <div className="text-[10px] text-amber-700">Re-upload required</div>
                                ) : docInfo.url ? (
                                  <a
                                    href={docInfo.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-blue-600 hover:underline"
                                  >
                                    Download
                                  </a>
                                ) : null}
                              </div>
                            ) : (
                              <div className="text-center p-2">
                                <div className="text-4xl mb-2">📎</div>
                                <div className="text-xs text-gray-500">Unknown File</div>
                              </div>
                            )}
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="absolute -top-2 -right-2 h-7 w-7 p-0 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => removeImage(idx)}
                            type="button"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                    <label
                      htmlFor={inquiryImageInputId}
                      className="aspect-square border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer flex flex-col items-center justify-center text-gray-500 hover:text-gray-600"
                      title="Add more files"
                    >
                      <Plus className="h-6 w-6 mb-2" />
                      <span className="text-xs font-semibold">Add More</span>
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 text-center">Drag, drop, or paste to add more files</p>
                </div>
              )}
              <input
                id={inquiryImageInputId}
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,.doc,.docx,.xlsx,.xls"
                multiple
                className="sr-only"
                onChange={handleFileSelect}
              />
            </div>
          ) : (
            imageDataList.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {imageDataList.map((fileData, idx) => {
                  const isImage = isImageData(fileData);
                  const docInfo = !isImage ? getAttachmentDisplayInfo(fileData) : null;
                  
                  return (
                    <div key={`${fileData.slice(0, 30)}-${idx}`} className="aspect-square border-2 border-gray-200 rounded-lg p-2 bg-white flex items-center justify-center">
                      {isImage ? (
                        <img
                          src={fileData}
                          alt={`Image ${idx + 1}`}
                          className="w-full h-full rounded-md object-cover"
                        />
                      ) : docInfo ? (
                        <div className="text-center p-2 w-full">
                          <div className="text-4xl mb-2">
                            {getFileIcon(docInfo.type)}
                          </div>
                          <div className="text-xs font-semibold text-gray-700 truncate mb-1">
                            {docInfo.name}
                          </div>
                          {docInfo.legacyMissing ? (
                            <div className="text-[10px] text-amber-700">Unavailable</div>
                          ) : docInfo.url ? (
                            <a
                              href={docInfo.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-blue-600 hover:underline"
                            >
                              Download
                            </a>
                          ) : null}
                        </div>
                      ) : (
                        <div className="text-center p-2">
                          <div className="text-4xl mb-2">📎</div>
                          <div className="text-xs text-gray-500">File</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </Card>

      {/* Additional Details Section */}
      <Card className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Additional Details</h3>
          <p className="text-xs text-gray-600 mt-1">Provide any additional specifications, requirements, or notes</p>
        </div>
        <div className="p-4">
          <Textarea
            placeholder="Enter specifications, quality requirements, delivery preferences, or any other relevant details..."
            value={otherDetails}
            onChange={(e) => setOtherDetails(e.target.value)}
            rows={4}
            className="resize-none rounded-lg border-gray-200 bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            disabled={!canEditForm}
          />
        </div>
      </Card>

      {inquiry?.id && (
        <Card className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Inquiry Conversation</h3>
            <p className="text-xs text-gray-600 mt-1">Messages are shown only for this inquiry.</p>
          </div>
          <div className="p-4 space-y-3">
            <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
              {chatMessages.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">No messages yet.</p>
              ) : (
                chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-lg border p-2.5 text-sm ${
                      message.sender_role === "sales_agent"
                        ? "bg-blue-50 border-blue-200"
                        : "bg-white border-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-700">
                        {message.sender_role === "sales_agent"
                          ? "Sales"
                          : message.sender_role === "operations"
                            ? "Operations"
                            : "Admin"}{" "}
                        · {message.sender_username}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(message.created_at).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-slate-700 whitespace-pre-wrap">{message.message}</p>
                  </div>
                ))
              )}
            </div>
            <div className="space-y-2">
              <Textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a message for Operations..."
                rows={2}
                className="bg-white text-sm resize-none"
              />
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => void handleSendChatMessage()}
                  disabled={isSendingChat || !chatInput.trim()}
                  className="h-9 rounded-lg bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {isSendingChat ? "Sending..." : "Send Message"}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Action Buttons */}
      {isCreateFlow && (
        <Card className="bg-gradient-to-r from-gray-50 to-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
          <div className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Button 
                onClick={handleSaveInquiry} 
                disabled={isPending} 
                variant="outline" 
                className="flex-1 h-12 rounded-lg border-2 font-semibold"
              >
                {isPending ? "Saving..." : "Save as Draft"}
              </Button>
              <Button
                onClick={handleSendInquiry}
                disabled={isPending || !isFormValid}
                className="flex-1 h-12 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold shadow-lg"
              >
                <Send className="h-5 w-5 mr-2" />
                {isPending ? "Sending..." : "Send Inquiry"}
              </Button>
            </div>
            {!isFormValid && (
              <p className="text-xs text-red-500 mt-2 text-center">Please fill in the product name to send the inquiry</p>
            )}
          </div>
        </Card>
      )}
    </div>
  );

  const pageSideNav = tabbedPage ? (
    <nav
      aria-label="Inquiry workflow navigation"
      className="flex lg:flex-col gap-2 w-full lg:w-64 shrink-0"
    >
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Inquiry Workflow</h3>
          <p className="text-xs text-gray-600 mt-1">Manage lead inquiries and track progress</p>
        </div>
        <div className="p-2 space-y-1">
          {(
            [
              { 
                id: "create" as const, 
                label: "Create New Inquiry", 
                icon: Plus,
                description: "Start a new inquiry for this lead",
                color: "blue"
              },
              { 
                id: "view" as const, 
                label: "View Inquiries", 
                icon: List,
                description: "Browse all existing inquiries",
                color: "purple"
              },
              { 
                id: "status" as const, 
                label: "Inquiry Status", 
                icon: Activity,
                description: "Track inquiry progress and updates",
                color: "green"
              },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const activeTab = mainTab === t.id;
            const isCreateTab = t.id === "create";
            const isDisabled = isCreateTab && !allowInquiry;
            
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  if (isDisabled) {
                    toast.error(`Send Inquiry is only available from the "Inquiry Received" board. Current board: ${boardStatus || lead?.status}`);
                    return;
                  }
                  setMainTab(t.id);
                }}
                disabled={isDisabled}
                className={`
                  w-full text-left p-3 rounded-lg transition-all duration-200 group relative
                  ${isDisabled 
                    ? "bg-gray-50 text-gray-400 cursor-not-allowed opacity-60" 
                    : activeTab
                    ? `bg-gradient-to-r ${
                        t.color === "blue" ? "from-blue-500 to-blue-600" :
                        t.color === "purple" ? "from-purple-500 to-purple-600" :
                        "from-green-500 to-green-600"
                      } text-white shadow-lg transform scale-[1.02]`
                    : "bg-gray-50 hover:bg-gray-100 text-gray-700 hover:text-gray-900"
                  }
                `}
              >
                <div className="flex items-start gap-3">
                  <div className={`
                    w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                    ${activeTab && !isDisabled
                      ? "bg-white/20" 
                      : isDisabled 
                      ? "bg-gray-200" 
                      : `bg-${t.color}-100`
                    }
                  `}>
                    <Icon className={`h-4 w-4 ${
                      activeTab && !isDisabled 
                        ? "text-white" 
                        : isDisabled 
                        ? "text-gray-400" 
                        : `text-${t.color}-600`
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-semibold text-sm leading-tight ${
                      activeTab && !isDisabled ? "text-white" : ""
                    }`}>
                      {t.label}
                    </div>
                    <div className={`text-xs mt-1 leading-relaxed ${
                      activeTab && !isDisabled 
                        ? "text-white/80" 
                        : isDisabled 
                        ? "text-gray-400" 
                        : "text-gray-500"
                    }`}>
                      {t.description}
                    </div>
                    {isCreateTab && !allowInquiry && (
                      <Badge className="mt-2 bg-orange-100 text-orange-700 text-xs px-2 py-1 font-medium">
                        Inquiry Received Only
                      </Badge>
                    )}
                  </div>
                </div>
                {activeTab && !isDisabled && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  ) : null;

  return (
    <>
    <div className={layout === "page" ? "min-h-screen bg-slate-50" : ""}>
      {layout === "page" && (
        <header className="border-b border-slate-200 bg-white">
          <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2 min-w-0">
              <Link
                href="/sales-agent/dashboard"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to dashboard
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-slate-900 truncate">
                  Lead details — {lead.name || "Lead"}
                </h1>
                {lead.lead_id_formatted && (
                  <span className="text-xs font-mono text-slate-500">#{lead.lead_id_formatted}</span>
                )}
              </div>
              <p className="text-sm text-slate-600">{lead.number}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="rounded-sm text-xs font-normal border-slate-200 bg-slate-50">
                  {lead.status}
                </Badge>
                <Badge variant="outline" className="rounded-sm text-xs font-normal border-slate-200 bg-slate-50">
                  {lead.source}
                </Badge>
              </div>
            </div>
          </div>
        </header>
      )}

      {layout === "dialog" && (
        <div className="px-6 pt-5 pb-3 border-b border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-5 w-5 text-slate-700 shrink-0" />
              <span className="text-base font-semibold text-slate-900 truncate">Inquiry — {lead.name}</span>
            </div>
            <Badge variant="outline" className="rounded-sm text-xs border-slate-200 shrink-0">
              {mode === "create" ? "Create inquiry" : isViewEditing ? "Editing" : "View inquiry"}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">Complete the form; logs update on the right.</p>
        </div>
      )}

      <div className={layout === "page" ? "max-w-6xl mx-auto px-4 py-6" : "p-4 sm:p-6"}>
        {isLoading ? (
          <div className="py-10 text-center text-secondary-muted text-sm">Loading inquiry data...</div>
        ) : mode === "view" && leadInquiries.length === 0 && !tabbedPage ? (
          <div className="py-16 flex flex-col items-center justify-center gap-4 border border-dashed border-slate-200 rounded-sm bg-white">
            <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center">
              <Inbox className="h-7 w-7 text-slate-500" />
            </div>
            <h3 className="text-base font-semibold text-slate-800">No inquiry found</h3>
            <p className="text-sm text-slate-500 text-center max-w-sm">
              Create one from the Inquiry Received card using the Send button.
            </p>
            <Button
              variant="outline"
              className="rounded-sm"
              onClick={() => {
                onRequestClose?.();
                if (layout === "page") router.push("/sales-agent/dashboard");
              }}
            >
              Back to dashboard
            </Button>
          </div>
        ) : tabbedPage ? (
          <div className="flex flex-col lg:flex-row gap-6">
            {pageSideNav}
            <div className="flex-1 min-w-0 space-y-6">
              {mainTab === "create" && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-4">{renderFormColumn({ showInquiryList: false })}</div>
                  <div className="space-y-4 lg:col-span-1">{renderInquiryLogsPanel()}</div>
                </div>
              )}
              {mainTab === "view" && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Inquiries Sidebar */}
                  <div className="lg:col-span-1 space-y-4">
                    <Card className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
                      <div className="bg-gradient-to-r from-purple-50 to-blue-50 px-4 py-3 border-b border-gray-200">
                        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                          <List className="h-4 w-4" />
                          All Inquiries
                        </h3>
                        <p className="text-xs text-gray-600 mt-1">Select an inquiry to view details</p>
                      </div>
                      <div className="p-2">
                        {/* Workflow constraint notification */}
                        {!allowInquiry && (
                          <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 mb-3">
                            <div className="flex items-start gap-2">
                              <div className="w-6 h-6 bg-orange-200 rounded-full flex items-center justify-center flex-shrink-0">
                                <History className="h-3 w-3 text-orange-600" />
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold text-orange-800 mb-1">
                                  Limited Access
                                </h4>
                                <p className="text-xs text-orange-700 leading-relaxed">
                                  New inquiries can only be created from the &ldquo;Inquiry Received&rdquo; board.
                                  Current: <span className="font-semibold">{boardStatus || lead?.status}</span>
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {leadInquiries.length === 0 ? (
                          <div className="text-center py-8">
                            <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
                              <Inbox className="h-6 w-6 text-gray-400" />
                            </div>
                            <p className="text-sm font-semibold text-gray-700 mb-1">No Inquiries Yet</p>
                            <p className="text-xs text-gray-500 leading-relaxed">
                              {!allowInquiry 
                                ? "Move this lead to 'Inquiry Received' board to create inquiries."
                                : "Use 'Create New Inquiry' to get started."
                              }
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {leadInquiries.map((inq) => {
                              const isApproved = salesInquiryIsApproved(inq, approvedInquiryId);
                              return (
                                <button
                                  key={inq.id}
                                  type="button"
                                  onClick={() => handleSelectInquiry(inq)}
                                  className={`w-full text-left p-3 rounded-lg border transition-all duration-200 ${
                                    selectedInquiryId === inq.id 
                                      ? "bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200 shadow-sm" 
                                      : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold text-sm text-gray-900 truncate mb-1">
                                        {inq.product_name?.trim() || "Unnamed Inquiry"}
                                      </p>
                                      <p className="text-xs text-gray-500 mb-2">
                                        {inq.created_at && new Date(inq.created_at).toLocaleDateString()}
                                      </p>
                                      <Badge 
                                        className={`text-xs px-2 py-1 rounded-full border-0 font-semibold ${
                                          isApproved 
                                            ? "bg-emerald-100 text-emerald-800" 
                                            : "bg-amber-100 text-amber-800"
                                        }`}
                                      >
                                        {isApproved ? "Approved" : "Pending"}
                                      </Badge>
                                    </div>
                                    {selectedInquiryId === inq.id && (
                                      <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1"></div>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </Card>
                  </div>

                  {/* Inquiry Details */}
                  <div className="lg:col-span-2 space-y-4">
                    {leadInquiries.length > 0 && inquiry ? (
                      <>
                        {renderFormColumn({ showInquiryList: false })}
                        {renderInquiryLogsPanel(true)}
                      </>
                    ) : leadInquiries.length > 0 ? (
                      <Card className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
                        <div className="p-8 text-center">
                          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                            <FileText className="h-8 w-8 text-gray-400" />
                          </div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">Select an Inquiry</h3>
                          <p className="text-sm text-gray-600">
                            Choose an inquiry from the sidebar to view its details and make edits.
                          </p>
                        </div>
                      </Card>
                    ) : null}
                  </div>
                </div>
              )}
              {mainTab === "status" && (
                <div className="space-y-6">
                  {/* Header Section */}
                  <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 shadow-sm border border-gray-200 rounded-xl overflow-hidden">
                    <div className="p-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        Inquiry Progress Tracker
                      </h3>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        Track the status of all your inquiries. Approved inquiries show final rates and can be acted upon. 
                        Pending inquiries are being reviewed by Operations and Admin teams.
                      </p>
                    </div>
                  </Card>

                  {/* Statistics Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
                      <div className="p-4 text-center">
                        <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
                          <div className="w-6 h-6 bg-gray-500 rounded-full"></div>
                        </div>
                        <div className="text-2xl font-bold text-gray-900 mb-1">{leadInquiries.length}</div>
                        <div className="text-sm font-semibold text-gray-600">Total Inquiries</div>
                      </div>
                    </Card>
                    <Card className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
                      <div className="p-4 text-center">
                        <div className="w-12 h-12 mx-auto mb-3 bg-emerald-100 rounded-full flex items-center justify-center">
                          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                        </div>
                        <div className="text-2xl font-bold text-emerald-700 mb-1">{approvedRows.length}</div>
                        <div className="text-sm font-semibold text-emerald-600">Approved</div>
                      </div>
                    </Card>
                    <Card className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
                      <div className="p-4 text-center">
                        <div className="w-12 h-12 mx-auto mb-3 bg-amber-100 rounded-full flex items-center justify-center">
                          <Clock className="h-6 w-6 text-amber-600" />
                        </div>
                        <div className="text-2xl font-bold text-amber-700 mb-1">
                          {Math.max(leadInquiries.length - approvedRows.length, 0)}
                        </div>
                        <div className="text-sm font-semibold text-amber-600">Pending Review</div>
                      </div>
                    </Card>
                  </div>

                  {/* Inquiries List */}
                  {statusTabInquiries.length === 0 ? (
                    <Card className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
                      <div className="p-8 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                          <Inbox className="h-8 w-8 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Inquiries Yet</h3>
                        <p className="text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
                          Create and send your first inquiry from the &ldquo;Create New Inquiry&rdquo; tab to start tracking progress here.
                        </p>
                      </div>
                    </Card>
                  ) : (
                    <Card className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
                      <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900">Lead: {lead.name || "Unnamed Lead"}</h3>
                            <p className="text-xs text-gray-600 mt-1">
                              {lead.lead_id_formatted ? `#${lead.lead_id_formatted}` : `ID ${lead.id.slice(0, 8)}…`}
                            </p>
                          </div>
                          <Badge className="bg-blue-100 text-blue-800 border-0 px-3 py-1 text-xs font-semibold">
                            {statusTabInquiries.length} {statusTabInquiries.length === 1 ? 'Inquiry' : 'Inquiries'}
                          </Badge>
                        </div>
                      </div>
                      <div className="p-6">
                        <div className="grid gap-4">
                          {statusTabInquiries.map((inq, idx) => {
                            const isApproved = salesInquiryIsApproved(inq, approvedInquiryId);
                            const inquiryPricing = getInquiryPricingForDisplay(inq, pricingByInquiryId);
                            const title = inq.product_name?.trim() || "Product TBD";
                            const createdDate = inq.created_at ? new Date(inq.created_at).toLocaleDateString() : 'Unknown date';
                            
                            const cardContent = (
                              <div className="p-4">
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-semibold text-gray-900 mb-1">
                                      Inquiry #{idx + 1}
                                    </h4>
                                    <p className="text-xs text-gray-600">{createdDate}</p>
                                  </div>
                                  <Badge
                                    className={`text-xs px-3 py-1 rounded-full border-0 font-semibold ${
                                      isApproved
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-amber-100 text-amber-800"
                                    }`}
                                  >
                                    {isApproved ? "Approved" : "Pending"}
                                  </Badge>
                                </div>
                                
                                <p className="text-sm font-semibold text-gray-800 mb-3">{title}</p>
                                
                                {isApproved ? (
                                  <div className="space-y-3">
                                    <p className="text-xs text-emerald-700 font-medium">
                                      ✓ Ready for next steps - Click to view pricing details
                                    </p>
                                    {inquiryPricing && (
                                      <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                                        <div className="grid grid-cols-2 gap-3 text-xs">
                                          <div>
                                            <p className="text-emerald-600 font-medium">Unit Price</p>
                                            <p className="text-emerald-900 font-semibold">
                                              {formatInquiryMoney(inquiryPricing.unit_price)}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-emerald-600 font-medium">Total Amount</p>
                                            <p className="text-emerald-900 font-semibold">
                                              {formatInquiryMoney(inquiryPricing.total_amount)}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-xs text-amber-700">
                                    <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></div>
                                    <p className="font-medium">Under review by Operations and Admin</p>
                                  </div>
                                )}
                              </div>
                            );

                            return isApproved ? (
                              <button
                                key={inq.id}
                                type="button"
                                onClick={() => void openApprovedInquiryDetail(inq)}
                                className="w-full text-left border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl shadow-sm hover:shadow-lg hover:border-emerald-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                              >
                                {cardContent}
                              </button>
                            ) : (
                              <div
                                key={inq.id}
                                className="w-full border-2 border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl shadow-sm"
                              >
                                {cardContent}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </Card>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="space-y-5 lg:col-span-2">{renderFormColumn({ showInquiryList: true })}</div>
            <div className="lg:col-span-1 space-y-4">{renderInquiryLogsPanel()}</div>
          </div>
        )}
      </div>
    </div>

    <Dialog open={approvedDetailOpen} onOpenChange={setApprovedDetailOpen}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto rounded-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-slate-900">{approvedDetailTitle}</DialogTitle>
          <DialogDescription>
            Summary of the inquiry and the final rates from admin (read-only).
          </DialogDescription>
        </DialogHeader>
        {approvedDetailLoading ? (
          <p className="text-sm text-slate-500 py-2">Loading approved rates…</p>
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-sm p-4 leading-relaxed">
            {approvedDetailText}
          </pre>
        )}
      </DialogContent>
    </Dialog>
    <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <DialogContent className="sm:max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle>Delete Inquiry</DialogTitle>
          <DialogDescription>
            This will permanently remove this inquiry. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void handleDeleteInquiry()} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete Inquiry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
