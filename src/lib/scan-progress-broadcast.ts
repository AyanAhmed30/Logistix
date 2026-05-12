/** Same-tab / other-tab same-origin: instant Scan Progress UI sync without waiting on Realtime. */
export const SCAN_PROGRESS_CHANNEL = "logistix-scan-progress-v1";

export type ScanProgressBroadcastMessage = {
  type: "carton_scanned";
  order_id: string;
  carton_id: string;
  scanned_at: string;
};

export function notifyCartonScanned(payload: Omit<ScanProgressBroadcastMessage, "type">) {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const ch = new BroadcastChannel(SCAN_PROGRESS_CHANNEL);
    const msg: ScanProgressBroadcastMessage = { type: "carton_scanned", ...payload };
    ch.postMessage(msg);
    ch.close();
  } catch {
    // ignore private mode / unsupported
  }
}
