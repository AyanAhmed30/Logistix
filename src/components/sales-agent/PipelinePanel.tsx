"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
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
import { MessageSquare, Edit2, Trash2, Plus, UserPlus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

const STATUSES: LeadStatus[] = [
  "Leads",
  "Inquiry Received",
  "Quotation Sent",
  "Negotiation",
  "Win",
];


function LeadCard({
  lead,
  onOpenComments,
  onConvert,
  showConvertButton,
}: {
  lead: Lead;
  onOpenComments: (lead: Lead) => void;
  onConvert?: (lead: Lead) => void;
  showConvertButton?: boolean;
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

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card className="mb-2 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow">
        <CardContent className="p-2.5">
          <div className="space-y-1.5">
            <div>
              <h4 className="font-semibold text-xs text-primary-dark leading-tight truncate">{lead.name}</h4>
              <p className="text-[10px] text-secondary-muted truncate">{lead.number}</p>
            </div>
            <div className="flex items-center justify-between gap-1">
              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] truncate flex-1 min-w-0">
                {lead.source}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenComments(lead);
                }}
              >
                <MessageSquare className="h-3 w-3" />
              </Button>
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
  searchQuery,
}: {
  status: LeadStatus;
  leads: Lead[];
  onOpenComments: (lead: Lead) => void;
  onConvert?: (lead: Lead) => void;
  searchQuery?: string;
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
                  showConvertButton={showConvertButton}
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

export function PipelinePanel() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [leadToConvert, setLeadToConvert] = useState<Lead | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    fetchLeads();
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
    
    if (STATUSES.includes(droppedOnId as LeadStatus)) {
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
              <div className="flex gap-2 sm:gap-3 md:gap-4 overflow-x-auto pb-4 scrollbar-thin">
                {STATUSES.map((status) => (
                  <KanbanColumn
                    key={status}
                    status={status}
                    leads={leads}
                    onOpenComments={handleOpenComments}
                    onConvert={handleConvertLead}
                    searchQuery={searchQuery}
                  />
                ))}
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
