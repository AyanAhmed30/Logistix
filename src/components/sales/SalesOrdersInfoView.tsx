"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getSalesOrdersInfo,
  updateSalesOrderShipmentInfo,
  uploadSalesParcelPhoto,
} from "@/app/actions/sales/orders-info";
import {
  ordersInfoStatusLabel,
  type OrdersInfoRow,
  type OrdersInfoSummary,
  type ShipmentInfoStatus,
} from "@/lib/sales-orders-info";
import { useSalesShell } from "@/components/sales/SalesShell";
import {
  SalesEmptyState,
  SalesPageSkeleton,
} from "@/components/sales/SalesSkeleton";

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function statusClass(status: ShipmentInfoStatus) {
  switch (status) {
    case "tracking_and_photo":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "accepted_pending":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "tracking_added":
    case "photo_uploaded":
      return "bg-sky-50 text-sky-800 border-sky-200";
    case "quotation_sent":
      return "bg-slate-50 text-slate-700 border-slate-200";
    default:
      return "bg-slate-50 text-slate-600 border-slate-200";
  }
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
    </div>
  );
}

export function SalesOrdersInfoView() {
  const router = useRouter();
  const { searchQuery } = useSalesShell();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<OrdersInfoRow[]>([]);
  const [summary, setSummary] = useState<OrdersInfoSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState<ShipmentInfoStatus | "all">(
    "all"
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [editRow, setEditRow] = useState<OrdersInfoRow | null>(null);
  const [tracking, setTracking] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getSalesOrdersInfo({
      search: searchQuery,
      shipmentStatus: statusFilter,
      page: 1,
      pageSize: 100,
    });
    setLoading(false);
    if ("error" in res) {
      toast.error(res.error);
      setRows([]);
      setSummary(null);
      return;
    }
    setRows(res.rows);
    setSummary(res.summary);
  }, [searchQuery, statusFilter, refreshKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const filters = useMemo(
    () =>
      [
        { id: "all", label: "All" },
        { id: "quotation_sent", label: "Quotation Sent" },
        { id: "accepted_pending", label: "Info Pending" },
        { id: "tracking_added", label: "Tracking" },
        { id: "photo_uploaded", label: "Photo" },
        { id: "tracking_and_photo", label: "Complete" },
      ] as const,
    []
  );

  const openEdit = (row: OrdersInfoRow) => {
    setEditRow(row);
    setTracking(row.trackingNumber || "");
    setPhotoFile(null);
  };

  const saveShipment = async () => {
    if (!editRow) return;
    setSaving(true);
    try {
      let photoUrl: string | null = null;
      let photoPath: string | null = null;
      if (photoFile) {
        const fd = new FormData();
        fd.set("quotationId", editRow.id);
        fd.set("file", photoFile);
        const uploaded = await uploadSalesParcelPhoto(fd);
        if ("error" in uploaded) {
          toast.error(uploaded.error);
          setSaving(false);
          return;
        }
        photoUrl = uploaded.url;
        photoPath = uploaded.path;
      }

      const result = await updateSalesOrderShipmentInfo({
        quotationId: editRow.id,
        trackingNumber: tracking.trim() || null,
        parcelPhotoUrl: photoUrl,
        parcelPhotoPath: photoPath,
      });

      if ("error" in result) {
        toast.error(result.error);
        setSaving(false);
        return;
      }

      toast.success("Shipment information updated");
      setEditRow(null);
      setRefreshKey((k) => k + 1);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !summary) {
    return <SalesPageSkeleton />;
  }

  return (
    <div className="space-y-5">
      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <SummaryCard label="Quotations Sent" value={summary.totalQuotationsSent} />
          <SummaryCard label="Accepted" value={summary.quotationsAccepted} />
          <SummaryCard label="Info Pending" value={summary.acceptedPending} />
          <SummaryCard label="Tracking Added" value={summary.trackingAdded} />
          <SummaryCard label="Photo Uploaded" value={summary.photoUploaded} />
          <SummaryCard label="Tracking + Photo" value={summary.trackingAndPhoto} />
          <SummaryCard label="Info Complete" value={summary.informationComplete} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() =>
                setStatusFilter(filter.id as ShipmentInfoStatus | "all")
              }
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                statusFilter === filter.id
                  ? "border-teal-600 bg-teal-50 text-teal-800"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {rows.length === 0 ? (
        <SalesEmptyState
          title="No orders info yet"
          description="Sent quotations and customer acceptance / shipment updates will appear here."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Quotation</TableHead>
                <TableHead>Inquiry</TableHead>
                <TableHead>Shipment status</TableHead>
                <TableHead>Tracking</TableHead>
                <TableHead>Photo</TableHead>
                <TableHead>Sales agent</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-mono text-sm font-semibold text-slate-900">
                      {row.customerId || "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-slate-900">{row.customerName}</div>
                    <div className="text-xs text-slate-500">
                      {row.customerEmail || row.customerPhone || "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="font-medium text-teal-700 hover:underline"
                      onClick={() => router.push(`/sales/quotations/${row.id}`)}
                    >
                      {row.quotationNumber || row.id.slice(0, 8)}
                    </button>
                    <div className="text-xs text-slate-500">
                      Sent {formatDate(row.quotationSentAt)}
                    </div>
                    {row.acceptedAt ? (
                      <div className="text-xs text-slate-500">
                        Accepted {formatDate(row.acceptedAt)}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {row.inquiryId ? row.inquiryId.slice(0, 8) : "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(
                        row.shipmentStatus
                      )}`}
                    >
                      {ordersInfoStatusLabel(row.shipmentStatus)}
                    </span>
                    <div className="mt-1 text-xs text-slate-500">{row.orderStatus}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.trackingNumber || "Not Provided"}
                  </TableCell>
                  <TableCell>
                    {row.parcelPhotoUrl ? (
                      <a
                        href={row.parcelPhotoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-teal-700 hover:underline"
                      >
                        Uploaded
                      </a>
                    ) : (
                      <span className="text-xs text-slate-500">Not Uploaded</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">
                    {row.salespersonName || "—"}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {formatDate(row.lastUpdated)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(row)}
                    >
                      Add / Update Info
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={Boolean(editRow)} onOpenChange={(open) => !open && setEditRow(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Shipment information</DialogTitle>
          </DialogHeader>
          {editRow ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                {editRow.customerName} · {editRow.quotationNumber}
              </p>
              <div className="space-y-2">
                <Label htmlFor="tracking">Tracking number</Label>
                <Input
                  id="tracking"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  placeholder="TRK-123456"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="photo">Parcel photo</Label>
                <Input
                  id="photo"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                />
                {editRow.parcelPhotoUrl ? (
                  <a
                    href={editRow.parcelPhotoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700"
                  >
                    <Upload className="h-3 w-3" />
                    Current photo
                  </a>
                ) : null}
              </div>
              <p className="text-xs text-slate-500">
                Provide a tracking number, photo, or both. Updates the same order the
                customer sees — no duplicates.
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditRow(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void saveShipment()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
