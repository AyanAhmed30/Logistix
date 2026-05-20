/** DOM event for the on-screen debug panel (do not rely on console.log interception). */
export const USB_DEBUG_EVENT = "logistix-usb-debug";

/** Set NEXT_PUBLIC_USB_SCANNER_DEBUG=false in production to silence scanner logs. */
export function isUsbScannerDebugEnabled(): boolean {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_USB_SCANNER_DEBUG === "false") {
    return false;
  }
  return true;
}

export function usbScannerLog(step: string, detail?: Record<string, unknown>): void {
  if (!isUsbScannerDebugEnabled()) return;
  if (detail) {
    console.log(`[USB-QR] ${step}`, detail);
  } else {
    console.log(`[USB-QR] ${step}`);
  }
  if (typeof window !== "undefined") {
    const payload = { step, ...detail };
    queueMicrotask(() => {
      window.dispatchEvent(new CustomEvent(USB_DEBUG_EVENT, { detail: payload }));
    });
  }
}
