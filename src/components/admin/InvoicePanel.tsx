"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  getAllInvoices,
  updateInvoice,
  deleteInvoice,
  confirmInvoice,
  registerPayment,
  getInvoiceLogs,
  logInvoicePrint,
  type Invoice,
  type InvoiceStatus,
  type InvoiceLog,
} from "@/app/actions/invoices";
import { Card, CardContent } from "@/components/ui/card";
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
import { Trash2, Edit2, CheckCircle, DollarSign, History, Printer } from "lucide-react";
import jsPDF from "jspdf";
import { Badge } from "@/components/ui/badge";

function formatStatus(status: InvoiceStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "posted":
      return "Posted";
    case "paid":
      return "Paid";
    default:
      return status;
  }
}

function formatPaymentStatus(status: string): string {
  switch (status) {
    case "unpaid":
      return "Unpaid";
    case "paid":
      return "Paid";
    case "partial":
      return "Partial";
    default:
      return status;
  }
}

function getStatusBadgeVariant(status: InvoiceStatus): "default" | "secondary" | "outline" {
  switch (status) {
    case "draft":
      return "outline";
    case "posted":
      return "secondary";
    case "paid":
      return "default";
    default:
      return "outline";
  }
}

type InvoiceFormState = {
  id?: string;
  customer_name: string;
  product_service: string;
  quantity: string;
  unit_price: string;
  total_amount: string;
  invoice_date: string;
};

