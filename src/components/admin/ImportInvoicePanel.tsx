"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createImportInvoice, getAllImportInvoices, deleteImportInvoice, type ImportInvoice, type ImportInvoiceItem } from "@/app/actions/import_invoices";
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
import { PlusCircle, FileText, Trash2, X } from "lucide-react";
import jsPDF from "jspdf";

export function ImportInvoicePanel() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<ImportInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ImportInvoice | null>(null);
  const [isPending, startTransition] = useTransition();

  type ProductItem = {
    product_name: string;
    hs_code: string;
    unit: string;
    no_of_units: string;
    unit_price: string;
    total_amount: string;
  };

  const [formData, setFormData] = useState({
    invoice_no: "",
    bill_to_name: "",
    bill_to_address: "",
    bill_to_ntn: "",
    bill_to_phone: "",
    bill_to_email: "",
    ship_to_name: "",
    ship_to_address: "",
    ship_to_ntn: "",
    ship_to_phone: "",
    ship_to_email: "",
    payment_terms: "",
    shipped_via: "",
    coo: "",
    port_loading: "",
    port_discharge: "",
    shipping_terms: "",
    exporter_bank_name: "",
    exporter_bank_address: "",
    exporter_bank_swift: "",
    exporter_account_name: "",
    exporter_account_address: "",
    exporter_account_number: "",
    importer_bank_name: "",
    importer_bank_address: "",
    importer_bank_swift: "",
    importer_account_name: "",
    importer_account_address: "",
    importer_account_number: "",
    importer_iban_number: "",
  });

  const [products, setProducts] = useState<ProductItem[]>([
    {
      product_name: "",
      hs_code: "",
      unit: "",
      no_of_units: "",
      unit_price: "",
      total_amount: "",
    },
  ]);

  useEffect(() => {
    fetchInvoices();
  }, []);

  async function fetchInvoices() {
    setIsLoading(true);
    try {
      const result = await getAllImportInvoices();
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

  function calculateTotalAmount(noOfUnits: string, unitPrice: string): string {
    const units = parseFloat(noOfUnits) || 0;
    const price = parseFloat(unitPrice) || 0;
    return (units * price).toFixed(2);
  }

  function generatePDF(invoice: ImportInvoice) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let y = margin;

    // Company Header (Top Center)
    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.text("DJS EXPORT CO., LIMITED", pageWidth / 2, y, { align: "center" });
    y += 7;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text("FLAT/RM 504,5/F HO KING COMMERCIAL CENTER", pageWidth / 2, y, { align: "center" });
    y += 5;
    doc.text("2-16 FA YUEN STREET MONG KOK KOWLOON, HONG KONG", pageWidth / 2, y, { align: "center" });
    y += 10;

    // Document Title (Centered)
    doc.setFontSize(18);
    doc.setFont(undefined, "bold");
    doc.text("COMMERCIAL INVOICE", pageWidth / 2, y, { align: "center" });
    y += 10;

    // Invoice No and Date (Top Right)
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    const invoiceNo = invoice.invoice_no || `INV-${invoice.id.substring(0, 8).toUpperCase()}`;
    const date = new Date(invoice.created_at).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    doc.text(`INVOICE NO.: ${invoiceNo}`, pageWidth - margin, margin + 5, { align: "right" });
    doc.text(`DATE: ${date}`, pageWidth - margin, margin + 10, { align: "right" });
    y += 5;

    // Bill To and Ship To Sections (Side by Side)
    const billToStartY = y;
    const columnWidth = (pageWidth - margin * 3) / 2;
    const leftColumnX = margin;
    const rightColumnX = pageWidth / 2 + margin / 2;

    // Bill To Section (Left)
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text("Bill To:", leftColumnX, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    const billToName = invoice.bill_to_name || "";
    const billToAddress = invoice.bill_to_address || "";
    const billToNtn = invoice.bill_to_ntn || "";
    const billToPhone = invoice.bill_to_phone || "";
    const billToEmail = invoice.bill_to_email || "";
    
    doc.text(billToName, leftColumnX, y);
    y += 5;
    if (billToAddress) {
      const addressLines = doc.splitTextToSize(billToAddress, columnWidth - 5);
      addressLines.forEach((line: string) => {
        doc.text(line, leftColumnX, y);
        y += 5;
      });
    }
    if (billToNtn) {
      doc.text(`NTN NO: ${billToNtn}`, leftColumnX, y);
      y += 5;
    }
    if (billToPhone) {
      doc.text(`Phone: ${billToPhone}`, leftColumnX, y);
      y += 5;
    }
    if (billToEmail) {
      doc.text(`Email: ${billToEmail}`, leftColumnX, y);
      y += 5;
    }

    // Ship To Section (Right)
    let shipToY = billToStartY;
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text("Ship To:", rightColumnX, shipToY);
    shipToY += 6;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    const shipToName = invoice.ship_to_name || "";
    const shipToAddress = invoice.ship_to_address || "";
    const shipToNtn = invoice.ship_to_ntn || "";
    const shipToPhone = invoice.ship_to_phone || "";
    const shipToEmail = invoice.ship_to_email || "";
    
    doc.text(shipToName, rightColumnX, shipToY);
    shipToY += 5;
    if (shipToAddress) {
      const addressLines = doc.splitTextToSize(shipToAddress, columnWidth - 5);
      addressLines.forEach((line: string) => {
        doc.text(line, rightColumnX, shipToY);
        shipToY += 5;
      });
    }
    if (shipToNtn) {
      doc.text(`NTN NO. ${shipToNtn}`, rightColumnX, shipToY);
      shipToY += 5;
    }
    if (shipToPhone) {
      doc.text(`Phone: ${shipToPhone}`, rightColumnX, shipToY);
      shipToY += 5;
    }
    if (shipToEmail) {
      doc.text(`Email: ${shipToEmail}`, rightColumnX, shipToY);
      shipToY += 5;
    }

    // Payment and Shipping Details Section
    y = Math.max(y, shipToY) + 8;
    const detailsStartY = y;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    const paymentTerms = invoice.payment_terms || "";
    const shippedVia = invoice.shipped_via || "";
    const coo = invoice.coo || "";
    const portLoading = invoice.port_loading || "";
    const portDischarge = invoice.port_discharge || "";
    const shippingTerms = invoice.shipping_terms || "";
    
    if (paymentTerms) {
      doc.text(`Payment Terms: ${paymentTerms}`, leftColumnX, y);
      y += 5;
    }
    if (portLoading && portDischarge) {
      doc.text(`Port of Loading/Discharge: ${portLoading}/${portDischarge}`, leftColumnX, y);
      y += 5;
    }
    if (shippedVia) {
      doc.text(`Shipped Via: ${shippedVia}`, rightColumnX, detailsStartY);
    }
    let rightY = detailsStartY + 5;
    if (shippingTerms) {
      doc.text(`Shipping Terms: ${shippingTerms}`, rightColumnX, rightY);
      rightY += 5;
    }
    if (coo) {
      doc.text(`COO: ${coo}`, rightColumnX, rightY);
      rightY += 5;
    }
    y = Math.max(y, rightY) + 8;

    // Product Table
    const tableStartY = y;
    const colWidths = [12, 65, 20, 15, 20, 20, 25]; // S.no, Product, HS Code, Unit, No of Units, Unit Price, Total Amount
    const colHeaders = ["S.no", "Product", "HS Code", "Unit", "No of Units", "Unit Price", "Total Amount"];
    const tableWidth = colWidths.reduce((sum, w) => sum + w, 0);
    const tableStartX = margin;
    const rowHeight = 7;

    // Get products from items array
    const invoiceProducts = invoice.items && invoice.items.length > 0
      ? invoice.items.sort((a: ImportInvoiceItem, b: ImportInvoiceItem) => (a.item_order || 0) - (b.item_order || 0))
      : [];

    // Draw table header with borders
    doc.setLineWidth(0.5);
    doc.rect(tableStartX, tableStartY - rowHeight, tableWidth, rowHeight);
    
    // Draw vertical lines between columns for header
    let xPos = tableStartX;
    for (let i = 0; i < colWidths.length; i++) {
      xPos += colWidths[i];
      if (i < colWidths.length - 1) {
        doc.line(xPos, tableStartY - rowHeight, xPos, tableStartY);
      }
    }

    // Table Header
    doc.setFontSize(9);
    doc.setFont(undefined, "bold");
    let x = tableStartX;
    colHeaders.forEach((header, idx) => {
      doc.text(header, x + colWidths[idx] / 2, tableStartY - rowHeight / 2, { align: "center" });
      x += colWidths[idx];
    });

    // Table Data Rows
    doc.setFontSize(8);
    doc.setFont(undefined, "normal");
    let currentY = tableStartY;
    let totalAmount = 0;
    
    invoiceProducts.forEach((product: ImportInvoiceItem, idx: number) => {
      // Check if we need a new page
      if (currentY + rowHeight > pageHeight - margin - 50) {
        doc.addPage();
        currentY = margin;
        // Redraw table header on new page
        doc.setFontSize(9);
        doc.setFont(undefined, "bold");
        x = tableStartX;
        colHeaders.forEach((header, headerIdx) => {
          doc.text(header, x + colWidths[headerIdx] / 2, currentY - rowHeight / 2, { align: "center" });
          x += colWidths[headerIdx];
        });
        // Draw borders for header
        doc.rect(tableStartX, currentY - rowHeight, tableWidth, rowHeight);
        xPos = tableStartX;
        for (let i = 0; i < colWidths.length; i++) {
          xPos += colWidths[i];
          if (i < colWidths.length - 1) {
            doc.line(xPos, currentY - rowHeight, xPos, currentY);
          }
        }
        currentY += rowHeight;
      }

      // Draw row border
      doc.rect(tableStartX, currentY, tableWidth, rowHeight);
      xPos = tableStartX;
      for (let i = 0; i < colWidths.length; i++) {
        xPos += colWidths[i];
        if (i < colWidths.length - 1) {
          doc.line(xPos, currentY, xPos, currentY + rowHeight);
        }
      }

      // Draw product data
      x = tableStartX;
      doc.text((idx + 1).toString(), x + colWidths[0] / 2, currentY + rowHeight / 2, { align: "center" });
      x += colWidths[0];
      const productLines = doc.splitTextToSize(product.product_name || "", colWidths[1] - 4);
      doc.text(productLines[0] || "", x + 2, currentY + rowHeight / 2);
      x += colWidths[1];
      doc.text(product.hs_code || "", x + colWidths[2] / 2, currentY + rowHeight / 2, { align: "center" });
      x += colWidths[2];
      doc.text(product.unit || "", x + colWidths[3] / 2, currentY + rowHeight / 2, { align: "center" });
      x += colWidths[3];
      doc.text((product.no_of_units || 0).toString(), x + colWidths[4] / 2, currentY + rowHeight / 2, { align: "center" });
      x += colWidths[4];
      doc.text(`$${(product.unit_price || 0).toFixed(2)}`, x + colWidths[5] / 2, currentY + rowHeight / 2, { align: "center" });
      x += colWidths[5];
      doc.text(`$${(product.total_amount || 0).toFixed(2)}`, x + colWidths[6] / 2, currentY + rowHeight / 2, { align: "center" });
      totalAmount += product.total_amount || 0;
      currentY += rowHeight;
    });

    // Totals Section
    currentY += 5;
    doc.setFontSize(10);
    doc.setFont(undefined, "bold");
    doc.text("TOTAL:", tableStartX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5], currentY);
    doc.text(`$${totalAmount.toFixed(2)}`, tableStartX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5] + colWidths[6], currentY, { align: "right" });
    currentY += 6;
    doc.setFontSize(9);
    doc.text("SAY TOTAL US DOLLARS VALUE IN WORDS:", tableStartX, currentY);
    currentY += 5;
    doc.setFont(undefined, "bold");
    doc.text(numberToWords(totalAmount).toUpperCase() + " ONLY.", tableStartX, currentY);
    currentY += 10;

    // Exporter Bank Details
    if (invoice.exporter_account_name || invoice.exporter_bank_name) {
      doc.setFontSize(11);
      doc.setFont(undefined, "bold");
      doc.text("Exporter Bank Details:", margin, currentY);
      currentY += 6;
      doc.setFontSize(9);
      doc.setFont(undefined, "normal");
      if (invoice.exporter_account_name) {
        doc.text(`Beneficiary's A/C Name: ${invoice.exporter_account_name}`, margin, currentY);
        currentY += 5;
      }
      if (invoice.exporter_account_address) {
        const addressLines = doc.splitTextToSize(`Beneficiary's Address: ${invoice.exporter_account_address}`, pageWidth - margin * 2);
        addressLines.forEach((line: string) => {
          doc.text(line, margin, currentY);
          currentY += 5;
        });
      }
      if (invoice.exporter_account_number) {
        doc.text(`Beneficiary's A/C Number: ${invoice.exporter_account_number}`, margin, currentY);
        currentY += 5;
      }
      if (invoice.exporter_bank_name) {
        doc.text(`Beneficiary's Bank: ${invoice.exporter_bank_name}`, margin, currentY);
        currentY += 5;
      }
      if (invoice.exporter_bank_address) {
        const addressLines = doc.splitTextToSize(`Beneficiary's Bank Address: ${invoice.exporter_bank_address}`, pageWidth - margin * 2);
        addressLines.forEach((line: string) => {
          doc.text(line, margin, currentY);
          currentY += 5;
        });
      }
      if (invoice.exporter_bank_swift) {
        doc.text(`Beneficiary's Bank Swift Code: ${invoice.exporter_bank_swift}`, margin, currentY);
        currentY += 5;
      }
      currentY += 5;
    }

    // Importer Bank Details
    if (invoice.importer_account_name || invoice.importer_bank_name) {
      doc.setFontSize(11);
      doc.setFont(undefined, "bold");
      doc.text("Importer Bank Details:", margin, currentY);
      currentY += 6;
      doc.setFontSize(9);
      doc.setFont(undefined, "normal");
      if (invoice.importer_account_name) {
        doc.text(`Beneficiary's A/C Name: ${invoice.importer_account_name}`, margin, currentY);
        currentY += 5;
      }
      if (invoice.importer_account_address) {
        const addressLines = doc.splitTextToSize(`Beneficiary's Address: ${invoice.importer_account_address}`, pageWidth - margin * 2);
        addressLines.forEach((line: string) => {
          doc.text(line, margin, currentY);
          currentY += 5;
        });
      }
      if (invoice.importer_account_number) {
        doc.text(`Beneficiary's A/C Number: ${invoice.importer_account_number}`, margin, currentY);
        currentY += 5;
      }
      if (invoice.importer_iban_number) {
        doc.text(`Beneficiary's Iban Number: ${invoice.importer_iban_number}`, margin, currentY);
        currentY += 5;
      }
      if (invoice.importer_bank_name) {
        doc.text(`Beneficiary's Bank: ${invoice.importer_bank_name}`, margin, currentY);
        currentY += 5;
      }
      if (invoice.importer_bank_address) {
        const addressLines = doc.splitTextToSize(`Beneficiary's Bank Address: ${invoice.importer_bank_address}`, pageWidth - margin * 2);
        addressLines.forEach((line: string) => {
          doc.text(line, margin, currentY);
          currentY += 5;
        });
      }
      if (invoice.importer_bank_swift) {
        doc.text(`Beneficiary's Bank Swift Code: ${invoice.importer_bank_swift}`, margin, currentY);
        currentY += 5;
      }
      currentY += 5;
    }

    // Signature Section (Bottom Right)
    const signatureY = pageHeight - margin - 20;
    doc.setFontSize(8);
    doc.setFont(undefined, "normal");
    doc.text("For and on behalf of", pageWidth - margin, signatureY, { align: "right" });
    doc.setFontSize(10);
    doc.setFont(undefined, "bold");
    doc.text("DJS EXPORT CO., LIMITED", pageWidth - margin, signatureY + 5, { align: "right" });
    doc.setLineWidth(0.5);
    doc.line(pageWidth - margin - 60, signatureY + 10, pageWidth - margin, signatureY + 10);
    doc.setFontSize(7);
    doc.setFont(undefined, "normal");
    doc.text("Authorized Signatory(s)", pageWidth - margin, signatureY + 15, { align: "right" });

    // Footer
    doc.setFontSize(9);
    doc.setFont(undefined, "bold");
    doc.text("FOR: DJS EXPORT CO, LIMITED", margin, pageHeight - margin);

    // Generate filename
    const filename = `Commercial_Invoice_${invoiceNo}_${date.replace(/\s/g, "_")}.pdf`;
    
    // Save PDF
    doc.save(filename);
  }

  // Helper function to convert number to words
  function numberToWords(num: number): string {
    const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN',
      'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
    const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
    
    if (num === 0) return 'ZERO';
    
    function convertHundreds(n: number): string {
      let str = '';
      if (n >= 100) {
        str += ones[Math.floor(n / 100)] + ' HUNDRED ';
        n %= 100;
      }
      if (n >= 20) {
        str += tens[Math.floor(n / 10)] + ' ';
        n %= 10;
      }
      if (n > 0) {
        str += ones[n] + ' ';
      }
      return str.trim();
    }
    
    let result = '';
    const dollars = Math.floor(num);
    const cents = Math.round((num - dollars) * 100);
    
    if (dollars >= 1000) {
      const thousands = Math.floor(dollars / 1000);
      result += convertHundreds(thousands) + ' THOUSAND ';
      const remainder = dollars % 1000;
      if (remainder > 0) {
        result += convertHundreds(remainder);
      }
    } else {
      result += convertHundreds(dollars);
    }
    
    if (cents > 0) {
      result += ` AND ${cents}/100`;
    }
    
    return result.trim();
  }

  function handleCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formDataObj = new FormData(event.currentTarget);
    
    // Validate products
    if (products.length === 0) {
      toast.error("Please add at least one product");
      return;
    }
    
    const hasInvalidProduct = products.some(
      (p) =>
        !p.product_name?.trim() ||
        !p.hs_code?.trim() ||
        !p.unit?.trim() ||
        !p.no_of_units ||
        !p.unit_price ||
        !p.total_amount
    );
    
    if (hasInvalidProduct) {
      toast.error("Please fill in all required fields for all products");
      return;
    }
    
    // Add products to formData
    products.forEach((product, index) => {
      formDataObj.append(`products[${index}][product_name]`, product.product_name);
      formDataObj.append(`products[${index}][hs_code]`, product.hs_code);
      formDataObj.append(`products[${index}][unit]`, product.unit);
      formDataObj.append(`products[${index}][no_of_units]`, product.no_of_units);
      formDataObj.append(`products[${index}][unit_price]`, product.unit_price);
      formDataObj.append(`products[${index}][total_amount]`, product.total_amount);
    });
    
    startTransition(async () => {
      const result = await createImportInvoice(formDataObj);
      
      if (result && "error" in result) {
        toast.error(result.error || "Failed to create import invoice");
        return;
      }
      
      if (result && "invoice" in result) {
        toast.success("Import invoice created successfully", {
          className: "bg-green-400 text-white border-green-400",
        });
        
        // Generate and download PDF
        generatePDF(result.invoice);
        
        setCreateOpen(false);
        form.reset();
        setFormData({
          invoice_no: "",
          bill_to_name: "",
          bill_to_address: "",
          bill_to_ntn: "",
          bill_to_phone: "",
          bill_to_email: "",
          ship_to_name: "",
          ship_to_address: "",
          ship_to_ntn: "",
          ship_to_phone: "",
          ship_to_email: "",
          payment_terms: "",
          shipped_via: "",
          coo: "",
          port_loading: "",
          port_discharge: "",
          shipping_terms: "",
          exporter_bank_name: "",
          exporter_bank_address: "",
          exporter_bank_swift: "",
          exporter_account_name: "",
          exporter_account_address: "",
          exporter_account_number: "",
          importer_bank_name: "",
          importer_bank_address: "",
          importer_bank_swift: "",
          importer_account_name: "",
          importer_account_address: "",
          importer_account_number: "",
          importer_iban_number: "",
        });
        setProducts([
          {
            product_name: "",
            hs_code: "",
            unit: "",
            no_of_units: "",
            unit_price: "",
            total_amount: "",
          },
        ]);
        router.refresh();
        fetchInvoices();
      }
    });
  }

  function handleDelete(invoice: ImportInvoice) {
    setDeleteTarget(invoice);
    setDeleteOpen(true);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    
    startTransition(async () => {
      const result = await deleteImportInvoice(deleteTarget.id);
      
      if (result && "error" in result) {
        toast.error(result.error || "Failed to delete import invoice");
        return;
      }
      
      toast.success("Import invoice deleted successfully", {
        className: "bg-green-400 text-white border-green-400",
      });
      setDeleteOpen(false);
      setDeleteTarget(null);
      router.refresh();
      fetchInvoices();
    });
  }

  return (
    <div className="space-y-6">
      <Card className="bg-white border shadow-sm">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Import Invoice</CardTitle>
            <CardDescription>
              Create and manage import invoices. PDFs are automatically generated on creation.
            </CardDescription>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="create-console-btn bg-primary-dark hover:bg-primary-accent text-white"
          >
            <PlusCircle className="h-4 w-4 mr-2" />
            Add
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-16 text-center text-secondary-muted">
              Loading invoices...
            </div>
          ) : invoices.length === 0 ? (
            <div className="py-16 text-center text-secondary-muted">
              No invoices found. Click &quot;Add&quot; to create your first invoice.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice No.</TableHead>
                    <TableHead>Bill To</TableHead>
                    <TableHead>Ship To</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead>Total Amount</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => {
                    const invoiceProducts = invoice.items && invoice.items.length > 0
                      ? invoice.items.sort((a: ImportInvoiceItem, b: ImportInvoiceItem) => (a.item_order || 0) - (b.item_order || 0))
                      : [];
                    
                    const totalAmount = invoiceProducts.reduce((sum: number, p: ImportInvoiceItem) => sum + (p.total_amount || 0), 0);
                    
                    return (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium">
                          {invoice.invoice_no}
                        </TableCell>
                        <TableCell>{invoice.bill_to_name}</TableCell>
                        <TableCell>{invoice.ship_to_name}</TableCell>
                        <TableCell>
                          {invoiceProducts.length > 0 ? (
                            <div className="space-y-1">
                              {invoiceProducts.length === 1 ? (
                                <div>
                                  <div className="font-medium">{invoiceProducts[0].product_name}</div>
                                  <div className="text-xs text-muted-foreground">HS: {invoiceProducts[0].hs_code}</div>
                                </div>
                              ) : (
                                <div>
                                  <div className="font-medium">{invoiceProducts.length} Products</div>
                                  <div className="text-xs text-muted-foreground">
                                    {invoiceProducts.slice(0, 2).map((p: ImportInvoiceItem, idx: number) => (
                                      <div key={idx}>{p.product_name} (HS: {p.hs_code})</div>
                                    ))}
                                    {invoiceProducts.length > 2 && (
                                      <div className="text-muted-foreground">+{invoiceProducts.length - 2} more</div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>${totalAmount.toFixed(2)}</TableCell>
                        <TableCell>
                          {new Date(invoice.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => generatePDF(invoice)}
                            title="Download PDF"
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            PDF
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(invoice)}
                            disabled={isPending}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Invoice Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Import Invoice</DialogTitle>
            <DialogDescription>
              Fill in the invoice details. A PDF will be automatically generated and downloaded upon submission.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            {/* Invoice No */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="invoice_no">Invoice No. *</Label>
                <Input
                  id="invoice_no"
                  name="invoice_no"
                  value={formData.invoice_no}
                  onChange={(e) => setFormData({ ...formData, invoice_no: e.target.value })}
                  placeholder="e.g., DJS-INV-12251"
                  required
                />
              </div>
            </div>

            {/* Bill To Section */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-3">Bill To</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bill_to_name">Name *</Label>
                  <Input
                    id="bill_to_name"
                    name="bill_to_name"
                    value={formData.bill_to_name}
                    onChange={(e) => setFormData({ ...formData, bill_to_name: e.target.value })}
                    placeholder="Company Name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bill_to_ntn">NTN NO.</Label>
                  <Input
                    id="bill_to_ntn"
                    name="bill_to_ntn"
                    value={formData.bill_to_ntn}
                    onChange={(e) => setFormData({ ...formData, bill_to_ntn: e.target.value })}
                    placeholder="NTN Number"
                  />
                </div>
              </div>
              <div className="space-y-2 mt-2">
                <Label htmlFor="bill_to_address">Address</Label>
                <Input
                  id="bill_to_address"
                  name="bill_to_address"
                  value={formData.bill_to_address}
                  onChange={(e) => setFormData({ ...formData, bill_to_address: e.target.value })}
                  placeholder="Full Address"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2 mt-2">
                <div className="space-y-2">
                  <Label htmlFor="bill_to_phone">Phone</Label>
                  <Input
                    id="bill_to_phone"
                    name="bill_to_phone"
                    value={formData.bill_to_phone}
                    onChange={(e) => setFormData({ ...formData, bill_to_phone: e.target.value })}
                    placeholder="Phone Number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bill_to_email">Email</Label>
                  <Input
                    id="bill_to_email"
                    name="bill_to_email"
                    type="email"
                    value={formData.bill_to_email}
                    onChange={(e) => setFormData({ ...formData, bill_to_email: e.target.value })}
                    placeholder="Email Address"
                  />
                </div>
              </div>
            </div>

            {/* Ship To Section */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-3">Ship To</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ship_to_name">Name *</Label>
                  <Input
                    id="ship_to_name"
                    name="ship_to_name"
                    value={formData.ship_to_name}
                    onChange={(e) => setFormData({ ...formData, ship_to_name: e.target.value })}
                    placeholder="Company Name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ship_to_ntn">NTN NO.</Label>
                  <Input
                    id="ship_to_ntn"
                    name="ship_to_ntn"
                    value={formData.ship_to_ntn}
                    onChange={(e) => setFormData({ ...formData, ship_to_ntn: e.target.value })}
                    placeholder="NTN Number"
                  />
                </div>
              </div>
              <div className="space-y-2 mt-2">
                <Label htmlFor="ship_to_address">Address</Label>
                <Input
                  id="ship_to_address"
                  name="ship_to_address"
                  value={formData.ship_to_address}
                  onChange={(e) => setFormData({ ...formData, ship_to_address: e.target.value })}
                  placeholder="Full Address"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2 mt-2">
                <div className="space-y-2">
                  <Label htmlFor="ship_to_phone">Phone</Label>
                  <Input
                    id="ship_to_phone"
                    name="ship_to_phone"
                    value={formData.ship_to_phone}
                    onChange={(e) => setFormData({ ...formData, ship_to_phone: e.target.value })}
                    placeholder="Phone Number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ship_to_email">Email</Label>
                  <Input
                    id="ship_to_email"
                    name="ship_to_email"
                    type="email"
                    value={formData.ship_to_email}
                    onChange={(e) => setFormData({ ...formData, ship_to_email: e.target.value })}
                    placeholder="Email Address"
                  />
                </div>
              </div>
            </div>

            {/* Payment and Shipping Details */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-3">Payment & Shipping Details</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="payment_terms">Payment Terms</Label>
                  <Input
                    id="payment_terms"
                    name="payment_terms"
                    value={formData.payment_terms}
                    onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                    placeholder="e.g., D/P AT SIGHT"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shipped_via">Shipped Via</Label>
                  <Input
                    id="shipped_via"
                    name="shipped_via"
                    value={formData.shipped_via}
                    onChange={(e) => setFormData({ ...formData, shipped_via: e.target.value })}
                    placeholder="e.g., Sea"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="coo">COO</Label>
                  <Input
                    id="coo"
                    name="coo"
                    value={formData.coo}
                    onChange={(e) => setFormData({ ...formData, coo: e.target.value })}
                    placeholder="Country of Origin"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="port_loading">Port of Loading</Label>
                  <Input
                    id="port_loading"
                    name="port_loading"
                    value={formData.port_loading}
                    onChange={(e) => setFormData({ ...formData, port_loading: e.target.value })}
                    placeholder="e.g., Nansha, China"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="port_discharge">Port of Discharge</Label>
                  <Input
                    id="port_discharge"
                    name="port_discharge"
                    value={formData.port_discharge}
                    onChange={(e) => setFormData({ ...formData, port_discharge: e.target.value })}
                    placeholder="e.g., Karachi, Pakistan"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shipping_terms">Shipping Terms</Label>
                  <Input
                    id="shipping_terms"
                    name="shipping_terms"
                    value={formData.shipping_terms}
                    onChange={(e) => setFormData({ ...formData, shipping_terms: e.target.value })}
                    placeholder="e.g., CFR Karachi"
                  />
                </div>
              </div>
            </div>

            {/* Product Details */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Product Details</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setProducts([
                      ...products,
                      {
                        product_name: "",
                        hs_code: "",
                        unit: "",
                        no_of_units: "",
                        unit_price: "",
                        total_amount: "",
                      },
                    ]);
                  }}
                >
                  <PlusCircle className="h-4 w-4 mr-1" />
                  Add Product
                </Button>
              </div>
              {products.map((product, index) => (
                <div key={index} className="border rounded-lg p-4 mb-4 space-y-3 relative">
                  {products.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 h-6 w-6 p-0"
                      onClick={() => {
                        setProducts(products.filter((_, i) => i !== index));
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                  <div className="pr-8">
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                      Product {index + 1}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`product_name_${index}`}>Product Name *</Label>
                      <Input
                        id={`product_name_${index}`}
                        name={`product_name_${index}`}
                        value={product.product_name}
                        onChange={(e) => {
                          const updated = [...products];
                          updated[index].product_name = e.target.value;
                          setProducts(updated);
                        }}
                        placeholder="Product Name"
                        required
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 mt-2">
                      <div className="space-y-2">
                        <Label htmlFor={`hs_code_${index}`}>HS Code *</Label>
                        <Input
                          id={`hs_code_${index}`}
                          name={`hs_code_${index}`}
                          value={product.hs_code}
                          onChange={(e) => {
                            const updated = [...products];
                            updated[index].hs_code = e.target.value;
                            setProducts(updated);
                          }}
                          placeholder="HS Code"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`unit_${index}`}>Unit *</Label>
                        <Input
                          id={`unit_${index}`}
                          name={`unit_${index}`}
                          value={product.unit}
                          onChange={(e) => {
                            const updated = [...products];
                            updated[index].unit = e.target.value;
                            setProducts(updated);
                          }}
                          placeholder="e.g., u, Kg"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3 mt-2">
                      <div className="space-y-2">
                        <Label htmlFor={`no_of_units_${index}`}>No of Units *</Label>
                        <Input
                          id={`no_of_units_${index}`}
                          name={`no_of_units_${index}`}
                          type="number"
                          step="0.001"
                          min="0"
                          value={product.no_of_units}
                          onChange={(e) => {
                            const updated = [...products];
                            updated[index].no_of_units = e.target.value;
                            const total = calculateTotalAmount(e.target.value, updated[index].unit_price);
                            updated[index].total_amount = total;
                            setProducts(updated);
                          }}
                          placeholder="0.000"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`unit_price_${index}`}>Unit Price ($) *</Label>
                        <Input
                          id={`unit_price_${index}`}
                          name={`unit_price_${index}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={product.unit_price}
                          onChange={(e) => {
                            const updated = [...products];
                            updated[index].unit_price = e.target.value;
                            const total = calculateTotalAmount(updated[index].no_of_units, e.target.value);
                            updated[index].total_amount = total;
                            setProducts(updated);
                          }}
                          placeholder="0.00"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`total_amount_${index}`}>Total Amount ($) *</Label>
                        <Input
                          id={`total_amount_${index}`}
                          name={`total_amount_${index}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={product.total_amount}
                          readOnly
                          className="bg-muted"
                          placeholder="0.00"
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Exporter Bank Details */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-3">Exporter Bank Details</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="exporter_account_name">Beneficiary&apos;s A/C Name</Label>
                  <Input
                    id="exporter_account_name"
                    name="exporter_account_name"
                    value={formData.exporter_account_name}
                    onChange={(e) => setFormData({ ...formData, exporter_account_name: e.target.value })}
                    placeholder="Account Name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exporter_account_number">Beneficiary&apos;s A/C Number</Label>
                  <Input
                    id="exporter_account_number"
                    name="exporter_account_number"
                    value={formData.exporter_account_number}
                    onChange={(e) => setFormData({ ...formData, exporter_account_number: e.target.value })}
                    placeholder="Account Number"
                  />
                </div>
              </div>
              <div className="space-y-2 mt-2">
                <Label htmlFor="exporter_account_address">Beneficiary&apos;s Address</Label>
                <Input
                  id="exporter_account_address"
                  name="exporter_account_address"
                  value={formData.exporter_account_address}
                  onChange={(e) => setFormData({ ...formData, exporter_account_address: e.target.value })}
                  placeholder="Full Address"
                />
              </div>
              <div className="space-y-2 mt-2">
                <Label htmlFor="exporter_bank_name">Beneficiary&apos;s Bank</Label>
                <Input
                  id="exporter_bank_name"
                  name="exporter_bank_name"
                  value={formData.exporter_bank_name}
                  onChange={(e) => setFormData({ ...formData, exporter_bank_name: e.target.value })}
                  placeholder="Bank Name"
                />
              </div>
              <div className="space-y-2 mt-2">
                <Label htmlFor="exporter_bank_address">Beneficiary&apos;s Bank Address</Label>
                <Input
                  id="exporter_bank_address"
                  name="exporter_bank_address"
                  value={formData.exporter_bank_address}
                  onChange={(e) => setFormData({ ...formData, exporter_bank_address: e.target.value })}
                  placeholder="Bank Address"
                />
              </div>
              <div className="space-y-2 mt-2">
                <Label htmlFor="exporter_bank_swift">Beneficiary&apos;s Bank Swift Code</Label>
                <Input
                  id="exporter_bank_swift"
                  name="exporter_bank_swift"
                  value={formData.exporter_bank_swift}
                  onChange={(e) => setFormData({ ...formData, exporter_bank_swift: e.target.value })}
                  placeholder="Swift Code"
                />
              </div>
            </div>

            {/* Importer Bank Details */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-3">Importer Bank Details</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="importer_account_name">Beneficiary&apos;s A/C Name</Label>
                  <Input
                    id="importer_account_name"
                    name="importer_account_name"
                    value={formData.importer_account_name}
                    onChange={(e) => setFormData({ ...formData, importer_account_name: e.target.value })}
                    placeholder="Account Name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="importer_account_number">Beneficiary&apos;s A/C Number</Label>
                  <Input
                    id="importer_account_number"
                    name="importer_account_number"
                    value={formData.importer_account_number}
                    onChange={(e) => setFormData({ ...formData, importer_account_number: e.target.value })}
                    placeholder="Account Number"
                  />
                </div>
              </div>
              <div className="space-y-2 mt-2">
                <Label htmlFor="importer_iban_number">Beneficiary&apos;s IBAN Number</Label>
                <Input
                  id="importer_iban_number"
                  name="importer_iban_number"
                  value={formData.importer_iban_number}
                  onChange={(e) => setFormData({ ...formData, importer_iban_number: e.target.value })}
                  placeholder="IBAN Number"
                />
              </div>
              <div className="space-y-2 mt-2">
                <Label htmlFor="importer_account_address">Beneficiary&apos;s Address</Label>
                <Input
                  id="importer_account_address"
                  name="importer_account_address"
                  value={formData.importer_account_address}
                  onChange={(e) => setFormData({ ...formData, importer_account_address: e.target.value })}
                  placeholder="Full Address"
                />
              </div>
              <div className="space-y-2 mt-2">
                <Label htmlFor="importer_bank_name">Beneficiary&apos;s Bank</Label>
                <Input
                  id="importer_bank_name"
                  name="importer_bank_name"
                  value={formData.importer_bank_name}
                  onChange={(e) => setFormData({ ...formData, importer_bank_name: e.target.value })}
                  placeholder="Bank Name"
                />
              </div>
              <div className="space-y-2 mt-2">
                <Label htmlFor="importer_bank_address">Beneficiary&apos;s Bank Address</Label>
                <Input
                  id="importer_bank_address"
                  name="importer_bank_address"
                  value={formData.importer_bank_address}
                  onChange={(e) => setFormData({ ...formData, importer_bank_address: e.target.value })}
                  placeholder="Bank Address"
                />
              </div>
              <div className="space-y-2 mt-2">
                <Label htmlFor="importer_bank_swift">Beneficiary&apos;s Bank Swift Code</Label>
                <Input
                  id="importer_bank_swift"
                  name="importer_bank_swift"
                  value={formData.importer_bank_swift}
                  onChange={(e) => setFormData({ ...formData, importer_bank_swift: e.target.value })}
                  placeholder="Swift Code"
                />
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateOpen(false);
                  setFormData({
                    invoice_no: "",
                    bill_to_name: "",
                    bill_to_address: "",
                    bill_to_ntn: "",
                    bill_to_phone: "",
                    bill_to_email: "",
                    ship_to_name: "",
                    ship_to_address: "",
                    ship_to_ntn: "",
                    ship_to_phone: "",
                    ship_to_email: "",
                    payment_terms: "",
                    shipped_via: "",
                    coo: "",
                    port_loading: "",
                    port_discharge: "",
                    shipping_terms: "",
                    exporter_bank_name: "",
                    exporter_bank_address: "",
                    exporter_bank_swift: "",
                    exporter_account_name: "",
                    exporter_account_address: "",
                    exporter_account_number: "",
                    importer_bank_name: "",
                    importer_bank_address: "",
                    importer_bank_swift: "",
                    importer_account_name: "",
                    importer_account_address: "",
                    importer_account_number: "",
                    importer_iban_number: "",
                  });
                  setProducts([
                    {
                      product_name: "",
                      hs_code: "",
                      unit: "",
                      no_of_units: "",
                      unit_price: "",
                      total_amount: "",
                    },
                  ]);
                }}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="w-full sm:w-auto bg-primary-dark hover:bg-primary-accent text-white"
              >
                {isPending ? "Creating..." : "Submit"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Import Invoice</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this invoice? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isPending}>
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
