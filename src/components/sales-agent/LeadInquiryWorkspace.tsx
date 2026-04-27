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
  type LeadInquiry,
  type InquiryLog,
  type InquiryQuotation,
} from "@/app/actions/inquiries";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

function pickPrimaryQuotation(quotations: InquiryQuotation[]): InquiryQuotation | null {
  if (!quotations.length) return null;
  const sent = quotations.find((q) => q.sent_to_agent);
  if (sent) return sent;
  return quotations.reduce((best, q) => (q.version > best.version ? q : best), quotations[0]);
}

function formatInquiryMoney(n: number) {
  return `Rs. ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isDecimalString(value: string) {
  if (!value.trim()) return true;
  return /^(?:\d+|\d+\.\d+|\d*\.\d+)$/.test(value.trim());
}

function buildApprovedInquiryDetailText(inq: LeadInquiry, quotations: InquiryQuotation[]): string {
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
  if (q) {
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
    lines.push("No quotation is on file yet. If you expected rates here, contact Operations.");
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
}: {
  lead: Lead | null;
  mode?: "create" | "view";
  active: boolean;
  layout: "dialog" | "page";
  onRequestClose?: () => void;
  /** When set on the lead detail page, selects this sidebar tab once on load. */
  initialMainTab?: MainTab;
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
  const [selectedInquiryId, setSelectedInquiryId] = useState<string>("");
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

  const [mainTab, setMainTab] = useState<MainTab>(() => initialMainTab ?? "create");
  const [approvedDetailOpen, setApprovedDetailOpen] = useState(false);
  const [approvedDetailLoading, setApprovedDetailLoading] = useState(false);
  const [approvedDetailText, setApprovedDetailText] = useState("");
  const [approvedDetailTitle, setApprovedDetailTitle] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pricingByInquiryId, setPricingByInquiryId] = useState<
    Record<string, { quotation_number: string; unit_price: number; total_amount: number; notes: string | null }>
  >({});

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
          const pricingResult = await getLatestQuotationPricingByInquiryIds(approvedInquiryIds);
          if (!("error" in pricingResult)) {
            setPricingByInquiryId(pricingResult.pricing || {});
          } else {
            setPricingByInquiryId({});
          }
        } else {
          setPricingByInquiryId({});
        }
        setApprovedInquiryId(nextApprovedFallback);

        const selected = selectedInquiryId
          ? list.find((x) => x.id === selectedInquiryId) || null
          : null;
        const current =
          mode === "create"
            ? (selected || list[0] || null)
            : layout === "page"
              ? selected
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
  }, [lead, selectedInquiryId, mode, layout]);

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

  // Handle image files (from drop, paste, or file input)
  const handleImageFiles = useCallback(async (files: File[]) => {
    const validFiles = files.filter((file) => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`"${file.name}" is larger than 5MB`);
        return false;
      }
      if (!file.type.startsWith("image/")) {
        toast.error(`"${file.name}" is not an image file`);
        return false;
      }
      return true;
    });
    if (validFiles.length === 0) return;
    try {
      const urls = await Promise.all(validFiles.map((file) => readImageAsDataUrl(file)));
      setImageDataList((prev) => [...prev, ...urls.filter((u) => u.length > 0)]);
    } catch {
      toast.error("Failed to process selected image(s)");
    }
  }, [readImageAsDataUrl]);

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
            void handleImageFiles([file]);
          }
          break;
        }
      }
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [active, handleImageFiles]);

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
      void handleImageFiles(Array.from(files));
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) {
      void handleImageFiles(Array.from(files));
    }
    // Reset input so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeImage(index: number) {
    setImageDataList((prev) => prev.filter((_, i) => i !== index));
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
    },
    [approvedInquiryId]
  );

  const openApprovedInquiryDetail = useCallback(
    async (inq: LeadInquiry) => {
      if (!salesInquiryIsApproved(inq, approvedInquiryId)) return;
      const label = inq.product_name?.trim() || "Inquiry";
      setApprovedDetailTitle(`${label} — approved`);
      setApprovedDetailOpen(true);
      setApprovedDetailLoading(true);
      setApprovedDetailText("");
      const result = await getQuotationsForInquiry(inq.id);
      setApprovedDetailLoading(false);
      if ("error" in result) {
        toast.error(result.error);
        setApprovedDetailText(
          `${buildApprovedInquiryDetailText(inq, [])}\n\n---\nCould not load quotation: ${result.error}`
        );
        return;
      }
      setApprovedDetailText(buildApprovedInquiryDetailText(inq, result.quotations || []));
    },
    [approvedInquiryId]
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
      const result = await saveInquiry(lead.id, {
        product_name: productName,
        total_weight: totalWeight,
        cbm,
        quantity,
        image_url: imageDataList[0] || null,
        additional_image_urls: imageDataList.slice(1),
        description: otherDetails,
      }, inquiry?.id, {
        forceNewInquiry:
          (mode === "create" && !inquiry?.id) ||
          (layout === "page" && mainTab === "create" && !inquiry?.id),
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
      // Save first
      const saveResult = await saveInquiry(lead.id, {
        product_name: productName,
        total_weight: totalWeight,
        cbm,
        quantity,
        image_url: imageDataList[0] || null,
        additional_image_urls: imageDataList.slice(1),
        description: otherDetails,
      }, inquiry?.id, {
        forceNewInquiry:
          (mode === "create" && !inquiry?.id) ||
          (layout === "page" && mainTab === "create" && !inquiry?.id),
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
    <div className="space-y-5">
      {opts.showInquiryList && mode === "view" && leadInquiries.length > 0 && (
        <div className="rounded-sm border border-slate-200 bg-white p-3 space-y-2">
          <p className="text-xs font-medium text-slate-600">Open an inquiry</p>
          <div className="flex flex-wrap gap-2">
            {leadInquiries.map((inq) => {
              const isApproved = salesInquiryIsApproved(inq, approvedInquiryId);
              return (
                <Button
                  key={inq.id}
                  type="button"
                  variant={selectedInquiryId === inq.id ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-xs rounded-sm"
                  onClick={() => handleSelectInquiry(inq)}
                >
                  {inq.product_name?.trim() || "Inquiry"}
                  {isApproved ? " · Approved" : ""}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {inquiry &&
        ((mode === "view" && !tabbedPage) || (tabbedPage && mainTab === "view")) && (
        <div className="flex justify-end gap-2">
          {isViewEditing ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleCancelViewEdit} disabled={isPending}>
                Cancel
              </Button>
              <Button type="button" size="sm" className="bg-slate-900 hover:bg-slate-800 text-white" onClick={handleSaveViewEdit} disabled={isPending}>
                {isPending ? "Saving..." : "Save changes"}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleStartViewEdit}>
                Edit
              </Button>
              <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
                Delete
              </Button>
            </>
          )}
        </div>
      )}

      {confirmationStatus === "approved" && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Inquiry approved</p>
            <p className="text-xs text-emerald-700">This inquiry has been approved by the admin. You may proceed.</p>
          </div>
        </div>
      )}

      {mode === "view" && inquiry?.sent_to_accounting && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 rounded-sm text-xs">
            Sent to accounting
          </Badge>
          <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 rounded-sm text-xs">
            Sent to operations
          </Badge>
          {inquiry.sent_at && (
            <span className="text-xs text-secondary-muted">on {new Date(inquiry.sent_at).toLocaleString()}</span>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">
          Product name <span className="text-red-500">*</span>
        </label>
        <Input
          placeholder="e.g. Steel pipes, cotton fabric..."
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          disabled={!canEditForm}
          className="h-10 rounded-sm border-slate-200 bg-white"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Total weight (kg)</label>
          <Input
            placeholder="e.g. 500"
            value={totalWeight}
            inputMode={canEditForm ? "numeric" : "text"}
            pattern={canEditForm ? "[0-9]*" : undefined}
            onChange={(e) => setTotalWeight(canEditForm ? toDigitsOnly(e.target.value) : e.target.value)}
            disabled={!canEditForm}
            className="h-10 rounded-sm border-slate-200 bg-white"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">CBM (cubic meter)</label>
          <Input
            placeholder="e.g. 12"
            value={cbm}
            inputMode={canEditForm ? "decimal" : "text"}
            pattern={canEditForm ? "^[0-9]*\\.?[0-9]*$" : undefined}
            onChange={(e) => setCbm(canEditForm ? toDecimalInput(e.target.value) : e.target.value)}
            disabled={!canEditForm}
            className="h-10 rounded-sm border-slate-200 bg-white"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Quantity</label>
        <Input
          placeholder="e.g. 1000"
          value={quantity}
          inputMode={canEditForm ? "numeric" : "text"}
          pattern={canEditForm ? "[0-9]*" : undefined}
          onChange={(e) => setQuantity(canEditForm ? toDigitsOnly(e.target.value) : e.target.value)}
          disabled={!canEditForm}
          className="h-10 rounded-sm border-slate-200 bg-white"
        />
      </div>

      {canEditForm ? (
        <div className="space-y-1.5">
          <label className="text-sm font-medium flex items-center gap-1">
            <ImageIcon className="h-4 w-4" /> Images
          </label>
          <div
            className={`border border-dashed rounded-sm p-4 transition-colors ${
              isDragging ? "border-slate-500 bg-slate-50" : "border-slate-300 hover:border-slate-400"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {imageDataList.length === 0 ? (
              <label htmlFor={inquiryImageInputId} className="block cursor-pointer text-center">
                <ImageIcon className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                <p className="text-sm text-slate-600 font-medium">
                  {isDragging ? "Drop image(s) here..." : "Drag and drop images here"}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  or click to browse · Paste with{" "}
                  <kbd className="px-1 py-0.5 bg-slate-100 rounded text-[10px] font-mono">Ctrl+V</kbd>
                </p>
                <p className="text-[10px] text-slate-400 mt-1">Max 5MB each</p>
              </label>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {imageDataList.map((img, idx) => (
                    <div key={`${img.slice(0, 30)}-${idx}`} className="relative border rounded-sm p-1.5 bg-white">
                      <img
                        src={img}
                        alt={`Inquiry attachment ${idx + 1}`}
                        className="h-28 w-full rounded-sm object-contain bg-slate-50"
                      />
                      <Button
                        variant="destructive"
                        size="sm"
                        className="absolute top-1 right-1 h-6 w-6 p-0"
                        onClick={() => removeImage(idx)}
                        type="button"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <label
                    htmlFor={inquiryImageInputId}
                    className="h-28 border rounded-sm border-dashed bg-white hover:bg-slate-50 transition-colors cursor-pointer flex flex-col items-center justify-center text-slate-500"
                    title="Add more images"
                  >
                    <Plus className="h-5 w-5 mb-1" />
                    <span className="text-xs font-medium">Add</span>
                  </label>
                </div>
                <p className="text-[10px] text-slate-400">Drag, drop, or paste to add more.</p>
              </div>
            )}
            <input
              id={inquiryImageInputId}
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={handleFileSelect}
            />
          </div>
        </div>
      ) : (
        imageDataList.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1">
              <ImageIcon className="h-4 w-4" /> Images
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {imageDataList.map((img, idx) => (
                <div key={`${img.slice(0, 30)}-${idx}`} className="border rounded-sm p-1.5 bg-white">
                  <img
                    src={img}
                    alt={`Inquiry attachment ${idx + 1}`}
                    className="h-28 w-full rounded-sm object-contain bg-slate-50"
                  />
                </div>
              ))}
            </div>
          </div>
        )
      )}

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Other details</label>
        <Textarea
          placeholder="Specifications, notes..."
          value={otherDetails}
          onChange={(e) => setOtherDetails(e.target.value)}
          rows={3}
          className="resize-none rounded-sm border-slate-200 bg-white"
          disabled={!canEditForm}
        />
      </div>

      {isCreateFlow && (
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button onClick={handleSaveInquiry} disabled={isPending} variant="outline" className="flex-1 h-10 rounded-sm">
            {isPending ? "Saving..." : "Save draft"}
          </Button>
          <Button
            onClick={handleSendInquiry}
            disabled={isPending || !isFormValid}
            className="flex-1 h-10 rounded-sm bg-slate-900 hover:bg-slate-800 text-white"
          >
            <Send className="h-4 w-4 mr-2" />
            {isPending ? "Sending..." : "Send inquiry"}
          </Button>
        </div>
      )}
    </div>
  );

  const pageSideNav = tabbedPage ? (
    <nav
      aria-label="Inquiry sections"
      className="flex lg:flex-col gap-1 w-full lg:w-52 shrink-0 rounded-sm border border-slate-200 bg-white p-2"
    >
      {(
        [
          { id: "create" as const, label: "Create New Inquiry", icon: Plus },
          { id: "view" as const, label: "View Inquiries", icon: List },
          { id: "status" as const, label: "Inquiry Status", icon: Activity },
        ] as const
      ).map((t) => {
        const Icon = t.icon;
        const activeTab = mainTab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setMainTab(t.id)}
            className={
              activeTab
                ? "flex items-center gap-2 rounded-sm px-3 py-2.5 text-left text-sm font-medium transition-colors bg-slate-900 text-white shadow-sm [&_span]:!text-white [&_svg]:!text-white"
                : "flex items-center gap-2 rounded-sm px-3 py-2.5 text-left text-sm font-medium transition-colors !text-slate-700 hover:bg-slate-100 [&_span]:!text-slate-700 [&_svg]:!text-slate-600 hover:!text-slate-900 hover:[&_span]:!text-slate-900 hover:[&_svg]:!text-slate-900"
            }
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="leading-snug">{t.label}</span>
          </button>
        );
      })}
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
                  <div className="lg:col-span-1 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inquiries</p>
                    {leadInquiries.length === 0 ? (
                      <p className="text-sm text-slate-500 rounded-sm border border-dashed border-slate-200 bg-white p-4">
                        No inquiries yet. Use Create New Inquiry to add one.
                      </p>
                    ) : (
                      <div className="rounded-sm border border-slate-200 bg-white divide-y divide-slate-100">
                        {leadInquiries.map((inq) => {
                          const isApproved = salesInquiryIsApproved(inq, approvedInquiryId);
                          return (
                            <button
                              key={inq.id}
                              type="button"
                              onClick={() => handleSelectInquiry(inq)}
                              className={`w-full text-left px-3 py-3 text-sm transition-colors ${
                                selectedInquiryId === inq.id ? "bg-slate-50" : "hover:bg-slate-50/80"
                              }`}
                            >
                              <span className="font-medium text-slate-900 block truncate">
                                {inq.product_name?.trim() || "Inquiry"}
                              </span>
                              <span className={`text-xs mt-0.5 ${isApproved ? "text-emerald-700" : "text-slate-500"}`}>
                                {isApproved ? "Approved" : "Pending"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="lg:col-span-2 space-y-4">
                    {leadInquiries.length > 0 && inquiry ? (
                      <>
                        {renderFormColumn({ showInquiryList: false })}
                        {renderInquiryLogsPanel(true)}
                      </>
                    ) : null}
                  </div>
                </div>
              )}
              {mainTab === "status" && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600 max-w-2xl">
                    Each numbered inquiry shows whether admin has approved it. Tap an approved inquiry to see full
                    details and final rates. Pending means it is still with Operations or Admin.
                  </p>
                  {statusTabInquiries.length === 0 ? (
                    <p className="text-sm text-slate-500 rounded-sm border border-dashed border-slate-200 bg-white p-6">
                      No inquiries yet. Create and send an inquiry from the Create tab.
                    </p>
                  ) : (
                    <div className="rounded-sm border border-slate-200 bg-white overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent border-slate-200">
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-normal w-[min(220px,32vw)]">
                              Lead
                            </TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-normal">
                              Inquiries on this lead
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow className="hover:bg-slate-50/80 align-top border-slate-100">
                            <TableCell className="whitespace-normal align-top py-4 text-sm text-slate-900">
                              <span className="font-medium block">{lead.name || "Lead"}</span>
                              <span className="text-xs font-mono text-slate-500 mt-1 block">
                                {lead.lead_id_formatted ? `#${lead.lead_id_formatted}` : `ID ${lead.id.slice(0, 8)}…`}
                              </span>
                            </TableCell>
                            <TableCell className="whitespace-normal align-top py-3">
                              <div className="flex flex-wrap gap-2">
                                {statusTabInquiries.map((inq, idx) => {
                                  const isApproved = salesInquiryIsApproved(inq, approvedInquiryId);
                                  const title = inq.product_name?.trim() || "Product TBD";
                                  const body = (
                                    <>
                                      <div className="flex items-start justify-between gap-2">
                                        <span className="text-xs font-semibold text-slate-700">Inquiry {idx + 1}</span>
                                        <Badge
                                          className={
                                            isApproved
                                              ? "shrink-0 text-[10px] h-5 border-0 bg-emerald-600 text-white hover:bg-emerald-600"
                                              : "shrink-0 text-[10px] h-5 border-0 bg-amber-500 text-white hover:bg-amber-500"
                                          }
                                        >
                                          {isApproved ? "Approved" : "Pending"}
                                        </Badge>
                                      </div>
                                      <p className="text-xs text-slate-700 line-clamp-2 leading-snug">{title}</p>
                                      {isApproved ? (
                                        <p className="text-[10px] font-medium text-emerald-800">Tap to view details and rates</p>
                                      ) : (
                                        <p className="text-[10px] text-slate-500">Awaiting approval</p>
                                      )}
                                      {isApproved && pricingByInquiryId[inq.id] ? (
                                        <div className="rounded-sm border border-emerald-200 bg-white px-2 py-1 text-[10px] leading-tight">
                                          <p className="font-semibold text-emerald-900">
                                            Unit: {formatInquiryMoney(pricingByInquiryId[inq.id].unit_price)}
                                          </p>
                                          <p className="font-medium text-emerald-800">
                                            Total: {formatInquiryMoney(pricingByInquiryId[inq.id].total_amount)}
                                          </p>
                                        </div>
                                      ) : null}
                                    </>
                                  );
                                  return isApproved ? (
                                    <button
                                      key={inq.id}
                                      type="button"
                                      onClick={() => void openApprovedInquiryDetail(inq)}
                                      className="min-w-[140px] max-w-[220px] rounded-sm border-2 border-emerald-400 bg-emerald-50/90 shadow-sm p-3 flex flex-col gap-2 text-left cursor-pointer transition-colors hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                                    >
                                      {body}
                                    </button>
                                  ) : (
                                    <div
                                      key={inq.id}
                                      className="min-w-[140px] max-w-[220px] rounded-sm border border-slate-200 bg-slate-50/50 p-3 flex flex-col gap-2"
                                    >
                                      {body}
                                    </div>
                                  );
                                })}
                              </div>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600">
                    <div className="rounded-sm border border-slate-200 bg-white px-3 py-2">
                      <span className="font-medium text-slate-800">Total on file: </span>
                      {leadInquiries.length}
                    </div>
                    <div className="rounded-sm border border-emerald-100 bg-emerald-50/40 px-3 py-2">
                      <span className="font-medium text-emerald-900">Approved: </span>
                      {approvedRows.length}
                    </div>
                    <div className="rounded-sm border border-amber-100 bg-amber-50/40 px-3 py-2">
                      <span className="font-medium text-amber-900">Pending: </span>
                      {Math.max(leadInquiries.length - approvedRows.length, 0)}
                    </div>
                  </div>
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
