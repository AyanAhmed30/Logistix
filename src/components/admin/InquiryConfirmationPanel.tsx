"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  getAllInquiryConfirmations,
  approveInquiryConfirmation,
  rejectInquiryConfirmation,
  type InquiryConfirmationWithLead,
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
  ClipboardCheck,
  Search,
  ArrowLeft,
  RefreshCcw,
  ImageIcon,
  Package,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────

function formatStatus(status: string) {
  switch (status) {
    case "pending": return "Pending";
    case "approved": return "Approved";
    case "rejected": return "Rejected";
    default: return status;
  }
}

function statusColor(status: string) {
  switch (status) {
    case "pending": return "bg-yellow-50 text-yellow-700 border-yellow-300";
    case "approved": return "bg-emerald-50 text-emerald-700 border-emerald-300";
    case "rejected": return "bg-red-50 text-red-700 border-red-300";
    default: return "";
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "approved": return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case "rejected": return <XCircle className="h-4 w-4 text-red-600" />;
    case "pending": return <Clock className="h-4 w-4 text-yellow-600" />;
    default: return null;
  }
}

// ─── Main Component ──────────────────────────────────────────────────

type ViewMode = "list" | "detail";

export function InquiryConfirmationPanel() {
  const [view, setView] = useState<ViewMode>("list");
  const [confirmations, setConfirmations] = useState<InquiryConfirmationWithLead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selected, setSelected] = useState<InquiryConfirmationWithLead | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isActioning, setIsActioning] = useState(false);

  const fetchConfirmations = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getAllInquiryConfirmations();
      if ("error" in result) {
        toast.error(result.error || "Unable to load confirmations");
        setConfirmations([]);
      } else {
        setConfirmations(result.confirmations || []);
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfirmations();
  }, [fetchConfirmations]);

  const filteredConfirmations = confirmations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const s = searchQuery.toLowerCase();
    return (
      (c.leads?.name || "").toLowerCase().includes(s) ||
      c.lead_number.toLowerCase().includes(s) ||
      c.product_name.toLowerCase().includes(s) ||
      c.submitted_by.toLowerCase().includes(s) ||
      c.status.toLowerCase().includes(s) ||
      (c.leads?.sales_agents?.name || "").toLowerCase().includes(s)
    );
  });

  function openDetail(conf: InquiryConfirmationWithLead) {
    setSelected(conf);
    setView("detail");
  }

  function backToList() {
    setView("list");
    setSelected(null);
    fetchConfirmations();
  }

  async function handleApprove() {
    if (!selected) return;
    setIsActioning(true);
    try {
      const result = await approveInquiryConfirmation(selected.id);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Inquiry confirmation approved!");
        setSelected({ ...selected, status: "approved", reviewed_by: "admin", reviewed_at: new Date().toISOString() });
        fetchConfirmations();
      }
    } catch {
      toast.error("Failed to approve.");
    } finally {
      setIsActioning(false);
    }
  }

  async function handleReject() {
    if (!selected) return;
    setIsActioning(true);
    try {
      const result = await rejectInquiryConfirmation(selected.id);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Inquiry confirmation rejected.");
        setSelected({ ...selected, status: "rejected", reviewed_by: "admin", reviewed_at: new Date().toISOString() });
        fetchConfirmations();
      }
    } catch {
      toast.error("Failed to reject.");
    } finally {
      setIsActioning(false);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  DETAIL VIEW
  // ═══════════════════════════════════════════════════════════════════

  if (view === "detail" && selected) {
    const c = selected;

    return (
      <div className="space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button onClick={backToList} className="text-teal-600 hover:underline flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> All Confirmations
          </button>
          <span className="text-slate-400">/</span>
          <span className="font-semibold text-slate-700">
            {c.product_name || "Unnamed"}
          </span>
        </div>

        {/* Header + Status */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Package className="h-5 w-5 text-teal-600" />
            {c.product_name}
          </h2>
          <div className="flex items-center gap-2">
            {statusIcon(c.status)}
            <Badge variant="outline" className={`text-xs ${statusColor(c.status)}`}>
              {formatStatus(c.status)}
            </Badge>
          </div>
        </div>

        {/* Inquiry Details */}
        <Card className="border shadow-sm">
          <CardContent className="p-6 space-y-5">
            {/* Lead Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-3">
              <div>
                <label className="text-xs text-slate-500 font-medium">Lead Number</label>
                <div className="font-mono text-lg font-bold text-teal-700 mt-0.5">{c.lead_number}</div>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium">Lead Name</label>
                <div className="font-semibold text-slate-800 mt-0.5">{c.leads?.name || "-"}</div>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium">Sales Agent</label>
                <div className="text-slate-700 mt-0.5">{c.leads?.sales_agents?.name || "-"}</div>
              </div>
            </div>

            <div className="border-t" />

            {/* Product Details */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Product Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                <div>
                  <label className="text-xs text-slate-500 font-medium">Product Name</label>
                  <div className="font-semibold text-slate-800 mt-0.5">{c.product_name || "-"}</div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium">Total Weight</label>
                  <div className="text-slate-700 mt-0.5">{c.total_weight || "-"}</div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium">CBM</label>
                  <div className="text-slate-700 mt-0.5">{c.cbm || "-"}</div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium">Quantity</label>
                  <div className="text-slate-700 mt-0.5">{c.quantity || "-"}</div>
                </div>
              </div>
            </div>

            <div className="border-t" />

            {/* Images - All 3 sections */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1">
                <ImageIcon className="h-4 w-4" /> Images
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Original Image */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500 font-medium">Original Inquiry Image</label>
                  {c.original_image_url ? (
                    <div className="border rounded-lg p-2">
                      <img
                        src={c.original_image_url}
                        alt="Original inquiry"
                        className="max-h-48 rounded object-contain w-full"
                      />
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center">
                      <ImageIcon className="h-8 w-8 mx-auto text-slate-300 mb-1" />
                      <p className="text-xs text-slate-400">No image</p>
                    </div>
                  )}
                </div>

                {/* Additional Image 1 */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500 font-medium">Additional Image 1</label>
                  {c.additional_image_1_url ? (
                    <div className="border rounded-lg p-2">
                      <img
                        src={c.additional_image_1_url}
                        alt="Additional 1"
                        className="max-h-48 rounded object-contain w-full"
                      />
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center">
                      <ImageIcon className="h-8 w-8 mx-auto text-slate-300 mb-1" />
                      <p className="text-xs text-slate-400">No image</p>
                    </div>
                  )}
                </div>

                {/* Additional Image 2 */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500 font-medium">Additional Image 2</label>
                  {c.additional_image_2_url ? (
                    <div className="border rounded-lg p-2">
                      <img
                        src={c.additional_image_2_url}
                        alt="Additional 2"
                        className="max-h-48 rounded object-contain w-full"
                      />
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center">
                      <ImageIcon className="h-8 w-8 mx-auto text-slate-300 mb-1" />
                      <p className="text-xs text-slate-400">No image</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t" />

            {/* Submission Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-3">
              <div>
                <label className="text-xs text-slate-500 font-medium">Submitted By</label>
                <div className="text-slate-700 mt-0.5">{c.submitted_by || "-"}</div>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium">Submitted At</label>
                <div className="text-slate-700 mt-0.5 text-sm">
                  {c.created_at ? new Date(c.created_at).toLocaleString() : "-"}
                </div>
              </div>
              {c.reviewed_by && (
                <div>
                  <label className="text-xs text-slate-500 font-medium">Reviewed By</label>
                  <div className="text-slate-700 mt-0.5">
                    {c.reviewed_by} — {c.reviewed_at ? new Date(c.reviewed_at).toLocaleString() : ""}
                  </div>
                </div>
              )}
            </div>

            {/* Admin Action Buttons */}
            {c.status === "pending" && (
              <>
                <div className="border-t" />
                <div className="flex justify-end gap-3">
                  <Button
                    variant="destructive"
                    onClick={handleReject}
                    disabled={isActioning}
                    className="gap-2"
                  >
                    {isActioning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    Reject
                  </Button>
                  <Button
                    onClick={handleApprove}
                    disabled={isActioning}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                  >
                    {isActioning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Approve
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
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
          <ClipboardCheck className="h-5 w-5 text-teal-600" />
          <h1 className="text-xl font-bold text-slate-800">Inquiry Confirmation</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search confirmations..."
              className="pl-9 w-60"
            />
          </div>
          <Button variant="outline" size="sm" onClick={fetchConfirmations} disabled={isLoading}>
            <RefreshCcw className={`h-4 w-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <span className="text-sm text-slate-500">
            {filteredConfirmations.length} record{filteredConfirmations.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Table */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400">Loading confirmations...</div>
          ) : filteredConfirmations.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              {searchQuery
                ? "No confirmations match your search."
                : "No inquiry confirmations yet."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold">Lead #</TableHead>
                    <TableHead className="font-semibold">Lead Name</TableHead>
                    <TableHead className="font-semibold">Product Name</TableHead>
                    <TableHead className="font-semibold">Weight</TableHead>
                    <TableHead className="font-semibold">CBM</TableHead>
                    <TableHead className="font-semibold">Qty</TableHead>
                    <TableHead className="font-semibold">Submitted By</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredConfirmations.map((conf) => (
                    <TableRow
                      key={conf.id}
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => openDetail(conf)}
                    >
                      <TableCell className="font-mono font-bold text-teal-700">
                        {conf.lead_number}
                      </TableCell>
                      <TableCell className="font-semibold text-slate-700">
                        {conf.leads?.name || "-"}
                      </TableCell>
                      <TableCell className="text-slate-700 font-medium">
                        {conf.product_name || "-"}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {conf.total_weight || "-"}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {conf.cbm || "-"}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {conf.quantity || "-"}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {conf.submitted_by || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {statusIcon(conf.status)}
                          <Badge variant="outline" className={`text-xs ${statusColor(conf.status)}`}>
                            {formatStatus(conf.status)}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {conf.created_at ? new Date(conf.created_at).toLocaleString([], {
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
                            openDetail(conf);
                          }}
                        >
                          View
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
