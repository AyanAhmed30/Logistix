export const HR_PDF_MAX_BYTES = 10 * 1024 * 1024;
export const HR_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export type PdfAttachmentMeta = {
  fileName: string;
  objectUrl: string;
  mimeType?: string;
};

const attachmentStore = new Map<string, PdfAttachmentMeta>();

const DOCUMENT_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".jpg",
  ".jpeg",
  ".png",
] as const;

const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);

function fileExtension(fileName: string) {
  const idx = fileName.lastIndexOf(".");
  return idx >= 0 ? fileName.slice(idx).toLowerCase() : "";
}

export function validatePdfFile(
  file: File,
): { ok: true } | { ok: false; error: string } {
  const isPdfMime =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");

  if (!isPdfMime) {
    return { ok: false, error: "Only PDF files are allowed." };
  }

  if (file.size > HR_PDF_MAX_BYTES) {
    return { ok: false, error: "PDF file must be 10 MB or smaller." };
  }

  return { ok: true };
}

/** HR Document Management uploads: PDF, DOC, DOCX, JPG, JPEG, PNG. */
export function validateHrDocumentFile(
  file: File,
): { ok: true } | { ok: false; error: string } {
  const extension = fileExtension(file.name);
  const mimeOk = !file.type || DOCUMENT_MIME_TYPES.has(file.type);
  const extensionOk = DOCUMENT_EXTENSIONS.includes(
    extension as (typeof DOCUMENT_EXTENSIONS)[number],
  );

  if (!extensionOk || (!mimeOk && file.type)) {
    return {
      ok: false,
      error: "Only PDF, DOC, DOCX, JPG, JPEG, or PNG files are allowed.",
    };
  }

  if (file.size > HR_DOCUMENT_MAX_BYTES) {
    return { ok: false, error: "File must be 10 MB or smaller." };
  }

  return { ok: true };
}

/** Payroll uploads: PDF, DOC, DOCX only. */
export function validatePayrollDocumentFile(
  file: File,
): { ok: true } | { ok: false; error: string } {
  const extension = fileExtension(file.name);
  const allowed = [".pdf", ".doc", ".docx"] as const;
  const mimeOk =
    !file.type ||
    file.type === "application/pdf" ||
    file.type === "application/msword" ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const extensionOk = allowed.includes(
    extension as (typeof allowed)[number],
  );

  if (!extensionOk || (!mimeOk && file.type)) {
    return {
      ok: false,
      error: "Only PDF, DOC, or DOCX files are allowed.",
    };
  }

  if (file.size > HR_DOCUMENT_MAX_BYTES) {
    return { ok: false, error: "File must be 10 MB or smaller." };
  }

  return { ok: true };
}

export function isPdfAttachment(attachment: PdfAttachmentMeta | null | undefined) {
  if (!attachment) return false;
  const name = attachment.fileName.toLowerCase();
  return (
    name.endsWith(".pdf") ||
    attachment.mimeType === "application/pdf"
  );
}

export function isImageAttachment(
  attachment: PdfAttachmentMeta | null | undefined,
) {
  if (!attachment) return false;
  const name = attachment.fileName.toLowerCase();
  return (
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png") ||
    attachment.mimeType === "image/jpeg" ||
    attachment.mimeType === "image/png"
  );
}

export function createPdfObjectUrl(file: File): PdfAttachmentMeta {
  return {
    fileName: file.name,
    objectUrl: URL.createObjectURL(file),
    mimeType: file.type || undefined,
  };
}

export function storePdfAttachment(
  recordId: string,
  attachment: PdfAttachmentMeta,
) {
  const existing = attachmentStore.get(recordId);
  if (existing) {
    URL.revokeObjectURL(existing.objectUrl);
  }
  attachmentStore.set(recordId, attachment);
}

export function getPdfAttachment(recordId: string): PdfAttachmentMeta | null {
  return attachmentStore.get(recordId) ?? null;
}

export function revokePdfAttachment(recordId: string) {
  const existing = attachmentStore.get(recordId);
  if (existing) {
    URL.revokeObjectURL(existing.objectUrl);
    attachmentStore.delete(recordId);
  }
}

export function viewPdfAttachment(recordId: string) {
  const attachment = getPdfAttachment(recordId);
  if (!attachment) return false;

  window.open(attachment.objectUrl, "_blank", "noopener,noreferrer");
  return true;
}

export function downloadPdfAttachment(recordId: string) {
  const attachment = getPdfAttachment(recordId);
  if (!attachment) return false;

  const link = document.createElement("a");
  link.href = attachment.objectUrl;
  link.download = attachment.fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return true;
}
