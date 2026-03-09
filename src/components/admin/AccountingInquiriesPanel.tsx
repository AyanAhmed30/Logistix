"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { toast } from "sonner";
import {
  getAllInquiriesForAccounting,
  updateInquiryForAccounting,
  getInquiryLogs,
  type LeadInquiryWithLead,
  type InquiryLog,
} from "@/app/actions/inquiries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileText,
  MessageSquare,
  Edit2,
  ExternalLink,
  ImageIcon,
  Link2,
  Search,
  History,
  ArrowLeft,
  X,
  Save,
  RefreshCcw,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────

function formatStatus(status: string) {
  switch (status) {
    case "pending": return "Pending";
    case "in_progress": return "In Progress";
    case "quotation_sent": return "Quotation Sent";
    case "completed": return "Completed";
    default: return status;
  }
}

function statusColor(status: string) {
  switch (status) {
    case "pending": return "bg-yellow-50 text-yellow-700 border-yellow-300";
    case "in_progress": return "bg-blue-50 text-blue-700 border-blue-300";
    case "quotation_sent": return "bg-green-50 text-green-700 border-green-300";
    case "completed": return "bg-slate-50 text-slate-700 border-slate-300";
    default: return "";
  }
}

function formatLogAction(action: string) {
  switch (action) {
    case "created": return "Created";
    case "updated": return "Updated";
    case "deleted": return "Deleted";
    case "status_changed": return "Status Changed";
    default: return action;
  }
}

function getLogActionColor(action: string) {
  switch (action) {
    case "created": return "bg-green-100 text-green-700";
    case "updated": return "bg-blue-100 text-blue-700";
    case "deleted": return "bg-red-100 text-red-700";
    case "status_changed": return "bg-purple-100 text-purple-700";
    default: return "bg-slate-100 text-slate-700";
  }
}

// ─── Log Content Renderer ────────────────────────────────────────────

