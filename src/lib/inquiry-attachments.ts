export type InquiryAttachmentKind = "image" | "pdf" | "office" | "text" | "legacy_meta" | "unknown";

export type InquiryAttachmentInfo = {
  url: string;
  kind: InquiryAttachmentKind;
  filename: string;
  mimeType: string | null;
  legacyMissing?: boolean;
};

const OFFICE_MIME_PREFIXES = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
];

export function parseLegacyAttachmentMeta(
  value: string
): { name: string; size: number; type: string } | null {
  const match = value.match(/^data:([^;]+);name=([^;]+);size=(\d+)$/);
  if (!match) return null;
  const [, type, encodedName, sizeStr] = match;
  return {
    type,
    name: decodeURIComponent(encodedName),
    size: parseInt(sizeStr, 10),
  };
}

export function classifyInquiryAttachment(url: string): InquiryAttachmentInfo {
  const trimmed = (url || "").trim();
  if (!trimmed) {
    return { url: "", kind: "unknown", filename: "attachment", mimeType: null };
  }

  const legacy = parseLegacyAttachmentMeta(trimmed);
  if (legacy) {
    return {
      url: trimmed,
      kind: "legacy_meta",
      filename: legacy.name,
      mimeType: legacy.type,
      legacyMissing: true,
    };
  }

  if (trimmed.startsWith("data:image/")) {
    return { url: trimmed, kind: "image", filename: "image", mimeType: "image/*" };
  }

  const lower = trimmed.toLowerCase();
  const filenameFromPath = decodeURIComponent(trimmed.split("/").pop()?.split("?")[0] || "attachment");

  if (lower.includes(".pdf") || lower.includes("application/pdf")) {
    return { url: trimmed, kind: "pdf", filename: filenameFromPath, mimeType: "application/pdf" };
  }

  if (
    OFFICE_MIME_PREFIXES.some((p) => lower.includes(p.replace(/\//g, ""))) ||
    /\.(docx?|xlsx?|pptx?)(\?|$)/i.test(lower)
  ) {
    return { url: trimmed, kind: "office", filename: filenameFromPath, mimeType: null };
  }

  if (/\.(txt|csv)(\?|$)/i.test(lower) || lower.startsWith("data:text/")) {
    return { url: trimmed, kind: "text", filename: filenameFromPath, mimeType: "text/plain" };
  }

  const imageUrlPattern = /\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)/i;
  const isImageUrl = trimmed.startsWith("http") && imageUrlPattern.test(lower);

  if (isImageUrl) {
    return { url: trimmed, kind: "image", filename: filenameFromPath, mimeType: "image/*" };
  }

  if (trimmed.startsWith("data:")) {
    return { url: trimmed, kind: "unknown", filename: filenameFromPath, mimeType: null };
  }

  return { url: trimmed, kind: "unknown", filename: filenameFromPath, mimeType: null };
}

export function collectInquiryAttachmentUrls(
  primary: string | null | undefined,
  additional: string[] | null | undefined
): string[] {
  const urls: string[] = [];
  if (primary?.trim()) urls.push(primary.trim());
  if (Array.isArray(additional)) {
    for (const u of additional) {
      if (typeof u === "string" && u.trim()) urls.push(u.trim());
    }
  }
  return urls;
}

export function collectOperationsConfirmationAttachmentUrls(
  confirmation: {
    operations_additional_image_urls?: string[] | null;
    additional_image_1_url?: string | null;
    additional_image_2_url?: string | null;
    calculator_values?: Record<string, unknown> | null;
  }
): string[] {
  const fromArray = Array.isArray(confirmation.operations_additional_image_urls)
    ? confirmation.operations_additional_image_urls.filter(
        (u) => typeof u === "string" && u.trim().length > 0
      )
    : [];
  if (fromArray.length > 0) return fromArray;

  const calculatorValues = confirmation.calculator_values;
  const fromCalculator = calculatorValues?.operations_attachment_urls;
  if (Array.isArray(fromCalculator)) {
    const urls = fromCalculator.filter(
      (u): u is string => typeof u === "string" && u.trim().length > 0
    );
    if (urls.length > 0) return urls;
  }

  return [confirmation.additional_image_1_url, confirmation.additional_image_2_url].filter(
    (u): u is string => typeof u === "string" && u.trim().length > 0
  );
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Max size for a single ops confirmation attachment (keeps server action payload safe). */
export const MAX_CONFIRMATION_ATTACHMENT_BYTES = 4 * 1024 * 1024;

/**
 * Only persist/serve storage or http(s) URLs.
 * Rejects data: URLs and other inline payloads that blow past server action body limits.
 */
export function isSafeInquiryAttachmentUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^data:/i.test(trimmed)) return false;
  if (/^blob:/i.test(trimmed)) return false;
  if (/^doc:\/\//i.test(trimmed)) return false;
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith("/");
}

export function sanitizeInquiryAttachmentUrls(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  return urls.filter(isSafeInquiryAttachmentUrl).map((url) => url.trim());
}

export function sanitizeInquiryAttachmentUrl(url: unknown): string | null {
  return isSafeInquiryAttachmentUrl(url) ? url.trim() : null;
}

