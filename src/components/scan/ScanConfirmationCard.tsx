"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { notifyCartonScanned } from "@/lib/scan-progress-broadcast";

type PreviewData = {
  scan_identifier: string;
  order_id: string;
  shipping_mark: string;
  destination_country: string;
  item_description: string | null;
  total_cartons: number;
  carton_serial_number: string;
  tracking_id: string;
  sticker_identifier: string;
  scan_status: string;
  scanned_at: string | null;
  already_scanned: boolean;
};

type Props = {
  preview: PreviewData;
};

export function ScanConfirmationCard({ preview }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScanned, setIsScanned] = useState(preview.already_scanned);
  const [message, setMessage] = useState<string>(
    preview.already_scanned ? "This sticker is already scanned." : "Pending scan confirmation."
  );
  const [error, setError] = useState<string | null>(null);
  const [resolvedScannedAt, setResolvedScannedAt] = useState<string | null>(preview.scanned_at);

  const statusLabel = useMemo(() => {
    if (isScanned) return "Scanned";
    return "Pending Scan";
  }, [isScanned]);

  async function handleMarkAsScanned() {
    if (isSubmitting || isScanned) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanIdentifier: preview.scan_identifier }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        duplicate?: boolean;
        error?: string;
        carton?: { id?: string; order_id?: string };
      };

      if (!response.ok || !result.success) {
        setError(result.error || "Unable to mark sticker as scanned.");
        return;
      }

      const scannedAt = new Date().toISOString();
      setIsScanned(true);
      setResolvedScannedAt(scannedAt);
      setMessage(result.duplicate ? "Already scanned earlier. No duplicate was created." : "Scanned successfully.");

      const cid = result.carton?.id;
      const oid = result.carton?.order_id ?? preview.order_id;
      if (cid && oid) {
        notifyCartonScanned({ order_id: oid, carton_id: cid, scanned_at: scannedAt });
      }
    } catch {
      setError("Network issue while saving scan. Please retry.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-10 px-4">
      <div className="max-w-md mx-auto rounded-xl border bg-white shadow-sm p-6 space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-primary-dark">Sticker Scan</h1>
          <p className="text-sm text-secondary-muted">
            Confirm scan to register this sticker in the warehouse system.
          </p>
        </div>

        <div className="rounded-lg border bg-slate-50 p-3 text-sm space-y-1">
          <div><span className="font-semibold">Order ID:</span> {preview.order_id}</div>
          <div><span className="font-semibold">Carton:</span> {preview.carton_serial_number}</div>
          <div><span className="font-semibold">Tracking:</span> {preview.tracking_id}</div>
          <div><span className="font-semibold">QR ID:</span> {preview.sticker_identifier}</div>
          <div><span className="font-semibold">Shipping Mark:</span> {preview.shipping_mark || "-"}</div>
          <div><span className="font-semibold">Destination:</span> {preview.destination_country || "-"}</div>
          <div><span className="font-semibold">Status:</span> {statusLabel}</div>
          <div>
            <span className="font-semibold">Scanned At:</span>{" "}
            {resolvedScannedAt ? new Date(resolvedScannedAt).toLocaleString() : "-"}
          </div>
        </div>

        <Button
          className="w-full h-11 text-base font-semibold"
          disabled={isSubmitting || isScanned}
          onClick={handleMarkAsScanned}
        >
          {isSubmitting ? "Marking..." : isScanned ? "Scanned" : "MARK AS SCANNED"}
        </Button>

        <div className="text-center text-sm">
          <p className={error ? "text-red-600" : isScanned ? "text-emerald-600 font-semibold" : "text-secondary-muted"}>
            {error || (isScanned ? `✓ ${message}` : message)}
          </p>
        </div>
      </div>
    </div>
  );
}
