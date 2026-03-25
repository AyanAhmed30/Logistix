"use client";

import { useEffect, useState, useTransition, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  getAllLeadsForSalesAgent,
  updateLeadStatus,
  getLeadComments,
  createLeadComment,
  updateLeadComment,
  deleteLeadComment,
  type Lead,
  type LeadStatus,
  type LeadComment,
} from "@/app/actions/leads";
import { convertLeadToCustomer } from "@/app/actions/customer_conversion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MessageSquare, Edit2, Trash2, Plus, UserPlus, Search, X, Send, FileText, ImageIcon, History, MoreVertical, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  saveInquiry,
  sendInquiryToAccounting,
  getInquiryForLead,
  getInquiryHistoryForLead,
  getQuotationsForLead,
  getInquiryTrackingForSalesAgent,
  type LeadInquiry,
  type InquiryQuotation,
  type InquiryTrackingInfo,
} from "@/app/actions/inquiries";
import jsPDF from "jspdf";

const STATUSES: LeadStatus[] = [
  "Leads",
  "Inquiry Received",
  "Quotation Sent",
  "Negotiation",
  "Win",
];

const STATUSES_ROW_2: LeadStatus[] = [
  "Follow up",
  "Lose",
];


// Boards where the dropdown shows "Follow Up" and "Lose"
const NORMAL_BOARDS: LeadStatus[] = ["Leads", "Inquiry Received", "Quotation Sent", "Negotiation", "Win"];
// Boards where the dropdown shows the normal board options
const SPECIAL_BOARDS: LeadStatus[] = ["Follow up", "Lose"];

