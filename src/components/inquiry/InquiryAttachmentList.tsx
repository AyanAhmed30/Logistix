"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { Download, FileText, ImageIcon, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  classifyInquiryAttachment,
  formatFileSize,
  parseLegacyAttachmentMeta,
  type InquiryAttachmentInfo,
} from "@/lib/inquiry-attachments";

type Props = {
  urls: string[];
  title?: string;
  compact?: boolean;
  onPreviewImage?: (url: string, title: string) => void;
};

function AttachmentCard({
  info,
  label,
  compact,
  onPreviewImage,
}: {
  info: InquiryAttachmentInfo;
  label: string;
  compact?: boolean;
  onPreviewImage?: (url: string, title: string) => void;
}) {
  const legacy = info.kind === "legacy_meta" ? parseLegacyAttachmentMeta(info.url) : null;

  if (info.kind === "legacy_meta") {
    return (
      <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 text-sm">
        <div className="flex items-start gap-2">
          <Paperclip className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-medium text-amber-900 truncate">{info.filename}</p>
            <p className="text-xs text-amber-800 mt-1">
              File metadata only — re-upload from Sales to make this file available.
              {legacy?.size ? ` (${formatFileSize(legacy.size)})` : ""}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (info.kind === "image") {
    return (
      <div className="border rounded-lg p-2 bg-white">
        <p className="text-xs text-slate-500 mb-1.5 truncate">{label}</p>
        <button
          type="button"
          className="block w-full text-left"
          onClick={() => onPreviewImage?.(info.url, label)}
        >
          <img
            src={info.url}
            alt={label}
            className={`w-full rounded object-contain cursor-zoom-in ${compact ? "max-h-40" : "max-h-56"}`}
          />
        </button>
      </div>
    );
  }

  if (info.kind === "pdf") {
    return (
      <div className="border rounded-lg p-3 bg-white space-y-2">
        <p className="text-xs text-slate-500 truncate">{label}</p>
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <FileText className="h-4 w-4 text-red-600 shrink-0" />
          <span className="truncate font-medium">{info.filename}</span>
        </div>
        <iframe
          src={info.url}
          title={label}
          className={`w-full rounded border bg-slate-50 ${compact ? "h-40" : "h-56"}`}
        />
        <Button asChild size="sm" variant="outline" className="w-full">
          <a href={info.url} target="_blank" rel="noopener noreferrer" download={info.filename}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Download PDF
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-3 bg-white space-y-2">
      <p className="text-xs text-slate-500 truncate">{label}</p>
      <div className="flex items-center gap-2 text-sm text-slate-700">
        <FileText className="h-4 w-4 text-sky-600 shrink-0" />
        <span className="truncate font-medium">{info.filename}</span>
      </div>
      <Button asChild size="sm" variant="outline" className="w-full">
        <a href={info.url} target="_blank" rel="noopener noreferrer" download={info.filename}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Download file
        </a>
      </Button>
    </div>
  );
}

export function InquiryAttachmentList({ urls, title, compact, onPreviewImage }: Props) {
  const items = urls
    .map((url, idx) => ({
      url,
      label: title ? `${title} ${idx + 1}` : `Attachment ${idx + 1}`,
      info: classifyInquiryAttachment(url),
    }))
    .filter((x) => x.url.trim().length > 0);

  if (!items.length) return null;

  return (
    <div>
      {title ? (
        <label className="text-xs text-slate-500 font-medium flex items-center gap-1 mb-2">
          <ImageIcon className="h-3.5 w-3.5" />
          {title}
        </label>
      ) : null}
      <div
        className={`grid gap-3 ${compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}
      >
        {items.map((item) => (
          <AttachmentCard
            key={`${item.url.slice(0, 48)}-${item.label}`}
            info={item.info}
            label={item.label}
            compact={compact}
            onPreviewImage={onPreviewImage}
          />
        ))}
      </div>
    </div>
  );
}

export function useInquiryImagePreview() {
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  return {
    preview,
    openPreview: (url: string, title: string) => setPreview({ url, title }),
    closePreview: () => setPreview(null),
  };
}
