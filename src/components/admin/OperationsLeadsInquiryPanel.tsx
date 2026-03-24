"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  getAllInquiriesForOperations,
  updateInquiryForAccounting,
  deleteInquiry,
  type LeadInquiryWithLead,
} from "@/app/actions/inquiries";
import {
  getInquiryByLeadNumber,
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
  const [leadNumber, setLeadNumber] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [fetchedData, setFetchedData] = useState<{
    lead: { id: string; name: string };
    inquiry: {
      id: string;
      product_name: string;
      total_weight: string;
      cbm: string;
      quantity: string;
      image_url: string | null;
    };
  } | null>(null);
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

  async function openDetail(inquiry: LeadInquiryWithLead) {
    setSelectedInquiry(inquiry);
    setView("detail");
    setShowForm(false);
    resetForm();
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
    // Also re-fetch all inquiries in background so list data stays fresh
    fetchInquiries();
  }

  function backToList() {
    setView("list");
    setSelectedInquiry(null);
    setShowForm(false);
    resetForm();
    fetchInquiries();
  }

  function resetForm() {
    setLeadNumber("");
    setFetchedData(null);
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

  // ─── Fetch inquiry by lead number ─────────────────────────────────

  async function handleFetchByLeadNumber() {
    if (leadNumber.trim().length !== 6) {
      toast.error("Please enter a valid 6-digit lead number.");
      return;
    }
    setIsFetching(true);
    try {
      const result = await getInquiryByLeadNumber(leadNumber.trim());
      if ("error" in result) {
        toast.error(result.error);
        setFetchedData(null);
      } else {
        setFetchedData(result as typeof fetchedData);
        // Auto-populate the form
        setFormProductName(result.inquiry?.product_name || "");
        setFormWeight(result.inquiry?.total_weight || "");
        setFormCbm(result.inquiry?.cbm || "");
        setFormQuantity(result.inquiry?.quantity || "");
        toast.success("Lead data fetched successfully!");
      }
    } catch {
      toast.error("Failed to fetch lead data.");
    } finally {
      setIsFetching(false);
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
    if (!fetchedData) {
      toast.error("Please fetch lead data first.");
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
        inquiry_id: fetchedData.inquiry.id,
        lead_id: fetchedData.lead.id,
        lead_number: leadNumber.trim(),
        product_name: formProductName,
        total_weight: formWeight,
        cbm: formCbm,
        quantity: formQuantity,
        original_image_url: fetchedData.inquiry.image_url,
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
                <Button size="sm" onClick={() => setShowForm(true)} className="gap-1">
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

        {/* Main Content */}
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

        {/* ═══════════════════════════════════════════════════════════ */}
        {/*  LEAD MANAGEMENT FORM                                      */}
        {/* ═══════════════════════════════════════════════════════════ */}

        {showForm && (
          <Card className="border-2 border-teal-200 shadow-md">
            <CardContent className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-teal-600" />
                  Lead Management Form
                </h3>
                <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); resetForm(); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Lead Number Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Lead Number <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <Input
                    value={leadNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                      setLeadNumber(val);
                    }}
                    placeholder="Enter 6-digit lead number"
                    maxLength={6}
                    className="max-w-xs font-mono text-lg tracking-widest"
                  />
                  <Button
                    onClick={handleFetchByLeadNumber}
                    disabled={leadNumber.length !== 6 || isFetching}
                    size="sm"
                  >
                    {isFetching ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Search className="h-4 w-4 mr-1" />
                    )}
                    Fetch
                  </Button>
                </div>
                <p className="text-xs text-slate-400">
                  Enter the 6-digit Lead ID to auto-populate product details.
                </p>
              </div>

              {/* Auto-populated fields */}
              {fetchedData && (
                <>
                  <div className="border-t pt-4" />

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

                  {/* 3 Image Sections */}
                  <div className="border-t pt-4" />
                  <h4 className="text-sm font-semibold text-slate-700">Images</h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Section 1: Original Inquiry Image (read-only) */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-600">
                        Original Inquiry Image
                      </label>
                      {fetchedData.inquiry.image_url ? (
                        <div className="border rounded-lg p-2">
                          <img
                            src={fetchedData.inquiry.image_url}
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

                    {/* Section 2: Additional Image 1 */}
                    <ImageUploadSection
                      slot={1}
                      preview={additionalImage1Preview}
                      dropRef={dropZone1Ref}
                      inputRef={img1Ref}
                    />

                    {/* Section 3: Additional Image 2 */}
                    <ImageUploadSection
                      slot={2}
                      preview={additionalImage2Preview}
                      dropRef={dropZone2Ref}
                      inputRef={img2Ref}
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="border-t pt-4 flex justify-end">
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
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

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
                  {filteredInquiries.map((inquiry) => (
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
