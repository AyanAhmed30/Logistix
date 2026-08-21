"use client";

import { Download, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  downloadPdfAttachment,
  getPdfAttachment,
  viewPdfAttachment,
} from "@/lib/hr-pdf-attachment";

type PdfAttachmentActionsProps = {
  recordId: string;
  fileName?: string | null;
  size?: "sm" | "default";
};

export function PdfAttachmentActions({
  recordId,
  fileName,
  size = "sm",
}: PdfAttachmentActionsProps) {
  const attachment = getPdfAttachment(recordId);
  const displayName = fileName || attachment?.fileName;

  if (!displayName) {
    return <span className="text-xs text-slate-400">No PDF attached</span>;
  }

  function handleView() {
    const opened = viewPdfAttachment(recordId);
    if (!opened) {
      toast.error("PDF is no longer available in this session.");
    }
  }

  function handleDownload() {
    const downloaded = downloadPdfAttachment(recordId);
    if (!downloaded) {
      toast.error("PDF is no longer available in this session.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500">{displayName}</span>
      <Button type="button" variant="outline" size={size} onClick={handleView}>
        <Eye className="mr-1 h-4 w-4" />
        View PDF
      </Button>
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={handleDownload}
      >
        <Download className="mr-1 h-4 w-4" />
        Download PDF
      </Button>
    </div>
  );
}