export function InvoicePanel() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<InvoiceStatus>("draft");
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [logs, setLogs] = useState<InvoiceLog[]>([]);
  const [formState, setFormState] = useState<InvoiceFormState>({
    customer_name: "",
    product_service: "",
    quantity: "",
    unit_price: "",
    total_amount: "",
    invoice_date: "",
  });

  useEffect(() => {
    fetchInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  async function fetchInvoices() {
    setIsLoading(true);
    try {
      const result = await getAllInvoices(activeTab);
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

  function openEdit(invoice: Invoice) {
    setFormState({
      id: invoice.id,
      customer_name: invoice.customer_name,
      product_service: invoice.product_service,
      quantity: String(invoice.quantity),
      unit_price: String(invoice.unit_price),
      total_amount: String(invoice.total_amount),
      invoice_date: invoice.invoice_date,
    });
    setFormOpen(true);
  }

  function handleFormChange<K extends keyof InvoiceFormState>(key: K, value: string) {
    setFormState((prev) => {
      const updated = { ...prev, [key]: value };
      // Auto-calculate total_amount if quantity or unit_price changes
      if (key === "quantity" || key === "unit_price") {
        const qty = parseFloat(updated.quantity) || 0;
        const price = parseFloat(updated.unit_price) || 0;
        updated.total_amount = (qty * price).toFixed(2);
      }
      return updated;
    });
  }

  function handleCloseForm(open: boolean) {
    setFormOpen(open);
    if (!open) {
      setFormState({
        customer_name: "",
        product_service: "",
        quantity: "",
        unit_price: "",
        total_amount: "",
        invoice_date: "",
      });
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
      const result = await updateInvoice(fd);

      if ("error" in result) {
        toast.error(result.error || "Unable to save invoice");
        return;
      }

      toast.success("Invoice updated", {
        className: "bg-green-500 text-white border-green-500",
      });
      handleCloseForm(false);
      await fetchInvoices();
      router.refresh();
    });
  }

  function confirmDelete(invoice: Invoice) {
    setDeleteTarget(invoice);
    setDeleteOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    startTransition(async () => {
      const result = await deleteInvoice(deleteTarget.id);
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

  async function handleConfirmInvoice(invoice: Invoice) {
    startTransition(async () => {
      const result = await confirmInvoice(invoice.id);
      if ("error" in result) {
        toast.error(result.error || "Unable to confirm invoice");
        return;
      }
      toast.success("Invoice confirmed", {
        className: "bg-green-500 text-white border-green-500",
      });
      await fetchInvoices();
      router.refresh();
    });
  }

  async function handleRegisterPayment(invoice: Invoice) {
    startTransition(async () => {
      const result = await registerPayment(invoice.id);
      if ("error" in result) {
        toast.error(result.error || "Unable to register payment");
        return;
      }
      toast.success("Payment registered", {
        className: "bg-green-500 text-white border-green-500",
      });
      await fetchInvoices();
      router.refresh();
    });
  }

  async function openLogs(invoice: Invoice) {
    setLogsOpen(true);
    const result = await getInvoiceLogs(invoice.id);
    if ("error" in result) {
      toast.error(result.error || "Unable to load logs");
      setLogs([]);
    } else {
      setLogs(result.logs || []);
    }
  }

  async function handlePrintInvoice(invoice: Invoice) {
    startTransition(async () => {
      // Log the print action
      await logInvoicePrint(invoice.id);
      
      // Generate and download PDF
      downloadInvoicePdf(invoice);
    });
  }

  function downloadInvoicePdf(invoice: Invoice) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = margin;

    // Header: Company name (top-left)
    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.setTextColor(0, 128, 128); // Teal color
    doc.text("LOGISTIX", margin, y);
    
    // Tagline (top-right)
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(
      "Seamless, Strategic Logistics & Financing",
      pageWidth - margin,
      y,
      { align: "right" }
    );
    y += 8;

    // Company contact details (under logo)
    doc.setFontSize(9);
    const addressLines = [
      "National Incubation Center, NED University, Karachi,",
      "Karachi City, Sindh 75270",
    ];
    addressLines.forEach((line) => {
      doc.text(line, margin, y);
      y += 5;
    });
    y += 10;

    // Document Title: INVOICE
    doc.setFontSize(18);
    doc.setFont(undefined, "bold");
    doc.setTextColor(0, 128, 128);
    doc.text("INVOICE", pageWidth / 2, y, { align: "center" });
    y += 10;

    // Invoice Number and Date
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(`Invoice Number: ${invoice.invoice_number}`, margin, y);
    const invoiceDate = new Date(invoice.invoice_date).toLocaleDateString();
    doc.text(`Invoice Date: ${invoiceDate}`, pageWidth - margin, y, { align: "right" });
    y += 12;

    // Customer Details Section
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text("Customer Details:", margin, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text(`Customer Name: ${invoice.customer_name}`, margin + 5, y);
    y += 6;
    doc.text("Customer Contact: [To be filled]", margin + 5, y);
    y += 10;

    // Horizontal line
    doc.setDrawColor(200);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // Product/Service Table Header
    doc.setFontSize(10);
    doc.setFont(undefined, "bold");
    const descX = margin;
    const qtyX = margin + 90;
    const unitX = margin + 130;
    const totalX = pageWidth - margin;
    
    doc.text("Product/Service", descX, y);
    doc.text("Quantity", qtyX, y);
    doc.text("Unit Price", unitX, y);
    doc.text("Total Amount", totalX, y, { align: "right" });
    y += 6;

    // Table line
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    y += 7;

    // Product/Service Row
    doc.setFont(undefined, "normal");
    doc.text(invoice.product_service, descX, y);
    doc.text(String(invoice.quantity), qtyX, y);
    doc.text(`Rs. ${invoice.unit_price.toFixed(2)}`, unitX, y);
    doc.text(`Rs. ${invoice.total_amount.toFixed(2)}`, totalX, y, { align: "right" });
    y += 10;

    // Bottom line
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // Total Amount (right-aligned)
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("Total Amount:", pageWidth - margin - 50, y);
    doc.text(`Rs. ${invoice.total_amount.toFixed(2)}`, totalX, y, { align: "right" });
    y += 12;

    // Payment Status and Invoice Status
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text(`Payment Status: ${formatPaymentStatus(invoice.payment_status)}`, margin, y);
    y += 6;
    doc.text(`Invoice Status: ${formatStatus(invoice.invoice_status)}`, margin, y);
    y += 15;

    // Footer Notes
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text("Payment Terms: Net 30 days", margin, y);
    y += 5;
    doc.text("Please make payment to the account details provided.", margin, y);
    y += 5;
    doc.text(`Generated on: ${new Date().toLocaleString()}`, margin, y);

    // Save PDF
    doc.save(`invoice-${invoice.invoice_number}.pdf`);
  }

  const filteredInvoices = invoices.filter((i) => i.invoice_status === activeTab);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Invoice Management</h2>
          <p className="text-sm text-secondary-muted">
            Manage invoices through the invoicing workflow
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b overflow-x-auto">
        <Button
          variant={activeTab === "draft" ? "default" : "ghost"}
          onClick={() => setActiveTab("draft")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeTab === "draft" ? "default" : "outline"}
        >
          <span className="sidebar-text">Draft</span>
        </Button>
        <Button
          variant={activeTab === "posted" ? "default" : "ghost"}
          onClick={() => setActiveTab("posted")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeTab === "posted" ? "default" : "outline"}
        >
          <span className="sidebar-text">Posted</span>
        </Button>
        <Button
          variant={activeTab === "paid" ? "default" : "ghost"}
          onClick={() => setActiveTab("paid")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeTab === "paid" ? "default" : "outline"}
        >
          <span className="sidebar-text">Paid</span>
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-secondary-muted">
              Loading invoices...
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="py-16 text-center text-secondary-muted">
              No invoices found in this stage.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice Number</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product/Service</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Total Amount</TableHead>
                    <TableHead>Invoice Date</TableHead>
                    <TableHead>Payment Status</TableHead>
                    <TableHead>Invoice Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-semibold">
                        {invoice.invoice_number}
                      </TableCell>
                      <TableCell>{invoice.customer_name}</TableCell>
                      <TableCell>{invoice.product_service}</TableCell>
                      <TableCell>{invoice.quantity}</TableCell>
                      <TableCell className="font-semibold">
                        Rs. {invoice.total_amount.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {new Date(invoice.invoice_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {formatPaymentStatus(invoice.payment_status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(invoice.invoice_status)}>
                          {formatStatus(invoice.invoice_status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePrintInvoice(invoice)}
                            title="Print Invoice"
                            disabled={isPending}
                          >
                            <Printer className="h-4 w-4 mr-1" />
                            Print
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openLogs(invoice)}
                            title="View History"
                          >
                            <History className="h-4 w-4" />
                          </Button>
                          {invoice.invoice_status === "draft" && (
                            <>
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
                                variant="default"
                                onClick={() => handleConfirmInvoice(invoice)}
                                disabled={isPending}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Confirm Invoice
                              </Button>
                            </>
                          )}
                          {invoice.invoice_status === "posted" && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleRegisterPayment(invoice)}
                              disabled={isPending}
                            >
                              <DollarSign className="h-4 w-4 mr-1" />
                              Register Payment
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => confirmDelete(invoice)}
                            disabled={isPending}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Dialog open={formOpen} onOpenChange={handleCloseForm}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Invoice</DialogTitle>
            <DialogDescription>
              Update the invoice details below.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="customer_name">Customer Name *</Label>
                <Input
                  id="customer_name"
                  name="customer_name"
                  value={formState.customer_name}
                  onChange={(e) => handleFormChange("customer_name", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product_service">Product/Service *</Label>
                <Input
                  id="product_service"
                  name="product_service"
                  value={formState.product_service}
                  onChange={(e) => handleFormChange("product_service", e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity *</Label>
                  <Input
                    id="quantity"
                    name="quantity"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formState.quantity}
                    onChange={(e) => handleFormChange("quantity", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit_price">Unit Price *</Label>
                  <Input
                    id="unit_price"
                    name="unit_price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formState.unit_price}
                    onChange={(e) => handleFormChange("unit_price", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="total_amount">Total Amount *</Label>
                  <Input
                    id="total_amount"
                    name="total_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formState.total_amount}
                    onChange={(e) => handleFormChange("total_amount", e.target.value)}
                    required
                    readOnly
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoice_date">Invoice Date *</Label>
                <Input
                  id="invoice_date"
                  name="invoice_date"
                  type="date"
                  value={formState.invoice_date}
                  onChange={(e) => handleFormChange("invoice_date", e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleCloseForm(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Update"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Invoice</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this invoice? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activity Logs Modal */}
      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Activity History</DialogTitle>
            <DialogDescription>
              Complete activity log for this invoice
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {logs.length === 0 ? (
              <div className="py-8 text-center text-secondary-muted">
                No activity logs found.
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => {
                  const details = log.details as 
                    | { previous?: { quantity?: unknown; unit_price?: unknown; total_amount?: unknown }; new?: { quantity?: unknown; unit_price?: unknown; total_amount?: unknown } }
                    | { quantity?: unknown; unit_price?: unknown; total_amount?: unknown }
                    | null;
                  const hasChanges =
                    log.action === "updated" &&
                    details &&
                    'previous' in details &&
                    'new' in details &&
                    details.previous &&
                    details.new;
                  const isCreatedDetails = log.action === "created" && details && !('previous' in details);

                  return (
                    <div
                      key={log.id}
                      className="border-l-2 border-slate-300 pl-4 py-2 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">
                          {log.action === "created" && "Created"}
                          {log.action === "updated" && "Updated"}
                          {log.action === "deleted" && "Deleted"}
                          {log.action === "status_changed" && "Status Changed"}
                          {log.action === "payment_registered" && "Payment Registered"}
                          {log.action === "printed" && "Invoice Printed"}
                        </span>
                        <span className="text-xs text-secondary-muted">
                          {new Date(log.performed_at).toLocaleString()}
                        </span>
                      </div>
                      {log.action === "status_changed" && (
                        <div className="text-sm text-secondary-muted">
                          {log.previous_status && (
                            <span>
                              From: <strong>{formatStatus(log.previous_status as InvoiceStatus)}</strong>
                            </span>
                          )}
                          {log.previous_status && log.new_status && " → "}
                          {log.new_status && (
                            <span>
                              To: <strong>{formatStatus(log.new_status as InvoiceStatus)}</strong>
                            </span>
                          )}
                        </div>
                      )}
                      {log.action === "payment_registered" && (
                        <div className="text-sm text-secondary-muted">
                          Payment registered - Invoice marked as Paid
                        </div>
                      )}
                      {hasChanges && details && details.previous && details.new && (
                        <div className="text-sm space-y-1 mt-2">
                          {(details.previous.quantity !== details.new.quantity ||
                            details.previous.unit_price !== details.new.unit_price ||
                            details.previous.total_amount !== details.new.total_amount) && (
                            <div className="bg-slate-50 p-2 rounded space-y-1">
                              {details.previous.quantity !== details.new.quantity && (
                                <div className="text-xs">
                                  <span className="text-secondary-muted">Quantity: </span>
                                  <span className="line-through text-red-600">
                                    {String(details.previous.quantity ?? '')}
                                  </span>
                                  {" → "}
                                  <span className="text-green-600 font-semibold">
                                    {String(details.new.quantity ?? '')}
                                  </span>
                                </div>
                              )}
                              {details.previous.unit_price !== details.new.unit_price && (
                                <div className="text-xs">
                                  <span className="text-secondary-muted">Unit Price: </span>
                                  <span className="line-through text-red-600">
                                    Rs. {parseFloat(String(details.previous.unit_price ?? '0')).toFixed(2)}
                                  </span>
                                  {" → "}
                                  <span className="text-green-600 font-semibold">
                                    Rs. {parseFloat(String(details.new.unit_price ?? '0')).toFixed(2)}
                                  </span>
                                </div>
                              )}
                              {details.previous.total_amount !== details.new.total_amount && (
                                <div className="text-xs">
                                  <span className="text-secondary-muted">Total Amount: </span>
                                  <span className="line-through text-red-600">
                                    Rs. {parseFloat(String(details.previous.total_amount ?? '0')).toFixed(2)}
                                  </span>
                                  {" → "}
                                  <span className="text-green-600 font-semibold">
                                    Rs. {parseFloat(String(details.new.total_amount ?? '0')).toFixed(2)}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {isCreatedDetails && (
                        <div className="text-xs text-secondary-muted space-y-0.5 mt-1">
                          <div>Quantity: {String((details as { quantity?: unknown; unit_price?: unknown; total_amount?: unknown }).quantity ?? '')}</div>
                          <div>Unit Price: Rs. {parseFloat(String((details as { quantity?: unknown; unit_price?: unknown; total_amount?: unknown }).unit_price ?? '0')).toFixed(2)}</div>
                          <div>Total Amount: Rs. {parseFloat(String((details as { quantity?: unknown; unit_price?: unknown; total_amount?: unknown }).total_amount ?? '0')).toFixed(2)}</div>
                        </div>
                      )}
                      <div className="text-xs text-secondary-muted">
                        By: {log.performed_by}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
