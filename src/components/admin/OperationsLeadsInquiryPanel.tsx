"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  getAllInquiriesForOperations,
  updateInquiryForAccounting,
  deleteInquiry,
  getInquiryLogsForLead,
  addInquiryLogNote,
  addInquiryActivity,
  addInquiryCalculatorFieldLog,
  saveInquiryCalculatorField,
  getSharedInquiryCalculatorValues,
  getLeadChatMessages,
  sendLeadChatMessage,
  type LeadInquiryWithLead,
  type InquiryLog,
  type LeadChatMessage,
} from "@/app/actions/inquiries";
import {
  submitInquiryForConfirmation,
  uploadConfirmationImage,
  getConfirmationsForInquiry,
  type InquiryConfirmation,
} from "@/app/actions/inquiry_confirmations";
import { InquiryAttachmentList } from "@/components/inquiry/InquiryAttachmentList";
import { collectInquiryAttachmentUrls } from "@/lib/inquiry-attachments";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  ClipboardList,
  Search,
  ArrowLeft,
  RefreshCcw,
  ImageIcon,
  Package,
  Upload,
  X,
  Loader2,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  CalendarClock,
  Pencil,
  Trash2,
  Save,
} from "lucide-react";

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

function confirmationStatusIcon(status: string) {
  switch (status) {
    case "approved": return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case "rejected": return <XCircle className="h-4 w-4 text-red-600" />;
    case "pending": return <Clock className="h-4 w-4 text-yellow-600" />;
    default: return null;
  }
}

/**
 * Get the latest confirmation status for an inquiry from its confirmations array.
 * Returns the status of the most recent confirmation, or null if none exist.
 */
