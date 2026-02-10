"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createPackingList, getAllPackingLists, deletePackingList, type PackingList } from "@/app/actions/packing_lists";
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

export function ImportPackingListPanel() {
  const router = useRouter();
  const [packingLists, setPackingLists] = useState<PackingList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PackingList | null>(null);
  const [isPending, startTransition] = useTransition();

  type ProductItem = {
    product_name: string;
    hs_code: string;
    no_of_cartons: string;
    weight: string;
    net_weight: string;
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
  });

  const [products, setProducts] = useState<ProductItem[]>([
    {
      product_name: "",
      hs_code: "",
      no_of_cartons: "",
      weight: "",
      net_weight: "",
    },
  ]);

  useEffect(() => {
    fetchPackingLists();
  }, []);

  async function fetchPackingLists() {
    setIsLoading(true);
    try {
      const result = await getAllPackingLists();
      if ("error" in result) {
        toast.error(result.error || "Unable to load packing lists");
        setPackingLists([]);
      } else {
        setPackingLists(result.packingLists || []);
      }
    } catch {
      toast.error("An unexpected error occurred while loading packing lists");
      setPackingLists([]);
    } finally {
      setIsLoading(false);
    }
  }

  function generatePDF(packingList: PackingList) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let y = margin;

    // Company Header (Top Left)
    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text("DJS EXPORT CO., LIMITED", margin, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text("FLAT/RM 504,5/F HO KING COMMERCIAL CENTER", margin, y);
    y += 5;
    doc.text("2-16 FA YUEN STREET, MONG KOK, KOWLOON, HONG KONG", margin, y);
    y += 10;

    // Document Title (Centered)
    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.text("PACKING LIST", pageWidth / 2, y, { align: "center" });
    y += 10;

    // Invoice No and Date (Right aligned, same line as title)
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    const invoiceNo = packingList.invoice_no || `INV-${packingList.id.substring(0, 8).toUpperCase()}`;
    const date = new Date(packingList.created_at).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    doc.text(`Invoice No.: ${invoiceNo}`, pageWidth - margin, y - 10, { align: "right" });
    doc.text(`Date: ${date}`, pageWidth - margin, y - 5, { align: "right" });
    y += 5;

    // Bill To Section (Left side)
    const billToStartY = y;
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text("Bill To:", margin, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    const billToName = packingList.bill_to_name || packingList.build_to || "";
    const billToAddress = packingList.bill_to_address || "";
    const billToNtn = packingList.bill_to_ntn || "";
    const billToPhone = packingList.bill_to_phone || "";
    const billToEmail = packingList.bill_to_email || "";
    
    doc.text(billToName, margin, y);
    y += 5;
    if (billToAddress) {
      const addressLines = doc.splitTextToSize(billToAddress, 80);
      addressLines.forEach((line: string) => {
        doc.text(line, margin, y);
        y += 5;
      });
    }
    if (billToNtn) {
      doc.text(`NTN NO.: ${billToNtn}`, margin, y);
      y += 5;
    }
    if (billToPhone) {
      doc.text(`Phone: ${billToPhone}`, margin, y);
      y += 5;
    }
    if (billToEmail) {
      doc.text(`Email: ${billToEmail}`, margin, y);
      y += 5;
    }
    y += 3;

    // Ship To Section (Left side, below Bill To)
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text("Ship To:", margin, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    const shipToName = packingList.ship_to_name || packingList.ship_to || "";
    const shipToAddress = packingList.ship_to_address || "";
    const shipToNtn = packingList.ship_to_ntn || "";
    const shipToPhone = packingList.ship_to_phone || "";
    const shipToEmail = packingList.ship_to_email || "";
    
    doc.text(shipToName, margin, y);
    y += 5;
    if (shipToAddress) {
      const addressLines = doc.splitTextToSize(shipToAddress, 80);
      addressLines.forEach((line: string) => {
        doc.text(line, margin, y);
        y += 5;
      });
    }
    if (shipToNtn) {
      doc.text(`NTN NO.: ${shipToNtn}`, margin, y);
      y += 5;
    }
    if (shipToPhone) {
      doc.text(`Phone: ${shipToPhone}`, margin, y);
      y += 5;
    }
    if (shipToEmail) {
      doc.text(`Email: ${shipToEmail}`, margin, y);
      y += 5;
    }

    // Payment and Shipping Details Section (Right side, aligned with Bill To)
    const detailsStartX = pageWidth / 2 + 10;
    let detailsY = billToStartY;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    const paymentTerms = packingList.payment_terms || "";
    const shippedVia = packingList.shipped_via || "";
    const coo = packingList.coo || "";
    const portLoading = packingList.port_loading || "";
    const portDischarge = packingList.port_discharge || "";
    const shippingTerms = packingList.shipping_terms || "";
    
    if (paymentTerms) {
      doc.text(`Payment Terms: ${paymentTerms}`, detailsStartX, detailsY);
      detailsY += 5;
    }
    if (shippedVia) {
      doc.text(`Shipped Via: ${shippedVia}`, detailsStartX, detailsY);
      detailsY += 5;
    }
    if (coo) {
      doc.text(`COO: ${coo}`, detailsStartX, detailsY);
      detailsY += 5;
    }
    if (portLoading && portDischarge) {
      doc.text(`Port of Loading/Discharge: ${portLoading}/${portDischarge}`, detailsStartX, detailsY);
      detailsY += 5;
    }
    if (shippingTerms) {
      doc.text(`Shipping Terms: ${shippingTerms}`, detailsStartX, detailsY);
      detailsY += 5;
    }

    // Product Table (below both sections)
    y = Math.max(y, detailsY) + 10;
    const tableStartY = y;
    const colWidths = [15, 70, 25, 25, 30, 30]; // S.no, Product, HS Code, Total Ctns, Gross Weight, Net Weight
    const colHeaders = ["S.no", "Product", "HS Code", "Total Ctns", "Gross Weight (KG)", "Net Weight (KG)"];
    const tableWidth = colWidths.reduce((sum, w) => sum + w, 0);
    const tableStartX = margin;
    const rowHeight = 7;

    // Draw table header with borders
    doc.setLineWidth(0.5);
    // Header row border
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
    doc.setFontSize(10);
    doc.setFont(undefined, "bold");
    let x = tableStartX;
    colHeaders.forEach((header, idx) => {
      doc.text(header, x + colWidths[idx] / 2, tableStartY - rowHeight / 2, { align: "center" });
      x += colWidths[idx];
    });

    // Get products from items array or fallback to single product
    const products = packingList.items && packingList.items.length > 0
      ? packingList.items.sort((a: any, b: any) => (a.item_order || 0) - (b.item_order || 0))
      : packingList.product_name
        ? [{
            product_name: packingList.product_name,
            hs_code: packingList.hs_code || "",
            no_of_cartons: packingList.no_of_cartons || 0,
            weight: packingList.weight || 0,
            net_weight: packingList.net_weight || 0,
          }]
        : [];

    // Calculate totals
    const totalCartons = products.reduce((sum: number, p: any) => sum + (p.no_of_cartons || 0), 0);
    const totalWeight = products.reduce((sum: number, p: any) => sum + (p.weight || 0), 0);
    const totalNetWeight = products.reduce((sum: number, p: any) => sum + (p.net_weight || 0), 0);

    // Table Data Rows
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    let currentY = tableStartY;
    
    products.forEach((product: any, idx: number) => {
      // Check if we need a new page
      if (currentY + rowHeight > pageHeight - margin - 20) {
        doc.addPage();
        currentY = margin;
        // Redraw table header on new page
        doc.setFontSize(10);
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
      doc.text((product.no_of_cartons || 0).toString(), x + colWidths[3] / 2, currentY + rowHeight / 2, { align: "center" });
      x += colWidths[3];
      doc.text((product.weight || 0).toFixed(2), x + colWidths[4] / 2, currentY + rowHeight / 2, { align: "center" });
      x += colWidths[4];
      doc.text((product.net_weight || 0).toFixed(2), x + colWidths[5] / 2, currentY + rowHeight / 2, { align: "center" });
      currentY += rowHeight;
    });

    // Totals Row
    if (currentY + rowHeight * 2 > pageHeight - margin - 20) {
      doc.addPage();
      currentY = margin;
    }

    doc.rect(tableStartX, currentY, tableWidth, rowHeight);
    xPos = tableStartX;
    for (let i = 0; i < colWidths.length; i++) {
      xPos += colWidths[i];
      if (i < colWidths.length - 1) {
        doc.line(xPos, currentY, xPos, currentY + rowHeight);
      }
    }

    doc.setFontSize(9);
    doc.setFont(undefined, "bold");
    x = tableStartX;
    doc.text("", x + colWidths[0] / 2, currentY + rowHeight / 2, { align: "center" });
    x += colWidths[0];
    doc.text("TOTAL", x + 2, currentY + rowHeight / 2);
    x += colWidths[1];
    doc.text("", x + colWidths[2] / 2, currentY + rowHeight / 2, { align: "center" });
    x += colWidths[2];
    doc.text(totalCartons.toString(), x + colWidths[3] / 2, currentY + rowHeight / 2, { align: "center" });
    x += colWidths[3];
    doc.text(totalWeight.toFixed(2), x + colWidths[4] / 2, currentY + rowHeight / 2, { align: "center" });
    x += colWidths[4];
    doc.text(totalNetWeight.toFixed(2), x + colWidths[5] / 2, currentY + rowHeight / 2, { align: "center" });
    currentY += rowHeight + 5;

    // Overall Totals (below table)
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text(`TOTAL NET WEIGHT: ${totalNetWeight.toFixed(2)}KGS`, margin, currentY);
    currentY += 6;
    doc.text(`TOTAL GROSS WEIGHT: ${totalWeight.toFixed(2)} KGS`, margin, currentY);

    // Generate filename
    const filename = `Packing_List_${invoiceNo}_${date.replace(/\s/g, "_")}.pdf`;
    
    // Save PDF
    doc.save(filename);
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
        !p.no_of_cartons ||
        !p.weight ||
        !p.net_weight
    );
    
    if (hasInvalidProduct) {
      toast.error("Please fill in all required fields for all products");
      return;
    }
    
    // Add products to formData
    products.forEach((product, index) => {
      formDataObj.append(`products[${index}][product_name]`, product.product_name);
      formDataObj.append(`products[${index}][hs_code]`, product.hs_code);
      formDataObj.append(`products[${index}][no_of_cartons]`, product.no_of_cartons);
      formDataObj.append(`products[${index}][weight]`, product.weight);
      formDataObj.append(`products[${index}][net_weight]`, product.net_weight);
    });
    
    startTransition(async () => {
      const result = await createPackingList(formDataObj);
      
      if (result && "error" in result) {
        toast.error(result.error || "Failed to create packing list");
        return;
      }
      
      if (result && "packingList" in result) {
        toast.success("Packing list created successfully", {
          className: "bg-green-400 text-white border-green-400",
        });
        
        // Generate and download PDF
        generatePDF(result.packingList);
        
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
        });
        setProducts([
          {
            product_name: "",
            hs_code: "",
            no_of_cartons: "",
            weight: "",
            net_weight: "",
          },
        ]);
        router.refresh();
        fetchPackingLists();
      }
    });
  }

  function handleDelete(packingList: PackingList) {
    setDeleteTarget(packingList);
    setDeleteOpen(true);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    
    startTransition(async () => {
      const result = await deletePackingList(deleteTarget.id);
      
      if (result && "error" in result) {
        toast.error(result.error || "Failed to delete packing list");
        return;
      }
      
      toast.success("Packing list deleted successfully", {
        className: "bg-green-400 text-white border-green-400",
      });
      setDeleteOpen(false);
      setDeleteTarget(null);
      router.refresh();
      fetchPackingLists();
    });
  }

  return (
    <div className="space-y-6">
      <Card className="bg-white border shadow-sm">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Import Packing List</CardTitle>
            <CardDescription>
              Create and manage import packing lists. PDFs are automatically generated on creation.
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
              Loading packing lists...
            </div>
          ) : packingLists.length === 0 ? (
            <div className="py-16 text-center text-secondary-muted">
              No packing lists found. Click &quot;Add&quot; to create your first packing list.
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
                    <TableHead>Total Cartons</TableHead>
                    <TableHead>Gross Weight (kg)</TableHead>
                    <TableHead>Net Weight (kg)</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packingLists.map((packingList) => {
                    const products = packingList.items && packingList.items.length > 0
                      ? packingList.items.sort((a: any, b: any) => (a.item_order || 0) - (b.item_order || 0))
                      : packingList.product_name
                        ? [{ product_name: packingList.product_name, hs_code: packingList.hs_code }]
                        : [];
                    
                    const totalCartons = products.reduce((sum: number, p: any) => sum + (p.no_of_cartons || 0), packingList.no_of_cartons || 0);
                    const totalWeight = products.reduce((sum: number, p: any) => sum + (p.weight || 0), packingList.weight || 0);
                    const totalNetWeight = products.reduce((sum: number, p: any) => sum + (p.net_weight || 0), packingList.net_weight || 0);
                    
                    return (
                      <TableRow key={packingList.id}>
                        <TableCell className="font-medium">
                          {packingList.invoice_no || `INV-${packingList.id.substring(0, 8).toUpperCase()}`}
                        </TableCell>
                        <TableCell>{packingList.bill_to_name || packingList.build_to || "-"}</TableCell>
                        <TableCell>{packingList.ship_to_name || packingList.ship_to || "-"}</TableCell>
                        <TableCell>
                          {products.length > 0 ? (
                            <div className="space-y-1">
                              {products.length === 1 ? (
                                <div>
                                  <div className="font-medium">{products[0].product_name}</div>
                                  <div className="text-xs text-muted-foreground">HS: {products[0].hs_code}</div>
                                </div>
                              ) : (
                                <div>
                                  <div className="font-medium">{products.length} Products</div>
                                  <div className="text-xs text-muted-foreground">
                                    {products.slice(0, 2).map((p: any, idx: number) => (
                                      <div key={idx}>{p.product_name} (HS: {p.hs_code})</div>
                                    ))}
                                    {products.length > 2 && (
                                      <div className="text-muted-foreground">+{products.length - 2} more</div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>{totalCartons}</TableCell>
                        <TableCell>{totalWeight.toFixed(2)}</TableCell>
                        <TableCell>{totalNetWeight.toFixed(2)}</TableCell>
                        <TableCell>
                          {new Date(packingList.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => generatePDF(packingList)}
                            title="Download PDF"
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            PDF
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(packingList)}
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

      {/* Create Packing List Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Import Packing List</DialogTitle>
            <DialogDescription>
              Fill in the packing list details. A PDF will be automatically generated and downloaded upon submission.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            {/* Invoice No and Date */}
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
                        no_of_cartons: "",
                        weight: "",
                        net_weight: "",
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
                    <div className="space-y-2 mt-2">
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
                    <div className="grid gap-4 md:grid-cols-3 mt-2">
                      <div className="space-y-2">
                        <Label htmlFor={`no_of_cartons_${index}`}>No. of Cartons *</Label>
                        <Input
                          id={`no_of_cartons_${index}`}
                          name={`no_of_cartons_${index}`}
                          type="number"
                          min="0"
                          value={product.no_of_cartons}
                          onChange={(e) => {
                            const updated = [...products];
                            updated[index].no_of_cartons = e.target.value;
                            setProducts(updated);
                          }}
                          placeholder="0"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`weight_${index}`}>Gross Weight (kg) *</Label>
                        <Input
                          id={`weight_${index}`}
                          name={`weight_${index}`}
                          type="number"
                          step="0.001"
                          min="0"
                          value={product.weight}
                          onChange={(e) => {
                            const updated = [...products];
                            updated[index].weight = e.target.value;
                            setProducts(updated);
                          }}
                          placeholder="0.000"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`net_weight_${index}`}>Net Weight (kg) *</Label>
                        <Input
                          id={`net_weight_${index}`}
                          name={`net_weight_${index}`}
                          type="number"
                          step="0.001"
                          min="0"
                          value={product.net_weight}
                          onChange={(e) => {
                            const updated = [...products];
                            updated[index].net_weight = e.target.value;
                            setProducts(updated);
                          }}
                          placeholder="0.000"
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
              <Button
                variant="outline"
                type="button"
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
                  });
                }}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} className="create-console-btn bg-primary-dark hover:bg-primary-accent text-white w-full sm:w-auto">
                {isPending ? "Submitting..." : "Submit"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Packing List</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this packing list? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteOpen(false);
                setDeleteTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
