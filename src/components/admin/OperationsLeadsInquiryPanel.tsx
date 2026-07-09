"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useCallback, useRef, useLayoutEffect } from "react";
import { toast } from "sonner";
import {
  getAllInquiriesForOperations,
  getOperationsInquiriesBootstrap,
  getInquiryForOperations,
  updateInquiryForAccounting,
  deleteInquiry,
  getInquiryLogsForLead,
  addInquiryLogNote,
  addInquiryActivity,
  addInquiryCalculatorFieldLog,
  saveInquiryCalculatorField,
  saveInquiryCalculatorPayload,
  getLeadChatMessages,
  sendLeadChatMessage,
  type LeadInquiryWithLead,
  type InquiryLog,
  type LeadChatMessage,
} from "@/app/actions/inquiries";
import {
  getCachedOperationsBootstrap,
  setCachedOperationsBootstrap,
  invalidateCachedOperationsBootstrap,
} from "@/lib/operations-inquiries-cache";
import {
  submitInquiryForConfirmation,
  uploadConfirmationImage,
  getConfirmationsForInquiry,
  type InquiryConfirmation,
} from "@/app/actions/inquiry_confirmations";
import { InquiryAttachmentList } from "@/components/inquiry/InquiryAttachmentList";
import { InquiryCalculatorSection } from "@/components/admin/InquiryCalculatorSection";
import { EstimatedDutiesAndTaxesBlock } from "@/components/admin/EstimatedDutiesAndTaxesBlock";
import { collectInquiryAttachmentUrls } from "@/lib/inquiry-attachments";
import { downloadLeadManagementPdf } from "@/lib/lead-management-pdf";
import {
  getEmptyCalculatorValues,
  parseStoredCalculatorPayload,
  serializeCalculatorPayload,
  withDerivedInvValue,
  parsePricingConfig,
  type CalculatorPricingConfig,
} from "@/lib/inquiry-calculator";
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
  Plus,
  Download,
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

type OperationsFormAttachment = {
  id: string;
  file: File | null;
  preview: string | null;
};

