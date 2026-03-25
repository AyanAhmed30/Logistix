"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  getAllInquiriesForSalesAgent,
  type LeadInquiryWithLead,
} from "@/app/actions/inquiries";
import { getAllLeadsForSalesAgent, type Lead } from "@/app/actions/leads";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  RefreshCcw,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Package,
  ImageIcon,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────

type TrackingStatus = "not_sent" | "draft" | "sent" | "approved";

function getInquiryTrackingStatus(inquiry: LeadInquiryWithLead): TrackingStatus {
  // Check confirmations for approved status (only show approved to sales agent)
  const confirmations = inquiry.inquiry_confirmations || [];
  const sorted = [...confirmations].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const latestApproved = sorted.find((c) => c.status === "approved");

  if (latestApproved) return "approved";
  if (inquiry.sent_to_accounting) return "sent";
  return "draft";
}

function getStatusLabel(status: TrackingStatus): string {
  switch (status) {
    case "not_sent": return "Not Sent";
    case "draft": return "Draft";
    case "sent": return "Sent (Pending)";
    case "approved": return "Approved";
  }
}

function getStatusBadgeClass(status: TrackingStatus): string {
  switch (status) {
    case "not_sent": return "bg-slate-50 text-slate-600 border-slate-300";
    case "draft": return "bg-yellow-50 text-yellow-700 border-yellow-300";
    case "sent": return "bg-blue-50 text-blue-700 border-blue-300";
    case "approved": return "bg-emerald-50 text-emerald-700 border-emerald-300";
  }
}

function getStatusIcon(status: TrackingStatus) {
  switch (status) {
    case "not_sent": return <FileText className="h-3.5 w-3.5 text-slate-400" />;
    case "draft": return <AlertCircle className="h-3.5 w-3.5 text-yellow-600" />;
    case "sent": return <Clock className="h-3.5 w-3.5 text-blue-600" />;
    case "approved": return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  }
}

// ─── Main Component ──────────────────────────────────────────────────

