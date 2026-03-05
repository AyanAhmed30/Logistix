"use client";

import { useEffect, useState, useTransition } from "react";
import jsPDF from "jspdf";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  createAdminInvoice,
  deleteAdminInvoice,
  getAllAdminInvoices,
  updateAdminInvoice,
  type AdminInvoice,
} from "@/app/actions/admin_invoices";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlusCircle, FileText, Trash2, Edit2 } from "lucide-react";

type InvoiceFormState = {
  id?: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  source: string;
  description: string;
  quantity: string;
  unit_price: string;
  taxes: string;
  amount: string;
  untaxed_amount: string;
  total: string;
  payment_communication: string;
};

const emptyForm: InvoiceFormState = {
  invoice_number: "",
  invoice_date: "",
  due_date: "",
  source: "",
  description: "",
  quantity: "",
  unit_price: "",
  taxes: "",
  amount: "",
  untaxed_amount: "",
  total: "",
  payment_communication: "",
};

export function AdminInvoicePanel() {
  const router = useRouter();
  // We still keep invoices state for Save & Print, but the primary UX is the modal form.
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  // Open the modal as soon as admin clicks the Invoice tab (panel mounts)
  const [formOpen, setFormOpen] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminInvoice | null>(null);
  const [formState, setFormState] = useState<InvoiceFormState>(emptyForm);
  const [submitMode, setSubmitMode] = useState<"save" | "save_print">("save");

  const isEditing = Boolean(formState.id);

  useEffect(() => {
    fetchInvoices();
  }, []);

  async function fetchInvoices() {
    setIsLoading(true);
    try {
      const result = await getAllAdminInvoices();
      if ("error" in result) {
        toast.error(result.error || "Unable to load invoices");
        setInvoices([]);
      } else {
        setInvoices(result.invoices || []);
      }
    } catch {
      toast.error("An unexpected error occurred while loading invoices");
      setInvoices([]);
    } finally {
      setIsLoading(false);
    }
  }

  function computeNextInvoiceNumber(existing: AdminInvoice[]): string {
    const today = new Date();
    const year = today.getFullYear();
    const prefix = `INV/${year}/`;

    const yearInvoices = existing.filter((inv) =>
      inv.invoice_number?.startsWith(prefix)
    );

    if (yearInvoices.length === 0) {
      return `${prefix}0001`;
    }

    const lastSeq = yearInvoices
      .map((inv) => {
        const match = inv.invoice_number.match(/INV\/(\d{4})\/(\d{4})/);
        return match ? parseInt(match[2], 10) || 0 : 0;
      })
      .reduce((max, val) => (val > max ? val : max), 0);

    const nextSeq = (lastSeq || 0) + 1;
    return `${prefix}${nextSeq.toString().padStart(4, "0")}`;
  }

  function openCreate() {
    const today = new Date().toISOString().slice(0, 10);
    setFormState({
      ...emptyForm,
      invoice_number: computeNextInvoiceNumber(invoices),
      invoice_date: today,
      due_date: today,
    });
    setFormOpen(true);
  }

  function openEdit(invoice: AdminInvoice) {
    setFormState({
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date?.slice(0, 10) || "",
      due_date: invoice.due_date?.slice(0, 10) || "",
      source: invoice.source || "",
      description: invoice.description || "",
      quantity: invoice.quantity || "",
      unit_price: invoice.unit_price || "",
      taxes: invoice.taxes || "",
      amount: invoice.amount || "",
      untaxed_amount: invoice.untaxed_amount || "",
      total: invoice.total || "",
      payment_communication: invoice.payment_communication || "",
    });
    setFormOpen(true);
  }

  function handleFormChange<K extends keyof InvoiceFormState>(key: K, value: string) {
    setFormState((prev) => ({
      ...prev,
      [key]: value,
      ...(key === "invoice_number" && !prev.payment_communication
        ? {
            payment_communication: `Payment Communication: ${value} on this account: MEEZAN BANK - Meezan Bank`,
          }
        : {}),
    }));
  }

  function handleCloseForm(open: boolean) {
    setFormOpen(open);
    if (!open) {
      setFormState(emptyForm);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);

    if (formState.id) {
      fd.set("id", formState.id);
    }

    startTransition(async () => {
      const action = formState.id ? updateAdminInvoice : createAdminInvoice;
      const result = await action(fd);

      if ("error" in result) {
        toast.error(result.error || "Unable to save invoice");
        return;
      }

      const savedInvoice = (result as { invoice?: AdminInvoice }).invoice;

      toast.success("Invoice saved", {
        className: "bg-green-500 text-white border-green-500",
      });
      handleCloseForm(false);
      await fetchInvoices();
      router.refresh();

      // If admin chose "Save & Print", immediately download the PDF
      if (submitMode === "save_print" && savedInvoice) {
        downloadPdf(savedInvoice);
      }
    });
  }

  function confirmDelete(invoice: AdminInvoice) {
    setDeleteTarget(invoice);
    setDeleteOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    startTransition(async () => {
      const result = await deleteAdminInvoice(deleteTarget.id);
      if ("error" in result) {
        toast.error(result.error || "Unable to delete invoice");
        return;
      }
      toast.success("Invoice deleted", {
        className: "bg-green-500 text-white border-green-500",
      });
      setDeleteOpen(false);
      setDeleteTarget(null);
      await fetchInvoices();
      router.refresh();
    });
  }

  function downloadPdf(invoice: AdminInvoice) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = margin;

    // Header logo text (top-left)
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("LOGISTIX", margin, y);

    // Tagline (top-right)
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    doc.text(
      "Seamless, Strategic Logistics & Financing",
      pageWidth - margin,
      y,
      { align: "right" }
    );
    y += 10;

    // Address under logo
    doc.setFontSize(8);
    const addressLines = [
      "National Incubation Center, NED University, Karachi,",
      "Karachi City, Sindh 75270",
    ];
    addressLines.forEach((line) => {
      doc.text(line, margin, y);
      y += 4;
    });

    // Cache Tech centered
    y += 16;
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    doc.text("Cache Tech", pageWidth / 2, y, { align: "center" });
    y += 16;

    // Title: PROFORMA Invoice INV/...
    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    const title = `PROFORMA Invoice ${invoice.invoice_number}`;
    doc.text(title, margin, y);
    y += 16;

    // Meta row labels
    doc.setFontSize(8);
    doc.setFont(undefined, "bold");
    const col1 = margin;
    const col2 = margin + 80;
    const col3 = margin + 160;
    doc.text("Invoice Date", col1, y);
    doc.text("Due Date", col2, y);
    doc.text("Source", col3, y);
    y += 5;

    // Meta values
    doc.setFont(undefined, "normal");
    doc.text(invoice.invoice_date || "", col1, y);
    doc.text(invoice.due_date || "", col2, y);
    doc.text(invoice.source || "", col3, y);
    y += 12;

    // Table header line
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;

    // Column headers
    doc.setFontSize(8);
    doc.setFont(undefined, "bold");
    const descX = margin;
    const qtyX = margin + 90;
    const unitX = margin + 125;
    const taxX = margin + 160;
    const amtX = pageWidth - margin;
    doc.text("Description", descX, y);
    doc.text("Quantity", qtyX, y);
    doc.text("Unit Price", unitX, y);
    doc.text("Taxes", taxX, y);
    doc.text("Amount", amtX, y, { align: "right" });
    y += 8;

    // Single line item
    doc.setFont(undefined, "normal");
    doc.text(invoice.description || "", descX, y);
    doc.text(invoice.quantity || "", qtyX, y);
    doc.text(invoice.unit_price || "", unitX, y);
    doc.text(invoice.taxes || "", taxX, y);
    doc.text(invoice.amount || "", amtX, y, { align: "right" });
    y += 10;

    // Second horizontal line
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // Untaxed amount & total section (right side)
    const labelX = pageWidth - margin - 60;
    const valueX = pageWidth - margin;
    doc.setFont(undefined, "normal");
    doc.text("Untaxed Amount", labelX, y);
    doc.text(invoice.untaxed_amount || "", valueX, y, { align: "right" });
    y += 6;
    doc.text("Total", labelX, y);
    doc.text(invoice.total || "", valueX, y, { align: "right" });
    y += 14;

    // Payment communication (two-line style)
    doc.setFontSize(8);
    doc.setFont(undefined, "normal");
    const paymentText =
      invoice.payment_communication ||
      `Payment Communication: ${invoice.invoice_number} on this account: MEEZAN BANK - Meezan Bank`;
    const lines = doc.splitTextToSize(paymentText, pageWidth - margin * 2);
    lines.forEach((line: string) => {
      doc.text(line, margin, y);
      y += 4;
    });

    doc.save(`invoice-${invoice.invoice_number || invoice.id}.pdf`);
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Invoice history table so each saved invoice appears as a row */}
      <Card className="bg-white border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>
              View and manage all generated proforma invoices.
            </CardDescription>
          </div>
          <Button onClick={openCreate}>
            <PlusCircle className="h-4 w-4 mr-2" />
            New Invoice
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-secondary-muted">
              Loading invoices...
            </div>
          ) : invoices.length === 0 ? (
            <div className="py-8 text-center text-secondary-muted">
              No invoices yet. Use the Invoice form to create the first one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Invoice Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-semibold">
                        {invoice.invoice_number}
                      </TableCell>
                      <TableCell>{invoice.invoice_date}</TableCell>
                      <TableCell>{invoice.due_date}</TableCell>
                      <TableCell>{invoice.source}</TableCell>
                      <TableCell>{invoice.amount}</TableCell>
                      <TableCell>{invoice.total}</TableCell>
                      <TableCell>
                        {new Date(invoice.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadPdf(invoice)}
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          PDF
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(invoice)}
                        >
                          <Edit2 className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => confirmDelete(invoice)}
                          disabled={isPending}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Primary interaction is through the modal */}
      <Dialog open={formOpen} onOpenChange={handleCloseForm}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="sr-only">
              {isEditing ? "Edit Invoice" : "New Invoice"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* HEADER: matches the top of the provided invoice */}
            <div className="flex flex-col gap-6">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                {/* Left: Logo + address */}
                <div className="space-y-1">
                  <div className="font-black text-xs tracking-[0.18em] uppercase">
                    LOGISTIX
                  </div>
                  <div className="text-xs text-secondary-muted leading-relaxed max-w-xs">
                    National Incubation Center, NED University, Karachi,
                    <br />
                    Karachi City, Sindh 75270
                  </div>
                </div>
                {/* Right: Tagline */}
                <div className="text-[11px] md:text-xs text-teal-700 font-semibold md:text-right">
                  Seamless, Strategic Logistics &amp; Financing
                </div>
              </div>

              {/* Center company name */}
              <div className="text-center text-xs text-secondary-muted mt-4">
                Cache Tech
              </div>

              {/* Title with dynamic invoice number (non-editable visual, but stored in hidden input) */}
              <div className="mt-10">
                <div className="text-teal-700 font-semibold text-xl">
                  PROFORMA Invoice{" "}
                  <span>{formState.invoice_number || "INV/2026/0001"}</span>
                </div>
                <input
                  type="hidden"
                  id="invoice_number"
                  name="invoice_number"
                  value={formState.invoice_number}
                />
              </div>
            </div>

            {/* META ROW: Invoice Date / Due Date / Source */}
            <div className="space-y-1 mt-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px] font-semibold text-teal-700">
                <div>Invoice Date</div>
                <div>Due Date</div>
                <div>Source</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  id="invoice_date"
                  name="invoice_date"
                  type="date"
                  value={formState.invoice_date}
                  onChange={(e) => handleFormChange("invoice_date", e.target.value)}
                  required
                />
                <Input
                  id="due_date"
                  name="due_date"
                  type="date"
                  value={formState.due_date}
                  onChange={(e) => handleFormChange("due_date", e.target.value)}
                  required
                />
                <Input
                  id="source"
                  name="source"
                  value={formState.source}
                  onChange={(e) => handleFormChange("source", e.target.value)}
                />
              </div>
            </div>

            {/* DESCRIPTION / QUANTITY / UNIT PRICE / TAXES / AMOUNT in a single row */}
            <div className="border-t border-slate-300 pt-4">
              <div className="grid grid-cols-[2fr,1fr,1fr,1fr,1fr] gap-4 items-start text-xs">
                <div className="flex flex-col gap-1">
                  <div className="text-[11px] font-semibold text-teal-700">
                    Description
                  </div>
                  <Input
                    id="description"
                    name="description"
                    value={formState.description}
                    onChange={(e) => handleFormChange("description", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="text-[11px] font-semibold text-teal-700">
                    Quantity
                  </div>
                  <Input
                    id="quantity"
                    name="quantity"
                    value={formState.quantity}
                    onChange={(e) => handleFormChange("quantity", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="text-[11px] font-semibold text-teal-700">
                    Unit Price
                  </div>
                  <Input
                    id="unit_price"
                    name="unit_price"
                    value={formState.unit_price}
                    onChange={(e) => handleFormChange("unit_price", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="text-[11px] font-semibold text-teal-700">
                    Taxes
                  </div>
                  <Input
                    id="taxes"
                    name="taxes"
                    value={formState.taxes}
                    onChange={(e) => handleFormChange("taxes", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="text-[11px] font-semibold text-teal-700 text-right">
                    Amount
                  </div>
                  <Input
                    id="amount"
                    name="amount"
                    value={formState.amount}
                    onChange={(e) => handleFormChange("amount", e.target.value)}
                    className="text-right"
                  />
                </div>
              </div>
              <div className="border-b border-slate-300 mt-3" />
            </div>

            {/* SUMMARY: Untaxed Amount (row) then Total (row) on the right side */}
            <div className="mt-6 flex flex-col items-end gap-3 text-xs">
              <div className="flex items-center gap-3 min-w-[260px]">
                <div className="flex-1 text-right text-[11px] font-semibold text-teal-700">
                  Untaxed Amount
                </div>
                <Input
                  id="untaxed_amount"
                  name="untaxed_amount"
                  value={formState.untaxed_amount}
                  onChange={(e) => handleFormChange("untaxed_amount", e.target.value)}
                  className="w-40 text-right"
                />
              </div>
              <div className="flex items-center gap-3 min-w-[260px]">
                <div className="flex-1 text-right text-[11px] font-semibold text-teal-700">
                  Total
                </div>
                <Input
                  id="total"
                  name="total"
                  value={formState.total}
                  onChange={(e) => handleFormChange("total", e.target.value)}
                  className="w-40 text-right"
                />
              </div>
            </div>

            {/* PAYMENT COMMUNICATION (two-line style like design) */}
            <div className="mt-8 space-y-1 text-xs">
              <div className="flex flex-col md:flex-row gap-1 md:items-baseline">
                <span className="font-semibold">Payment Communication:</span>
                <Input
                  id="payment_communication"
                  name="payment_communication"
                  value={formState.payment_communication}
                  onChange={(e) =>
                    handleFormChange("payment_communication", e.target.value)
                  }
                  className="md:flex-1"
                  placeholder="INV/2025/00144"
                />
              </div>
              <div className="flex flex-col md:flex-row gap-1 md:items-baseline">
                <span>on this account:</span>
                <Input
                  id="bank_account_line"
                  name="bank_account_line"
                  value="MEEZAN BANK - Meezan Bank"
                  readOnly
                  className="md:flex-1 font-semibold"
                />
              </div>
            </div>

            <DialogFooter className="mt-6 flex flex-col md:flex-row md:justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleCloseForm(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="secondary"
                disabled={isPending}
                onClick={() => setSubmitMode("save")}
              >
                {isPending && submitMode === "save" ? "Saving..." : "Save"}
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                onClick={() => setSubmitMode("save_print")}
              >
                {isPending && submitMode === "save_print"
                  ? "Saving..."
                  : "Save & Print"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Invoice</DialogTitle>
            <DialogDescription>
              This will permanently remove the invoice record. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

