import { notifyCartonScanned } from "@/lib/scan-progress-broadcast";
import { usbScannerLog } from "@/lib/usb-scanner-debug";

export type SubmitCartonScanResult =
  | {
      success: true;
      duplicate: boolean;
      scannedAt: string;
      scanType: "inward" | "outward";
      consoleId: string | null;
      carton: { id: string; order_id: string };
    }
  | { success: false; error: string };

/** Same client path as `ScanConfirmationCard` → POST `/api/scan` + realtime broadcast. */
export async function submitCartonScan(scanIdentifier: string): Promise<SubmitCartonScanResult> {
  const trimmed = scanIdentifier.trim();
  if (!trimmed) {
    usbScannerLog("[API] Empty scan identifier");
    return { success: false, error: "Scan token is required" };
  }

  try {
    console.log("UPDATING SUPABASE via POST /api/scan", trimmed);
    usbScannerLog("UPDATING SUPABASE", { scanIdentifier: trimmed });

    const response = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scanIdentifier: trimmed }),
    });

    usbScannerLog("[API] Response status", { status: response.status, ok: response.ok });

    const result = (await response.json()) as {
      success?: boolean;
      duplicate?: boolean;
      error?: string;
      scanType?: "inward" | "outward";
      consoleId?: string | null;
      carton?: { id?: string; order_id?: string };
    };

    usbScannerLog("[API] Response body", {
      success: result.success,
      error: result.error,
      scanType: result.scanType,
      cartonId: result.carton?.id,
      orderId: result.carton?.order_id,
      duplicate: result.duplicate,
    });

    if (!response.ok || !result.success) {
      usbScannerLog("[API] ✗ Request failed", { error: result.error });
      return { success: false, error: result.error || "Unable to mark sticker as scanned." };
    }

    const scannedAt = new Date().toISOString();
    const cid = result.carton?.id;
    const oid = result.carton?.order_id;

    if (cid && oid) {
      usbScannerLog("[BROADCAST] Notifying scan progress listeners", {
        order_id: oid,
        carton_id: cid,
        scan_type: result.scanType ?? "inward",
        console_id: result.consoleId ?? null,
      });
      notifyCartonScanned({
        order_id: oid,
        carton_id: cid,
        scanned_at: scannedAt,
        scan_type: result.scanType ?? "inward",
        console_id: result.consoleId ?? null,
      });
    } else {
      usbScannerLog("[WARNING] Scan saved but carton ID missing", {
        carton: result.carton,
      });
    }

    return {
      success: true,
      duplicate: !!result.duplicate,
      scannedAt,
      scanType: result.scanType ?? "inward",
      consoleId: result.consoleId ?? null,
      carton: { id: cid ?? "", order_id: oid ?? "" },
    };
  } catch (err) {
    usbScannerLog("[API] ✗ Network error", {
      message: err instanceof Error ? err.message : String(err),
    });
    return { success: false, error: "Network issue while saving scan. Please retry." };
  }
}
