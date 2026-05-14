/** Base URL for scan QR links (matches BookOrderModal behaviour). */
export function getScanStickerBaseUrl(): string {
  const envBase =
    typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_APP_BASE_URL as string | undefined) : undefined;
  const runtimeOrigin = typeof window !== "undefined" ? window.location.origin : "";
  return ((envBase && envBase.trim()) || runtimeOrigin || "").replace(/\/+$/, "");
}

/** Single URL for every carton sticker: inward on first scan, outward on later scans when loading is open (server decides). */
export function buildStickerScanUrl(scanIdentifier: string): string {
  const base = getScanStickerBaseUrl();
  const id = encodeURIComponent(scanIdentifier.trim());
  return `${base}/scan/${id}`;
}
