"use client";

import { useId } from "react";
import { FileText, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  createPdfObjectUrl,
  validatePdfFile,
  type PdfAttachmentMeta,
} from "@/lib/hr-pdf-attachment";

type PdfAttachmentInputProps = {
  id?: string;
  label?: string;
  description?: string;
  chooseLabel?: string;
  accept?: string;
  value: PdfAttachmentMeta | null;
  onChange: (attachment: PdfAttachmentMeta | null) => void;
  validateFile?: (
    file: File,
  ) => { ok: true } | { ok: false; error: string };
};

export function PdfAttachmentInput({
  id,
  label = "Attach PDF",
  description = "PDF only. Maximum size 10 MB.",
  chooseLabel = "Choose PDF",
  accept = "application/pdf,.pdf",
  value,
  onChange,
  validateFile = validatePdfFile,
}: PdfAttachmentInputProps) {
  const generatedId = useId();
  const inputId = id || generatedId;

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const validation = validateFile(file);
    if (!validation.ok) {
      toast.error(validation.error);
      return;
    }

    if (value) {
      URL.revokeObjectURL(value.objectUrl);
    }

    onChange(createPdfObjectUrl(file));
  }

  function handleRemove() {
    if (value) {
      URL.revokeObjectURL(value.objectUrl);
    }
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <p className="text-xs text-slate-500">{description}</p>
      <input
        id={inputId}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFileChange}
      />
      {!value ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => document.getElementById(inputId)?.click()}
        >
          <FileText className="mr-2 h-4 w-4" />
          {chooseLabel}
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <FileText className="h-4 w-4 text-slate-500" />
          <span className="font-medium text-slate-700">{value.fileName}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => document.getElementById(inputId)?.click()}
          >
            Replace
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
          >
            <X className="mr-1 h-4 w-4" />
            Remove
          </Button>
        </div>
      )}
    </div>
  );
}
