/** Normalize USB scanner / pasted input to the scan token or serial used by `/scan/[serial]`. */
export function parseScanIdentifierFromScannerInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  if (trimmed.includes("/scan/")) {
    try {
      const url = /^https?:\/\//i.test(trimmed) ? new URL(trimmed) : new URL(trimmed, "http://local");
      const match = url.pathname.match(/\/scan\/([^/?#]+)/i);
      if (match?.[1]) {
        return decodeURIComponent(match[1]).trim();
      }
    } catch {
      // fall through to raw value
    }
    const pathMatch = trimmed.match(/\/scan\/([^/?#\s]+)/i);
    if (pathMatch?.[1]) {
      return decodeURIComponent(pathMatch[1]).trim();
    }
  }

  return trimmed;
}
