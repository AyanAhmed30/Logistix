"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  getAllInquiriesForOperations,
  updateInquiryForAccounting,
  deleteInquiry,
  getInquiryLogsForLead,
  addInquiryLogNote,
  addInquiryActivity,
  type LeadInquiryWithLead,
  type InquiryLog,
} from "@/app/actions/inquiries";
import {
  submitInquiryForConfirmation,
  getConfirmationsForInquiry,
  type InquiryConfirmation,
} from "@/app/actions/inquiry_confirmations";
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

export function OperationsLeadsInquiryPanel() {
  const [view, setView] = useState<ViewMode>("list");
  const [inquiries, setInquiries] = useState<LeadInquiryWithLead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<LeadInquiryWithLead | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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

  // Duty calculator state (Operations detail view)
  const [calcInvValue, setCalcInvValue] = useState("");
  const [calcExchangeRate, setCalcExchangeRate] = useState("2254.13");
  const [calcCustomDutyRate, setCalcCustomDutyRate] = useState("0");
  const [calcAddCdRate, setCalcAddCdRate] = useState("0");
  const [calcGstRate, setCalcGstRate] = useState("18");
  const [calcAddGstRate, setCalcAddGstRate] = useState("0");
  const [calcIncomeTaxRate, setCalcIncomeTaxRate] = useState("12");
  const [calcExciseRate, setCalcExciseRate] = useState("1.8");
  const [calcRegularDutyRate, setCalcRegularDutyRate] = useState("30");
  const [calcStampDutyRate, setCalcStampDutyRate] = useState("0");
  const [calcInvFine, setCalcInvFine] = useState("0");
  const [calcFreight, setCalcFreight] = useState("0");
  const [calcShippingLineCharges, setCalcShippingLineCharges] = useState("0");
  const [calcClearanceExpense, setCalcClearanceExpense] = useState("0");

  const fetchInquiries = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getAllInquiriesForOperations();
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

  useEffect(() => {
    fetchInquiries();
  }, [fetchInquiries]);

  const filteredInquiries = inquiries.filter((inq) => {
    if (!searchQuery.trim()) return true;
    const s = searchQuery.toLowerCase();
    return (
      (inq.leads?.lead_id_formatted || "").toLowerCase().includes(s) ||
      (inq.leads?.name || "").toLowerCase().includes(s) ||
      (inq.leads?.number || "").toLowerCase().includes(s) ||
      (inq.leads?.source || "").toLowerCase().includes(s) ||
      (inq.leads?.sales_agents?.name || "").toLowerCase().includes(s) ||
      (inq.product_name || "").toLowerCase().includes(s) ||
      (inq.description || "").toLowerCase().includes(s) ||
      inq.status.toLowerCase().includes(s)
    );
  });

  // Show each lead only once in the list (latest inquiry row per lead).
  const dedupedFilteredInquiries = (() => {
    const latestByLead = new Map<string, LeadInquiryWithLead>();
    for (const inq of filteredInquiries) {
      const leadKey = inq.lead_id || inq.leads?.id || inq.id;
      const existing = latestByLead.get(leadKey);
      if (!existing) {
        latestByLead.set(leadKey, inq);
        continue;
      }
      const existingTime = new Date(existing.created_at).getTime();
      const currentTime = new Date(inq.created_at).getTime();
      if (currentTime > existingTime) {
        latestByLead.set(leadKey, inq);
      }
    }
    return Array.from(latestByLead.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  })();

  async function openDetail(inquiry: LeadInquiryWithLead) {
    setSelectedInquiry(inquiry);
    setView("detail");
    setShowForm(false);
    resetForm();
    // Prefill calculator with inquiry values; user can adjust freely.
    setCalcInvValue(inquiry.quantity || "");
    setCalcExchangeRate("2254.13");
    setCalcCustomDutyRate("0");
    setCalcAddCdRate("0");
    setCalcGstRate("18");
    setCalcAddGstRate("0");
    setCalcIncomeTaxRate("12");
    setCalcExciseRate("1.8");
    setCalcRegularDutyRate("30");
    setCalcStampDutyRate("0");
    setCalcInvFine("0");
    setCalcFreight("0");
    setCalcShippingLineCharges("0");
    setCalcClearanceExpense("0");
    // Load full confirmation history from server (always fresh)
    try {
      const result = await getConfirmationsForInquiry(inquiry.id);
      if ("error" in result) {
        setConfirmations([]);
      } else {
        setConfirmations(result.confirmations || []);
      }
    } catch {
      setConfirmations([]);
    }
    try {
      const logsResult = await getInquiryLogsForLead(inquiry.lead_id);
      if ("error" in logsResult) {
        setInquiryLogs([]);
      } else {
        setInquiryLogs(logsResult.logs || []);
      }
    } catch {
      setInquiryLogs([]);
    }
    setActiveRightTab("send_message");
    setLogNoteText("");
    // Also re-fetch all inquiries in background so list data stays fresh
    fetchInquiries();
  }

  function backToList() {
    setView("list");
    setSelectedInquiry(null);
    setShowForm(false);
    setInquiryLogs([]);
    setActiveRightTab("send_message");
    setLogNoteText("");
    resetForm();
    fetchInquiries();
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
      const logsResult = await getInquiryLogsForLead(selectedInquiry.lead_id);
      if (!("error" in logsResult)) {
        setInquiryLogs(logsResult.logs || []);
      }
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
      const logsResult = await getInquiryLogsForLead(selectedInquiry.lead_id);
      if (!("error" in logsResult)) {
        setInquiryLogs(logsResult.logs || []);
      }
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
        setSelectedInquiry({
          ...selectedInquiry,
          product_name: editProductName.trim(),
          total_weight: editWeight.trim(),
          cbm: editCbm.trim(),
          quantity: editQuantity.trim(),
          description: editDescription.trim(),
        });
        setIsEditing(false);
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
          fetchInquiries();
        }
      }
    } catch {
      toast.error("Failed to delete inquiry.");
    } finally {
      setIsDeleting(false);
    }
  }

  // ─── Image handling helpers ───────────────────────────────────────

  function handleImageFile(file: File, slot: 1 | 2) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      if (slot === 1) {
        setAdditionalImage1(file);
        setAdditionalImage1Preview(url);
      } else {
        setAdditionalImage2(file);
        setAdditionalImage2Preview(url);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent, slot: 1 | 2) {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageFile(file, slot);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handlePaste(e: React.ClipboardEvent, slot: 1 | 2) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          handleImageFile(file, slot);
          return;
        }
      }
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>, slot: 1 | 2) {
    const file = e.target.files?.[0];
    if (file) handleImageFile(file, slot);
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
      // Upload additional images if present (convert to base64 data URLs as fallback)
      let img1Url: string | null = null;
      let img2Url: string | null = null;

      if (additionalImage1) {
        img1Url = additionalImage1Preview; // base64 data URL
      }
      if (additionalImage2) {
        img2Url = additionalImage2Preview; // base64 data URL
      }

      const result = await submitInquiryForConfirmation({
        inquiry_id: selectedInquiry.id,
        lead_id: selectedInquiry.lead_id,
        lead_number: selectedInquiry.leads.lead_id_formatted || "",
        product_name: formProductName,
        total_weight: formWeight,
        cbm: formCbm,
        quantity: formQuantity,
        original_image_url: selectedInquiry.image_url,
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
  }: {
    slot: 1 | 2;
    preview: string | null;
    dropRef: React.RefObject<HTMLDivElement | null>;
    inputRef: React.RefObject<HTMLInputElement | null>;
  }) {
    return (
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-600">
          Additional Image {slot}
        </label>
        {preview ? (
          <div className="relative border rounded-lg p-2 inline-block">
            <img
              src={preview}
              alt={`Additional ${slot}`}
              className="max-h-40 rounded object-contain"
            />
            <button
              type="button"
              onClick={() => removeImage(slot)}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div
            ref={dropRef}
            onDrop={(e) => handleDrop(e, slot)}
            onDragOver={handleDragOver}
            onPaste={(e) => handlePaste(e, slot)}
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
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
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
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
    const leadInquiryHistory = inquiries
      .filter((item) => item.lead_id === inq.lead_id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

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

    const totalDutyCost =
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
      totalDutyCost,
      costPerWeight,
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
                    <Input value={calcInvValue} onChange={(e) => setCalcInvValue(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{calc.invValue || "-"}</div>
                </div>

                <div className="grid grid-cols-12 border-b">
                  <div className="col-span-5 px-3 py-2 border-r text-sm font-medium">@ (Exchange Rate)</div>
                  <div className="col-span-3 px-2 py-1.5 border-r">
                    <Input value={calcExchangeRate} onChange={(e) => setCalcExchangeRate(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{calcExchangeRate || "-"}</div>
                </div>

                <div className="grid grid-cols-12 border-b">
                  <div className="col-span-8 px-3 py-2 border-r text-sm font-medium">PKR Value</div>
                  <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{fmtMoney(calc.pkrValue)}</div>
                </div>
                <div className="grid grid-cols-12 border-b">
                  <div className="col-span-8 px-3 py-2 border-r text-sm font-medium">Assessed Value</div>
                  <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{fmtMoney(calc.assessedValue)}</div>
                </div>

                {[
                  { label: "Custom Duty", rate: calcCustomDutyRate, setRate: setCalcCustomDutyRate, amount: calc.customDuty },
                  { label: "Add CD", rate: calcAddCdRate, setRate: setCalcAddCdRate, amount: calc.addCd },
                  { label: "GST", rate: calcGstRate, setRate: setCalcGstRate, amount: calc.gst },
                  { label: "Add GST", rate: calcAddGstRate, setRate: setCalcAddGstRate, amount: calc.addGst },
                  { label: "Income Tax", rate: calcIncomeTaxRate, setRate: setCalcIncomeTaxRate, amount: calc.incomeTax },
                  { label: "Excise", rate: calcExciseRate, setRate: setCalcExciseRate, amount: calc.excise },
                  { label: "Regular Duty", rate: calcRegularDutyRate, setRate: setCalcRegularDutyRate, amount: calc.regularDuty },
                  { label: "Stamp Duty", rate: calcStampDutyRate, setRate: setCalcStampDutyRate, amount: calc.stampDuty },
                ].map((row) => (
                  <div key={row.label} className="grid grid-cols-12 border-b">
                    <div className="col-span-5 px-3 py-2 border-r text-sm">{row.label}</div>
                    <div className="col-span-3 px-2 py-1.5 border-r">
                      <Input value={row.rate} onChange={(e) => row.setRate(e.target.value)} className="h-8 text-xs" />
                      <div className="text-[10px] text-slate-500 mt-0.5">{fmtRate(row.rate)}</div>
                    </div>
                    <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{fmtMoney(row.amount)}</div>
                  </div>
                ))}

                {[
                  { label: "INV Fine", value: calcInvFine, setValue: setCalcInvFine, amount: calc.invFine },
                  { label: "Freight", value: calcFreight, setValue: setCalcFreight, amount: calc.freight },
                  { label: "Shipping Line Charges", value: calcShippingLineCharges, setValue: setCalcShippingLineCharges, amount: calc.shippingLineCharges },
                  { label: "Clearance Expense", value: calcClearanceExpense, setValue: setCalcClearanceExpense, amount: calc.clearanceExpense },
                ].map((row) => (
                  <div key={row.label} className="grid grid-cols-12 border-b">
                    <div className="col-span-5 px-3 py-2 border-r text-sm">{row.label}</div>
                    <div className="col-span-3 px-2 py-1.5 border-r">
                      <Input value={row.value} onChange={(e) => row.setValue(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{fmtMoney(row.amount)}</div>
                  </div>
                ))}

                <div className="grid grid-cols-12 bg-yellow-50">
                  <div className="col-span-8 px-3 py-2 border-r text-sm font-bold text-slate-800">Total Duty Cost</div>
                  <div className="col-span-4 px-3 py-2 text-right text-sm font-bold text-slate-900">{fmtMoney(calc.totalDutyCost)}</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                <div>
                  <div className="text-xs text-slate-500 font-medium">Weight</div>
                  <div className="text-sm font-semibold text-slate-800 mt-0.5">{weightKg || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-medium">Cost per Weight</div>
                  <div className="text-sm font-semibold text-slate-800 mt-0.5">
                    {weightKg > 0 ? calc.costPerWeight.toFixed(6) : "-"}
                  </div>
                </div>
              </div>
            </div>

            {/* Separator */}
            <div className="border-t" />

            {/* Image */}
            {inq.image_url && (
              <div>
                <label className="text-xs text-slate-500 font-medium flex items-center gap-1">
                  <ImageIcon className="h-3.5 w-3.5" /> Attached Image
                </label>
                <div className="mt-1 border rounded-lg p-2 inline-block">
                  <img
                    src={inq.image_url}
                    alt="Inquiry attachment"
                    className="max-h-56 rounded object-contain"
                  />
                </div>
              </div>
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
                    // Keep history stable/readable:
                    // - Always show value-diff timeline from inquiry versions
                    // - Only inject explicit "log_note" entries from inquiry_logs
                    const extraLogs = inquiryLogs.filter((log) => {
                      const next = (log.new_values || {}) as Record<string, unknown>;
                      const hasNote =
                        log.action === "log_note" &&
                        typeof next.note === "string" &&
                        String(next.note).trim().length > 0;
                      const hasActivity =
                        log.action === "activity" &&
                        typeof next.summary === "string" &&
                        String(next.summary).trim().length > 0;
                      return hasNote || hasActivity;
                    });

                    const extraLogNodes = extraLogs.map((log) => {
                        const next = (log.new_values || {}) as Record<string, unknown>;
                        const note = typeof next.note === "string" ? next.note : "";
                        const summary = typeof next.summary === "string" ? next.summary : "";
                        const dueDate =
                          typeof next.due_date === "string" && next.due_date
                            ? new Date(next.due_date)
                            : null;
                        const isPast = dueDate ? dueDate < new Date() : false;
                        return (
                          <div key={log.id} className="flex gap-3">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center font-semibold text-xs shrink-0 mt-0.5 ${
                              log.action === "activity" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"
                            }`}>
                              {(log.performed_by || "U").charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="font-semibold text-sm text-slate-700">{log.performed_by}</span>
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
                              {log.action === "activity" ? (
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
                                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{summary}</p>
                                </div>
                              ) : (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-1 text-sm text-slate-700 whitespace-pre-wrap">
                                  {note}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      });

                    if (leadInquiryHistory.length === 0 && extraLogNodes.length === 0) {
                      return <p className="text-sm text-slate-400 text-center py-8">No activity yet.</p>;
                    }

                    const timelineNodes = leadInquiryHistory.map((h, idx) => {
                      const prev = idx > 0 ? leadInquiryHistory[idx - 1] : null;
                      const actor = h.leads?.sales_agents?.name || h.leads?.name || "User";
                      const changes: { field: string; oldVal: string; newVal: string }[] = [];
                      if (prev) {
                        if ((prev.product_name || "") !== (h.product_name || "")) {
                          changes.push({ field: "Product", oldVal: prev.product_name || "-", newVal: h.product_name || "-" });
                        }
                        if ((prev.quantity || "") !== (h.quantity || "")) {
                          changes.push({ field: "Quantity", oldVal: prev.quantity || "-", newVal: h.quantity || "-" });
                        }
                        if ((prev.total_weight || "") !== (h.total_weight || "")) {
                          changes.push({ field: "Weight", oldVal: prev.total_weight || "-", newVal: h.total_weight || "-" });
                        }
                        if ((prev.cbm || "") !== (h.cbm || "")) {
                          changes.push({ field: "CBM", oldVal: prev.cbm || "-", newVal: h.cbm || "-" });
                        }
                        if ((prev.description || "") !== (h.description || "")) {
                          changes.push({ field: "Details", oldVal: prev.description || "-", newVal: h.description || "-" });
                        }
                      }
                      return (
                        <div key={h.id} className="flex gap-3">
                          <div className="h-8 w-8 rounded-full flex items-center justify-center font-semibold text-xs shrink-0 mt-0.5 bg-teal-100 text-teal-800">
                            {(actor || "U").charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-slate-700">{actor}</span>
                              <span className="text-xs text-slate-400">
                                {new Date(h.created_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                                {" · "}
                                {new Date(h.created_at).toLocaleDateString([], {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                            </div>
                            {prev ? (
                              <div className="space-y-1 mt-1">
                                {changes.length > 0 ? (
                                  changes.map((c) => (
                                    <div key={`${h.id}-${c.field}`} className="text-sm text-slate-700">
                                      <span className="text-slate-600 font-medium">{c.field}:</span>
                                      <span className="ml-1 text-slate-500">Old: {c.oldVal}</span>
                                      <span className="mx-1 text-slate-400">→</span>
                                      <span className="font-semibold text-teal-700">New: {c.newVal}</span>
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-sm text-slate-500">No field change in this version.</div>
                                )}
                              </div>
                            ) : (
                              <div className="text-sm text-slate-500 mt-1">
                                Creating a new record...
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    });

                    return (
                      <>
                        {extraLogNodes}
                        {timelineNodes}
                      </>
                    );
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
                    onChange={(e) => setFormQuantity(e.target.value)}
                    placeholder="e.g. 100"
                  />
                </div>
              </div>

              <div className="border-t pt-4" />
              <h4 className="text-sm font-semibold text-slate-700">Images</h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-600">
                    Original Inquiry Image
                  </label>
                  {selectedInquiry?.image_url ? (
                    <div className="border rounded-lg p-2">
                      <img
                        src={selectedInquiry.image_url}
                        alt="Original inquiry"
                        className="max-h-40 rounded object-contain w-full"
                      />
                      <p className="text-[10px] text-slate-400 mt-1 text-center">Read-only</p>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center">
                      <ImageIcon className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                      <p className="text-xs text-slate-400">No image attached</p>
                    </div>
                  )}
                </div>

                <ImageUploadSection
                  slot={1}
                  preview={additionalImage1Preview}
                  dropRef={dropZone1Ref}
                  inputRef={img1Ref}
                />

                <ImageUploadSection
                  slot={2}
                  preview={additionalImage2Preview}
                  dropRef={dropZone2Ref}
                  inputRef={img2Ref}
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
          <Button variant="outline" size="sm" onClick={fetchInquiries} disabled={isLoading}>
            <RefreshCcw className={`h-4 w-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <span className="text-sm text-slate-500">
            {dedupedFilteredInquiries.length} record{dedupedFilteredInquiries.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Table */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400">Loading inquiries...</div>
          ) : dedupedFilteredInquiries.length === 0 ? (
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
                    <TableHead className="font-semibold">Total Weight</TableHead>
                    <TableHead className="font-semibold">CBM</TableHead>
                    <TableHead className="font-semibold">Quantity</TableHead>
                    <TableHead className="font-semibold">Sales Agent</TableHead>
                    <TableHead className="font-semibold">Confirmation</TableHead>
                    <TableHead className="font-semibold">Sent At</TableHead>
                    <TableHead className="text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dedupedFilteredInquiries.map((inquiry) => (
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
                        {inquiry.total_weight || "-"}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {inquiry.cbm || "-"}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {inquiry.quantity || "-"}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {inquiry.leads?.sales_agents?.name || "-"}
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