function LeadCard({
  lead,
  onOpenComments,
  onConvert,
  onOpenInquiry,
  onMoveToStatus,
  showConvertButton,
  showInquiryButton,
  inquiryTracking,
}: {
  lead: Lead;
  onOpenComments: (lead: Lead) => void;
  onConvert?: (lead: Lead) => void;
  onOpenInquiry?: (lead: Lead) => void;
  onMoveToStatus?: (lead: Lead, status: LeadStatus) => void;
  showConvertButton?: boolean;
  showInquiryButton?: boolean;
  inquiryTracking?: InquiryTrackingInfo | null;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Determine dropdown options based on current board
  const isInSpecialBoard = SPECIAL_BOARDS.includes(lead.status);
  const dropdownOptions: LeadStatus[] = isInSpecialBoard ? NORMAL_BOARDS : SPECIAL_BOARDS;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card className="mb-2 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow">
        <CardContent className="p-2.5">
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0 flex-1">
                {lead.lead_id_formatted && (
                  <span className="font-mono text-[10px] text-primary-accent font-semibold">#{lead.lead_id_formatted}</span>
                )}
                <h4 className="font-semibold text-xs text-primary-dark leading-tight truncate">{lead.name}</h4>
                <p className="text-[10px] text-secondary-muted truncate">{lead.number}</p>
              </div>
              {/* Three-dot menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-3.5 w-3.5 text-secondary-muted" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {dropdownOptions.map((status) => (
                    <DropdownMenuItem
                      key={status}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveToStatus?.(lead, status);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="text-xs cursor-pointer"
                    >
                      {status}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex items-center justify-between gap-1">
              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] truncate flex-1 min-w-0">
                {lead.source}
              </span>
              <div className="flex gap-0.5 flex-shrink-0">
                {showInquiryButton && onOpenInquiry && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenInquiry(lead);
                    }}
                    title="Open Inquiry"
                  >
                    <FileText className="h-3 w-3 text-orange-600" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenComments(lead);
                  }}
                >
                  <MessageSquare className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {showConvertButton && !lead.converted && onConvert && (
              <Button
                variant="default"
                size="sm"
                className="w-full mt-1.5 h-7 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onConvert(lead);
                }}
              >
                <UserPlus className="h-3 w-3 mr-1" />
                <span className="truncate">Create Customer</span>
              </Button>
            )}
            {lead.converted && (
              <div className="mt-1.5 px-1.5 py-0.5 bg-green-100 text-green-800 rounded text-[10px] text-center">
                Converted
              </div>
            )}
            {/* Inquiry Tracking Badge */}
            {inquiryTracking && (
              <div className={`mt-1.5 px-1.5 py-0.5 rounded text-[10px] text-center flex items-center justify-center gap-1 ${
                inquiryTracking.status === 'approved'
                  ? 'bg-emerald-100 text-emerald-800'
                  : inquiryTracking.status === 'sent'
                  ? 'bg-blue-100 text-blue-800'
                  : inquiryTracking.status === 'draft'
                  ? 'bg-yellow-100 text-yellow-800'
                  : ''
              }`}>
                {inquiryTracking.status === 'approved' && (
                  <><CheckCircle2 className="h-3 w-3" /> Inquiry Approved</>
                )}
                {inquiryTracking.status === 'sent' && (
                  <><Clock className="h-3 w-3" /> Inquiry Sent</>
                )}
                {inquiryTracking.status === 'draft' && (
                  <><AlertCircle className="h-3 w-3" /> Inquiry Draft</>
                )}
              </div>
            )}
            {/* Show "No Inquiry" for leads in Inquiry Received that have no tracking */}
            {showInquiryButton && !inquiryTracking && (
              <div className="mt-1.5 px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] text-center flex items-center justify-center gap-1">
                <FileText className="h-3 w-3" /> No Inquiry Sent
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KanbanColumn({
  status,
  leads,
  onOpenComments,
  onConvert,
  onOpenInquiry,
  onMoveToStatus,
  searchQuery,
  inquiryTrackingMap,
}: {
  status: LeadStatus;
  leads: Lead[];
  onOpenComments: (lead: Lead) => void;
  onConvert?: (lead: Lead) => void;
  onOpenInquiry?: (lead: Lead) => void;
  onMoveToStatus?: (lead: Lead, status: LeadStatus) => void;
  searchQuery?: string;
  inquiryTrackingMap?: Map<string, InquiryTrackingInfo>;
}) {
  const { setNodeRef } = useDroppable({ id: status });
  const [columnSearchQuery, setColumnSearchQuery] = useState("");

  let filteredLeads = leads.filter((lead) => lead.status === status);
  
  // Apply global search filter if search query exists
  if (searchQuery && searchQuery.trim()) {
    const query = searchQuery.toLowerCase().trim();
    filteredLeads = filteredLeads.filter((lead) =>
      lead.name.toLowerCase().includes(query) ||
      lead.number.toLowerCase().includes(query) ||
      lead.source.toLowerCase().includes(query)
    );
  }

  // Apply column-specific search filter
  if (columnSearchQuery && columnSearchQuery.trim()) {
    const query = columnSearchQuery.toLowerCase().trim();
    filteredLeads = filteredLeads.filter((lead) =>
      lead.name.toLowerCase().includes(query) ||
      lead.number.toLowerCase().includes(query) ||
      lead.source.toLowerCase().includes(query)
    );
  }
  
  const showConvertButton = status === 'Win';
  const showInquiryButton = status === 'Inquiry Received';

  return (
    <div ref={setNodeRef} className="flex-1 min-w-[200px] sm:min-w-[240px] md:min-w-[280px]">
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-2 px-3 pt-3 space-y-2">
          <div>
            <CardTitle className="text-sm md:text-base leading-tight">{status}</CardTitle>
            <CardDescription className="text-[10px] md:text-xs">
              {filteredLeads.length} {filteredLeads.length === 1 ? "lead" : "leads"}
            </CardDescription>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-secondary-muted pointer-events-none" />
            <Input
              type="text"
              placeholder="Search..."
              value={columnSearchQuery}
              onChange={(e) => setColumnSearchQuery(e.target.value)}
              className="pl-7 pr-6 h-7 text-xs"
            />
            {columnSearchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-0.5 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-transparent"
                onClick={() => setColumnSearchQuery("")}
              >
                <X className="h-2.5 w-2.5 text-secondary-muted" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto max-h-[calc(100vh-360px)] sm:max-h-[calc(100vh-380px)] px-2 pb-2">
          <SortableContext items={filteredLeads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
            {filteredLeads.length === 0 ? (
              <div className="text-center py-6 text-[10px] md:text-xs text-secondary-muted">
                {columnSearchQuery || searchQuery ? "No matching leads" : "No leads"}
              </div>
            ) : (
              filteredLeads.map((lead) => (
                <LeadCard 
                  key={lead.id} 
                  lead={lead} 
                  onOpenComments={onOpenComments}
                  onConvert={onConvert}
                  onOpenInquiry={onOpenInquiry}
                  onMoveToStatus={onMoveToStatus}
                  showConvertButton={showConvertButton}
                  showInquiryButton={showInquiryButton}
                  inquiryTracking={inquiryTrackingMap?.get(lead.id) || null}
                />
              ))
            )}
          </SortableContext>
        </CardContent>
      </Card>
    </div>
  );
}

function CommentsDialog({
  lead,
  open,
  onOpenChange,
}: {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [comments, setComments] = useState<LeadComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [isPending, startTransition] = useTransition();

  const fetchComments = useCallback(async () => {
    if (!lead) return;
    setIsLoading(true);
    try {
      const result = await getLeadComments(lead.id);
      if ("error" in result) {
        toast.error(result.error || "Unable to load comments");
      } else {
        setComments(result.comments || []);
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [lead]);

  useEffect(() => {
    if (open && lead) {
      fetchComments();
    } else {
      setComments([]);
      setNewComment("");
      setEditingId(null);
      setEditText("");
    }
  }, [open, lead, fetchComments]);

  function handleAddComment() {
    if (!lead || !newComment.trim()) return;

    startTransition(async () => {
      const result = await createLeadComment(lead.id, newComment);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Comment added successfully");
        setNewComment("");
        fetchComments();
      }
    });
  }

  function handleStartEdit(comment: LeadComment) {
    setEditingId(comment.id);
    setEditText(comment.comment);
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  function handleSaveEdit(commentId: string) {
    if (!editText.trim()) return;

    startTransition(async () => {
      const result = await updateLeadComment(commentId, editText);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Comment updated successfully");
        setEditingId(null);
        setEditText("");
        fetchComments();
      }
    });
  }

  function handleDelete(commentId: string) {
    if (!confirm("Are you sure you want to delete this comment?")) return;

    startTransition(async () => {
      const result = await deleteLeadComment(commentId);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Comment deleted successfully");
        fetchComments();
      }
    });
  }

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Comments - {lead.name}</DialogTitle>
          <DialogDescription>
            Add and manage comments for this lead. All comments are saved with timestamps.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add Comment Section */}
          <div className="space-y-2">
            <Textarea
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={3}
            />
            <Button
              onClick={handleAddComment}
              disabled={isPending || !newComment.trim()}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Comment
            </Button>
          </div>

          {/* Comments List */}
          {isLoading ? (
            <div className="text-center py-8 text-sm text-secondary-muted">
              Loading comments...
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-8 text-sm text-secondary-muted">
              No comments yet. Add your first comment above.
            </div>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => (
                <Card key={comment.id} className="p-3">
                  {editingId === comment.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleSaveEdit(comment.id)}
                          disabled={isPending || !editText.trim()}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCancelEdit}
                          disabled={isPending}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-primary-dark whitespace-pre-wrap">
                        {comment.comment}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-secondary-muted">
                          {new Date(comment.created_at).toLocaleString()}
                          {comment.updated_at !== comment.created_at && " (edited)"}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleStartEdit(comment)}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                            onClick={() => handleDelete(comment.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InquiryDialog({
  lead,
  open,
  onOpenChange,
}: {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [inquiry, setInquiry] = useState<LeadInquiry | null>(null);
  const [quotations, setQuotations] = useState<InquiryQuotation[]>([]);
  const [productName, setProductName] = useState("");
  const [totalWeight, setTotalWeight] = useState("");
  const [cbm, setCbm] = useState("");
  const [quantity, setQuantity] = useState("");
  const [imageData, setImageData] = useState("");
  const [otherDetails, setOtherDetails] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [showQuotationHistory, setShowQuotationHistory] = useState(false);
  const [inquiryHistory, setInquiryHistory] = useState<LeadInquiry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmationStatus, setConfirmationStatus] = useState<'none' | 'approved'>('none');

  const fetchInquiryData = useCallback(async () => {
    if (!lead) return;
    setIsLoading(true);
    try {
      const [inquiryResult, inquiryHistoryResult, quotationsResult, trackingResult] = await Promise.all([
        getInquiryForLead(lead.id),
        getInquiryHistoryForLead(lead.id),
        getQuotationsForLead(lead.id),
        getInquiryTrackingForSalesAgent(),
      ]);
      if ("error" in inquiryResult) {
        // No inquiry yet, that's fine
      } else if (inquiryResult.inquiry) {
        setInquiry(inquiryResult.inquiry);
        setProductName(inquiryResult.inquiry.product_name || "");
        setTotalWeight(inquiryResult.inquiry.total_weight || "");
        setCbm(inquiryResult.inquiry.cbm || "");
        setQuantity(inquiryResult.inquiry.quantity || "");
        setImageData(inquiryResult.inquiry.image_url || "");
        setOtherDetails(inquiryResult.inquiry.description || "");
      }
      if (!("error" in quotationsResult)) {
        setQuotations(quotationsResult.quotations || []);
      }
      if (!("error" in inquiryHistoryResult)) {
        setInquiryHistory(inquiryHistoryResult.inquiries || []);
      }
      // Check confirmation status - only show "approved" to sales agent
      if (!("error" in trackingResult) && trackingResult.tracking) {
        const thisTracking = trackingResult.tracking.find((t) => t.lead_id === lead.id);
        if (thisTracking?.status === 'approved') {
          setConfirmationStatus('approved');
        } else {
          setConfirmationStatus('none');
        }
      }
    } catch {
      toast.error("Failed to load inquiry data");
    } finally {
      setIsLoading(false);
    }
  }, [lead]);

  useEffect(() => {
    if (open && lead) {
      fetchInquiryData();
    } else {
      setInquiry(null);
      setQuotations([]);
      setProductName("");
      setTotalWeight("");
      setCbm("");
      setQuantity("");
      setImageData("");
      setOtherDetails("");
      setShowQuotationHistory(false);
      setInquiryHistory([]);
      setIsDragging(false);
      setConfirmationStatus('none');
    }
  }, [open, lead, fetchInquiryData]);

  // Handle image file (from drop, paste, or file input)
  const handleImageFile = useCallback((file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageData(reader.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  // Global paste handler for Ctrl+V image paste
  useEffect(() => {
    if (!open) return;
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handleImageFile(file);
          break;
        }
      }
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [open, handleImageFile]);

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
      handleImageFile(files[0]);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleImageFile(files[0]);
    }
    // Reset input so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeImage() {
    setImageData("");
  }

  function handleSaveInquiry() {
    if (!lead) return;
    startTransition(async () => {
      const result = await saveInquiry(lead.id, {
        product_name: productName,
        total_weight: totalWeight,
        cbm,
        quantity,
        image_url: imageData || null,
        description: otherDetails,
      });
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Inquiry saved successfully");
        if (result.inquiry) setInquiry(result.inquiry);
      }
    });
  }

  function handleSendInquiry() {
    if (!lead) return;
    if (!productName.trim()) {
      toast.error("Please add a product name before sending.");
      return;
    }
    startTransition(async () => {
      // Save first
      const saveResult = await saveInquiry(lead.id, {
        product_name: productName,
        total_weight: totalWeight,
        cbm,
        quantity,
        image_url: imageData || null,
        description: otherDetails,
      });
      if ("error" in saveResult) {
        toast.error(saveResult.error);
        return;
      }
      // Then send to Accounting + Operations
      const result = await sendInquiryToAccounting(lead.id);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Inquiry sent to Accounting & Operations!");
        if (result.inquiry) setInquiry(result.inquiry);
        // Close the modal after a successful send so the workflow can continue.
        onOpenChange(false);
      }
    });
  }

  function handleDownloadQuotationPDF(q: InquiryQuotation) {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Quotation", 105, 20, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Quotation #: ${q.quotation_number}`, 20, 35);
    doc.text(`Date: ${new Date(q.created_at).toLocaleDateString()}`, 20, 42);
    doc.text(`Version: ${q.version}`, 150, 35);
    
    doc.setFontSize(12);
    doc.text("Customer Details", 20, 55);
    doc.setFontSize(10);
    doc.text(`Customer: ${q.customer_name}`, 20, 63);
    
    doc.setFontSize(12);
    doc.text("Quotation Details", 20, 78);
    doc.setFontSize(10);
    
    // Table header
    doc.setFillColor(240, 240, 240);
    doc.rect(20, 84, 170, 8, "F");
    doc.text("Product/Service", 22, 90);
    doc.text("Qty", 105, 90);
    doc.text("Unit Price", 125, 90);
    doc.text("Total", 160, 90);
    
    // Table row
    doc.text(q.product_service, 22, 100);
    doc.text(String(q.quantity), 105, 100);
    doc.text(`Rs. ${Number(q.unit_price).toFixed(2)}`, 125, 100);
    doc.text(`Rs. ${Number(q.total_amount).toFixed(2)}`, 160, 100);
    
    // Total
    doc.setFontSize(12);
    doc.text(`Total Amount: Rs. ${Number(q.total_amount).toFixed(2)}`, 20, 118);
    
    if (q.notes) {
      doc.setFontSize(10);
      doc.text("Notes:", 20, 132);
      doc.text(q.notes, 20, 140);
    }
    
    doc.save(`quotation_${q.quotation_number.replace(/\//g, '_')}.pdf`);
  }

  if (!lead) return null;

  const isFormValid = productName.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-orange-600" />
            Inquiry - {lead.name}
          </DialogTitle>
          <DialogDescription>
            Submit product inquiry details to the Accounting & Operations departments.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-secondary-muted text-sm">Loading inquiry data...</div>
        ) : (
          <div className="space-y-4">
            {/* Confirmation Status Banner */}
            {confirmationStatus === 'approved' && (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Inquiry Approved</p>
                  <p className="text-xs text-emerald-600">This inquiry has been approved by the Admin. You may proceed with further work.</p>
                </div>
              </div>
            )}

            {/* Status badges */}
            {inquiry?.sent_to_accounting && (
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                  Sent to Accounting
                </Badge>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                  Sent to Operations
                </Badge>
                {inquiry.sent_at && (
                  <span className="text-xs text-secondary-muted">
                    on {new Date(inquiry.sent_at).toLocaleString()}
                  </span>
                )}
              </div>
            )}

            {/* Product Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Product Name <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="e.g. Steel Pipes, Cotton Fabric..."
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
              />
            </div>

            {/* Total Weight & CBM Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Total Weight</label>
                <Input
                  placeholder="e.g. 500 kg"
                  value={totalWeight}
                  onChange={(e) => setTotalWeight(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">CBM (Cubic Meter)</label>
                <Input
                  placeholder="e.g. 12.5 m³"
                  value={cbm}
                  onChange={(e) => setCbm(e.target.value)}
                />
              </div>
            </div>

            {/* Quantity */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Quantity</label>
              <Input
                placeholder="e.g. 1000 pcs"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>

            {/* Image Upload - Drag & Drop + Paste */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1">
                <ImageIcon className="h-4 w-4" /> Image
              </label>
              {imageData ? (
                <div className="relative border rounded-lg p-3 bg-slate-50">
                  <img
                    src={imageData}
                    alt="Inquiry attachment"
                    className="max-h-56 rounded object-contain mx-auto"
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2 h-7 w-7 p-0"
                    onClick={removeImage}
                    type="button"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    isDragging
                      ? "border-orange-500 bg-orange-50"
                      : "border-slate-300 hover:border-orange-400 hover:bg-orange-50/50"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <ImageIcon className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                  <p className="text-sm text-slate-600 font-medium">
                    {isDragging ? "Drop image here..." : "Drag & drop an image here"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    or click to browse &bull; Paste with <kbd className="px-1 py-0.5 bg-slate-200 rounded text-[10px] font-mono">Ctrl+V</kbd>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">Max 5MB &bull; JPG, PNG, GIF, WebP</p>
                </div>
              )}
            </div>

            {/* Other Details */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Other Details</label>
              <Textarea
                placeholder="Any additional information, specifications, or notes..."
                value={otherDetails}
                onChange={(e) => setOtherDetails(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button onClick={handleSaveInquiry} disabled={isPending} variant="outline" className="flex-1">
                {isPending ? "Saving..." : "Save Draft"}
              </Button>
              <Button
                onClick={handleSendInquiry}
                disabled={isPending || !isFormValid}
                className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
              >
                <Send className="h-4 w-4 mr-2" />
                {isPending ? "Sending..." : "Send Inquiry"}
              </Button>
            </div>

            {/* Inquiry Version History */}
            {inquiryHistory.length > 1 && (
              <div className="border-t pt-4 space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-1">
                  <History className="h-4 w-4" />
                  Inquiry History ({inquiryHistory.length})
                </h3>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {inquiryHistory.map((h, idx) => (
                    <Card key={h.id} className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className={idx === 0 ? "bg-teal-50 text-teal-700 border-teal-300" : ""}>
                          {idx === 0 ? "Current" : `Previous #${idx}`}
                        </Badge>
                        <span className="text-[11px] text-slate-500">
                          {new Date(h.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-xs text-secondary-muted">
                        <div>Product: <span className="text-primary-dark">{h.product_name || "-"}</span></div>
                        <div>Qty: <span className="text-primary-dark">{h.quantity || "-"}</span></div>
                        <div>Weight: <span className="text-primary-dark">{h.total_weight || "-"}</span></div>
                        <div>CBM: <span className="text-primary-dark">{h.cbm || "-"}</span></div>
                        <div className="col-span-2">
                          Status:{" "}
                          <span className="text-primary-dark">
                            {h.sent_to_accounting ? "Sent" : "Draft"}
                          </span>
                        </div>
                        {h.description && (
                          <div className="col-span-2">
                            Note: <span className="text-primary-dark">{h.description}</span>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Quotations from Accounting */}
            {quotations.length > 0 && (
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm flex items-center gap-1">
                    <History className="h-4 w-4" />
                    Quotations from Accounting ({quotations.length})
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowQuotationHistory(!showQuotationHistory)}
                  >
                    {showQuotationHistory ? "Show Latest" : "Show All"}
                  </Button>
                </div>
                {(showQuotationHistory ? quotations : quotations.slice(0, 1)).map((q) => (
                  <Card key={q.id} className="p-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{q.quotation_number}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            v{q.version}
                          </Badge>
                          {q.sent_to_agent && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 text-xs">
                              From Accounting
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-xs text-secondary-muted">
                        <div>Product: <span className="text-primary-dark">{q.product_service}</span></div>
                        <div>Customer: <span className="text-primary-dark">{q.customer_name}</span></div>
                        <div>Qty: <span className="text-primary-dark">{q.quantity}</span></div>
                        <div>Unit Price: <span className="text-primary-dark">Rs. {Number(q.unit_price).toFixed(2)}</span></div>
                        <div className="col-span-2 font-semibold text-primary-dark">
                          Total: Rs. {Number(q.total_amount).toFixed(2)}
                        </div>
                      </div>
                      {q.notes && (
                        <p className="text-xs text-secondary-muted bg-slate-50 p-2 rounded">{q.notes}</p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-secondary-muted">
                        <span>{new Date(q.created_at).toLocaleString()}</span>
                        <span>by {q.created_by}</span>
                      </div>
                      {q.sent_to_agent && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs h-7"
                          onClick={() => handleDownloadQuotationPDF(q)}
                        >
                          <FileText className="h-3 w-3 mr-1" />
                          Download PDF
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PipelinePanel() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [inquiryLead, setInquiryLead] = useState<Lead | null>(null);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [leadToConvert, setLeadToConvert] = useState<Lead | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [inquiryTrackingMap, setInquiryTrackingMap] = useState<Map<string, InquiryTrackingInfo>>(new Map());

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    fetchLeads();
    fetchInquiryTracking();
  }, []);

  async function fetchLeads() {
    setIsLoading(true);
    try {
      const result = await getAllLeadsForSalesAgent();
      if ("error" in result) {
        toast.error(result.error || "Unable to load leads");
        setLeads([]);
      } else {
        setLeads(result.leads || []);
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchInquiryTracking() {
    try {
      const result = await getInquiryTrackingForSalesAgent();
      if ("error" in result) return;
      const map = new Map<string, InquiryTrackingInfo>();
      (result.tracking || []).forEach((t) => map.set(t.lead_id, t));
      setInquiryTrackingMap(map);
    } catch {
      // Silent fail - tracking is supplementary
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const leadId = active.id as string;
    const droppedOnId = String(over.id);

    // Check if dropped on a lead card (UUID) or on a column (status)
    // If dropped on a lead card, find which column it belongs to
    let newStatus: LeadStatus | null = null;
    
    if (STATUSES.includes(droppedOnId as LeadStatus) || STATUSES_ROW_2.includes(droppedOnId as LeadStatus)) {
      // Dropped directly on a column
      newStatus = droppedOnId as LeadStatus;
    } else {
      // Dropped on a lead card - find which column it's in
      const targetLead = leads.find((l) => l.id === droppedOnId);
      if (targetLead) {
        newStatus = targetLead.status;
      } else {
        toast.error(`Invalid drop target: ${droppedOnId}`);
        return;
      }
    }

    if (!newStatus) {
      toast.error("Could not determine target status");
      return;
    }

    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.status === newStatus) return;

    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: newStatus! } : l))
    );

    // Update in database
    startTransition(async () => {
      const result = await updateLeadStatus(leadId, newStatus!);
      if ("error" in result) {
        toast.error(result.error);
        // Revert on error
        fetchLeads();
      } else {
        toast.success("Lead moved successfully");
      }
    });
  }

  function handleOpenComments(lead: Lead) {
    setSelectedLead(lead);
    setCommentsOpen(true);
  }

  function handleOpenInquiry(lead: Lead) {
    setInquiryLead(lead);
    setInquiryOpen(true);
  }

  function handleMoveToStatus(lead: Lead, newStatus: LeadStatus) {
    if (lead.status === newStatus) return;

    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => (l.id === lead.id ? { ...l, status: newStatus } : l))
    );

    // Update in database
    startTransition(async () => {
      const result = await updateLeadStatus(lead.id, newStatus);
      if ("error" in result) {
        toast.error(result.error);
        // Revert on error
        fetchLeads();
      } else {
        toast.success(`Lead moved to ${newStatus}`);
      }
    });
  }

  function handleConvertLead(lead: Lead) {
    setLeadToConvert(lead);
    setConvertDialogOpen(true);
  }

  function handleConfirmConvert() {
    if (!leadToConvert) return;

    startTransition(async () => {
      const result = await convertLeadToCustomer(leadToConvert.id);
      if ("error" in result) {
        toast.error(result.error);
      } else if (result.success && result.customer) {
        toast.success(`Customer created successfully! Customer ID: ${result.customer.customer_id_formatted}`);
        setConvertDialogOpen(false);
        setLeadToConvert(null);
        fetchLeads();
      } else {
        toast.success("Customer created successfully!");
        setConvertDialogOpen(false);
        setLeadToConvert(null);
        fetchLeads();
      }
    });
  }

  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null;

  return (
    <div className="space-y-4 md:space-y-6">
      <Card className="bg-white border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg md:text-xl">Pipeline</CardTitle>
              <CardDescription className="text-xs md:text-sm">
                Manage your leads across different stages. Drag and drop leads between boards.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-auto sm:min-w-[250px]">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-secondary-muted pointer-events-none" />
              <Input
                type="text"
                placeholder="Search leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-8 h-9 text-sm"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0 hover:bg-transparent"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="h-3.5 w-3.5 text-secondary-muted" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          {isLoading ? (
            <div className="py-16 text-center text-secondary-muted text-sm">
              Loading pipeline...
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="space-y-4">
                {/* First Row: Original Statuses */}
                <div className="flex gap-2 sm:gap-3 md:gap-4 overflow-x-auto pb-4 scrollbar-thin">
                  {STATUSES.map((status) => (
                    <KanbanColumn
                      key={status}
                      status={status}
                      leads={leads}
                      onOpenComments={handleOpenComments}
                      onConvert={handleConvertLead}
                      onOpenInquiry={handleOpenInquiry}
                      onMoveToStatus={handleMoveToStatus}
                      searchQuery={searchQuery}
                      inquiryTrackingMap={inquiryTrackingMap}
                    />
                  ))}
                </div>
                {/* Second Row: Follow up and Lose */}
                <div className="flex gap-2 sm:gap-3 md:gap-4 overflow-x-auto pb-4 scrollbar-thin">
                  {STATUSES_ROW_2.map((status) => (
                    <KanbanColumn
                      key={status}
                      status={status}
                      leads={leads}
                      onOpenComments={handleOpenComments}
                      onConvert={handleConvertLead}
                      onOpenInquiry={handleOpenInquiry}
                      onMoveToStatus={handleMoveToStatus}
                      searchQuery={searchQuery}
                      inquiryTrackingMap={inquiryTrackingMap}
                    />
                  ))}
                </div>
              </div>
              <DragOverlay>
                {activeLead ? (
                  <Card className="w-[200px] sm:w-[240px] md:w-[280px] opacity-90 rotate-3">
                    <CardContent className="p-2.5">
                      <div className="space-y-1.5">
                        <div>
                          <h4 className="font-semibold text-xs text-primary-dark leading-tight truncate">
                            {activeLead.name}
                          </h4>
                          <p className="text-[10px] text-secondary-muted truncate">{activeLead.number}</p>
                        </div>
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px]">
                          {activeLead.source}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </CardContent>
      </Card>

      <CommentsDialog
        lead={selectedLead}
        open={commentsOpen}
        onOpenChange={setCommentsOpen}
      />

      <InquiryDialog
        lead={inquiryLead}
        open={inquiryOpen}
        onOpenChange={(open) => {
          setInquiryOpen(open);
          if (!open) {
            setInquiryLead(null);
            // Refresh tracking data when inquiry dialog closes
            fetchInquiryTracking();
          }
        }}
      />

      {/* Convert to Customer Dialog */}
      <Dialog 
        open={convertDialogOpen} 
        onOpenChange={(open) => {
          setConvertDialogOpen(open);
          if (!open) {
            setLeadToConvert(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Convert Lead to Customer</DialogTitle>
            <DialogDescription>
              Are you sure you want to convert &quot;{leadToConvert?.name}&quot; to a customer? 
              This will create a new customer record and mark the lead as converted.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            {leadToConvert && (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-secondary-muted">Lead Name:</span>
                  <span className="text-sm text-primary-dark">{leadToConvert.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-secondary-muted">Phone Number:</span>
                  <span className="text-sm text-primary-dark">{leadToConvert.number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-secondary-muted">Source:</span>
                  <span className="text-sm text-primary-dark">{leadToConvert.source}</span>
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setConvertDialogOpen(false);
                setLeadToConvert(null);
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmConvert}
              disabled={isPending}
              className="create-console-btn"
            >
              {isPending ? "Converting..." : "Convert to Customer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
