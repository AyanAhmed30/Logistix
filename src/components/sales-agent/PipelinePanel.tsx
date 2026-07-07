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
import { prefetchLeadInquiries } from "@/lib/sales-agent-lead-inquiries-cache";

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
  const router = useRouter();
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

  function renderLeadBody() {
    // For Inquiry Received board, show detailed inquiry stats
    if (showInquiryButton) {
      return (
        <CardContent className="p-5">
          <div className="space-y-4">
            {/* Header Section */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {lead.lead_id_formatted && (
                  <div className="font-mono text-sm text-blue-600 font-bold mb-2 px-2 py-1 bg-blue-50 rounded-md inline-block">
                    #{lead.lead_id_formatted}
                  </div>
                )}
                <h3 className="font-bold text-base text-gray-900 leading-tight mb-2">
                  {lead.name || "Unnamed Lead"}
                </h3>
                <p className="text-sm text-gray-600 font-medium">{lead.number}</p>
              </div>
              {/* Actions Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 hover:bg-gray-100"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-4 w-4 text-gray-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {dropdownOptions.map((status) => (
                    <DropdownMenuItem
                      key={status}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveToStatus?.(lead, status);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="text-sm cursor-pointer"
                    >
                      Move to {status}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenTransferDialog?.(lead);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="text-sm cursor-pointer text-orange-600"
                  >
                    Transfer Lead
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Lead Status Badges */}
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-blue-100 text-blue-800 border-0 hover:bg-blue-200 text-sm font-semibold px-3 py-1.5 rounded-full">
                {lead.source}
              </Badge>
              <Badge
                className={
                  lead.created_by_sales_agent_id === lead.sales_agent_id
                    ? "bg-emerald-100 text-emerald-800 border-0 hover:bg-emerald-200 text-sm font-semibold px-3 py-1.5 rounded-full"
                    : "bg-purple-100 text-purple-800 border-0 hover:bg-purple-200 text-sm font-semibold px-3 py-1.5 rounded-full"
                }
              >
                {lead.created_by_sales_agent_id === lead.sales_agent_id ? "Own Lead" : "Received Lead"}
              </Badge>
            </div>

            {/* Inquiry Stats Section */}
            {inquiryTracking ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-700">Inquiry Status</span>
                  <div className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
                    inquiryTracking.status === 'approved'
                      ? 'bg-green-100 text-green-700'
                      : inquiryTracking.status === 'sent'
                      ? 'bg-blue-100 text-blue-700'
                      : inquiryTracking.status === 'draft'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {inquiryTracking.status === 'approved' && (
                      <><CheckCircle2 className="h-3 w-3" /> Approved</>
                    )}
                    {inquiryTracking.status === 'sent' && (
                      <><Clock className="h-3 w-3" /> Sent</>
                    )}
                    {inquiryTracking.status === 'draft' && (
                      <><AlertCircle className="h-3 w-3" /> Draft</>
                    )}
                    {!inquiryTracking.status || inquiryTracking.status === 'none' && (
                      <><FileText className="h-3 w-3" /> Pending</>
                    )}
                  </div>
                </div>
                
                {/* Inquiry Metrics Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3 text-center border border-gray-200">
                    <div className="text-2xl font-bold text-gray-900 mb-1">
                      {inquiryTracking.total_inquiry_count || 0}
                    </div>
                    <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Total Inquiries</div>
                  </div>
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-3 text-center border border-blue-200">
                    <div className="text-2xl font-bold text-blue-800 mb-1">
                      {inquiryTracking.sent_inquiry_count || 0}
                    </div>
                    <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Sent</div>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-3 text-center border border-green-200">
                    <div className="text-2xl font-bold text-green-800 mb-1">
                      {inquiryTracking.approved_inquiry_count || 0}
                    </div>
                    <div className="text-xs font-semibold text-green-700 uppercase tracking-wide">Approved</div>
                  </div>
                  <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-3 text-center border border-amber-200">
                    <div className="text-2xl font-bold text-amber-800 mb-1">
                      {inquiryTracking.pending_inquiry_count || 0}
                    </div>
                    <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Pending</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gradient-to-br from-blue-25 to-blue-50 border-2 border-dashed border-blue-200 rounded-xl p-6 text-center">
                <div className="w-12 h-12 mx-auto mb-3 bg-blue-200 rounded-full flex items-center justify-center">
                  <div className="w-6 h-6 bg-blue-500 rounded-full"></div>
                </div>
                <div className="text-sm font-bold text-blue-800 mb-2">Ready for Inquiry</div>
                <div className="text-xs text-blue-600">Click this lead to start the inquiry process</div>
              </div>
            )}

            {/* Action Buttons - Only available in Inquiry Received board */}
            <div className="flex gap-3 pt-3 border-t border-gray-100">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-10 text-sm font-semibold bg-white border-2 border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenComments(lead);
                }}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Add Comment
              </Button>
            </div>

            {/* Convert Button for Win status */}
            {showConvertButton && !lead.converted && onConvert && (
              <Button
                variant="default"
                size="sm"
                className="w-full h-8 text-xs font-medium bg-green-600 hover:bg-green-700"
                onClick={(e) => {
                  e.stopPropagation();
                  onConvert(lead);
                }}
              >
                <UserPlus className="h-3 w-3 mr-1.5" />
                Create Customer
              </Button>
            )}
            {lead.converted && (
              <div className="bg-green-100 border border-green-200 text-green-800 rounded-lg p-2 text-xs text-center font-medium">
                ✅ Converted to Customer
              </div>
            )}
          </div>
        </CardContent>
      );
    }

    // For other boards, show compact but premium design
    return (
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header Section */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {lead.lead_id_formatted && (
                <div className="font-mono text-sm text-indigo-600 font-bold mb-2 px-2 py-1 bg-indigo-50 rounded-md inline-block">
                  #{lead.lead_id_formatted}
                </div>
              )}
              <h3 className="font-bold text-sm text-gray-900 leading-tight mb-2">
                {lead.name || "Unnamed Lead"}
              </h3>
              <p className="text-sm text-gray-600 font-medium">{lead.number}</p>
            </div>
            {/* Actions Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-gray-100"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-3.5 w-3.5 text-gray-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
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
                    Move to {status}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenTransferDialog?.(lead);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="text-xs cursor-pointer text-orange-600"
                >
                  Transfer Lead
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Status Badges */}
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-blue-100 text-blue-800 border-0 text-xs font-semibold px-2.5 py-1 rounded-full">
              {lead.source}
            </Badge>
            <Badge
              className={
                lead.created_by_sales_agent_id === lead.sales_agent_id
                  ? "bg-emerald-100 text-emerald-800 border-0 text-xs font-semibold px-2.5 py-1 rounded-full"
                  : "bg-purple-100 text-purple-800 border-0 text-xs font-semibold px-2.5 py-1 rounded-full"
              }
            >
              {lead.created_by_sales_agent_id === lead.sales_agent_id ? "Own" : "Received"}
            </Badge>
          </div>

          {/* Inquiry Status for other boards */}
          {inquiryTracking && (
            <div className="space-y-1.5">
              <div className={`px-2 py-1 rounded text-xs text-center font-medium flex items-center justify-center gap-1 ${
                inquiryTracking.status === 'approved'
                  ? 'bg-green-100 text-green-700 border border-green-200'
                  : inquiryTracking.status === 'sent'
                  ? 'bg-blue-100 text-blue-700 border border-blue-200'
                  : inquiryTracking.status === 'draft'
                  ? 'bg-amber-100 text-amber-700 border border-amber-200'
                  : 'bg-gray-100 text-gray-700 border border-gray-200'
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
                {(!inquiryTracking.status || inquiryTracking.status === 'none') && (
                  <><FileText className="h-3 w-3" /> No Inquiry</>
                )}
              </div>
              
              {inquiryTracking.total_inquiry_count > 0 && (
                <div className="flex gap-1 text-xs">
                  <span className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-medium">
                    {inquiryTracking.total_inquiry_count} Total
                  </span>
                  <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                    {inquiryTracking.approved_inquiry_count} Approved
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Visual indicator for drag-only cards */}
          <div className="pt-3 border-t border-gray-100">
            <div className="flex items-center justify-center gap-2 text-xs text-gray-500 bg-gray-50 py-2 rounded-lg">
              <GripVertical className="h-3 w-3" />
              <span className="font-medium">Drag to move pipeline stage</span>
            </div>
          </div>

          {/* Convert Button for Win status */}
          {showConvertButton && !lead.converted && onConvert && (
            <Button
              variant="default"
              size="sm"
              className="w-full h-7 text-xs font-medium bg-green-600 hover:bg-green-700"
              onClick={(e) => {
                e.stopPropagation();
                onConvert(lead);
              }}
            >
              <UserPlus className="h-3 w-3 mr-1" />
              Create Customer
            </Button>
          )}
          {lead.converted && (
            <div className="bg-green-100 border border-green-200 text-green-800 rounded p-1.5 text-xs text-center font-medium">
              ✅ Converted
            </div>
          )}
        </div>
      </CardContent>
    );
  }

  if (showInquiryButton) {
    // Inquiry Received board - leads are clickable for inquiry workflow
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="mb-4">
        <div className="flex gap-0 items-stretch min-w-0 group">
          <button
            type="button"
            {...listeners}
            className="rounded-l-xl border border-r-0 border-blue-200 bg-gradient-to-b from-blue-50 to-blue-100 px-2 cursor-grab active:cursor-grabbing touch-none shrink-0 flex items-center justify-center self-stretch hover:from-blue-100 hover:to-blue-200 min-w-[36px] transition-all duration-200"
            aria-label="Drag to move lead"
          >
            <GripVertical className="h-4 w-4 text-blue-500 group-hover:text-blue-600" />
          </button>
          <Card
            className="flex-1 min-w-0 rounded-l-none rounded-r-xl border-blue-200 cursor-pointer hover:shadow-2xl hover:border-blue-300 hover:bg-blue-25 transition-all duration-300 shadow-lg mb-0 bg-white"
            onMouseEnter={() => {
              void prefetchLeadInquiries(lead.id);
              const params = new URLSearchParams();
              params.set("allowInquiry", "true");
              params.set("boardStatus", lead.status);
              router.prefetch(`/sales-agent/leads/${lead.id}?${params.toString()}`);
            }}
            onClick={() => onOpenLeadDetail?.(lead)}
          >
            {renderLeadBody()}
          </Card>
        </div>
      </div>
    );
  }

  // All other boards - leads are NOT clickable, only draggable
  return (
    <div ref={setNodeRef} style={style} {...attributes} className="mb-4">
      <div className="flex gap-0 items-stretch min-w-0 group">
        <button
          type="button"
          {...listeners}
          className="rounded-l-xl border border-r-0 border-gray-200 bg-gradient-to-b from-gray-50 to-gray-100 px-2 cursor-grab active:cursor-grabbing touch-none shrink-0 flex items-center justify-center self-stretch hover:from-gray-100 hover:to-gray-200 min-w-[36px] transition-all duration-200"
          aria-label="Drag to move lead"
        >
          <GripVertical className="h-4 w-4 text-gray-500 group-hover:text-gray-600" />
        </button>
        <Card
          className="flex-1 min-w-0 rounded-l-none rounded-r-xl border-gray-200 cursor-default hover:shadow-lg hover:border-gray-300 transition-all duration-300 shadow-md mb-0 bg-white"
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
    <div ref={setNodeRef} className="flex-1 min-w-[280px] sm:min-w-[320px] md:min-w-[350px] lg:min-w-[380px]">
      <Card className="h-full flex flex-col bg-white shadow-lg border-0 rounded-xl overflow-hidden">
        <CardHeader className={`pb-4 px-6 pt-5 space-y-4 ${
          status === "Leads" ? "bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200" :
          status === "Inquiry Received" ? "bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200" :
          status === "Quotation Sent" ? "bg-gradient-to-r from-purple-50 to-purple-100 border-b border-purple-200" :
          status === "Negotiation" ? "bg-gradient-to-r from-amber-50 to-amber-100 border-b border-amber-200" :
          status === "Win" ? "bg-gradient-to-r from-green-50 to-green-100 border-b border-green-200" :
          status === "Follow up" ? "bg-gradient-to-r from-orange-50 to-orange-100 border-b border-orange-200" :
          status === "Lose" ? "bg-gradient-to-r from-red-50 to-red-100 border-b border-red-200" :
          "bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                status === "Leads" ? "bg-gray-500" :
                status === "Inquiry Received" ? "bg-blue-600" :
                status === "Quotation Sent" ? "bg-purple-600" :
                status === "Negotiation" ? "bg-amber-600" :
                status === "Win" ? "bg-green-600" :
                status === "Follow up" ? "bg-orange-600" :
                status === "Lose" ? "bg-red-600" :
                "bg-gray-500"
              }`}>
                <div className="w-2 h-2 bg-white rounded-full"></div>
              </div>
              <div>
                <CardTitle className={`text-base md:text-lg font-bold leading-tight ${
                  status === "Leads" ? "text-gray-900" :
                  status === "Inquiry Received" ? "text-blue-900" :
                  status === "Quotation Sent" ? "text-purple-900" :
                  status === "Negotiation" ? "text-amber-900" :
                  status === "Win" ? "text-green-900" :
                  status === "Follow up" ? "text-orange-900" :
                  status === "Lose" ? "text-red-900" :
                  "text-gray-900"
                }`}>
                  {status}
                </CardTitle>
                <CardDescription className={`text-sm font-medium mt-1 ${
                  status === "Leads" ? "text-gray-600" :
                  status === "Inquiry Received" ? "text-blue-600" :
                  status === "Quotation Sent" ? "text-purple-600" :
                  status === "Negotiation" ? "text-amber-600" :
                  status === "Win" ? "text-green-600" :
                  status === "Follow up" ? "text-orange-600" :
                  status === "Lose" ? "text-red-600" :
                  "text-gray-600"
                }`}>
                  {filteredLeads.length} {filteredLeads.length === 1 ? "Lead" : "Leads"}
                </CardDescription>
              </div>
            </div>
            <div className={`px-3 py-1.5 rounded-full text-xs font-bold ${
              status === "Leads" ? "bg-gray-200 text-gray-800" :
              status === "Inquiry Received" ? "bg-blue-200 text-blue-800" :
              status === "Quotation Sent" ? "bg-purple-200 text-purple-800" :
              status === "Negotiation" ? "bg-amber-200 text-amber-800" :
              status === "Win" ? "bg-green-200 text-green-800" :
              status === "Follow up" ? "bg-orange-200 text-orange-800" :
              status === "Lose" ? "bg-red-200 text-red-800" :
              "bg-gray-200 text-gray-800"
            }`}>
              {filteredLeads.length}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
            <Input
              type="text"
              placeholder={`Search in ${status}...`}
              value={columnSearchQuery}
              onChange={(e) => setColumnSearchQuery(e.target.value)}
              className="pl-10 pr-10 h-10 text-sm bg-white border-2 border-gray-200 rounded-lg focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all duration-200"
            />
            {columnSearchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-gray-100 rounded-full"
                onClick={() => setColumnSearchQuery("")}
              >
                <X className="h-3.5 w-3.5 text-gray-500" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto max-h-[calc(100vh-320px)] sm:max-h-[calc(100vh-340px)] px-4 pb-4">
          <SortableContext items={filteredLeads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
            {filteredLeads.length === 0 ? (
              <div className={`text-center py-12 rounded-xl border-2 border-dashed ${
                status === "Leads" ? "bg-gray-25 border-gray-200 text-gray-500" :
                status === "Inquiry Received" ? "bg-blue-25 border-blue-200 text-blue-500" :
                status === "Quotation Sent" ? "bg-purple-25 border-purple-200 text-purple-500" :
                status === "Negotiation" ? "bg-amber-25 border-amber-200 text-amber-500" :
                status === "Win" ? "bg-green-25 border-green-200 text-green-500" :
                status === "Follow up" ? "bg-orange-25 border-orange-200 text-orange-500" :
                status === "Lose" ? "bg-red-25 border-red-200 text-red-500" :
                "bg-gray-25 border-gray-200 text-gray-500"
              }`}>
                <div className="space-y-3">
                  <div className={`text-4xl opacity-50 ${
                    status === "Leads" ? "text-gray-400" :
                    status === "Inquiry Received" ? "text-blue-400" :
                    status === "Quotation Sent" ? "text-purple-400" :
                    status === "Negotiation" ? "text-amber-400" :
                    status === "Win" ? "text-green-400" :
                    status === "Follow up" ? "text-orange-400" :
                    status === "Lose" ? "text-red-400" : "text-gray-400"
                  }`}>
                    ●
                  </div>
                  <div className="space-y-1">
                    <div className="font-semibold text-sm">
                      {columnSearchQuery || searchQuery ? "No matching leads found" : `No leads in ${status}`}
                    </div>
                    {!columnSearchQuery && !searchQuery && (
                      <div className="text-xs opacity-75">
                        {status === "Leads" ? "New leads will appear here first" :
                         status === "Inquiry Received" ? "Leads ready for inquiry will show here" :
                         status === "Quotation Sent" ? "Leads with sent quotations appear here" :
                         status === "Negotiation" ? "Leads in active negotiations show here" :
                         status === "Win" ? "Successfully won leads appear here" :
                         status === "Follow up" ? "Leads requiring follow-up show here" :
                         status === "Lose" ? "Lost leads are moved here" :
                         "Leads will appear here as they progress"}
                      </div>
                    )}
                  </div>
                </div>
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
    void prefetchLeadInquiries(lead.id);
    const allowInquiry = lead.status === "Inquiry Received";

    const params = new URLSearchParams();
    if (tab) params.set("tab", tab);
    params.set("allowInquiry", allowInquiry.toString());
    params.set("boardStatus", lead.status);

    const queryString = params.toString();
    const href = `/sales-agent/leads/${lead.id}${queryString ? `?${queryString}` : ""}`;
    router.prefetch(href);
    router.push(href);
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
    <div className="space-y-6 md:space-y-8">
      <Card className="bg-white border-0 shadow-2xl rounded-2xl overflow-hidden">
        <CardHeader className="pb-6 bg-gradient-to-r from-indigo-50 via-white to-purple-50 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg md:text-xl font-semibold text-gray-900 mb-2">
                Sales Pipeline
              </CardTitle>
              <CardDescription className="text-sm md:text-base text-gray-600 font-medium">
                Track and manage your leads through every stage of the sales journey. Drag cards between boards to update progress.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-auto sm:min-w-[320px]">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
              <Input
                type="text"
                placeholder="Search across all pipeline stages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 pr-12 h-12 text-sm bg-white border-2 border-gray-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 font-medium transition-all duration-200"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 hover:bg-gray-100 rounded-full transition-colors duration-200"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="h-4 w-4 text-gray-500" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 sm:px-8 py-6">
          {isLoading ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-indigo-200 to-purple-200 rounded-full flex items-center justify-center">
                <div className="w-8 h-8 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full animate-pulse"></div>
              </div>
              <div className="text-lg font-semibold text-gray-600">Loading pipeline...</div>
              <div className="text-sm text-gray-500 mt-1">Please wait while we fetch your leads</div>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="space-y-6">
                {/* First Row: Original Statuses */}
                <div className="flex gap-4 sm:gap-5 md:gap-6 lg:gap-8 overflow-x-auto pb-6 scrollbar-thin">
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
                <div className="flex gap-4 sm:gap-5 md:gap-6 lg:gap-8 overflow-x-auto pb-6 scrollbar-thin">
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
