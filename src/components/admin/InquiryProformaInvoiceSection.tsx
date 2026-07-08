"use client";

import { useRef, useState } from "react";
import { FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProformaInvoiceDocument } from "@/components/admin/ProformaInvoiceDocument";
import {
  createEmptyProformaInvoiceForm,
  createEmptyProformaInvoiceLineItem,
  type ProformaInvoiceFormData,
  type ProformaInvoiceLineItem,
} from "@/lib/proforma-invoice";
import { downloadProformaInvoicePdf } from "@/lib/proforma-invoice-pdf";

export function InquiryProformaInvoiceSection() {
  const documentRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<ProformaInvoiceFormData>(createEmptyProformaInvoiceForm);
  const [isDownloading, setIsDownloading] = useState(false);

  function updateField<K extends keyof ProformaInvoiceFormData>(key: K, value: ProformaInvoiceFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateLineItem(index: number, key: keyof ProformaInvoiceLineItem, value: string) {
    setForm((prev) => ({
      ...prev,
      lineItems: prev.lineItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item
      ),
    }));
  }

  function addLineItem() {
    setForm((prev) => ({
      ...prev,
      lineItems: [...prev.lineItems, createEmptyProformaInvoiceLineItem()],
    }));
  }

  function removeLineItem(index: number) {
    setForm((prev) => {
      if (prev.lineItems.length <= 1) return prev;
      return {
        ...prev,
        lineItems: prev.lineItems.filter((_, itemIndex) => itemIndex !== index),
      };
    });
  }

  async function handleDownloadPdf() {
    if (!documentRef.current) {
      toast.error("Invoice form is not ready");
      return;
    }

    setIsDownloading(true);
    try {
      await downloadProformaInvoicePdf(form, documentRef.current);
      toast.success("PDF downloaded");
    } catch {
      toast.error("Unable to generate PDF");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <Card className="border shadow-sm">
      <CardContent className="space-y-4 bg-slate-50/60 p-4 md:p-6">
        <ProformaInvoiceDocument
          ref={documentRef}
          form={form}
          onFieldChange={updateField}
          onLineItemChange={updateLineItem}
        />

        {form.lineItems.length > 1 ? (
          <div className="mx-auto flex max-w-[794px] flex-wrap gap-2">
            {form.lineItems.map((_, index) => (
              <Button
                key={index}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => removeLineItem(index)}
                className="gap-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove line {index + 1}
              </Button>
            ))}
          </div>
        ) : null}

        <div className="mx-auto flex max-w-[794px] flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" size="sm" onClick={addLineItem} className="gap-1">
            <Plus className="h-4 w-4" />
            Add Line Item
          </Button>
          <Button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isDownloading}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            {isDownloading ? "Generating..." : "Download PDF"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
