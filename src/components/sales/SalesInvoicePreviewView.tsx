"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Eye, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getSalesInvoiceDetail,
  type SalesInvoiceDetail,
} from "@/app/actions/sales/to-invoice";
import { generateSalesInvoicePdf } from "@/lib/sales-invoice-pdf";
import { SalesPageSkeleton } from "@/components/sales/SalesSkeleton";
import { formatMoney } from "@/lib/sales-quotation-form";

type Props = { invoiceId: string };

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

export function SalesInvoicePreviewView({ invoiceId }: Props) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<SalesInvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getSalesInvoiceDetail(invoiceId);
    if ("error" in res && res.error) {
      toast.error(res.error);
      setInvoice(null);
    } else if ("invoice" in res && res.invoice) {
      setInvoice(res.invoice);
    }
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runPdf(mode: "preview" | "download" | "print") {
    if (!invoice) return;
    setPdfBusy(true);
    try {
      await generateSalesInvoicePdf(invoice, {
        download: mode === "download",
        openPrintDialog: mode === "print",
      });
      if (mode === "download") toast.success("Invoice PDF downloaded");
      if (mode === "preview") toast.success("PDF opened");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF failed");
    } finally {
      setPdfBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4">
        <SalesPageSkeleton rows={8} />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="bg-white border border-slate-200 rounded-sm p-10 text-center">
        <p className="text-sm text-secondary-muted">Invoice not found.</p>
        <Button
          className="mt-4 h-8 rounded-sm"
          variant="outline"
          onClick={() => router.push("/sales/to-invoice")}
        >
          Back to Orders to Invoice
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden min-h-[calc(100vh-160px)] flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b border-slate-200">
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
            disabled={pdfBusy || isPending}
            onClick={() => void runPdf("preview")}
          >
            <Eye className="h-4 w-4 mr-1.5" />
            Preview
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm"
            disabled={pdfBusy}
            onClick={() => void runPdf("print")}
          >
            <Printer className="h-4 w-4 mr-1.5" />
            Print
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm"
            disabled={pdfBusy}
            onClick={() => void runPdf("download")}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Download PDF
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm"
            onClick={() =>
              toast.info(
                "Email sending is prepared for a later phase (placeholder)."
              )
            }
          >
            Send by Email
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 rounded-sm text-secondary-muted"
            onClick={() => router.push("/sales/to-invoice")}
          >
            Back
          </Button>
        </div>
        <span className="inline-flex items-center rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-secondary-muted capitalize">
          {invoice.status}
        </span>
      </div>

      <div className="p-4 sm:p-6 space-y-6 max-w-4xl">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-primary-dark">
              {invoice.invoice_number}
            </h1>
            <p className="text-sm text-secondary-muted mt-1">
              Customer Invoice
            </p>
          </div>
          <div className="text-sm text-secondary-muted text-right space-y-0.5">
            <p className="font-semibold text-primary-dark">
              {invoice.organization_name || "Company"}
            </p>
            {invoice.company_address ? <p>{invoice.company_address}</p> : null}
            {invoice.company_email ? <p>{invoice.company_email}</p> : null}
            {invoice.company_phone ? <p>{invoice.company_phone}</p> : null}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-secondary-muted mb-1">
              Customer
            </p>
            <p className="font-semibold text-primary-dark">
              {invoice.customer_name}
            </p>
            {invoice.contact_id ? (
              <button
                type="button"
                className="text-[#017e84] text-xs mt-1 hover:underline"
                onClick={() =>
                  startTransition(() =>
                    router.push(`/sales/customers/${invoice.contact_id}`)
                  )
                }
              >
                Open customer
              </button>
            ) : null}
          </div>
          <div className="space-y-1.5 sm:text-right">
            <p>
              <span className="text-secondary-muted">Invoice Date:</span>{" "}
              {formatDate(invoice.invoice_date)}
            </p>
            <p>
              <span className="text-secondary-muted">Due Date:</span>{" "}
              {formatDate(invoice.due_date)}
            </p>
            <p>
              <span className="text-secondary-muted">Payment Terms:</span>{" "}
              {invoice.payment_terms}
            </p>
            <p>
              <span className="text-secondary-muted">Source:</span>{" "}
              <button
                type="button"
                className="text-[#017e84] hover:underline font-medium"
                onClick={() =>
                  router.push(`/sales/orders/${invoice.quotation_id}`)
                }
              >
                {invoice.quotation_number || "Sales Order"}
              </button>
            </p>
            {invoice.salesperson_name ? (
              <p>
                <span className="text-secondary-muted">Salesperson:</span>{" "}
                {invoice.salesperson_name}
              </p>
            ) : null}
          </div>
        </div>

        <div className="border border-slate-200 rounded-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>UoM</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Taxes %</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <div className="font-medium">{line.product_name}</div>
                    {line.description ? (
                      <div className="text-xs text-secondary-muted">
                        {line.description}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.quantity}
                  </TableCell>
                  <TableCell>{line.uom}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(line.unit_price)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.taxes}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatMoney(line.line_total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap justify-between gap-4">
          <div className="text-sm text-secondary-muted max-w-md">
            {invoice.notes ? (
              <>
                <p className="text-xs uppercase tracking-wide mb-1">Notes</p>
                <p className="whitespace-pre-wrap">{invoice.notes}</p>
              </>
            ) : (
              <p className="italic">No notes</p>
            )}
          </div>
          <div className="text-sm space-y-1 min-w-[200px]">
            <div className="flex justify-between gap-8">
              <span className="text-secondary-muted">Untaxed Amount</span>
              <span className="tabular-nums font-medium">
                {formatMoney(invoice.untaxed_amount)}
              </span>
            </div>
            <div className="flex justify-between gap-8">
              <span className="text-secondary-muted">Taxes</span>
              <span className="tabular-nums font-medium">
                {formatMoney(invoice.tax_amount)}
              </span>
            </div>
            <div className="flex justify-between gap-8 border-t border-slate-200 pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums text-[#017e84]">
                {formatMoney(invoice.total_amount)}
              </span>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-secondary-muted border-t border-slate-100 pt-3">
          Sales invoice preview — ready for Finance &amp; Accounting integration.
          Linked to sales order {invoice.quotation_number}.
        </p>
      </div>
    </div>
  );
}
