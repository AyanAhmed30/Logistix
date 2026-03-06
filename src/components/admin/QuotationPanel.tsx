"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  createQuotation,
  deleteQuotation,
  getAllQuotations,
  updateQuotation,
  sendQuotation,
  confirmOrder,
  getQuotationLogs,
  logQuotationPrint,
  type Quotation,
  type QuotationStatus,
  type QuotationLog,
} from "@/app/actions/quotations";
import {
  createInvoiceFromSalesOrder,
  getInvoiceByQuotationId,
  type Invoice,
} from "@/app/actions/invoices";
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
import { PlusCircle, Trash2, Edit2, Send, CheckCircle, History, X, FileText, ExternalLink, Printer } from "lucide-react";
import jsPDF from "jspdf";
import { Badge } from "@/components/ui/badge";

type QuotationFormState = {
  id?: string;
  customer_name: string;
  product_service: string;
  quantity: string;
  unit_price: string;
  total_amount: string;
};

const emptyForm: QuotationFormState = {
  customer_name: "",
  product_service: "",
  quantity: "",
  unit_price: "",
  total_amount: "",
};

function formatStatus(status: QuotationStatus): string {
  switch (status) {
    case "quotation":
      return "Quotation";
    case "quotation_sent":
      return "Quotation Sent";
    case "sales_order":
      return "Sales Order";
    default:
      return status;
  }
}

function getStatusBadgeVariant(status: QuotationStatus): "default" | "secondary" | "outline" {
  switch (status) {
    case "quotation":
      return "outline";
    case "quotation_sent":
      return "secondary";
    case "sales_order":
      return "default";
    default:
      return "outline";
  }
}