export function InquiryTrackingPanel() {
  const [inquiries, setInquiries] = useState<LeadInquiryWithLead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<TrackingStatus | "all">("all");
  const [selectedInquiry, setSelectedInquiry] = useState<LeadInquiryWithLead | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchInquiries = useCallback(async () => {
    setIsLoading(true);
    try {
      const [leadsResult, inquiriesResult] = await Promise.all([
        getAllLeadsForSalesAgent(),
        getAllInquiriesForSalesAgent(),
      ]);

      if ("error" in leadsResult) {
        toast.error(leadsResult.error || "Unable to load leads");
        setInquiries([]);
        return;
      }

      // If inquiries fail, we still render lead placeholders (Draft / Not Sent).
      const leads = (leadsResult.leads || []) as Lead[];
      const inquiries: LeadInquiryWithLead[] = "inquiries" in inquiriesResult ? (inquiriesResult.inquiries || []) : [];

      // Keep a placeholder row only for leads that truly have no inquiries yet.
      const leadIdsWithInquiry = new Set(inquiries.map((i) => i.lead_id));
      const placeholders: LeadInquiryWithLead[] = leads
        .filter((lead) => !leadIdsWithInquiry.has(lead.id))
        .map((lead) => ({
          id: `placeholder-${lead.id}`,
          lead_id: lead.id,
          product_name: "",
          total_weight: "",
          cbm: "",
          quantity: "",
          description: "",
          image_url: null,
          link_url: null,
          status: "pending",
          sent_to_accounting: false,
          sent_to_operations: false,
          sent_at: null,
          created_at: lead.created_at,
          updated_at: lead.updated_at,
          leads: {
            id: lead.id,
            lead_id_formatted: lead.lead_id_formatted,
            name: lead.name,
            number: lead.number,
            source: lead.source,
            sales_agent_id: lead.sales_agent_id,
            sales_agents: null,
          },
          inquiry_confirmations: [],
        }));

      const merged = [...inquiries, ...placeholders].sort((a, b) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setInquiries(merged);
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInquiries();
  }, [fetchInquiries]);

  // Add tracking status to each inquiry
  const inquiriesWithStatus = inquiries.map((inq) => ({
    ...inq,
    trackingStatus: getInquiryTrackingStatus(inq),
  }));

  // Filter by search and status
  const filteredInquiries = inquiriesWithStatus.filter((inq) => {
    // Status filter
    if (filterStatus !== "all" && inq.trackingStatus !== filterStatus) return false;

    // Search filter
    if (!searchQuery.trim()) return true;
    const s = searchQuery.toLowerCase();
    return (
      (inq.leads?.lead_id_formatted || "").toLowerCase().includes(s) ||
      (inq.leads?.name || "").toLowerCase().includes(s) ||
      (inq.leads?.number || "").toLowerCase().includes(s) ||
      (inq.product_name || "").toLowerCase().includes(s) ||
      (inq.description || "").toLowerCase().includes(s)
    );
  });

  // Stats
  const stats = {
    total: inquiriesWithStatus.length,
    draft: inquiriesWithStatus.filter((i) => i.trackingStatus === "draft").length,
    sent: inquiriesWithStatus.filter((i) => i.trackingStatus === "sent").length,
    approved: inquiriesWithStatus.filter((i) => i.trackingStatus === "approved").length,
  };

  function openDetail(inquiry: LeadInquiryWithLead) {
    setSelectedInquiry(inquiry);
    setDetailOpen(true);
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          className={`text-left p-4 rounded-lg border transition-colors ${filterStatus === "all" ? "bg-slate-100 border-slate-400" : "bg-white border-slate-200 hover:bg-slate-50"}`}
          onClick={() => setFilterStatus("all")}
        >
          <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
          <p className="text-xs text-slate-500 font-medium">Total Inquiries</p>
        </button>
        <button
          className={`text-left p-4 rounded-lg border transition-colors ${filterStatus === "draft" ? "bg-yellow-100 border-yellow-400" : "bg-white border-slate-200 hover:bg-yellow-50"}`}
          onClick={() => setFilterStatus(filterStatus === "draft" ? "all" : "draft")}
        >
          <p className="text-2xl font-bold text-yellow-700">{stats.draft}</p>
          <p className="text-xs text-yellow-600 font-medium">Draft</p>
        </button>
        <button
          className={`text-left p-4 rounded-lg border transition-colors ${filterStatus === "sent" ? "bg-blue-100 border-blue-400" : "bg-white border-slate-200 hover:bg-blue-50"}`}
          onClick={() => setFilterStatus(filterStatus === "sent" ? "all" : "sent")}
        >
          <p className="text-2xl font-bold text-blue-700">{stats.sent}</p>
          <p className="text-xs text-blue-600 font-medium">Sent (Pending)</p>
        </button>
        <button
          className={`text-left p-4 rounded-lg border transition-colors ${filterStatus === "approved" ? "bg-emerald-100 border-emerald-400" : "bg-white border-slate-200 hover:bg-emerald-50"}`}
          onClick={() => setFilterStatus(filterStatus === "approved" ? "all" : "approved")}
        >
          <p className="text-2xl font-bold text-emerald-700">{stats.approved}</p>
          <p className="text-xs text-emerald-600 font-medium">Approved</p>
        </button>
      </div>

      {/* Main Card */}
      <Card className="bg-white border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg md:text-xl">Inquiry Tracking</CardTitle>
              <CardDescription className="text-xs md:text-sm">
                Track the status of all your lead inquiries — from draft to approval.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-auto sm:min-w-[250px]">
                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-secondary-muted pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Search by lead name, number..."
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchInquiries()}
                disabled={isLoading}
                className="h-9 shrink-0"
              >
                <RefreshCcw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400 text-sm">Loading inquiry tracking...</div>
          ) : filteredInquiries.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              {searchQuery || filterStatus !== "all"
                ? "No inquiries match your search/filter."
                : "No inquiries found. Create a lead and send an inquiry to get started."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold">Lead #</TableHead>
                    <TableHead className="font-semibold">Lead Name</TableHead>
                    <TableHead className="font-semibold">Phone</TableHead>
                    <TableHead className="font-semibold">Product Name</TableHead>
                    <TableHead className="font-semibold">Quantity</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
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
                      <TableCell className="font-semibold text-slate-700">
                        {inquiry.leads?.name || "Unknown"}
                      </TableCell>
                      <TableCell className="text-slate-600 text-sm">
                        {inquiry.leads?.number || "-"}
                      </TableCell>
                      <TableCell className="text-slate-700 font-medium">
                        {inquiry.product_name || "-"}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {inquiry.quantity || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {getStatusIcon(inquiry.trackingStatus)}
                          <Badge variant="outline" className={`text-xs ${getStatusBadgeClass(inquiry.trackingStatus)}`}>
                            {getStatusLabel(inquiry.trackingStatus)}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {inquiry.sent_at
                          ? new Date(inquiry.sent_at).toLocaleString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetail(inquiry);
                          }}
                        >
                          <FileText className="h-3.5 w-3.5 mr-1" /> Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-[650px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-teal-600" />
              Inquiry Details
              {selectedInquiry?.leads?.lead_id_formatted && (
                <span className="font-mono text-sm text-primary-accent">
                  #{selectedInquiry.leads.lead_id_formatted}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Full details and status of this lead inquiry.
            </DialogDescription>
          </DialogHeader>

          {selectedInquiry && (
            <div className="space-y-5">
              {/* Status Banner */}
              {(() => {
                const status = getInquiryTrackingStatus(selectedInquiry);
                if (status === "approved") {
                  return (
                    <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-emerald-800">Inquiry Approved</p>
                        <p className="text-xs text-emerald-600">This inquiry has been approved by the Admin. You may proceed with further work.</p>
                      </div>
                    </div>
                  );
                }
                if (status === "sent") {
                  return (
                    <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <Clock className="h-5 w-5 text-blue-600 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-blue-800">Inquiry Sent — Awaiting Review</p>
                        <p className="text-xs text-blue-600">Your inquiry has been sent to Accounting &amp; Operations. Waiting for confirmation.</p>
                      </div>
                    </div>
                  );
                }
                if (status === "draft") {
                  return (
                    <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-yellow-800">Draft — Not Yet Sent</p>
                        <p className="text-xs text-yellow-600">This inquiry has been saved but not sent yet. Go to Pipeline → Inquiry Received to send it.</p>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Lead Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                <div>
                  <label className="text-xs text-slate-500 font-medium">Lead Number</label>
                  <div className="font-mono font-bold text-primary-accent mt-0.5">
                    {selectedInquiry.leads?.lead_id_formatted ? `#${selectedInquiry.leads.lead_id_formatted}` : "-"}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium">Lead Name</label>
                  <div className="font-semibold text-slate-800 mt-0.5">
                    {selectedInquiry.leads?.name || "-"}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium">Phone</label>
                  <div className="text-slate-700 mt-0.5">{selectedInquiry.leads?.number || "-"}</div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium">Source</label>
                  <div className="mt-0.5">
                    <Badge variant="outline" className="text-xs">{selectedInquiry.leads?.source || "-"}</Badge>
                  </div>
                </div>
              </div>

              {/* Inquiry Details */}
              <div className="border-t pt-4 space-y-3">
                <h3 className="font-semibold text-sm text-slate-700">Inquiry Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Product Name</label>
                    <div className="text-slate-800 font-medium mt-0.5">{selectedInquiry.product_name || "-"}</div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Quantity</label>
                    <div className="text-slate-700 mt-0.5">{selectedInquiry.quantity || "-"}</div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Total Weight</label>
                    <div className="text-slate-700 mt-0.5">{selectedInquiry.total_weight || "-"}</div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-medium">CBM</label>
                    <div className="text-slate-700 mt-0.5">{selectedInquiry.cbm || "-"}</div>
                  </div>
                </div>
                {selectedInquiry.description && (
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Other Details</label>
                    <div className="text-slate-700 mt-0.5 text-sm bg-slate-50 p-3 rounded">{selectedInquiry.description}</div>
                  </div>
                )}
              </div>

              {/* Image */}
              {selectedInquiry.image_url && (
                <div className="border-t pt-4">
                  <label className="text-xs text-slate-500 font-medium flex items-center gap-1 mb-2">
                    <ImageIcon className="h-3.5 w-3.5" /> Attached Image
                  </label>
                  <div className="border rounded-lg p-2 inline-block">
                    <img
                      src={selectedInquiry.image_url}
                      alt="Inquiry attachment"
                      className="max-h-48 rounded object-contain"
                    />
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div className="border-t pt-4">
                <h3 className="font-semibold text-sm text-slate-700 mb-2">Timeline</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <div className="h-2 w-2 rounded-full bg-slate-400" />
                    Created: {new Date(selectedInquiry.created_at).toLocaleString()}
                  </div>
                  {selectedInquiry.sent_at && (
                    <div className="flex items-center gap-2 text-xs text-blue-600">
                      <div className="h-2 w-2 rounded-full bg-blue-500" />
                      Sent to Accounting & Operations: {new Date(selectedInquiry.sent_at).toLocaleString()}
                    </div>
                  )}
                  {(() => {
                    const confirmations = selectedInquiry.inquiry_confirmations || [];
                    const sorted = [...confirmations].sort(
                      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                    );
                    const approved = sorted.find((c) => c.status === "approved");
                    if (approved) {
                      return (
                        <div className="flex items-center gap-2 text-xs text-emerald-600">
                          <div className="h-2 w-2 rounded-full bg-emerald-500" />
                          Approved by Admin: {new Date(approved.created_at).toLocaleString()}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
