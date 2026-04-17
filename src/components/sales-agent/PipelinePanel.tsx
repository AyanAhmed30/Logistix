"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  getTransferableSalesAgents,
  transferLeadToSalesAgent,
  type Lead,
  type LeadStatus,
  type LeadComment,
  type TransferableSalesAgent,
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
import { MessageSquare, Edit2, Trash2, Plus, UserPlus, Search, X, FileText, MoreVertical, CheckCircle2, Clock, AlertCircle, GripVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getInquiryTrackingForSalesAgent,
  type InquiryTrackingInfo,
} from "@/app/actions/inquiries";

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
  onOpenLeadDetail,
  onMoveToStatus,
  onOpenTransferDialog,
  showConvertButton,
  showInquiryButton,
  inquiryTracking,
}: {
  lead: Lead;
  onOpenComments: (lead: Lead) => void;
  onConvert?: (lead: Lead) => void;
  onOpenLeadDetail?: (lead: Lead, tab?: "create" | "view" | "status") => void;
  onMoveToStatus?: (lead: Lead, status: LeadStatus) => void;
  onOpenTransferDialog?: (lead: Lead) => void;
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
  const statusBadge = inquiryTracking?.status === "approved"
    ? "Sent"
    : inquiryTracking?.status === "sent"
      ? "Sent"
      : inquiryTracking?.status === "draft"
        ? "Draft"
        : "Pending";

  function renderLeadBody() {
    return (
      <CardContent className="p-2.5">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0 flex-1">
                {lead.lead_id_formatted && (
                  <span className="font-mono text-[10px] text-primary-accent font-semibold">#{lead.lead_id_formatted}</span>
                )}
                <h4 className="font-semibold text-xs text-primary-dark leading-tight truncate">{lead.name || "Unnamed Lead"}</h4>
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
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenTransferDialog?.(lead);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="text-xs cursor-pointer text-orange-700"
                  >
                    Send Lead to Other Sales Agent
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] truncate">
                  {lead.source}
                </span>
                <Badge
                  variant="outline"
                  className={lead.created_by_sales_agent_id === lead.sales_agent_id
                    ? "h-5 text-[10px] px-1.5 bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "h-5 text-[10px] px-1.5 bg-violet-50 text-violet-700 border-violet-200"}
                >
                  {lead.created_by_sales_agent_id === lead.sales_agent_id ? "Own Lead" : "Received Lead"}
                </Badge>
                {showInquiryButton && (
                  <Badge
                    variant="outline"
                    className={`h-5 text-[10px] px-1.5 ${
                      statusBadge === "Sent"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : statusBadge === "Draft"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    {statusBadge}
                  </Badge>
                )}
              </div>
              <div className="flex gap-0.5 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenComments(lead);
                  }}
                  title="Comments"
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
            {/* Inquiry Tracking Badge for non inquiry board */}
            {!showInquiryButton && inquiryTracking && (
              <div className="mt-1.5 space-y-1">
                <div className={`px-1.5 py-0.5 rounded text-[10px] text-center flex items-center justify-center gap-1 ${
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
                <div className="px-1.5 py-0.5 rounded text-[10px] text-center bg-slate-100 text-slate-700">
                  Total Inquiries: {inquiryTracking.total_inquiry_count || 0}
                </div>
                <div className="px-1.5 py-0.5 rounded text-[10px] text-center bg-slate-100 text-slate-700">
                  Draft Inquiries: {inquiryTracking.draft_inquiry_count || 0}
                </div>
                <div className="px-1.5 py-0.5 rounded text-[10px] text-center bg-slate-100 text-slate-700">
                  Sent Inquiries: {inquiryTracking.sent_inquiry_count || 0}
                </div>
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
    );
  }

  if (showInquiryButton) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="mb-2">
        <div className="flex gap-0 items-stretch min-w-0">
          <button
            type="button"
            {...listeners}
            className="rounded-l-md border border-r-0 border-slate-200 bg-slate-50 px-1 cursor-grab active:cursor-grabbing touch-none shrink-0 flex items-center justify-center self-stretch hover:bg-slate-100 min-w-[28px]"
            aria-label="Drag to move lead"
          >
            <GripVertical className="h-4 w-4 text-slate-400" />
          </button>
          <Card
            className="flex-1 min-w-0 rounded-l-none rounded-r-xl border-slate-200 cursor-pointer hover:shadow-md transition-shadow shadow-sm mb-0"
            onClick={() => onOpenLeadDetail?.(lead)}
          >
            {renderLeadBody()}
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="mb-2">
      <div className="flex gap-0 items-stretch min-w-0">
        <button
          type="button"
          {...listeners}
          className="rounded-l-md border border-r-0 border-slate-200 bg-slate-50 px-1 cursor-grab active:cursor-grabbing touch-none shrink-0 flex items-center justify-center self-stretch hover:bg-slate-100 min-w-[28px]"
          aria-label="Drag to move lead"
        >
          <GripVertical className="h-4 w-4 text-slate-400" />
        </button>
        <Card
          className="flex-1 min-w-0 rounded-l-none rounded-r-xl border-slate-200 cursor-pointer hover:shadow-md transition-shadow shadow-sm mb-0"
          onClick={() => onOpenLeadDetail?.(lead)}
        >
          {renderLeadBody()}
        </Card>
      </div>
    </div>
  );
}

function KanbanColumn({
  status,
  leads,
  onOpenComments,
  onConvert,
  onOpenLeadDetail,
  onMoveToStatus,
  onOpenTransferDialog,
  searchQuery,
  inquiryTrackingMap,
}: {
  status: LeadStatus;
  leads: Lead[];
  onOpenComments: (lead: Lead) => void;
  onConvert?: (lead: Lead) => void;
  onOpenLeadDetail?: (lead: Lead, tab?: "create" | "view" | "status") => void;
  onMoveToStatus?: (lead: Lead, status: LeadStatus) => void;
  onOpenTransferDialog?: (lead: Lead) => void;
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
                <div key={lead.id} id={`pipeline-lead-${lead.id}`}>
                  <LeadCard
                    lead={lead}
                    onOpenComments={onOpenComments}
                    onConvert={onConvert}
                    onOpenLeadDetail={onOpenLeadDetail}
                    onMoveToStatus={onMoveToStatus}
                    onOpenTransferDialog={onOpenTransferDialog}
                    showConvertButton={showConvertButton}
                    showInquiryButton={showInquiryButton}
                    inquiryTracking={inquiryTrackingMap?.get(lead.id) || null}
                  />
                </div>
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

export function PipelinePanel() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [leadToConvert, setLeadToConvert] = useState<Lead | null>(null);
  const [leadToTransfer, setLeadToTransfer] = useState<Lead | null>(null);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [selectedTransferAgentId, setSelectedTransferAgentId] = useState<string>("");
  const [transferableAgents, setTransferableAgents] = useState<TransferableSalesAgent[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();
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
    fetchTransferableSalesAgents();
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

  async function fetchTransferableSalesAgents() {
    try {
      const agentsResult = await getTransferableSalesAgents();
      if (!("error" in agentsResult)) {
        setTransferableAgents(agentsResult.salesAgents || []);
      }
    } catch {
      // Keep pipeline usable even if transfer agents fail.
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

  function navigateToLeadDetail(lead: Lead, tab?: "create" | "view" | "status") {
    const q = tab ? `?tab=${tab}` : "";
    router.push(`/sales-agent/leads/${lead.id}${q}`);
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

  function handleOpenTransferDialog(lead: Lead) {
    setLeadToTransfer(lead);
    setSelectedTransferAgentId("");
    setTransferDialogOpen(true);
  }

  function handleTransferLead() {
    if (!leadToTransfer || !selectedTransferAgentId) {
      toast.error("Please select one sales agent");
      return;
    }

    startTransition(async () => {
      const result = await transferLeadToSalesAgent(leadToTransfer.id, selectedTransferAgentId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("Lead sent successfully");
      setTransferDialogOpen(false);
      setLeadToTransfer(null);
      setSelectedTransferAgentId("");
      await fetchLeads();
    });
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
                      onOpenLeadDetail={navigateToLeadDetail}
                      onMoveToStatus={handleMoveToStatus}
                      onOpenTransferDialog={handleOpenTransferDialog}
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
                      onOpenLeadDetail={navigateToLeadDetail}
                      onMoveToStatus={handleMoveToStatus}
                      onOpenTransferDialog={handleOpenTransferDialog}
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

      <Dialog
        open={transferDialogOpen}
        onOpenChange={(open) => {
          setTransferDialogOpen(open);
          if (!open) {
            setLeadToTransfer(null);
            setSelectedTransferAgentId("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Send Lead to Other Sales Agent</DialogTitle>
            <DialogDescription>
              Select exactly one sales agent to transfer this lead. The selected agent will receive it in their pipeline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border p-3 bg-slate-50">
              <div className="text-sm font-medium text-primary-dark">
                #{leadToTransfer?.lead_id_formatted || "N/A"} - {leadToTransfer?.name || "Lead"}
              </div>
              <div className="text-xs text-secondary-muted">{leadToTransfer?.number || "-"}</div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Select Sales Agent</label>
              <Select
                value={selectedTransferAgentId}
                onValueChange={setSelectedTransferAgentId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose one sales agent" />
                </SelectTrigger>
                <SelectContent>
                  {transferableAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name} {agent.username ? `(${agent.username})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setTransferDialogOpen(false);
                setLeadToTransfer(null);
                setSelectedTransferAgentId("");
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleTransferLead}
              disabled={isPending || !selectedTransferAgentId}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {isPending ? "Sending..." : "Send Lead"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