function InquiryLogEntry({ log }: { log: InquiryLog }) {
  const prev = log.previous_values as Record<string, unknown> | null;
  const next = log.new_values as Record<string, unknown> | null;

  const changes: { field: string; oldVal: string; newVal: string }[] = [];

  if (prev && next) {
    if (prev.description !== next.description) {
      changes.push({
        field: "Description",
        oldVal: String(prev.description || "(empty)"),
        newVal: String(next.description || "(empty)"),
      });
    }
    if (prev.status !== next.status) {
      changes.push({
        field: "Status",
        oldVal: formatStatus(String(prev.status || "")),
        newVal: formatStatus(String(next.status || "")),
      });
    }
    if (prev.image_url !== next.image_url) {
      changes.push({
        field: "Image",
        oldVal: prev.image_url ? "Attached" : "None",
        newVal: next.image_url ? "Attached" : "Removed",
      });
    }
    if (prev.link_url !== next.link_url) {
      changes.push({
        field: "Link",
        oldVal: String(prev.link_url || "(none)"),
        newVal: String(next.link_url || "(none)"),
      });
    }
  }

  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-800 font-semibold text-xs shrink-0 mt-0.5">
        {(log.performed_by || "?").charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-slate-700">
            {log.performed_by}
          </span>
          <Badge className={`text-[10px] h-5 ${getLogActionColor(log.action)}`}>
            {formatLogAction(log.action)}
          </Badge>
          <span className="text-xs text-slate-400">
            {new Date(log.performed_at).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        {changes.length > 0 ? (
          <div className="mt-1.5 space-y-1">
            {changes.map((c, i) => (
              <div key={i} className="text-sm bg-slate-50 rounded-md px-3 py-1.5 border border-slate-100">
                <span className="text-slate-500 text-xs font-medium">{c.field}: </span>
                <span className="text-red-400 line-through text-xs">{c.oldVal}</span>
                <span className="mx-1.5 text-slate-300">→</span>
                <span className="text-teal-700 font-semibold text-xs">{c.newVal}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 mt-0.5">
            {log.action === "created" ? "Inquiry created" : "Changes logged"}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

type ViewMode = "list" | "detail";

export function AccountingInquiriesPanel() {
  const [view, setView] = useState<ViewMode>("list");
  const [inquiries, setInquiries] = useState<LeadInquiryWithLead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<LeadInquiryWithLead | null>(null);
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState("");

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<string>("");
  const [editLink, setEditLink] = useState("");

  // Logs
  const [logs, setLogs] = useState<InquiryLog[]>([]);

  // ─── Data fetching ──────────────────────────────────────

  const fetchInquiries = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getAllInquiriesForAccounting();
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

  const fetchLogs = useCallback(async (inquiryId: string) => {
    const result = await getInquiryLogs(inquiryId);
    if (!("error" in result)) {
      setLogs(result.logs || []);
    } else {
      setLogs([]);
    }
  }, []);

  useEffect(() => {
    fetchInquiries();
  }, [fetchInquiries]);

  // ─── Filtered inquiries ─────────────────────────────────

  const filteredInquiries = inquiries.filter((inq) => {
    if (!searchQuery.trim()) return true;
    const s = searchQuery.toLowerCase();
    return (
      (inq.leads?.name || "").toLowerCase().includes(s) ||
      (inq.leads?.number || "").toLowerCase().includes(s) ||
      (inq.leads?.source || "").toLowerCase().includes(s) ||
      (inq.leads?.sales_agents?.name || "").toLowerCase().includes(s) ||
      (inq.description || "").toLowerCase().includes(s) ||
      inq.status.toLowerCase().includes(s)
    );
  });

  // ─── Navigation ─────────────────────────────────────────

  function openDetail(inquiry: LeadInquiryWithLead) {
    setSelectedInquiry(inquiry);
    setIsEditing(false);
    setView("detail");
    fetchLogs(inquiry.id);
  }

  function backToList() {
    setView("list");
    setSelectedInquiry(null);
    setIsEditing(false);
    setLogs([]);
    fetchInquiries();
  }

  function startEdit() {
    if (!selectedInquiry) return;
    setEditDescription(selectedInquiry.description || "");
    setEditStatus(selectedInquiry.status);
    setEditLink(selectedInquiry.link_url || "");
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
  }

  // ─── Save edit ──────────────────────────────────────────

  async function handleSaveEdit() {
    if (!selectedInquiry) return;

    startTransition(async () => {
      const updates: {
        description?: string;
        status?: "pending" | "in_progress" | "quotation_sent" | "completed";
        link_url?: string | null;
      } = {};

      if (editDescription !== (selectedInquiry.description || "")) {
        updates.description = editDescription;
      }
      if (editStatus !== selectedInquiry.status) {
        updates.status = editStatus as "pending" | "in_progress" | "quotation_sent" | "completed";
      }
      if (editLink !== (selectedInquiry.link_url || "")) {
        updates.link_url = editLink || null;
      }

      if (Object.keys(updates).length === 0) {
        toast.info("No changes to save");
        setIsEditing(false);
        return;
      }

      const result = await updateInquiryForAccounting(selectedInquiry.id, updates);

      if ("error" in result) {
        toast.error(result.error || "Failed to update inquiry");
        return;
      }

      toast.success("Inquiry updated successfully");
      setIsEditing(false);

      // Refresh the detail
      const refreshed = await getAllInquiriesForAccounting();
      if (!("error" in refreshed)) {
        const updated = (refreshed.inquiries || []).find((i) => i.id === selectedInquiry.id);
        if (updated) setSelectedInquiry(updated);
        setInquiries(refreshed.inquiries || []);
      }
      fetchLogs(selectedInquiry.id);
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  DETAIL VIEW
  // ═══════════════════════════════════════════════════════════

  if (view === "detail" && selectedInquiry) {
    const inq = selectedInquiry;

    return (
      <div className="space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button onClick={backToList} className="text-teal-600 hover:underline flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Inquiries
          </button>
          <span className="text-slate-400">/</span>
          <span className="font-semibold text-slate-700">
            {inq.leads?.name || "Unknown Lead"}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={isPending}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  {isPending ? "Saving..." : "Save"}
                </Button>
                <Button size="sm" variant="outline" onClick={cancelEdit}>
                  <X className="h-3.5 w-3.5 mr-1" /> Discard
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={startEdit}>
                <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
            )}
          </div>
          <Badge variant="outline" className={`text-xs ${statusColor(inq.status)}`}>
            {formatStatus(inq.status)}
          </Badge>
        </div>

        {/* Main Content: Info + Logs Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Inquiry Info */}
          <div className="lg:col-span-2">
            <Card className="border shadow-sm">
              <CardContent className="p-6 space-y-5">
                {/* Lead Info Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
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
                    <label className="text-xs text-slate-500 font-medium">Status</label>
                    {isEditing ? (
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                        className="mt-0.5 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="quotation_sent">Quotation Sent</option>
                        <option value="completed">Completed</option>
                      </select>
                    ) : (
                      <div className="mt-0.5">
                        <Badge variant="outline" className={`text-xs ${statusColor(inq.status)}`}>
                          {formatStatus(inq.status)}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>

                {/* Separator */}
                <div className="border-t" />

                {/* Description */}
                <div>
                  <label className="text-xs text-slate-500 font-medium">Inquiry Description</label>
                  {isEditing ? (
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={4}
                      className="mt-1"
                      placeholder="Inquiry description..."
                    />
                  ) : (
                    <div className="mt-1 bg-slate-50 border rounded-lg p-3 text-sm whitespace-pre-wrap min-h-[60px]">
                      {inq.description || "No description provided."}
                    </div>
                  )}
                </div>

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
                        className="max-h-48 rounded object-contain"
                      />
                    </div>
                  </div>
                )}

                {/* Link */}
                <div>
                  <label className="text-xs text-slate-500 font-medium flex items-center gap-1">
                    <Link2 className="h-3.5 w-3.5" /> Attached Link
                  </label>
                  {isEditing ? (
                    <Input
                      value={editLink}
                      onChange={(e) => setEditLink(e.target.value)}
                      className="mt-1"
                      placeholder="https://..."
                    />
                  ) : inq.link_url ? (
                    <a
                      href={inq.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 text-sm text-blue-600 hover:underline flex items-center gap-1"
                    >
                      {inq.link_url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <div className="mt-1 text-sm text-slate-400">No link attached.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right: Activity Logs */}
          <div className="lg:col-span-1">
            <div className="sticky top-4 space-y-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-teal-600" />
                <h3 className="font-semibold text-sm text-slate-700">Activity Log</h3>
              </div>

              <div className="space-y-4 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
                {logs.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">
                    No activity yet.
                  </p>
                ) : (
                  logs.map((log) => (
                    <InquiryLogEntry key={log.id} log={log} />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  LIST VIEW
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-5 w-5 text-teal-600" />
          <h1 className="text-xl font-bold text-slate-800">Inquiries from Sales Agents</h1>
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
                : "No inquiries from sales agents yet."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold">Lead Name</TableHead>
                    <TableHead className="font-semibold">Phone</TableHead>
                    <TableHead className="font-semibold">Source</TableHead>
                    <TableHead className="font-semibold">Sales Agent</TableHead>
                    <TableHead className="font-semibold">Description</TableHead>
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
                      <TableCell className="font-semibold text-teal-700">
                        {inquiry.leads?.name || "Unknown"}
                      </TableCell>
                      <TableCell className="text-slate-600">{inquiry.leads?.number || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {inquiry.leads?.source || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {inquiry.leads?.sales_agents?.name || "-"}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-slate-500">
                        {inquiry.description || "No description"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${statusColor(inquiry.status)}`}>
                          {formatStatus(inquiry.status)}
                        </Badge>
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