export function QuotationPanel() {
  const router = useRouter();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<QuotationStatus>("quotation");
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Quotation | null>(null);
  const [logsTarget, setLogsTarget] = useState<Quotation | null>(null);
  const [logs, setLogs] = useState<QuotationLog[]>([]);
  const [formState, setFormState] = useState<QuotationFormState>(emptyForm);
  const [invoiceMap, setInvoiceMap] = useState<Record<string, Invoice>>({});

  const isEditing = Boolean(formState.id);

  useEffect(() => {
    fetchQuotations();
  }, [activeTab]);

  async function fetchQuotations() {
    setIsLoading(true);
    try {
      const result = await getAllQuotations(activeTab);
      if ("error" in result) {
        toast.error(result.error || "Unable to load quotations");
        setQuotations([]);
      } else {
        setQuotations(result.quotations || []);
        // Fetch invoices for sales orders
        if (activeTab === "sales_order") {
          const invoicePromises = result.quotations.map(async (q) => {
            const invoiceResult = await getInvoiceByQuotationId(q.id);
            if ("invoice" in invoiceResult && invoiceResult.invoice) {
              return { quotationId: q.id, invoice: invoiceResult.invoice };
            }
            return null;
          });
          const invoiceResults = await Promise.all(invoicePromises);
          const newInvoiceMap: Record<string, Invoice> = {};
          invoiceResults.forEach((result) => {
            if (result) {
              newInvoiceMap[result.quotationId] = result.invoice;
            }
          });
          setInvoiceMap(newInvoiceMap);
        } else {
          setInvoiceMap({});
        }
      }
    } catch {
      toast.error("An unexpected error occurred while loading quotations");
      setQuotations([]);
    } finally {
      setIsLoading(false);
    }
  }

  function openCreate() {
    setFormState(emptyForm);
    setFormOpen(true);
  }

  function openEdit(quotation: Quotation) {
    setFormState({
      id: quotation.id,
      customer_name: quotation.customer_name,
      product_service: quotation.product_service,
      quantity: String(quotation.quantity),
      unit_price: String(quotation.unit_price),
      total_amount: String(quotation.total_amount),
    });
    setFormOpen(true);
  }

  function handleFormChange<K extends keyof QuotationFormState>(key: K, value: string) {
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
      const action = formState.id ? updateQuotation : createQuotation;
      const result = await action(fd);

      if ("error" in result) {
        toast.error(result.error || "Unable to save quotation");
        return;
      }

      toast.success("Quotation saved", {
        className: "bg-green-500 text-white border-green-500",
      });
      handleCloseForm(false);
      await fetchQuotations();
      router.refresh();
    });
  }

  function confirmDelete(quotation: Quotation) {
    setDeleteTarget(quotation);
    setDeleteOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    startTransition(async () => {
      const result = await deleteQuotation(deleteTarget.id);
      if ("error" in result) {
        toast.error(result.error || "Unable to delete quotation");
        return;
      }
      toast.success("Quotation deleted", {
        className: "bg-green-500 text-white border-green-500",
      });
      setDeleteOpen(false);
      setDeleteTarget(null);
      await fetchQuotations();
      router.refresh();
    });
  }

  async function handleSendQuotation(quotation: Quotation) {
    startTransition(async () => {
      const result = await sendQuotation(quotation.id);
      if ("error" in result) {
        toast.error(result.error || "Unable to send quotation");
        return;
      }
      toast.success("Quotation sent", {
        className: "bg-green-500 text-white border-green-500",
      });
      await fetchQuotations();
      router.refresh();
    });
  }

  async function handleConfirmOrder(quotation: Quotation) {
    startTransition(async () => {
      const result = await confirmOrder(quotation.id);
      if ("error" in result) {
        toast.error(result.error || "Unable to confirm order");
        return;
      }
      toast.success("Order confirmed", {
        className: "bg-green-500 text-white border-green-500",
      });
      await fetchQuotations();
      router.refresh();
    });
  }

  async function handleCreateInvoice(quotation: Quotation) {
    startTransition(async () => {
      const result = await createInvoiceFromSalesOrder(quotation.id);
      if ("error" in result) {
        toast.error(result.error || "Unable to create invoice");
        return;
      }
      toast.success("Invoice created successfully", {
        className: "bg-green-500 text-white border-green-500",
      });
      await fetchQuotations();
      router.refresh();
    });
  }

  async function openLogs(quotation: Quotation) {
    setLogsTarget(quotation);
    setLogsOpen(true);
    const result = await getQuotationLogs(quotation.id);
    if ("error" in result) {
      toast.error(result.error || "Unable to load logs");
      setLogs([]);
    } else {
      setLogs(result.logs || []);
    }
  }

  async function handlePrintQuotation(quotation: Quotation) {
    startTransition(async () => {
      // Log the print action
      await logQuotationPrint(quotation.id);
      
      // Generate and download PDF
      downloadQuotationPdf(quotation);
    });
  }

  function downloadQuotationPdf(quotation: Quotation) {
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

    // Document Title: QUOTATION
    doc.setFontSize(18);
    doc.setFont(undefined, "bold");
    doc.setTextColor(0, 128, 128);
    doc.text("QUOTATION", pageWidth / 2, y, { align: "center" });
    y += 10;

    // Quotation Number and Date
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.setTextColor(0, 0, 0);
    const quotationNumber = `QT-${quotation.id.substring(0, 8).toUpperCase()}`;
    doc.text(`Quotation Number: ${quotationNumber}`, margin, y);
    const quotationDate = new Date(quotation.created_at).toLocaleDateString();
    doc.text(`Quotation Date: ${quotationDate}`, pageWidth - margin, y, { align: "right" });
    y += 12;

    // Customer Details Section
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text("Customer Details:", margin, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text(`Customer Name: ${quotation.customer_name}`, margin + 5, y);
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
    doc.text(quotation.product_service, descX, y);
    doc.text(String(quotation.quantity), qtyX, y);
    doc.text(`Rs. ${quotation.unit_price.toFixed(2)}`, unitX, y);
    doc.text(`Rs. ${quotation.total_amount.toFixed(2)}`, totalX, y, { align: "right" });
    y += 10;

    // Bottom line
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // Total Amount (right-aligned)
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("Total Amount:", pageWidth - margin - 50, y);
    doc.text(`Rs. ${quotation.total_amount.toFixed(2)}`, totalX, y, { align: "right" });
    y += 12;

    // Quotation Status
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text(`Status: ${formatStatus(quotation.status)}`, margin, y);
    y += 15;

    // Footer Notes
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text("This quotation is valid for 30 days from the date of issue.", margin, y);
    y += 5;
    doc.text("For any queries, please contact us at the above address.", margin, y);
    y += 5;
    doc.text(`Generated on: ${new Date().toLocaleString()}`, margin, y);

    // Save PDF
    doc.save(`quotation-${quotationNumber}.pdf`);
  }

  const filteredQuotations = quotations.filter((q) => q.status === activeTab);

  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Sales Management</h2>
          <p className="text-sm text-secondary-muted">
            Manage quotations through the sales workflow
          </p>
        </div>
        <Button onClick={openCreate} className="create-console-btn">
          <PlusCircle className="h-4 w-4 mr-2" />
          New Quotation
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b overflow-x-auto">
        <Button
          variant={activeTab === "quotation" ? "default" : "ghost"}
          onClick={() => setActiveTab("quotation")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeTab === "quotation" ? "default" : "outline"}
        >
          <span className="sidebar-text">Quotations</span>
        </Button>
        <Button
          variant={activeTab === "quotation_sent" ? "default" : "ghost"}
          onClick={() => setActiveTab("quotation_sent")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeTab === "quotation_sent" ? "default" : "outline"}
        >
          <span className="sidebar-text">Quotations Sent</span>
        </Button>
        <Button
          variant={activeTab === "sales_order" ? "default" : "ghost"}
          onClick={() => setActiveTab("sales_order")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeTab === "sales_order" ? "default" : "outline"}
        >
          <span className="sidebar-text">Sales Orders</span>
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-secondary-muted">
              Loading quotations...
            </div>
          ) : filteredQuotations.length === 0 ? (
            <div className="py-16 text-center text-secondary-muted">
              No quotations found in this stage.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product/Service</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQuotations.map((quotation) => (
                    <TableRow key={quotation.id}>
                      <TableCell className="font-semibold">
                        {quotation.customer_name}
                      </TableCell>
                      <TableCell>{quotation.product_service}</TableCell>
                      <TableCell>{quotation.quantity}</TableCell>
                      <TableCell>Rs. {quotation.unit_price.toFixed(2)}</TableCell>
                      <TableCell className="font-semibold">
                        Rs. {quotation.total_amount.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(quotation.status)}>
                          {formatStatus(quotation.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePrintQuotation(quotation)}
                            title="Print Quotation"
                            disabled={isPending}
                          >
                            <Printer className="h-4 w-4 mr-1" />
                            Print
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openLogs(quotation)}
                            title="View History"
                          >
                            <History className="h-4 w-4" />
                          </Button>
                          {quotation.status === "quotation" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEdit(quotation)}
                              >
                                <Edit2 className="h-4 w-4 mr-1" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleSendQuotation(quotation)}
                                disabled={isPending}
                              >
                                <Send className="h-4 w-4 mr-1" />
                                Send Quotation
                              </Button>
                            </>
                          )}
                          {quotation.status === "quotation_sent" && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleConfirmOrder(quotation)}
                              disabled={isPending}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Confirm Order
                            </Button>
                          )}
                          {quotation.status === "sales_order" && (
                            <>
                              {invoiceMap[quotation.id] ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    toast.info(`Invoice: ${invoiceMap[quotation.id].invoice_number}`, {
                                      description: "View in Customer Invoice tab",
                                    });
                                  }}
                                >
                                  <ExternalLink className="h-4 w-4 mr-1" />
                                  View Invoice
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => handleCreateInvoice(quotation)}
                                  disabled={isPending}
                                >
                                  <FileText className="h-4 w-4 mr-1" />
                                  Create Invoice
                                </Button>
                              )}
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => confirmDelete(quotation)}
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

      {/* Create/Edit Modal */}
      <Dialog open={formOpen} onOpenChange={handleCloseForm}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Quotation" : "New Quotation"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update the quotation details below."
                : "Create a new quotation to start the sales workflow."}
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
                {isPending ? "Saving..." : isEditing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Quotation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this quotation? This action cannot be undone.
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
              Complete activity log for this quotation
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
                  const details = log.details as any;
                  const hasChanges =
                    log.action === "updated" &&
                    details?.previous &&
                    details?.new;

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
                          {log.action === "printed" && "Quotation Printed"}
                        </span>
                        <span className="text-xs text-secondary-muted">
                          {new Date(log.performed_at).toLocaleString()}
                        </span>
                      </div>
                      {log.action === "status_changed" && (
                        <div className="text-sm text-secondary-muted">
                          {log.previous_status && (
                            <span>
                              From: <strong>{formatStatus(log.previous_status as QuotationStatus)}</strong>
                            </span>
                          )}
                          {log.previous_status && log.new_status && " → "}
                          {log.new_status && (
                            <span>
                              To: <strong>{formatStatus(log.new_status as QuotationStatus)}</strong>
                            </span>
                          )}
                        </div>
                      )}
                      {hasChanges && (
                        <div className="text-sm space-y-1 mt-2">
                          {(details.previous.quantity !== details.new.quantity ||
                            details.previous.unit_price !== details.new.unit_price ||
                            details.previous.total_amount !== details.new.total_amount) && (
                            <div className="bg-slate-50 p-2 rounded space-y-1">
                              {details.previous.quantity !== details.new.quantity && (
                                <div className="text-xs">
                                  <span className="text-secondary-muted">Quantity: </span>
                                  <span className="line-through text-red-600">
                                    {details.previous.quantity}
                                  </span>
                                  {" → "}
                                  <span className="text-green-600 font-semibold">
                                    {details.new.quantity}
                                  </span>
                                </div>
                              )}
                              {details.previous.unit_price !== details.new.unit_price && (
                                <div className="text-xs">
                                  <span className="text-secondary-muted">Unit Price: </span>
                                  <span className="line-through text-red-600">
                                    Rs. {parseFloat(details.previous.unit_price).toFixed(2)}
                                  </span>
                                  {" → "}
                                  <span className="text-green-600 font-semibold">
                                    Rs. {parseFloat(details.new.unit_price).toFixed(2)}
                                  </span>
                                </div>
                              )}
                              {details.previous.total_amount !== details.new.total_amount && (
                                <div className="text-xs">
                                  <span className="text-secondary-muted">Total Amount: </span>
                                  <span className="line-through text-red-600">
                                    Rs. {parseFloat(details.previous.total_amount).toFixed(2)}
                                  </span>
                                  {" → "}
                                  <span className="text-green-600 font-semibold">
                                    Rs. {parseFloat(details.new.total_amount).toFixed(2)}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                          {(details.previous.customer_name !== details.new.customer_name ||
                            details.previous.product_service !== details.new.product_service) && (
                            <div className="text-xs text-secondary-muted space-y-0.5">
                              {details.previous.customer_name !== details.new.customer_name && (
                                <div>
                                  Customer:{" "}
                                  <span className="line-through">{details.previous.customer_name}</span> →{" "}
                                  <span className="font-semibold">{details.new.customer_name}</span>
                                </div>
                              )}
                              {details.previous.product_service !== details.new.product_service && (
                                <div>
                                  Product/Service:{" "}
                                  <span className="line-through">{details.previous.product_service}</span> →{" "}
                                  <span className="font-semibold">{details.new.product_service}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {log.action === "created" && details && (
                        <div className="text-xs text-secondary-muted space-y-0.5 mt-1">
                          <div>Quantity: {details.quantity}</div>
                          <div>Unit Price: Rs. {parseFloat(details.unit_price).toFixed(2)}</div>
                          <div>Total Amount: Rs. {parseFloat(details.total_amount).toFixed(2)}</div>
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