function createOperationsAttachment(): OperationsFormAttachment {
  return {
    id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    file: null,
    preview: null,
  };
}

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
  const initialBootstrap = getCachedOperationsBootstrap("");
  const [view, setView] = useState<ViewMode>("list");
  const [inquiries, setInquiries] = useState<LeadInquiryWithLead[]>(() => initialBootstrap?.inquiries ?? []);
  const [isLoading, setIsLoading] = useState(() => !initialBootstrap);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(() => Boolean(initialBootstrap?.hasMore));
  const [nextOffset, setNextOffset] = useState(() => initialBootstrap?.nextOffset ?? 0);
  const [selectedInquiry, setSelectedInquiry] = useState<LeadInquiryWithLead | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  // Lead Management Form state
  const [showForm, setShowForm] = useState(false);
  const [formProductName, setFormProductName] = useState("");
  const [formWeight, setFormWeight] = useState("");
  const [formCbm, setFormCbm] = useState("");
  const [formQuantity, setFormQuantity] = useState("");
  const [operationsAttachments, setOperationsAttachments] = useState<OperationsFormAttachment[]>(() => [
    createOperationsAttachment(),
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [activeAttachmentId, setActiveAttachmentId] = useState<string | null>(null);
  const operationsFileInputRef = useRef<HTMLInputElement>(null);
  const leadManagementPdfRef = useRef<HTMLDivElement>(null);
  const activeInquiryIdRef = useRef<string | null>(null);
  const syncedCalculatorInquiryIdRef = useRef<string | null>(null);

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
  const [calculators, setCalculators] = useState<Record<string, string>[]>(() => [
    getEmptyCalculatorValues(),
  ]);
  const [operationsDescription, setOperationsDescription] = useState("");
  const [lastCalcSnapshot, setLastCalcSnapshot] = useState<Record<string, string>>(() =>
    getEmptyCalculatorValues()
  );
  const [pricingConfig, setPricingConfig] = useState<CalculatorPricingConfig>(() =>
    parsePricingConfig(initialBootstrap?.calculatorValues ?? {})
  );

  const getDefaultCalculatorValues = useCallback(() => getEmptyCalculatorValues(), []);

  const buildCalculatorsForInquiry = useCallback((inquiry: LeadInquiryWithLead) => {
    const inquiryQuantity = inquiry.quantity?.trim() || "0";
    const parsed = parseStoredCalculatorPayload(inquiry.calculator_values);
    const resolved = parsed.calculators.map((values) => ({
      ...getEmptyCalculatorValues(),
      ...values,
      quantity: String(values.quantity ?? inquiryQuantity).trim() || inquiryQuantity,
    }));
    return {
      calculators: resolved.length > 0 ? resolved : [{ ...getEmptyCalculatorValues(), quantity: inquiryQuantity }],
      operationsDescription: parsed.operationsDescription,
    };
  }, []);

  const initializeCalculatorForInquiry = useCallback(
    (inquiry: LeadInquiryWithLead) => {
      const { calculators: resolvedCalculators, operationsDescription: resolvedDescription } =
        buildCalculatorsForInquiry(inquiry);
      setCalculators(resolvedCalculators);
      setOperationsDescription(resolvedDescription);
      setLastCalcSnapshot(resolvedCalculators[0] ?? getEmptyCalculatorValues());
    },
    [buildCalculatorsForInquiry]
  );

  const resetCalculatorState = useCallback(() => {
    const defaults = getEmptyCalculatorValues();
    setCalculators([defaults]);
    setOperationsDescription("");
    setLastCalcSnapshot(defaults);
  }, []);

  const updateCalculatorAt = useCallback((index: number, values: Record<string, string>) => {
    setCalculators((prev) => {
      const next = [...prev];
      next[index] = withDerivedInvValue(values);
      return next;
    });
  }, []);

  const addCalculator = useCallback(() => {
    setCalculators((prev) => [...prev, getEmptyCalculatorValues()]);
  }, []);

  const persistCalculatorPayload = useCallback(async () => {
    if (!selectedInquiry) return;
    const payload = serializeCalculatorPayload(calculators, operationsDescription);
    const result = await saveInquiryCalculatorPayload(selectedInquiry.id, payload);
    if ("error" in result) {
      toast.error(result.error || "Failed to save calculator data.");
      return;
    }
    setSelectedInquiry((prev) =>
      prev
        ? {
            ...prev,
            calculator_values: payload as Record<string, unknown>,
          }
        : prev
    );
  }, [selectedInquiry, calculators, operationsDescription]);

  const refreshInquiryLogs = useCallback(async (leadId: string, inquiryId?: string) => {
    try {
      const logsResult = await getInquiryLogsForLead(leadId, inquiryId);
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
      if (!selectedInquiry || field === "sales_tax_rate") return;
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
      setCalculators((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        next[0] = withDerivedInvValue({ ...next[0], [field]: currentValue });
        return next;
      });
      await refreshInquiryLogs(selectedInquiry.lead_id, selectedInquiry.id);
    },
    [lastCalcSnapshot, refreshInquiryLogs, selectedInquiry]
  );

  const fetchInquiries = useCallback(async (opts?: { append?: boolean; offset?: number; query?: string; background?: boolean }) => {
    const append = Boolean(opts?.append);
    const offset = Math.max(Number(opts?.offset || 0), 0);
    const query = String(opts?.query ?? debouncedSearchQuery);
    const background = Boolean(opts?.background);
    if (append) {
      setIsLoadingMore(true);
    } else if (!background) {
      setIsLoading(true);
    }
    try {
      const useBootstrap = !append && offset === 0;
      const result = useBootstrap
        ? await getOperationsInquiriesBootstrap({
            limit: PAGE_SIZE,
            offset,
            search: query,
          })
        : await getAllInquiriesForOperations({
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
          if ('calculatorValues' in result && result.calculatorValues) {
            setPricingConfig(parsePricingConfig(result.calculatorValues as Record<string, unknown>));
          }
          setCachedOperationsBootstrap(query, {
            inquiries: incoming,
            hasMore: Boolean(result.hasMore),
            nextOffset: Number(result.nextOffset || offset + incoming.length),
            calculatorValues:
              'calculatorValues' in result && result.calculatorValues
                ? (result.calculatorValues as Record<string, string>)
                : getCachedOperationsBootstrap(query)?.calculatorValues ?? {},
          });
        }
        setHasMore(Boolean(result.hasMore));
        setNextOffset(Number(result.nextOffset || offset + incoming.length));
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      if (append) {
        setIsLoadingMore(false);
      } else if (!background) {
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
    const cached = getCachedOperationsBootstrap(debouncedSearchQuery);
    fetchInquiries({
      append: false,
      offset: 0,
      query: debouncedSearchQuery,
      background: Boolean(cached),
    });
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

  useLayoutEffect(() => {
    if (view !== "detail" || !selectedInquiry) {
      if (view !== "detail") {
        syncedCalculatorInquiryIdRef.current = null;
      }
      return;
    }

    const inquiryId = selectedInquiry.id;
    if (syncedCalculatorInquiryIdRef.current === inquiryId) {
      return;
    }

    const defaults = getDefaultCalculatorValues();
    setCalculators([defaults]);
    setOperationsDescription("");
    setLastCalcSnapshot(defaults);
    initializeCalculatorForInquiry(selectedInquiry);
    syncedCalculatorInquiryIdRef.current = inquiryId;
  }, [
    view,
    selectedInquiry,
    initializeCalculatorForInquiry,
    getDefaultCalculatorValues,
  ]);

  async function openDetail(inquiry: LeadInquiryWithLead) {
    const inquiryId = inquiry.id;
    activeInquiryIdRef.current = inquiryId;
    syncedCalculatorInquiryIdRef.current = null;

    const defaults = getDefaultCalculatorValues();
    setCalculators([defaults]);
    setOperationsDescription("");
    setLastCalcSnapshot(defaults);

    setSelectedInquiry(inquiry);
    setView("detail");
    setShowForm(false);
    resetForm();
    setActiveRightTab("send_message");
    setLogNoteText("");
    setChatInput("");
    setChatMessages([]);

    initializeCalculatorForInquiry(inquiry);
    syncedCalculatorInquiryIdRef.current = inquiryId;

    const [detailResult, confirmResult] = await Promise.allSettled([
      getInquiryForOperations(inquiry.id),
      getConfirmationsForInquiry(inquiry.id),
      refreshInquiryLogs(inquiry.lead_id, inquiry.id),
    ]);

    if (activeInquiryIdRef.current !== inquiryId) {
      return;
    }

    if (detailResult.status === "fulfilled" && !("error" in detailResult.value) && detailResult.value.inquiry) {
      const fullInquiry = detailResult.value.inquiry;
      setSelectedInquiry(fullInquiry);
      initializeCalculatorForInquiry(fullInquiry);
    }

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
  }

  function backToList() {
    activeInquiryIdRef.current = null;
    syncedCalculatorInquiryIdRef.current = null;
    setView("list");
    setSelectedInquiry(null);
    setShowForm(false);
    setInquiryLogs([]);
    setActiveRightTab("send_message");
    setLogNoteText("");
    setChatInput("");
    setChatMessages([]);
    resetForm();
    resetCalculatorState();
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
      await refreshInquiryLogs(selectedInquiry.lead_id, selectedInquiry.id);
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
      await refreshInquiryLogs(selectedInquiry.lead_id, selectedInquiry.id);
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
    setOperationsAttachments([createOperationsAttachment()]);
    setActiveAttachmentId(null);
  }

  function addOperationsAttachment() {
    setOperationsAttachments((prev) => [...prev, createOperationsAttachment()]);
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
        setCalculators((prev) => {
          if (prev.length === 0) {
            return [{ ...getEmptyCalculatorValues(), quantity: editQuantity.trim() || "0" }];
          }
          const next = [...prev];
          next[0] = withDerivedInvValue({
            ...next[0],
            quantity: editQuantity.trim() || next[0].quantity || "0",
          });
          return next;
        });
        setLastCalcSnapshot((prev) => ({ ...prev, quantity: editQuantity.trim() || "0" }));
        setIsEditing(false);
        await refreshInquiryLogs(selectedInquiry.lead_id, selectedInquiry.id);
        invalidateCachedOperationsBootstrap();
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
        invalidateCachedOperationsBootstrap();
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

  const updateOperationsAttachment = useCallback(
    (attachmentId: string, patch: Partial<OperationsFormAttachment>) => {
      setOperationsAttachments((prev) =>
        prev.map((item) => (item.id === attachmentId ? { ...item, ...patch } : item))
      );
    },
    []
  );

  const processImageUpload = useCallback(
    (file: File | null, attachmentId: string) => {
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

      updateOperationsAttachment(attachmentId, { file });

      if (!isImageLike) {
        updateOperationsAttachment(attachmentId, {
          file,
          preview: `doc://${encodeURIComponent(file.name)}`,
        });
        return true;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const url = e.target?.result as string;
        updateOperationsAttachment(attachmentId, { file, preview: url });
      };
      reader.onerror = () => {
        toast.error("Unable to read selected file. Please try another file.");
      };
      reader.readAsDataURL(file);
      return true;
    },
    [isSupportedAttachmentFile, updateOperationsAttachment]
  );

  function handleDrop(e: React.DragEvent, attachmentId: string) {
    e.preventDefault();
    e.stopPropagation();
    setActiveAttachmentId(attachmentId);
    const file = extractImageFileFromFileList(e.dataTransfer.files);
    processImageUpload(file, attachmentId);
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

      setOperationsAttachments((prev) => {
        const empty = prev.find((item) => !item.file && !item.preview);
        if (empty) {
          setTimeout(() => processImageUpload(file, empty.id), 0);
          return prev;
        }
        const newAttachment = createOperationsAttachment();
        setTimeout(() => processImageUpload(file, newAttachment.id), 0);
        return [...prev, newAttachment];
      });
    }

    document.addEventListener("paste", handleGlobalPaste, true);
    return () => document.removeEventListener("paste", handleGlobalPaste, true);
  }, [showForm, extractImageFileFromClipboardData, processImageUpload]);

  function handleZonePaste(e: React.ClipboardEvent, attachmentId: string) {
    const file = extractImageFileFromClipboardData(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    setActiveAttachmentId(attachmentId);
    processImageUpload(file, attachmentId);
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const attachmentId = e.currentTarget.dataset.attachmentId || activeAttachmentId;
    if (!attachmentId) return;
    const file = extractImageFileFromFileList(e.target.files);
    if (!file && e.target.files && e.target.files.length > 0) {
      toast.error("Selected file is not a supported attachment format.");
    } else {
      processImageUpload(file, attachmentId);
    }
    e.target.value = "";
  }

  function removeOperationsAttachment(attachmentId: string) {
    setOperationsAttachments((prev) => {
      const next = prev.filter((item) => item.id !== attachmentId);
      return next.length > 0 ? next : [createOperationsAttachment()];
    });
  }

  function openOperationsAttachmentPicker(attachmentId: string) {
    setActiveAttachmentId(attachmentId);
    const input = operationsFileInputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!input) return;
    input.value = "";
    input.dataset.attachmentId = attachmentId;
    try {
      requestAnimationFrame(() => {
        if (typeof input.showPicker === "function") {
          input.showPicker();
          return;
        }
        input.click();
      });
    } catch {
      input.click();
    }
  }

  async function handleDownloadLeadManagementPdf() {
    if (!leadManagementPdfRef.current) {
      toast.error("PDF content is not ready yet.");
      return;
    }
    setIsDownloadingPdf(true);
    try {
      await downloadLeadManagementPdf(leadManagementPdfRef.current, {
        leadNumber: selectedInquiry?.leads?.lead_id_formatted,
        productName: formProductName,
      });
    } catch (error) {
      console.error("Lead management PDF export failed:", error);
      toast.error("Failed to generate PDF. Please try again.");
    } finally {
      setIsDownloadingPdf(false);
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
      const uploadErrors: string[] = [];
      const operationsImageUrls: string[] = [];

      for (let i = 0; i < operationsAttachments.length; i++) {
        const attachment = operationsAttachments[i];
        if (!attachment.file) continue;

        const upload = await uploadConfirmationImage(attachment.file, `additional_${i + 1}`);
        if ("error" in upload) {
          uploadErrors.push(`Attachment ${i + 1}: ${upload.error}`);
          const fallbackUrl = attachment.preview || (await fileToDataUrl(attachment.file));
          if (fallbackUrl) operationsImageUrls.push(fallbackUrl);
        } else if (upload.url) {
          operationsImageUrls.push(upload.url);
        }
      }

      // Show warning if any uploads failed (but don't block submission)
      if (uploadErrors.length > 0) {
        toast.warning(`Some images couldn't be uploaded to storage but will be saved locally: ${uploadErrors.join(", ")}`);
      }

      const primaryCalculator = calculators[0] ?? getEmptyCalculatorValues();
      const resolvedQuantity =
        primaryCalculator.quantity?.trim() ||
        (isEditing ? editQuantity : selectedInquiry.quantity)?.trim() ||
        formQuantity.trim() ||
        "0";

      const calculatorsForSubmit = calculators.map((calcValues, index) => ({
        ...calcValues,
        quantity:
          index === 0
            ? resolvedQuantity
            : calcValues.quantity?.trim() || resolvedQuantity,
      }));

      const serializedCalculatorValues = serializeCalculatorPayload(
        calculatorsForSubmit,
        operationsDescription
      );

      const result = await submitInquiryForConfirmation({
        inquiry_id: selectedInquiry.id,
        lead_id: selectedInquiry.lead_id,
        lead_number: selectedInquiry.leads.lead_id_formatted || "",
        product_name: formProductName,
        total_weight: formWeight,
        cbm: formCbm,
        quantity: resolvedQuantity,
        hs_code: primaryCalculator.hs_code ?? "",
        calculator_values: serializedCalculatorValues,
        original_image_url: selectedInquiry.image_url,
        sales_additional_image_urls: Array.isArray(selectedInquiry.additional_image_urls)
          ? selectedInquiry.additional_image_urls
          : [],
        operations_additional_image_urls: operationsImageUrls,
        additional_image_1_url: operationsImageUrls[0] || null,
        additional_image_2_url: operationsImageUrls[1] || null,
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
          await refreshInquiryLogs(selectedInquiry.lead_id, selectedInquiry.id);
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
    attachmentId,
    index,
    preview,
    onPreviewClick,
  }: {
    attachmentId: string;
    index: number;
    preview: string | null;
    onPreviewClick: (url: string) => void;
  }) {
    return (
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-600">
          Operations Attachment {index}
        </label>
        {preview ? (
          <div
            onDrop={(e) => handleDrop(e, attachmentId)}
            onDragOver={handleDragOver}
            onPaste={(e) => handleZonePaste(e, attachmentId)}
            onFocus={() => setActiveAttachmentId(attachmentId)}
            onClick={() => setActiveAttachmentId(attachmentId)}
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
                  alt={`Additional ${index}`}
                  className="max-h-40 rounded object-contain cursor-zoom-in"
                  onClick={() => onPreviewClick(preview)}
                />
              ) : (
                <button
                  type="button"
                  className="text-left text-sm text-teal-700 hover:underline max-w-full truncate"
                  onClick={() => onPreviewClick(preview)}
                >
                  {preview.split("/").pop()?.split("?")[0] || `Attachment ${index}`}
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeOperationsAttachment(attachmentId);
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
                onClick={() => openOperationsAttachmentPicker(attachmentId)}
              >
                Change File
              </Button>
              <span className="text-[11px] text-slate-400">You can also paste (Ctrl+V) to replace.</span>
            </div>
          </div>
        ) : (
          <div
            onDrop={(e) => handleDrop(e, attachmentId)}
            onDragOver={handleDragOver}
            onPaste={(e) => handleZonePaste(e, attachmentId)}
            onFocus={() => setActiveAttachmentId(attachmentId)}
            onClick={() => openOperationsAttachmentPicker(attachmentId)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openOperationsAttachmentPicker(attachmentId);
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

    const weightKg = toNum(isEditing ? editWeight : inq.total_weight);
    const cbm = toNum(isEditing ? editCbm : inq.cbm);
    const inquiryQuantity = (isEditing ? editQuantity : inq.quantity)?.trim() || "0";

    const formCalculators = calculators.map((calcValues, index) =>
      withDerivedInvValue({
        ...calcValues,
        quantity:
          calcValues.quantity?.trim() ||
          (index === 0 ? formQuantity || inquiryQuantity : inquiryQuantity) ||
          "0",
      })
    );

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
      unit_value: "Unit Value",
      exchange_rate: "Exchange Rate",
      custom_duty_rate: "Custom Duty %",
      add_cd_rate: "Add CD %",
      gst_rate: "Sales Tax %",
      add_gst_rate: "Add GST %",
      income_tax_rate: "Income Tax %",
      excise_rate: "Excise %",
      regular_duty_rate: "Regular Duty %",
      stamp_duty_rate: "Stamp Duty %",
      inv_fine: "INV Fine",
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
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs text-slate-500 font-medium">Description</label>
                    <Textarea
                      value={operationsDescription}
                      onChange={(e) => setOperationsDescription(e.target.value)}
                      onBlur={() => void persistCalculatorPayload()}
                      placeholder="Enter description..."
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

            {calculators.map((calcValues, calcIndex) => (
              <div key={`calculator-${inq.id}-${calcIndex}`}>
                <InquiryCalculatorSection
                  values={calcValues}
                  onChange={(values) => updateCalculatorAt(calcIndex, values)}
                  onFieldBlur={
                    calcIndex === 0
                      ? (field, value) => void logCalculatorFieldChange(field, value)
                      : undefined
                  }
                  inquiryQuantity={inquiryQuantity}
                  totalWeightKg={weightKg}
                  cbm={cbm}
                  pricingConfig={pricingConfig}
                  adminCalculatorMode={adminCalculatorMode}
                  title={
                    calculators.length > 1
                      ? `Calculation on Actual (Calculator ${calcIndex + 1})`
                      : "Calculation on Actual"
                  }
                />
              </div>
            ))}

            <div className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  addCalculator();
                  void persistCalculatorPayload();
                }}
              >
                <Plus className="h-4 w-4" />
                + Add Calculator
              </Button>
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

            {!isEditing && (
              <div>
                <label className="text-xs text-slate-500 font-medium">Description</label>
                <Textarea
                  value={operationsDescription}
                  onChange={(e) => setOperationsDescription(e.target.value)}
                  onBlur={() => void persistCalculatorPayload()}
                  placeholder="Enter description..."
                  rows={3}
                  className="mt-1"
                />
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
              <div id="lead-management-pdf-document" ref={leadManagementPdfRef}>
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

              {formCalculators.map((calcValues, calcIndex) => (
                <div key={`lead-form-calculator-${calcIndex}`} className="space-y-5">
                  {formCalculators.length > 1 && (
                    <h4 className="text-sm font-semibold text-slate-700">
                      Calculator {calcIndex + 1}
                    </h4>
                  )}
                  <EstimatedDutiesAndTaxesBlock
                    calculatorValues={calcValues}
                    quantityFallback={formQuantity || inquiryQuantity}
                    showDisclaimer={calcIndex === 0}
                  />
                </div>
              ))}

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Description</label>
                <Textarea
                  value={operationsDescription}
                  onChange={(e) => setOperationsDescription(e.target.value)}
                  onBlur={() => void persistCalculatorPayload()}
                  placeholder="Enter description..."
                  rows={3}
                />
              </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void handleDownloadLeadManagementPdf()}
                  disabled={isDownloadingPdf}
                >
                  {isDownloadingPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Download PDF
                </Button>
              </div>

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
                  {operationsAttachments.map((attachment, index) => (
                    <ImageUploadSection
                      key={attachment.id}
                      attachmentId={attachment.id}
                      index={index + 1}
                      preview={attachment.preview}
                      onPreviewClick={(url) => openImagePreview(url, `Additional Attachment ${index + 1}`)}
                    />
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={addOperationsAttachment}
                >
                  <Plus className="h-4 w-4" />
                  Add Attachment
                </Button>

                <input
                  ref={operationsFileInputRef}
                  type="file"
                  accept="image/*,application/pdf,.doc,.docx,.xlsx,.xls,.txt,.csv"
                  className="absolute -left-[9999px] h-px w-px opacity-0"
                  onChange={handleFileInputChange}
                />
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
