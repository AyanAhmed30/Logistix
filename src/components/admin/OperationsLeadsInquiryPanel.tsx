"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  getAllInquiriesForOperations,
  type LeadInquiryWithLead,
} from "@/app/actions/inquiries";
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
  FileText,
  ClipboardList,
  Search,
  ArrowLeft,
  RefreshCcw,
  ImageIcon,
  Package,
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

// ─── Main Component ──────────────────────────────────────────────────

type ViewMode = "list" | "detail";

export function OperationsLeadsInquiryPanel() {
  const [view, setView] = useState<ViewMode>("list");
  const [inquiries, setInquiries] = useState<LeadInquiryWithLead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<LeadInquiryWithLead | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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
      (inq.leads?.name || "").toLowerCase().includes(s) ||
      (inq.leads?.number || "").toLowerCase().includes(s) ||
      (inq.leads?.source || "").toLowerCase().includes(s) ||
      (inq.leads?.sales_agents?.name || "").toLowerCase().includes(s) ||
      (inq.product_name || "").toLowerCase().includes(s) ||
      (inq.description || "").toLowerCase().includes(s) ||
      inq.status.toLowerCase().includes(s)
    );
  });

  function openDetail(inquiry: LeadInquiryWithLead) {
    setSelectedInquiry(inquiry);
    setView("detail");
  }

  function backToList() {
    setView("list");
    setSelectedInquiry(null);
    fetchInquiries();
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
            <ArrowLeft className="h-4 w-4" /> Leads Inquiry
          </button>
          <span className="text-slate-400">/</span>
          <span className="font-semibold text-slate-700">
            {inq.leads?.name || "Unknown Lead"}
          </span>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Package className="h-5 w-5 text-teal-600" />
            {inq.product_name || "No Product Name"}
          </h2>
          <Badge variant="outline" className={`text-xs ${statusColor(inq.status)}`}>
            {formatStatus(inq.status)}
          </Badge>
        </div>

        {/* Main Content */}
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
                <div className="mt-0.5">
                  <Badge variant="outline" className={`text-xs ${statusColor(inq.status)}`}>
                    {formatStatus(inq.status)}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Separator */}
            <div className="border-t" />

            {/* Product Details Grid */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Product Details</h3>
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

            {/* Other Details */}
            {inq.description && (
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
                    <TableHead className="font-semibold">Lead Name</TableHead>
                    <TableHead className="font-semibold">Product Name</TableHead>
                    <TableHead className="font-semibold">Total Weight</TableHead>
                    <TableHead className="font-semibold">CBM</TableHead>
                    <TableHead className="font-semibold">Quantity</TableHead>
                    <TableHead className="font-semibold">Sales Agent</TableHead>
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
