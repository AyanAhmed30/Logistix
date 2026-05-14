/** Base URL for scan QR links (matches BookOrderModal behaviour). */
export function getScanStickerBaseUrl(): string {
  const envBase =
    typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_APP_BASE_URL as string | undefined) : undefined;
  const runtimeOrigin = typeof window !== "undefined" ? window.location.origin : "";
  return ((envBase && envBase.trim()) || runtimeOrigin || "").replace(/\/+$/, "");
}

/** Same token as inward; outward mode is encoded in query params (loading PDF only). */
export function buildOutwardScanUrl(scanIdentifier: string, consoleId: string): string {
  const base = getScanStickerBaseUrl();
  const id = encodeURIComponent(scanIdentifier.trim());
  const cid = encodeURIComponent(consoleId.trim());
  return `${base}/scan/${id}?outward=1&console=${cid}`;
}
