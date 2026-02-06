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
import { PlusCircle, FileText, Trash2 } from "lucide-react";
import jsPDF from "jspdf";

export function ImportPackingListPanel() {
  const router = useRouter();
  const [packingLists, setPackingLists] = useState<PackingList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PackingList | null>(null);
  const [isPending, startTransition] = useTransition();

  const [formData, setFormData] = useState({
    build_to: "",
    ship_to: "",
    product_name: "",
    hs_code: "",
    no_of_cartons: "",
    weight: "",
    net_weight: "",
  });

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
    
    // Title
    doc.setFontSize(18);
    doc.text("Import Packing List", 105, 20, { align: "center" });
    
    // Date
    doc.setFontSize(10);
    const date = new Date(packingList.created_at).toLocaleDateString();
    doc.text(`Date: ${date}`, 105, 30, { align: "center" });
    
    // Content
    doc.setFontSize(12);
    let y = 50;
    const lineHeight = 8;
    
    doc.setFont(undefined, "bold");
    doc.text("Build To:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(packingList.build_to, 60, y);
    
    y += lineHeight;
    doc.setFont(undefined, "bold");
    doc.text("Ship To:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(packingList.ship_to, 60, y);
    
    y += lineHeight;
    doc.setFont(undefined, "bold");
    doc.text("Product Name:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(packingList.product_name, 60, y);
    
    y += lineHeight;
    doc.setFont(undefined, "bold");
    doc.text("HS Code:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(packingList.hs_code, 60, y);
    
    y += lineHeight;
    doc.setFont(undefined, "bold");
    doc.text("No. of Cartons:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(packingList.no_of_cartons.toString(), 60, y);
    
    y += lineHeight;
    doc.setFont(undefined, "bold");
    doc.text("Weight:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(`${packingList.weight.toFixed(3)} kg`, 60, y);
    
    y += lineHeight;
    doc.setFont(undefined, "bold");
    doc.text("Net Weight:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(`${packingList.net_weight.toFixed(3)} kg`, 60, y);
    
    // Generate filename
    const filename = `Packing_List_${packingList.id.substring(0, 8)}_${date.replace(/\//g, "_")}.pdf`;
    
    // Save PDF
    doc.save(filename);
  }

  function handleCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formDataObj = new FormData(event.currentTarget);
    
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
          build_to: "",
          ship_to: "",
          product_name: "",
          hs_code: "",
          no_of_cartons: "",
          weight: "",
          net_weight: "",
        });
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
                    <TableHead>Build To</TableHead>
                    <TableHead>Ship To</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>HS Code</TableHead>
                    <TableHead>No. of Cartons</TableHead>
                    <TableHead>Weight (kg)</TableHead>
                    <TableHead>Net Weight (kg)</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packingLists.map((packingList) => (
                    <TableRow key={packingList.id}>
                      <TableCell className="font-medium">{packingList.build_to}</TableCell>
                      <TableCell>{packingList.ship_to}</TableCell>
                      <TableCell>{packingList.product_name}</TableCell>
                      <TableCell>{packingList.hs_code}</TableCell>
                      <TableCell>{packingList.no_of_cartons}</TableCell>
                      <TableCell>{packingList.weight.toFixed(3)}</TableCell>
                      <TableCell>{packingList.net_weight.toFixed(3)}</TableCell>
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
                  ))}
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
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="build_to">Build To (Company Name) *</Label>
                <Input
                  id="build_to"
                  name="build_to"
                  value={formData.build_to}
                  onChange={(e) => setFormData({ ...formData, build_to: e.target.value })}
                  placeholder="Company Name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ship_to">Ship To (Company Name) *</Label>
                <Input
                  id="ship_to"
                  name="ship_to"
                  value={formData.ship_to}
                  onChange={(e) => setFormData({ ...formData, ship_to: e.target.value })}
                  placeholder="Company Name"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="product_name">Product Name *</Label>
              <Input
                id="product_name"
                name="product_name"
                value={formData.product_name}
                onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                placeholder="Product Name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hs_code">HS Code *</Label>
              <Input
                id="hs_code"
                name="hs_code"
                value={formData.hs_code}
                onChange={(e) => setFormData({ ...formData, hs_code: e.target.value })}
                placeholder="HS Code"
                required
              />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="no_of_cartons">No. of Cartons *</Label>
                <Input
                  id="no_of_cartons"
                  name="no_of_cartons"
                  type="number"
                  min="0"
                  value={formData.no_of_cartons}
                  onChange={(e) => setFormData({ ...formData, no_of_cartons: e.target.value })}
                  placeholder="0"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weight">Weight (kg) *</Label>
                <Input
                  id="weight"
                  name="weight"
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                  placeholder="0.000"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="net_weight">Net Weight (kg) *</Label>
                <Input
                  id="net_weight"
                  name="net_weight"
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.net_weight}
                  onChange={(e) => setFormData({ ...formData, net_weight: e.target.value })}
                  placeholder="0.000"
                  required
                />
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setFormData({
                    build_to: "",
                    ship_to: "",
                    product_name: "",
                    hs_code: "",
                    no_of_cartons: "",
                    weight: "",
                    net_weight: "",
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
