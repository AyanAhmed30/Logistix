/** Same-tab / other-tab same-origin: instant Scan Progress UI sync without waiting on Realtime. */
export const SCAN_PROGRESS_CHANNEL = "logistix-scan-progress-v1";

export const SCAN_PROGRESS_DOM_EVENT = "logistix-carton-scanned";

export type ScanProgressBroadcastMessage = {
  type: "carton_scanned";
  order_id: string;
  carton_id: string;
  scanned_at: string;
  scan_type?: "inward" | "outward" | "re_inward" | "return";
  console_id?: string | null;
};

export function notifyCartonScanned(payload: Omit<ScanProgressBroadcastMessage, "type">) {
  const msg: ScanProgressBroadcastMessage = { type: "carton_scanned", ...payload };

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SCAN_PROGRESS_DOM_EVENT, { detail: msg }));
  }

  if (typeof BroadcastChannel === "undefined") return;
  try {
    const ch = new BroadcastChannel(SCAN_PROGRESS_CHANNEL);
    ch.postMessage(msg);
    ch.close();
  } catch {
    // ignore private mode / unsupported
  }
}
