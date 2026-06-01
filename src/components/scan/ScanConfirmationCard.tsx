"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { submitCartonScan } from "@/lib/submit-carton-scan";

type PreviewData = {
  scan_identifier: string;
  scan_mode?: "inward" | "outward" | "re_inward" | "return";
  loading_phase?: string | null;
  console_id?: string | null;
  console_number?: string | null;
  blocking_message?: string | null;
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
  const isOutward = preview.scan_mode === "outward";
  const isReInward = preview.scan_mode === "re_inward" || preview.scan_mode === "return";
  const blocked = Boolean(preview.blocking_message);
  const reInwardComplete = isReInward && preview.scan_status === "re_inward_complete";
  const cannotSubmit = blocked || (isReInward ? reInwardComplete : preview.already_scanned);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScanned, setIsScanned] = useState(isReInward ? reInwardComplete : preview.already_scanned);
  const [message, setMessage] = useState<string>(() => {
    if (preview.blocking_message) return preview.blocking_message;
    if (reInwardComplete) return "Re-inward already recorded for this carton.";
    if (preview.already_scanned && !isReInward) return "This sticker is already scanned.";
    if (isReInward) return "Ready for re-inward (3rd scan).";
    return "Pending scan confirmation.";
  });
  const [error, setError] = useState<string | null>(null);
  const [resolvedScannedAt, setResolvedScannedAt] = useState<string | null>(preview.scanned_at);

  const statusLabel = useMemo(() => {
    if (isScanned) return "Scanned";
    return "Pending Scan";
  }, [isScanned]);

  async function handleMarkAsScanned() {
    if (isSubmitting || isScanned || cannotSubmit) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await submitCartonScan(preview.scan_identifier);

      if (!result.success) {
        setError(result.error);
        return;
      }

      setIsScanned(true);
      setResolvedScannedAt(result.scannedAt);
      if (result.scanType === "re_inward" || result.scanType === "return") {
        setMessage(
          result.duplicate
            ? "Re-inward was already recorded for this carton."
            : "Re-inward recorded. Carton is back in warehouse inventory."
        );
      } else {
        setMessage(result.duplicate ? "Already scanned earlier. No duplicate was created." : "Scanned successfully.");
      }
    } catch {
      setError("Network issue while saving scan. Please retry.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const title = blocked
    ? "Scan on hold"
    : isReInward
      ? "Re-inward to warehouse"
      : isOutward
        ? "Loading (outward) scan"
        : "Sticker scan";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-10 px-4">
      <div className="max-w-md mx-auto rounded-xl border bg-white shadow-sm p-6 space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-primary-dark">{title}</h1>
          <p className="text-sm text-secondary-muted">
            {blocked
              ? preview.blocking_message ??
                "Use the same sticker on the carton. Scan again after admin opens loading for this order."
              : isReInward
                ? "Confirm re-inward (3rd scan). Original inward receipt stays on record."
                : isOutward
                  ? "Confirm to record loading for this carton. The same QR was used for inward receipt; no reprint needed."
                  : "Confirm scan to register this sticker in the warehouse system."}
          </p>
          {!blocked && isOutward && preview.console_number ? (
            <p className="text-xs font-semibold text-primary-dark">Console {preview.console_number}</p>
          ) : null}
        </div>

        <div className="rounded-lg border bg-slate-50 p-3 text-sm space-y-1">
          <div>
            <span className="font-semibold">Next record:</span>{" "}
            {blocked ? "—" : isReInward ? "Re-inward (3rd scan)" : isOutward ? "Outward (loading)" : "Inward (receipt)"}
          </div>
          <div>
            <span className="font-semibold">Order ID:</span> {preview.order_id}
          </div>
          <div>
            <span className="font-semibold">Carton:</span> {preview.carton_serial_number}
          </div>
          <div>
            <span className="font-semibold">Tracking:</span> {preview.tracking_id}
          </div>
          <div>
            <span className="font-semibold">QR ID:</span> {preview.sticker_identifier}
          </div>
          <div>
            <span className="font-semibold">Shipping Mark:</span> {preview.shipping_mark || "-"}
          </div>
          <div>
            <span className="font-semibold">Destination:</span> {preview.destination_country || "-"}
          </div>
          <div>
            <span className="font-semibold">Status:</span> {statusLabel}
          </div>
          <div>
            <span className="font-semibold">Scanned At:</span>{" "}
            {resolvedScannedAt ? new Date(resolvedScannedAt).toLocaleString() : "-"}
          </div>
        </div>

        <Button
          className="w-full h-11 text-base font-semibold"
          disabled={isSubmitting || isScanned || cannotSubmit}
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