function getLatestConfirmationStatus(inquiry: LeadInquiryWithLead): string | null {
  const confs = inquiry.inquiry_confirmations;
  if (!confs || confs.length === 0) return null;
  // Sort by created_at descending and return the latest status
  const sorted = [...confs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return sorted[0].status;
}

// ─── Main Component ──────────────────────────────────────────────────

type ViewMode = "list" | "detail";
const PAGE_SIZE = 20;

export function OperationsLeadsInquiryPanel({
  focusLeadId,
  focusInquiryId,
  onFocusHandled,
  adminCalculatorMode = false,
}: {
  focusLeadId?: string | null;
  focusInquiryId?: string | null;
  onFocusHandled?: () => void;
  adminCalculatorMode?: boolean;
} = {}) {
  const [view, setView] = useState<ViewMode>("list");
  const [inquiries, setInquiries] = useState<LeadInquiryWithLead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [selectedInquiry, setSelectedInquiry] = useState<LeadInquiryWithLead | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  // Lead Management Form state
  const [showForm, setShowForm] = useState(false);
  const [formProductName, setFormProductName] = useState("");
  const [formWeight, setFormWeight] = useState("");
  const [formCbm, setFormCbm] = useState("");
  const [formQuantity, setFormQuantity] = useState("");
  const [additionalImage1, setAdditionalImage1] = useState<File | null>(null);
  const [additionalImage1Preview, setAdditionalImage1Preview] = useState<string | null>(null);
  const [additionalImage2, setAdditionalImage2] = useState<File | null>(null);
  const [additionalImage2Preview, setAdditionalImage2Preview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeUploadSlot, setActiveUploadSlot] = useState<1 | 2>(1);
  const img1Ref = useRef<HTMLInputElement>(null);
  const img2Ref = useRef<HTMLInputElement>(null);
  const dropZone1Ref = useRef<HTMLDivElement>(null);
  const dropZone2Ref = useRef<HTMLDivElement>(null);

  // Confirmation history for selected inquiry
  const [confirmations, setConfirmations] = useState<InquiryConfirmation[]>([]);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editProductName, setEditProductName] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [editCbm, setEditCbm] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LeadInquiryWithLead | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [inquiryLogs, setInquiryLogs] = useState<InquiryLog[]>([]);
  const [activeRightTab, setActiveRightTab] = useState<"send_message" | "log_note" | "activity">("send_message");
  const [logNoteText, setLogNoteText] = useState("");
  const [isAddingLogNote, setIsAddingLogNote] = useState(false);
  const [activitySummary, setActivitySummary] = useState("");
  const [activityDueDate, setActivityDueDate] = useState("");
  const [isAddingActivity, setIsAddingActivity] = useState(false);
  const [chatMessages, setChatMessages] = useState<LeadChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ url: string; title: string } | null>(null);

  // Duty calculator state (Operations detail view)
  const [calcInvValue, setCalcInvValue] = useState("0");
  const [calcExchangeRate, setCalcExchangeRate] = useState("0");
  const [calcCustomDutyRate, setCalcCustomDutyRate] = useState("0");
  const [calcAddCdRate, setCalcAddCdRate] = useState("0");
  const [calcGstRate, setCalcGstRate] = useState("0");
  const [calcAddGstRate, setCalcAddGstRate] = useState("0");
  const [calcIncomeTaxRate, setCalcIncomeTaxRate] = useState("0");
  const [calcExciseRate, setCalcExciseRate] = useState("0");
  const [calcRegularDutyRate, setCalcRegularDutyRate] = useState("0");
  const [calcStampDutyRate, setCalcStampDutyRate] = useState("0");
  const [calcInvFine, setCalcInvFine] = useState("0");
  const [calcFreight, setCalcFreight] = useState("0");
  const [calcShippingLineCharges, setCalcShippingLineCharges] = useState("0");
  const [calcClearanceExpense, setCalcClearanceExpense] = useState("0");
  const [calcSalesTaxRate, setCalcSalesTaxRate] = useState("18");
  const [calcUom, setCalcUom] = useState("KG");
  const [calcQuantity, setCalcQuantity] = useState("0");
  const [calcHsCode, setCalcHsCode] = useState("");
  const [lastCalcSnapshot, setLastCalcSnapshot] = useState<Record<string, string>>({});

  const getDefaultCalculatorValues = useCallback(() => ({
    inv_value: "0",
    exchange_rate: "0",
    custom_duty_rate: "0",
    add_cd_rate: "0",
    gst_rate: "0",
    add_gst_rate: "0",
    income_tax_rate: "0",
    excise_rate: "0",
    regular_duty_rate: "0",
    stamp_duty_rate: "0",
    inv_fine: "0",
    freight: "0",
    shipping_line_charges: "0",
    clearance_expense: "0",
    sales_tax_rate: "18",
    uom: "KG",
    quantity: "0",
    hs_code: "",
  }), []);

  const applyCalculatorValues = useCallback((values: Record<string, string>) => {
    setCalcInvValue(values.inv_value ?? "0");
    setCalcExchangeRate(values.exchange_rate ?? "0");
    setCalcCustomDutyRate(values.custom_duty_rate ?? "0");
    setCalcAddCdRate(values.add_cd_rate ?? "0");
    setCalcGstRate(values.gst_rate ?? "0");
    setCalcAddGstRate(values.add_gst_rate ?? "0");
    setCalcIncomeTaxRate(values.income_tax_rate ?? "0");
    setCalcExciseRate(values.excise_rate ?? "0");
    setCalcRegularDutyRate(values.regular_duty_rate ?? "0");
    setCalcStampDutyRate(values.stamp_duty_rate ?? "0");
    setCalcInvFine(values.inv_fine ?? "0");
    setCalcFreight(values.freight ?? "0");
    setCalcShippingLineCharges(values.shipping_line_charges ?? "0");
    setCalcClearanceExpense(values.clearance_expense ?? "0");
    setCalcSalesTaxRate(values.sales_tax_rate ?? "18");
    setCalcUom(values.uom ?? "KG");
    setCalcQuantity(values.quantity ?? "0");
    setCalcHsCode(values.hs_code ?? "");
  }, []);

  const refreshInquiryLogs = useCallback(async (leadId: string) => {
    try {
      const logsResult = await getInquiryLogsForLead(leadId);
      if ("error" in logsResult) {
        setInquiryLogs([]);
      } else {
        setInquiryLogs(logsResult.logs || []);
      }
    } catch {
      setInquiryLogs([]);
    }
  }, []);

  const logCalculatorFieldChange = useCallback(
    async (field: string, currentValue: string) => {
      if (!selectedInquiry) return;
      const previousValue = lastCalcSnapshot[field] ?? "";
      if (previousValue === currentValue) return;
      const saveResult = await saveInquiryCalculatorField(
        selectedInquiry.id,
        field,
        currentValue
      );
      if ("error" in saveResult) {
        toast.error(saveResult.error || "Failed to save calculator value.");
        return;
      }

      await addInquiryCalculatorFieldLog(
        selectedInquiry.id,
        field,
        previousValue,
        currentValue
      );

      setLastCalcSnapshot((prev) => ({ ...prev, [field]: currentValue }));
      await refreshInquiryLogs(selectedInquiry.lead_id);
    },
    [lastCalcSnapshot, refreshInquiryLogs, selectedInquiry]
  );

  const fetchInquiries = useCallback(async (opts?: { append?: boolean; offset?: number; query?: string }) => {
    const append = Boolean(opts?.append);
    const offset = Math.max(Number(opts?.offset || 0), 0);
    const query = String(opts?.query ?? debouncedSearchQuery);
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    try {
      const result = await getAllInquiriesForOperations({
        limit: PAGE_SIZE,
        offset,
        search: query,
      });
      if ("error" in result) {
        toast.error(result.error || "Unable to load inquiries");
        if (!append) {
          setInquiries([]);
          setHasMore(false);
          setNextOffset(0);
        }
      } else {
        const incoming = result.inquiries || [];
        if (append) {
          setInquiries((prev) => {
            const seen = new Set(prev.map((row) => row.id));
            const merged = [...prev];
            for (const row of incoming) {
              if (!seen.has(row.id)) merged.push(row);
            }
            return merged;
          });
        } else {
          setInquiries(incoming);
        }
        setHasMore(Boolean(result.hasMore));
        setNextOffset(Number(result.nextOffset || offset + incoming.length));
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [debouncedSearchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    fetchInquiries({ append: false, offset: 0, query: debouncedSearchQuery });
  }, [fetchInquiries, debouncedSearchQuery]);

  useEffect(() => {
    if ((!focusLeadId && !focusInquiryId) || view !== "list" || inquiries.length === 0) return;
    const target = focusInquiryId
      ? inquiries.find((i) => i.id === focusInquiryId)
      : inquiries
          .filter((i) => i.lead_id === focusLeadId)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    if (target) {
      openDetail(target);
    }
    onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusLeadId, focusInquiryId, inquiries, view]);

  const fetchLeadChat = useCallback(async (leadId: string, inquiryId: string) => {
    try {
      const result = await getLeadChatMessages(leadId, inquiryId);
      if (!("error" in result)) {
        setChatMessages(result.messages || []);
      }
    } catch {
      // Polling failures should not break the page.
    }
  }, []);

  useEffect(() => {
    if (view !== "detail" || !selectedInquiry) return;
    fetchLeadChat(selectedInquiry.lead_id, selectedInquiry.id);
    const timer = setInterval(() => {
      fetchLeadChat(selectedInquiry.lead_id, selectedInquiry.id);
    }, 5000);
    return () => clearInterval(timer);
  }, [view, selectedInquiry, fetchLeadChat]);

  async function openDetail(inquiry: LeadInquiryWithLead) {
    setSelectedInquiry(inquiry);
    setView("detail");
    setShowForm(false);
    resetForm();
    // Calculator must start empty/zero for each inquiry (manual-only entry).
    const defaults = getDefaultCalculatorValues();
    const sharedResult = await getSharedInquiryCalculatorValues();
    const mergedDefaults =
      "error" in sharedResult
        ? defaults
        : { ...defaults, ...(sharedResult.values || {}) };
    applyCalculatorValues(mergedDefaults);
    // Load secondary detail data in parallel to reduce perceived latency.
    const [confirmResult] = await Promise.allSettled([
      getConfirmationsForInquiry(inquiry.id),
      refreshInquiryLogs(inquiry.lead_id),
    ]);
    if (confirmResult.status === "fulfilled") {
      const result = confirmResult.value;
      if ("error" in result) {
        setConfirmations([]);
      } else {
        setConfirmations(result.confirmations || []);
      }
    } else {
      setConfirmations([]);
    }
    setLastCalcSnapshot(mergedDefaults);
    setActiveRightTab("send_message");
    setLogNoteText("");
    setChatInput("");
    setChatMessages([]);
  }

  function backToList() {
    setView("list");
    setSelectedInquiry(null);
    setShowForm(false);
    setInquiryLogs([]);
    setActiveRightTab("send_message");
    setLogNoteText("");
    setChatInput("");
    setChatMessages([]);
    resetForm();
  }

  async function handleSendChatMessage() {
    if (!selectedInquiry) return;
    if (!chatInput.trim()) return;
    setIsSendingChat(true);
    try {
      const result = await sendLeadChatMessage(selectedInquiry.lead_id, chatInput, selectedInquiry.id);
      if ("error" in result) {
        toast.error(result.error || "Failed to send message.");
        return;
      }
      setChatInput("");
      await fetchLeadChat(selectedInquiry.lead_id, selectedInquiry.id);
    } catch {
      toast.error("Failed to send message.");
    } finally {
      setIsSendingChat(false);
    }
  }

  function openLeadManagementForm() {
    if (!selectedInquiry) return;
    setFormProductName(selectedInquiry.product_name || "");
    setFormWeight(selectedInquiry.total_weight || "");
    setFormCbm(selectedInquiry.cbm || "");
    setFormQuantity(selectedInquiry.quantity || "");
    setShowForm(true);
  }

  async function handleAddInquiryLogNote() {
    if (!selectedInquiry) return;
    if (!logNoteText.trim()) {
      toast.error("Please enter a note.");
      return;
    }
    setIsAddingLogNote(true);
    try {
      const result = await addInquiryLogNote(selectedInquiry.id, logNoteText);
      if ("error" in result) {
        toast.error(result.error || "Failed to add note.");
        return;
      }
      toast.success("Note added.");
      setLogNoteText("");
      setActiveRightTab("send_message");
      await refreshInquiryLogs(selectedInquiry.lead_id);
    } catch {
      toast.error("Failed to add note.");
    } finally {
      setIsAddingLogNote(false);
    }
  }

  async function handleAddInquiryActivity() {
    if (!selectedInquiry) return;
    if (!activitySummary.trim()) {
      toast.error("Please enter an activity or reminder.");
      return;
    }
    setIsAddingActivity(true);
    try {
      const result = await addInquiryActivity(
        selectedInquiry.id,
        activitySummary,
        activityDueDate || null
      );
      if ("error" in result) {
        toast.error(result.error || "Failed to add activity.");
        return;
      }
      toast.success("Activity added.");
      setActivitySummary("");
      setActivityDueDate("");
      setActiveRightTab("send_message");
      await refreshInquiryLogs(selectedInquiry.lead_id);
    } catch {
      toast.error("Failed to add activity.");
    } finally {
      setIsAddingActivity(false);
    }
  }

  function resetForm() {
    setFormProductName("");
    setFormWeight("");
    setFormCbm("");
    setFormQuantity("");
    setAdditionalImage1(null);
    setAdditionalImage1Preview(null);
    setAdditionalImage2(null);
    setAdditionalImage2Preview(null);
  }

  // ─── Edit helpers ──────────────────────────────────────────────────

  function startEdit(inq: LeadInquiryWithLead) {
    setEditProductName(inq.product_name || "");
    setEditWeight(inq.total_weight || "");
    setEditCbm(inq.cbm || "");
    setEditQuantity(inq.quantity || "");
    setEditDescription(inq.description || "");
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
  }

  async function handleSaveEdit() {
    if (!selectedInquiry) return;
    if (!editProductName.trim()) {
      toast.error("Product Name is required.");
      return;
    }
    setIsSavingEdit(true);
    try {
      const result = await updateInquiryForAccounting(selectedInquiry.id, {
        product_name: editProductName,
        total_weight: editWeight,
        cbm: editCbm,
        quantity: editQuantity,
        description: editDescription,
      });
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Inquiry updated successfully!");
        // Update the local selected inquiry
        const updatedInquiry = {
          ...selectedInquiry,
          product_name: editProductName.trim(),
          total_weight: editWeight.trim(),
          cbm: editCbm.trim(),
          quantity: editQuantity.trim(),
          description: editDescription.trim(),
        };
        setSelectedInquiry(updatedInquiry);
        setIsEditing(false);
        await refreshInquiryLogs(selectedInquiry.lead_id);
        fetchInquiries();
      }
    } catch {
      toast.error("Failed to save changes.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  // ─── Delete helpers ─────────────────────────────────────────────────

  function openDeleteDialog(inq: LeadInquiryWithLead) {
    setDeleteTarget(inq);
    setDeleteDialogOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const result = await deleteInquiry(deleteTarget.id);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Inquiry deleted successfully.");
        setDeleteDialogOpen(false);
        setDeleteTarget(null);
        // If we were in detail view, go back to list
        if (view === "detail" && selectedInquiry?.id === deleteTarget.id) {
          backToList();
        } else {
          setInquiries((prev) => prev.filter((row) => row.id !== deleteTarget.id));
        }
      }
    } catch {
      toast.error("Failed to delete inquiry.");
    } finally {
      setIsDeleting(false);
    }
  }

  // ─── Image handling helpers ───────────────────────────────────────

  const isSupportedAttachmentFile = useCallback((file: File) => {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const imageExts = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "heic", "heif", "avif"]);
    const docExts = new Set(["pdf", "doc", "docx", "xls", "xlsx", "txt", "csv"]);
    if (file.type?.startsWith("image/") || imageExts.has(ext)) return true;
    if (file.type === "application/pdf" || ext === "pdf") return true;
    if (file.type.includes("word") || docExts.has(ext)) return true;
    if (file.type.includes("excel") || file.type.includes("spreadsheet") || docExts.has(ext)) return true;
    if (file.type.startsWith("text/")) return true;
    return false;
  }, []);

  const extractImageFileFromFileList = useCallback((files: FileList | null | undefined) => {
    if (!files || files.length === 0) return null;
    for (let i = 0; i < files.length; i++) {
      if (isSupportedAttachmentFile(files[i])) return files[i];
    }
    return null;
  }, [isSupportedAttachmentFile]);

  const extractImageFileFromItems = useCallback((items: DataTransferItemList | null | undefined) => {
    if (!items) return null;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        return items[i].getAsFile();
      }
    }
    return null;
  }, []);

  const extractImageFileFromClipboardData = useCallback((data: DataTransfer | null | undefined) => {
    if (!data) return null;
    const fromFiles = extractImageFileFromFileList(data.files);
    if (fromFiles) return fromFiles;
    return extractImageFileFromItems(data.items);
  }, [extractImageFileFromFileList, extractImageFileFromItems]);

  function processImageUpload(file: File | null, slot: 1 | 2) {
    if (!file) return false;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const imageExts = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "heic", "heif", "avif"]);
    const isImageLike = file.type?.startsWith("image/") || imageExts.has(ext);
    if (!isSupportedAttachmentFile(file)) {
      toast.error("Unsupported file type.");
      return false;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File must be less than 5 MB.");
      return false;
    }

    if (slot === 1) {
      setAdditionalImage1(file);
    } else {
      setAdditionalImage2(file);
    }

    if (!isImageLike) {
      const label = `doc://${encodeURIComponent(file.name)}`;
      if (slot === 1) {
        setAdditionalImage1Preview(label);
      } else {
        setAdditionalImage2Preview(label);
      }
      return true;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      if (slot === 1) {
        setAdditionalImage1Preview(url);
      } else {
        setAdditionalImage2Preview(url);
      }
    };
    reader.onerror = () => {
      toast.error("Unable to read selected file. Please try another file.");
    };
    reader.readAsDataURL(file);
    return true;
  }

  function handleDrop(e: React.DragEvent, slot: 1 | 2) {
    e.preventDefault();
    e.stopPropagation();
    setActiveUploadSlot(slot);
    const file = extractImageFileFromFileList(e.dataTransfer.files);
    processImageUpload(file, slot);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  useEffect(() => {
    if (!showForm) return;

    function handleGlobalPaste(e: ClipboardEvent) {
      const file = extractImageFileFromClipboardData(e.clipboardData);
      if (!file) return;

      e.preventDefault();

      const activeEl = document.activeElement as Node | null;
      const isInSlot1 =
        !!activeEl &&
        !!dropZone1Ref.current &&
        (activeEl === dropZone1Ref.current || dropZone1Ref.current.contains(activeEl));
      const isInSlot2 =
        !!activeEl &&
        !!dropZone2Ref.current &&
        (activeEl === dropZone2Ref.current || dropZone2Ref.current.contains(activeEl));

      let targetSlot: 1 | 2 = activeUploadSlot;
      if (isInSlot1) {
        targetSlot = 1;
      } else if (isInSlot2) {
        targetSlot = 2;
      } else if (!additionalImage1) {
        targetSlot = 1;
      } else if (!additionalImage2) {
        targetSlot = 2;
      }

      setActiveUploadSlot(targetSlot);
      processImageUpload(file, targetSlot);
    }

    // Capture phase helps when focused controls stop bubbling paste events.
    document.addEventListener("paste", handleGlobalPaste, true);
    return () => document.removeEventListener("paste", handleGlobalPaste, true);
  }, [showForm, additionalImage1, additionalImage2, activeUploadSlot, extractImageFileFromClipboardData]);

  function handleZonePaste(e: React.ClipboardEvent, slot: 1 | 2) {
    const file = extractImageFileFromClipboardData(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    setActiveUploadSlot(slot);
    processImageUpload(file, slot);
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>, slot: 1 | 2) {
    setActiveUploadSlot(slot);
    const file = extractImageFileFromFileList(e.target.files);
    if (!file && e.target.files && e.target.files.length > 0) {
      toast.error("Selected file is not a supported attachment format.");
    } else {
      processImageUpload(file, slot);
    }
    e.target.value = "";
  }

  function removeImage(slot: 1 | 2) {
    if (slot === 1) {
      setAdditionalImage1(null);
      setAdditionalImage1Preview(null);
      if (img1Ref.current) img1Ref.current.value = "";
    } else {
      setAdditionalImage2(null);
      setAdditionalImage2Preview(null);
      if (img2Ref.current) img2Ref.current.value = "";
    }
  }

  function openImagePreview(url: string, title: string) {
    if (!url) return;
    setImagePreview({ url, title });
  }

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.readAsDataURL(file);
    });
  }

  // ─── Submit form ──────────────────────────────────────────────────

  async function handleSendForConfirmation() {
    if (!selectedInquiry || !selectedInquiry.leads) {
      toast.error("Lead data is not available.");
      return;
    }
    if (!formProductName.trim()) {
      toast.error("Product Name is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Upload additional images to storage and keep only URLs in DB/logs.
      let img1Url: string | null = null;
      let img2Url: string | null = null;

      if (additionalImage1) {
        const upload1 = await uploadConfirmationImage(additionalImage1, "additional_1");
        if ("error" in upload1) {
          img1Url = additionalImage1Preview || await fileToDataUrl(additionalImage1);
        } else {
          img1Url = upload1.url || null;
        }
      }
      if (additionalImage2) {
        const upload2 = await uploadConfirmationImage(additionalImage2, "additional_2");
        if ("error" in upload2) {
          img2Url = additionalImage2Preview || await fileToDataUrl(additionalImage2);
        } else {
          img2Url = upload2.url || null;
        }
      }

      const result = await submitInquiryForConfirmation({
        inquiry_id: selectedInquiry.id,
        lead_id: selectedInquiry.lead_id,
        lead_number: selectedInquiry.leads.lead_id_formatted || "",
        product_name: formProductName,
        total_weight: formWeight,
        cbm: formCbm,
        quantity: formQuantity || calcQuantity,
        hs_code: calcHsCode,
        calculator_values: {
          inv_value: calcInvValue,
          exchange_rate: calcExchangeRate,
          custom_duty_rate: calcCustomDutyRate,
          add_cd_rate: calcAddCdRate,
          gst_rate: calcGstRate,
          add_gst_rate: calcAddGstRate,
          income_tax_rate: calcIncomeTaxRate,
          excise_rate: calcExciseRate,
          regular_duty_rate: calcRegularDutyRate,
          stamp_duty_rate: calcStampDutyRate,
          inv_fine: calcInvFine,
          freight: calcFreight,
          shipping_line_charges: calcShippingLineCharges,
          clearance_expense: calcClearanceExpense,
          sales_tax_rate: calcSalesTaxRate,
          uom: calcUom,
          quantity: calcQuantity,
          hs_code: calcHsCode,
        },
        original_image_url: selectedInquiry.image_url,
        sales_additional_image_urls: Array.isArray(selectedInquiry.additional_image_urls)
          ? selectedInquiry.additional_image_urls
          : [],
        additional_image_1_url: img1Url,
        additional_image_2_url: img2Url,
      });

      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Inquiry sent for confirmation! Status: Pending");
        setShowForm(false);
        resetForm();
        // Refresh confirmations
        if (selectedInquiry) {
          const confResult = await getConfirmationsForInquiry(selectedInquiry.id);
          if (!("error" in confResult)) {
            setConfirmations(confResult.confirmations || []);
          }
          await refreshInquiryLogs(selectedInquiry.lead_id);
        }
      }
    } catch {
      toast.error("Failed to submit. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  IMAGE UPLOAD SECTION COMPONENT
  // ═══════════════════════════════════════════════════════════════════

  function ImageUploadSection({
    slot,
    preview,
    dropRef,
    inputRef,
    onPreviewClick,
  }: {
    slot: 1 | 2;
    preview: string | null;
    dropRef: React.RefObject<HTMLDivElement | null>;
    inputRef: React.RefObject<HTMLInputElement | null>;
    onPreviewClick: (url: string) => void;
  }) {
    const inputId = `lead-management-image-${slot}`;
    const openSystemPicker = () => {
      setActiveUploadSlot(slot);
      const input = inputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
      if (!input) return;
      input.value = "";
      try {
        requestAnimationFrame(() => {
          if (typeof input.showPicker === "function") {
            input.showPicker();
            return;
          }
          input.click();
        });
      } catch {
        // Some browsers throw on showPicker for hidden inputs; fallback keeps file picker reliable.
        input.click();
      }
    };
    return (
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-600">
          Operations Attachment {slot}
        </label>
        {preview ? (
          <div
            ref={dropRef}
            onDrop={(e) => handleDrop(e, slot)}
            onDragOver={handleDragOver}
            onPaste={(e) => handleZonePaste(e, slot)}
            onFocus={() => setActiveUploadSlot(slot)}
            onClick={() => setActiveUploadSlot(slot)}
            tabIndex={0}
            className="border rounded-lg p-2 space-y-2 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
          >
            <div className="relative inline-block">
              {preview.startsWith("doc://") ? (
                <div className="text-sm text-slate-700 p-2">
                  <FileText className="h-5 w-5 text-teal-600 mb-1" />
                  <div className="font-medium truncate">
                    {decodeURIComponent(preview.replace(/^doc:\/\//, ""))}
                  </div>
                </div>
              ) : preview.startsWith("data:image/") || /\.(jpe?g|png|gif|webp)(\?|$)/i.test(preview) ? (
                <img
                  src={preview}
                  alt={`Additional ${slot}`}
                  className="max-h-40 rounded object-contain cursor-zoom-in"
                  onClick={() => onPreviewClick(preview)}
                />
              ) : (
                <button
                  type="button"
                  className="text-left text-sm text-teal-700 hover:underline max-w-full truncate"
                  onClick={() => onPreviewClick(preview)}
                >
                  {preview.split("/").pop()?.split("?")[0] || `Attachment ${slot}`}
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeImage(slot);
                }}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={openSystemPicker}
              >
                Change Image
              </Button>
              <span className="text-[11px] text-slate-400">You can also paste (Ctrl+V) to replace.</span>
            </div>
          </div>
        ) : (
          <div
            ref={dropRef}
            onDrop={(e) => handleDrop(e, slot)}
            onDragOver={handleDragOver}
            onPaste={(e) => handleZonePaste(e, slot)}
            onFocus={() => setActiveUploadSlot(slot)}
            onClick={openSystemPicker}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openSystemPicker();
              }
            }}
            tabIndex={0}
            className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 transition-colors focus:outline-none focus:border-teal-500"
          >
            <Upload className="h-8 w-8 mx-auto text-slate-400 mb-2" />
            <p className="text-sm text-slate-500">
              Drag & drop, paste (Ctrl+V), or click to upload
            </p>
            <p className="text-xs text-slate-400 mt-1">Max 5 MB</p>
          </div>
        )}
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf,.doc,.docx,.xlsx,.xls,.txt,.csv"
          className="absolute -left-[9999px] h-px w-px opacity-0"
          onChange={(e) => handleFileInputChange(e, slot)}
        />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  //  DETAIL VIEW
  // ═══════════════════════════════════════════════════════════════════

  if (view === "detail" && selectedInquiry) {
    const inq = selectedInquiry;
    const salesAttachmentUrls = collectInquiryAttachmentUrls(
      inq.image_url,
      inq.additional_image_urls
    );

    const toNum = (v: string | null | undefined) => {
      const n = parseFloat(String(v ?? "").replace(/,/g, ""));
      return Number.isFinite(n) ? n : 0;
    };
    const fmtMoney = (n: number) =>
      Number.isFinite(n)
        ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "-";
    const fmtRate = (v: string) => `${toNum(v).toFixed(2)}%`;

    const weightKg = toNum(isEditing ? editWeight : inq.total_weight);

    const invValue = toNum(calcInvValue);
    const exchangeRate = toNum(calcExchangeRate);
    const customDutyRate = toNum(calcCustomDutyRate);
    const addCdRate = toNum(calcAddCdRate);
    const gstRate = toNum(calcGstRate);
    const addGstRate = toNum(calcAddGstRate);
    const incomeTaxRate = toNum(calcIncomeTaxRate);
    const exciseRate = toNum(calcExciseRate);
    const regularDutyRate = toNum(calcRegularDutyRate);
    const stampDutyRate = toNum(calcStampDutyRate);
    const invFine = toNum(calcInvFine);
    const freight = toNum(calcFreight);
    const shippingLineCharges = toNum(calcShippingLineCharges);
    const clearanceExpense = toNum(calcClearanceExpense);
    const salesTaxRate = toNum(calcSalesTaxRate);

    const pkrValue = invValue * exchangeRate;
    const assessedValue = pkrValue;

    const customDuty = (assessedValue * customDutyRate) / 100;
    const addCd = (assessedValue * addCdRate) / 100;
    const gst = (assessedValue * gstRate) / 100;
    const addGst = (assessedValue * addGstRate) / 100;
    const incomeTax = (assessedValue * incomeTaxRate) / 100;
    const excise = (assessedValue * exciseRate) / 100;
    const regularDuty = (assessedValue * regularDutyRate) / 100;
    const stampDuty = (assessedValue * stampDutyRate) / 100;

    const subTotalDutyCost =
      assessedValue +
      customDuty +
      addCd +
      gst +
      addGst +
      incomeTax +
      excise +
      regularDuty +
      stampDuty +
      invFine +
      freight +
      shippingLineCharges +
      clearanceExpense;
    const salesTaxAmount = (subTotalDutyCost * salesTaxRate) / 100;
    const totalDutyCost = subTotalDutyCost + salesTaxAmount;

    const costPerWeight = weightKg > 0 ? totalDutyCost / weightKg : 0;

    const calc = {
      invValue,
      pkrValue,
      assessedValue,
      customDuty,
      addCd,
      gst,
      addGst,
      incomeTax,
      excise,
      regularDuty,
      stampDuty,
      invFine,
      freight,
      shippingLineCharges,
      clearanceExpense,
      salesTaxAmount,
      totalDutyCost,
      costPerWeight,
    };

    const calculatorFieldsForForm = [
      { label: "INV Value", value: calc.invValue, format: "money" as const },
      { label: "Exchange Rate", value: exchangeRate, format: "number" as const },
      { label: "PKR Value", value: calc.pkrValue, format: "money" as const },
      { label: "Assessed Value", value: calc.assessedValue, format: "money" as const },
      { label: "Custom Duty %", value: customDutyRate, format: "percent" as const },
      { label: "Custom Duty Amount", value: calc.customDuty, format: "money" as const },
      { label: "Add CD %", value: addCdRate, format: "percent" as const },
      { label: "Add CD Amount", value: calc.addCd, format: "money" as const },
      { label: "GST %", value: gstRate, format: "percent" as const },
      { label: "GST Amount", value: calc.gst, format: "money" as const },
      { label: "Add GST %", value: addGstRate, format: "percent" as const },
      { label: "Add GST Amount", value: calc.addGst, format: "money" as const },
      { label: "Income Tax %", value: incomeTaxRate, format: "percent" as const },
      { label: "Income Tax Amount", value: calc.incomeTax, format: "money" as const },
      { label: "Excise %", value: exciseRate, format: "percent" as const },
      { label: "Excise Amount", value: calc.excise, format: "money" as const },
      { label: "Regular Duty %", value: regularDutyRate, format: "percent" as const },
      { label: "Regular Duty Amount", value: calc.regularDuty, format: "money" as const },
      { label: "Stamp Duty %", value: stampDutyRate, format: "percent" as const },
      { label: "Stamp Duty Amount", value: calc.stampDuty, format: "money" as const },
      { label: "INV Fine", value: calc.invFine, format: "money" as const },
      { label: "Freight", value: calc.freight, format: "money" as const },
      { label: "Shipping Line Charges", value: calc.shippingLineCharges, format: "money" as const },
      { label: "Clearance Expense", value: calc.clearanceExpense, format: "money" as const },
      { label: "Sales Tax (ST) %", value: salesTaxRate, format: "percent" as const },
      { label: "Sales Tax Amount", value: calc.salesTaxAmount, format: "money" as const },
      { label: "Total Duty Cost", value: calc.totalDutyCost, format: "money" as const },
      { label: "Cost per Weight", value: calc.costPerWeight, format: "number" as const },
    ].filter((item) => Math.abs(item.value) > 0);

    const fieldLabels: Record<string, string> = {
      product_name: "Product",
      total_weight: "Weight",
      cbm: "CBM",
      quantity: "Quantity",
      description: "Details",
      image_url: "Image",
      link_url: "Link",
      sent_to_accounting: "Sent to Accounting",
      sent_at: "Sent At",
      inv_value: "INV Value",
      exchange_rate: "Exchange Rate",
      custom_duty_rate: "Custom Duty %",
      add_cd_rate: "Add CD %",
      gst_rate: "GST %",
      add_gst_rate: "Add GST %",
      income_tax_rate: "Income Tax %",
      excise_rate: "Excise %",
      regular_duty_rate: "Regular Duty %",
      stamp_duty_rate: "Stamp Duty %",
      inv_fine: "INV Fine",
      freight: "Freight",
      shipping_line_charges: "Shipping Line Charges",
      clearance_expense: "Clearance Expense",
      sales_tax_rate: "Sales Tax (ST) %",
      uom: "UOM",
      hs_code: "HS Code",
      additional_image_1: "Additional Image 1",
      additional_image_2: "Additional Image 2",
      status: "Status",
    };

    const formatLogValue = (value: unknown) => {
      if (value === null || value === undefined || value === "") return "-";
      if (typeof value === "boolean") return value ? "Yes" : "No";
      if (typeof value === "number") return value.toString();
      if (typeof value === "string") {
        if (value.includes("T") && !Number.isNaN(new Date(value).getTime())) {
          return new Date(value).toLocaleString();
        }
        return value;
      }
      return String(value);
    };

    return (
      <div className="space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button onClick={backToList} className="text-teal-600 hover:underline flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Leads Inquiry
          </button>
          <span className="text-slate-400">/</span>
          <span className="font-semibold text-slate-700">
            {inq.leads?.name || "Unknown Lead"}
          </span>
        </div>

        {/* Status + Action */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Package className="h-5 w-5 text-teal-600" />
            {inq.product_name || "No Product Name"}
          </h2>
          <div className="flex items-center gap-2">
            {(() => {
              const confStatus = getLatestConfirmationStatus(inq);
              if (confStatus) {
                return (
                  <div className="flex items-center gap-1.5">
                    {confirmationStatusIcon(confStatus)}
                    <Badge variant="outline" className={`text-xs ${statusColor(confStatus)}`}>
                      {formatStatus(confStatus)}
                    </Badge>
                  </div>
                );
              }
              return (
                <Badge variant="outline" className={`text-xs ${statusColor(inq.status)}`}>
                  {formatStatus(inq.status)}
                </Badge>
              );
            })()}
            {!showForm && !isEditing && (
              <>
                <Button size="sm" variant="outline" onClick={() => startEdit(inq)} className="gap-1">
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button size="sm" variant="destructive" onClick={() => openDeleteDialog(inq)} className="gap-1">
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
                <Button size="sm" onClick={openLeadManagementForm} className="gap-1">
                  <FileText className="h-3.5 w-3.5" />
                  Lead Management Form
                </Button>
              </>
            )}
            {isEditing && (
              <>
                <Button size="sm" variant="outline" onClick={cancelEdit} className="gap-1">
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveEdit} disabled={isSavingEdit} className="gap-1 bg-teal-600 hover:bg-teal-700">
                  {isSavingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Main Content + Right-side Inquiry History */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <Card className="border shadow-sm">
              <CardContent className="p-6 space-y-5">
            {/* Lead Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
              <div>
                <label className="text-xs text-slate-500 font-medium">Lead Number</label>
                <div className="font-mono font-bold text-primary-accent mt-0.5">
                  {inq.leads?.lead_id_formatted ? `#${inq.leads.lead_id_formatted}` : "-"}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium">Lead Name</label>
                <div className="font-semibold text-slate-800 mt-0.5">
                  {inq.leads?.name || "-"}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium">Phone</label>
                <div className="text-slate-700 mt-0.5">{inq.leads?.number || "-"}</div>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium">Source</label>
                <div className="mt-0.5">
                  <Badge variant="outline" className="text-xs">{inq.leads?.source || "-"}</Badge>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium">Sales Agent</label>
                <div className="text-slate-700 mt-0.5">
                  {inq.leads?.sales_agents?.name || "-"}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium">Sent At</label>
                <div className="text-slate-700 mt-0.5 text-sm">
                  {inq.sent_at ? new Date(inq.sent_at).toLocaleString() : "-"}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium">Confirmation Status</label>
                <div className="mt-0.5">
                  {(() => {
                    const confStatus = getLatestConfirmationStatus(inq);
                    if (confStatus) {
                      return (
                        <div className="flex items-center gap-1.5">
                          {confirmationStatusIcon(confStatus)}
                          <Badge variant="outline" className={`text-xs ${statusColor(confStatus)}`}>
                            {formatStatus(confStatus)}
                          </Badge>
                        </div>
                      );
                    }
                    return (
                      <Badge variant="outline" className="text-xs bg-slate-50 text-slate-500 border-slate-300">
                        Not Submitted
                      </Badge>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Separator */}
            <div className="border-t" />

            {/* Product Details Grid */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Product Details</h3>
              {isEditing ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500 font-medium">
                      Product Name <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={editProductName}
                      onChange={(e) => setEditProductName(e.target.value)}
                      placeholder="Product Name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500 font-medium">Total Weight</label>
                    <Input
                      value={editWeight}
                      onChange={(e) => setEditWeight(e.target.value)}
                      placeholder="e.g. 500 kg"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500 font-medium">CBM (Cubic Meter)</label>
                    <Input
                      value={editCbm}
                      onChange={(e) => setEditCbm(e.target.value)}
                      placeholder="e.g. 2.5"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500 font-medium">Quantity</label>
                    <Input
                      value={editQuantity}
                      onChange={(e) => setEditQuantity(e.target.value)}
                      placeholder="e.g. 100"
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs text-slate-500 font-medium">Other Details</label>
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Enter additional details..."
                      rows={3}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Product Name</label>
                    <div className="font-semibold text-slate-800 mt-0.5">
                      {inq.product_name || "-"}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Total Weight</label>
                    <div className="text-slate-700 mt-0.5">{inq.total_weight || "-"}</div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-medium">CBM (Cubic Meter)</label>
                    <div className="text-slate-700 mt-0.5">{inq.cbm || "-"}</div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Quantity</label>
                    <div className="text-slate-700 mt-0.5">{inq.quantity || "-"}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Additional Calculator */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Calculation on Actual</h3>
              <div className="border rounded-lg overflow-hidden">
                <div className="grid grid-cols-12 bg-slate-50 border-b text-xs font-semibold text-slate-600">
                  <div className="col-span-5 px-3 py-2 border-r">Item</div>
                  <div className="col-span-3 px-3 py-2 border-r">Rate / Input</div>
                  <div className="col-span-4 px-3 py-2 text-right">Amount</div>
                </div>

                <div className="grid grid-cols-12 border-b">
                  <div className="col-span-5 px-3 py-2 border-r text-sm font-medium">INV Value</div>
                  <div className="col-span-3 px-2 py-1.5 border-r">
                    <Input
                      value={calcInvValue}
                      onChange={(e) => setCalcInvValue(e.target.value)}
                      onBlur={() => void logCalculatorFieldChange("inv_value", calcInvValue)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{calc.invValue || "-"}</div>
                </div>

                <div className="grid grid-cols-12 border-b">
                  <div className="col-span-5 px-3 py-2 border-r text-sm font-medium">@ (Exchange Rate)</div>
                  <div className="col-span-3 px-2 py-1.5 border-r">
                    <Input
                      value={calcExchangeRate}
                      onChange={(e) => setCalcExchangeRate(e.target.value)}
                      onBlur={() => void logCalculatorFieldChange("exchange_rate", calcExchangeRate)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{calcExchangeRate || "-"}</div>
                </div>

                {(!adminCalculatorMode || calc.pkrValue !== 0) && (
                  <div className="grid grid-cols-12 border-b">
                    <div className="col-span-8 px-3 py-2 border-r text-sm font-medium">PKR Value</div>
                    <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{fmtMoney(calc.pkrValue)}</div>
                  </div>
                )}
                {(!adminCalculatorMode || calc.assessedValue !== 0) && (
                  <div className="grid grid-cols-12 border-b">
                    <div className="col-span-8 px-3 py-2 border-r text-sm font-medium">Assessed Value</div>
                    <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{fmtMoney(calc.assessedValue)}</div>
                  </div>
                )}

                {[
                  { field: "custom_duty_rate", label: "Custom Duty", rate: calcCustomDutyRate, setRate: setCalcCustomDutyRate, amount: calc.customDuty },
                  { field: "add_cd_rate", label: "Add CD", rate: calcAddCdRate, setRate: setCalcAddCdRate, amount: calc.addCd },
                  { field: "gst_rate", label: "GST", rate: calcGstRate, setRate: setCalcGstRate, amount: calc.gst },
                  { field: "add_gst_rate", label: "Add GST", rate: calcAddGstRate, setRate: setCalcAddGstRate, amount: calc.addGst },
                  { field: "income_tax_rate", label: "Income Tax", rate: calcIncomeTaxRate, setRate: setCalcIncomeTaxRate, amount: calc.incomeTax },
                  { field: "excise_rate", label: "Excise", rate: calcExciseRate, setRate: setCalcExciseRate, amount: calc.excise },
                  { field: "regular_duty_rate", label: "Regular Duty", rate: calcRegularDutyRate, setRate: setCalcRegularDutyRate, amount: calc.regularDuty },
                  { field: "stamp_duty_rate", label: "Stamp Duty", rate: calcStampDutyRate, setRate: setCalcStampDutyRate, amount: calc.stampDuty },
                ].map((row) => (
                  <div key={row.label} className="grid grid-cols-12 border-b">
                    <div className="col-span-5 px-3 py-2 border-r text-sm">{row.label}</div>
                    <div className="col-span-3 px-2 py-1.5 border-r">
                      <Input
                        value={row.rate}
                        onChange={(e) => row.setRate(e.target.value)}
                        onBlur={() => void logCalculatorFieldChange(row.field, row.rate)}
                        className="h-8 text-xs"
                      />
                      <div className="text-[10px] text-slate-500 mt-0.5">{fmtRate(row.rate)}</div>
                    </div>
                    <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{fmtMoney(row.amount)}</div>
                  </div>
                ))}

                <div className="grid grid-cols-12 border-b">
                  <div className="col-span-5 px-3 py-2 border-r text-sm">Sales Tax (ST)</div>
                  <div className="col-span-3 px-2 py-1.5 border-r">
                    <Input
                      value={calcSalesTaxRate}
                      onChange={(e) => setCalcSalesTaxRate(e.target.value)}
                      onBlur={() => void logCalculatorFieldChange("sales_tax_rate", calcSalesTaxRate)}
                      className="h-8 text-xs"
                    />
                    <div className="text-[10px] text-slate-500 mt-0.5">{fmtRate(calcSalesTaxRate)}</div>
                  </div>
                  <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{fmtMoney(calc.salesTaxAmount)}</div>
                </div>

                <div className="grid grid-cols-12 border-b">
                  <div className="col-span-5 px-3 py-2 border-r text-sm">UOM</div>
                  <div className="col-span-7 px-2 py-1.5">
                    <Select
                      value={calcUom}
                      onValueChange={(value) => {
                        setCalcUom(value);
                        void logCalculatorFieldChange("uom", value);
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="KG">KG</SelectItem>
                        <SelectItem value="M³">M³</SelectItem>
                        <SelectItem value="PCS/U">PCS/U</SelectItem>
                        <SelectItem value="Pairs (2U)">Pairs (2U)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-12 border-b">
                  <div className="col-span-5 px-3 py-2 border-r text-sm">Quantity</div>
                  <div className="col-span-7 px-2 py-1.5">
                    <Input
                      value={calcQuantity}
                      onChange={(e) => setCalcQuantity(e.target.value.replace(/\D/g, ""))}
                      onBlur={() => void logCalculatorFieldChange("quantity", calcQuantity)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-12 border-b">
                  <div className="col-span-5 px-3 py-2 border-r text-sm">HS Code</div>
                  <div className="col-span-7 px-2 py-1.5">
                    <Input
                      value={calcHsCode}
                      onChange={(e) => setCalcHsCode(e.target.value)}
                      onBlur={() => void logCalculatorFieldChange("hs_code", calcHsCode)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                {[
                  { field: "inv_fine", label: "INV Fine", value: calcInvFine, setValue: setCalcInvFine, amount: calc.invFine },
                  { field: "freight", label: "Freight", value: calcFreight, setValue: setCalcFreight, amount: calc.freight },
                  { field: "shipping_line_charges", label: "Shipping Line Charges", value: calcShippingLineCharges, setValue: setCalcShippingLineCharges, amount: calc.shippingLineCharges },
                  { field: "clearance_expense", label: "Clearance Expense", value: calcClearanceExpense, setValue: setCalcClearanceExpense, amount: calc.clearanceExpense },
                ].map((row) => (
                  <div key={row.label} className="grid grid-cols-12 border-b">
                    <div className="col-span-5 px-3 py-2 border-r text-sm">{row.label}</div>
                    <div className="col-span-3 px-2 py-1.5 border-r">
                      <Input
                        value={row.value}
                        onChange={(e) => row.setValue(e.target.value)}
                        onBlur={() => void logCalculatorFieldChange(row.field, row.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{fmtMoney(row.amount)}</div>
                  </div>
                ))}

                {(!adminCalculatorMode || calc.totalDutyCost !== 0) && (
                  <div className="grid grid-cols-12 bg-yellow-50">
                    <div className="col-span-8 px-3 py-2 border-r text-sm font-bold text-slate-800">Total Duty Cost</div>
                    <div className="col-span-4 px-3 py-2 text-right text-sm font-bold text-slate-900">{fmtMoney(calc.totalDutyCost)}</div>
                  </div>
                )}
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                {(!adminCalculatorMode || weightKg !== 0) && (
                  <div>
                    <div className="text-xs text-slate-500 font-medium">Weight</div>
                    <div className="text-sm font-semibold text-slate-800 mt-0.5">{weightKg || "-"}</div>
                  </div>
                )}
                {(!adminCalculatorMode || calc.costPerWeight !== 0) && (
                  <div>
                    <div className="text-xs text-slate-500 font-medium">Cost per Weight</div>
                    <div className="text-sm font-semibold text-slate-800 mt-0.5">
                      {weightKg > 0 ? calc.costPerWeight.toFixed(6) : "-"}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Separator */}
            <div className="border-t" />

            {salesAttachmentUrls.length > 0 && (
              <InquiryAttachmentList
                urls={salesAttachmentUrls}
                title={`Sales Attachment${salesAttachmentUrls.length > 1 ? "s" : ""}`}
                onPreviewImage={openImagePreview}
              />
            )}

            {/* Other Details (read-only when not editing) */}
            {!isEditing && inq.description && (
              <div>
                <label className="text-xs text-slate-500 font-medium">Other Details</label>
                <div className="mt-1 bg-slate-50 border rounded-lg p-3 text-sm whitespace-pre-wrap min-h-[40px]">
                  {inq.description}
                </div>
              </div>
            )}
              </CardContent>
            </Card>
          </div>

          <div className="xl:col-span-1">
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex gap-1 flex-wrap mb-4">
                  <Button
                    size="sm"
                    className={`text-xs h-7 px-3 ${
                      activeRightTab === "send_message" ? "bg-orange-500 hover:bg-orange-600 text-white" : ""
                    }`}
                    variant={activeRightTab === "send_message" ? "default" : "outline"}
                    onClick={() => setActiveRightTab("send_message")}
                  >
                    Send message
                  </Button>
                  <Button
                    size="sm"
                    className={`text-xs h-7 px-3 ${
                      activeRightTab === "log_note" ? "bg-amber-500 hover:bg-amber-600 text-white" : ""
                    }`}
                    variant={activeRightTab === "log_note" ? "default" : "outline"}
                    onClick={() => setActiveRightTab("log_note")}
                  >
                    Log note
                  </Button>
                  <Button
                    size="sm"
                    className={`text-xs h-7 px-3 ${
                      activeRightTab === "activity" ? "bg-blue-500 hover:bg-blue-600 text-white" : ""
                    }`}
                    variant={activeRightTab === "activity" ? "default" : "outline"}
                    onClick={() => setActiveRightTab("activity")}
                  >
                    Activity
                  </Button>
                </div>

                {activeRightTab === "log_note" && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2 mb-4">
                    <div className="text-xs font-semibold text-amber-700">Add Internal Note</div>
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
                        onClick={handleAddInquiryLogNote}
                        disabled={isAddingLogNote || !logNoteText.trim()}
                      >
                        {isAddingLogNote ? "Adding..." : "Add Note"}
                      </Button>
                    </div>
                  </div>
                )}

                {activeRightTab === "send_message" && (
                  <div className="border rounded-lg p-3 space-y-3 mb-4 bg-slate-50">
                    <div className="max-h-48 overflow-y-auto pr-1 space-y-2">
                      {chatMessages.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-3">No messages yet.</p>
                      ) : (
                        chatMessages.map((m) => (
                          <div key={m.id} className={`rounded-lg p-2.5 text-sm ${
                            m.sender_role === "operations"
                              ? "bg-blue-50 border border-blue-200"
                              : "bg-white border border-slate-200"
                          }`}>
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-xs font-semibold text-slate-700">
                                {m.sender_role === "sales_agent" ? "Sales" : m.sender_role === "operations" ? "Operations" : "Admin"} · {m.sender_username}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {new Date(m.created_at).toLocaleString([], {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <p className="text-slate-700 whitespace-pre-wrap">{m.message}</p>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="space-y-2">
                      <Textarea
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Type a message for Sales..."
                        rows={2}
                        className="bg-white text-sm resize-none"
                      />
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          className="bg-orange-500 hover:bg-orange-600 text-white text-xs h-7"
                          onClick={handleSendChatMessage}
                          disabled={isSendingChat || !chatInput.trim()}
                        >
                          {isSendingChat ? "Sending..." : "Send"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {activeRightTab === "activity" && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2 mb-4">
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
                      <label className="text-xs text-blue-600">Due Date</label>
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
                        onClick={handleAddInquiryActivity}
                        disabled={isAddingActivity || !activitySummary.trim()}
                      >
                        {isAddingActivity ? "Adding..." : "Schedule"}
                      </Button>
                    </div>
                  </div>
                )}

                <h3 className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-4">
                  Inquiry History
                </h3>
                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                  {(() => {
                    const sortedLogs = [...inquiryLogs].sort(
                      (a, b) =>
                        new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime()
                    );

                    if (sortedLogs.length === 0) {
                      return <p className="text-sm text-slate-400 text-center py-8">No activity yet.</p>;
                    }

                    return sortedLogs.map((log) => {
                      const prev = (log.previous_values || {}) as Record<string, unknown>;
                      const next = (log.new_values || {}) as Record<string, unknown>;
                      const actor = log.performed_by || "User";
                      const dueDate =
                        typeof next.due_date === "string" && next.due_date
                          ? new Date(next.due_date)
                          : null;
                      const isPast = dueDate ? dueDate < new Date() : false;
                      const changedFields = Array.from(
                        new Set([...Object.keys(prev), ...Object.keys(next)])
                      );
                      const headerLabel =
                        log.action === "log_note"
                          ? "Log Note"
                          : log.action === "activity"
                            ? "Activity"
                            : log.action === "send_for_confirmation"
                              ? "Sent for Confirmation"
                              : log.action === "image_uploaded"
                                ? "Image Upload"
                                : log.action === "calculator_updated"
                                  ? "Calculator Update"
                                  : log.action === "lead_management_form_updated"
                                    ? "Lead Management Update"
                                    : log.action === "status_changed"
                                      ? "Status Update"
                                      : log.action === "created"
                                        ? "Inquiry Created"
                                        : "Inquiry Update";

                      return (
                        <div key={log.id} className="flex gap-3">
                          <div className="h-8 w-8 rounded-full flex items-center justify-center font-semibold text-xs shrink-0 mt-0.5 bg-teal-100 text-teal-800">
                            {(actor || "U").charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-slate-700">{actor}</span>
                              <span className="text-[11px] text-slate-500 font-medium">{headerLabel}</span>
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

                            {log.action === "log_note" ? (
                              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-1 text-sm text-slate-700 whitespace-pre-wrap">
                                {String(next.note || "")}
                              </div>
                            ) : log.action === "activity" ? (
                              <div className={`border rounded-lg p-2.5 mt-1 ${isPast ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-200"}`}>
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
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">{String(next.summary || "")}</p>
                              </div>
                            ) : changedFields.length > 0 ? (
                              <div className="space-y-1 mt-1">
                                {changedFields.map((key) => (
                                  <div key={`${log.id}-${key}`} className="text-sm text-slate-700">
                                    <span className="text-slate-600 font-medium">{fieldLabels[key] || key}:</span>
                                    <span className="ml-1 text-slate-500">Old: {formatLogValue(prev[key])}</span>
                                    <span className="mx-1 text-slate-400">→</span>
                                    <span className="font-semibold text-teal-700">New: {formatLogValue(next[key])}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-slate-500 mt-1">Action recorded.</div>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog
          open={showForm}
          onOpenChange={(open) => {
            setShowForm(open);
            if (!open) resetForm();
          }}
        >
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-teal-600" />
                Lead Management Form
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">
                    Product Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={formProductName}
                    onChange={(e) => setFormProductName(e.target.value)}
                    placeholder="Product Name"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Total Weight</label>
                  <Input
                    value={formWeight}
                    onChange={(e) => setFormWeight(e.target.value)}
                    placeholder="e.g. 500 kg"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">CBM</label>
                  <Input
                    value={formCbm}
                    onChange={(e) => setFormCbm(e.target.value)}
                    placeholder="e.g. 2.5"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Quantity</label>
                  <Input
                    value={formQuantity}
                    onChange={(e) => setFormQuantity(e.target.value.replace(/\D/g, ""))}
                    placeholder="e.g. 100"
                  />
                </div>
              </div>

              <div className="border-t pt-4" />
              <h4 className="text-sm font-semibold text-slate-700">Calculator Fields (Non-Zero)</h4>
              {calculatorFieldsForForm.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {calculatorFieldsForForm.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between rounded border bg-slate-50 px-3 py-2 text-sm"
                    >
                      <span className="text-slate-600">{row.label}</span>
                      <span className="font-semibold text-slate-800">
                        {row.format === "percent"
                          ? `${row.value.toFixed(2)}%`
                          : row.format === "number"
                            ? row.value.toLocaleString(undefined, { maximumFractionDigits: 6 })
                            : fmtMoney(row.value)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded border border-dashed text-sm text-slate-400 px-3 py-2">
                  All calculator fields are currently zero.
                </div>
              )}

              <div className="border-t pt-4" />
              <h4 className="text-sm font-semibold text-slate-700">Attachments</h4>

              <div className="grid grid-cols-1 gap-4">
                {salesAttachmentUrls.length > 0 ? (
                  <div className="space-y-2">
                    <InquiryAttachmentList
                      urls={salesAttachmentUrls}
                      title="Sales Attachments (read-only)"
                      compact
                      onPreviewImage={openImagePreview}
                    />
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center">
                    <ImageIcon className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                    <p className="text-xs text-slate-400">No sales attachments</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ImageUploadSection
                  slot={1}
                  preview={additionalImage1Preview}
                  dropRef={dropZone1Ref}
                  inputRef={img1Ref}
                  onPreviewClick={(url) => openImagePreview(url, "Additional Image 1")}
                />

                <ImageUploadSection
                  slot={2}
                  preview={additionalImage2Preview}
                  dropRef={dropZone2Ref}
                  inputRef={img2Ref}
                  onPreviewClick={(url) => openImagePreview(url, "Additional Image 2")}
                />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendForConfirmation}
                disabled={isSubmitting || !formProductName.trim()}
                className="gap-2 bg-teal-600 hover:bg-teal-700"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send for Confirmation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!imagePreview}
          onOpenChange={(open) => {
            if (!open) setImagePreview(null);
          }}
        >
          <DialogContent className="sm:max-w-5xl w-[95vw] max-h-[95vh] p-4">
            <DialogHeader>
              <DialogTitle className="text-sm">{imagePreview?.title || "Image Preview"}</DialogTitle>
            </DialogHeader>
            {imagePreview?.url ? (
              <div className="overflow-auto max-h-[80vh]">
                <img
                  src={imagePreview.url}
                  alt={imagePreview.title}
                  className="w-full h-auto object-contain"
                />
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/*  CONFIRMATION HISTORY                                      */}
        {/* ═══════════════════════════════════════════════════════════ */}

        {confirmations.length > 0 && (
          <Card className="border shadow-sm">
            <CardContent className="p-6 space-y-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-teal-600" />
                Confirmation History
              </h3>
              <div className="space-y-2">
                {confirmations.map((conf) => (
                  <div
                    key={conf.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      conf.status === "approved"
                        ? "bg-emerald-50 border-emerald-200"
                        : conf.status === "rejected"
                        ? "bg-red-50 border-red-200"
                        : "bg-yellow-50 border-yellow-200"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {confirmationStatusIcon(conf.status)}
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          {conf.product_name} — Lead #{conf.lead_number}
                        </p>
                        <p className="text-xs text-slate-500">
                          Submitted by {conf.submitted_by} on{" "}
                          {new Date(conf.created_at).toLocaleString()}
                        </p>
                        {conf.status === "rejected" && conf.rejection_reason ? (
                          <p className="text-xs text-red-700 mt-1">
                            Reason: {conf.rejection_reason}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-xs ${statusColor(conf.status)}`}>
                      {formatStatus(conf.status)}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  //  LIST VIEW
  // ═══════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-5 w-5 text-teal-600" />
          <h1 className="text-xl font-bold text-slate-800">Leads Inquiry</h1>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchInquiries({ append: false, offset: 0, query: debouncedSearchQuery })}
            disabled={isLoading}
          >
            <RefreshCcw className={`h-4 w-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <span className="text-sm text-slate-500">
            Showing {inquiries.length} record{inquiries.length !== 1 ? "s" : ""}
            {hasMore ? "+" : ""}
          </span>
        </div>
      </div>
      <p className="text-xs text-slate-500 -mt-2">
        Keep this list simple: open a lead and follow the right-side steps to complete operations.
      </p>

      {/* Table */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-4 py-4 space-y-2">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div
                  key={`inquiry-skeleton-${idx}`}
                  className="h-10 w-full rounded-md bg-slate-100 animate-pulse"
                />
              ))}
            </div>
          ) : inquiries.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              {searchQuery
                ? "No inquiries match your search."
                : "No lead inquiries received yet."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold">Lead #</TableHead>
                    <TableHead className="font-semibold">Lead Name</TableHead>
                    <TableHead className="font-semibold">Product Name</TableHead>
                    <TableHead className="font-semibold">Sales Agent</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Confirmation</TableHead>
                    <TableHead className="font-semibold">Sent At</TableHead>
                    <TableHead className="text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inquiries.map((inquiry) => (
                    <TableRow
                      key={inquiry.id}
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => openDetail(inquiry)}
                    >
                      <TableCell className="font-mono text-xs font-semibold text-primary-accent">
                        {inquiry.leads?.lead_id_formatted ? `#${inquiry.leads.lead_id_formatted}` : "-"}
                      </TableCell>
                      <TableCell className="font-semibold text-teal-700">
                        {inquiry.leads?.name || "Unknown"}
                      </TableCell>
                      <TableCell className="text-slate-700 font-medium">
                        {inquiry.product_name || "-"}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {inquiry.leads?.sales_agents?.name || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${statusColor(inquiry.status)}`}>
                          {formatStatus(inquiry.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const confStatus = getLatestConfirmationStatus(inquiry);
                          if (confStatus) {
                            return (
                              <div className="flex items-center gap-1.5">
                                {confirmationStatusIcon(confStatus)}
                                <Badge variant="outline" className={`text-xs ${statusColor(confStatus)}`}>
                                  {formatStatus(confStatus)}
                                </Badge>
                              </div>
                            );
                          }
                          return (
                            <Badge variant="outline" className="text-xs bg-slate-50 text-slate-500 border-slate-300">
                              Not Submitted
                            </Badge>
                          );
                        })()}
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
                        <div className="flex items-center justify-end gap-1">
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
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDetail(inquiry);
                              setTimeout(() => startEdit(inquiry), 100);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDeleteDialog(inquiry);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {!isLoading && inquiries.length > 0 && (
            <div className="border-t px-4 py-3 flex items-center justify-center">
              {hasMore ? (
                <Button
                  variant="outline"
                  onClick={() => fetchInquiries({ append: true, offset: nextOffset, query: debouncedSearchQuery })}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {isLoadingMore ? "Loading..." : "Load More"}
                </Button>
              ) : (
                <span className="text-xs text-slate-500">You have reached the end of results.</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Inquiry</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the inquiry for{" "}
              <span className="font-semibold text-slate-700">
                {deleteTarget?.leads?.name || "this lead"}
              </span>
              ? This will also remove all related confirmations and logs. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting} className="gap-1">
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
