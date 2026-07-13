"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  archiveOrganizationQuotation,
  createOrganizationQuotation,
  getNextOrganizationQuotationNumber,
  getOrganizationQuotations,
  updateOrganizationQuotation,
  type OrganizationQuotation,
} from "@/app/actions/organization_quotations";
import { getOrganizationCustomers, type OrganizationCustomer } from "@/app/actions/organization_customers";
import type { Organization } from "@/app/actions/organizations";
import { OrganizationQuotationForm, OrganizationQuotationPreview } from "@/components/organization/OrganizationQuotationForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Archive, Edit, Eye, FileText, PlusCircle } from "lucide-react";
import { formatOrganizationCurrency } from "@/lib/organization-quotation";

type Props = {
  organization: Organization;
};

export function OrganizationQuotationsPanel({ organization }: Props) {
  const router = useRouter();
  const [quotations, setQuotations] = useState<OrganizationQuotation[]>([]);
  const [customers, setCustomers] = useState<OrganizationCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<OrganizationQuotation | null>(null);
  const [nextQuotationNumber, setNextQuotationNumber] = useState("");
  const [nextRfqNumber, setNextRfqNumber] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);
    try {
      const [quotationResult, customerResult] = await Promise.all([
        getOrganizationQuotations(),
        getOrganizationCustomers(),
      ]);

      if ("error" in quotationResult) {
        toast.error(quotationResult.error || "Unable to load quotations");
        setQuotations([]);
      } else {
        setQuotations(quotationResult.quotations || []);
      }

      if ("error" in customerResult) {
        toast.error(customerResult.error || "Unable to load customers");
        setCustomers([]);
      } else {
        setCustomers(customerResult.customers || []);
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  async function openCreateModal() {
    const result = await getNextOrganizationQuotationNumber();
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setNextQuotationNumber(result.quotation_number || "");
    setNextRfqNumber(result.rfq_number || "");
    setCreateOpen(true);
  }

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      const result = await createOrganizationQuotation(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Quotation created successfully");
      setCreateOpen(false);
      router.refresh();
      await fetchData();
    });
  }

  function handleEdit(formData: FormData) {
    startTransition(async () => {
      const result = await updateOrganizationQuotation(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Quotation updated successfully");
      setEditOpen(false);
      setSelectedQuotation(null);
      router.refresh();
      await fetchData();
    });
  }

  function confirmArchive() {
    if (!selectedQuotation) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", selectedQuotation.id);
      const result = await archiveOrganizationQuotation(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Quotation archived successfully");
      setArchiveOpen(false);
      setSelectedQuotation(null);
      router.refresh();
      await fetchData();
    });
  }

  return (
    <div className="space-y-6">
      <Card className="bg-white border shadow-sm">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Quotations
          </CardTitle>
          <Button onClick={() => void openCreateModal()} className="create-console-btn">
            <PlusCircle className="h-4 w-4 mr-2" />
            Add New Quotation
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-16 text-center text-secondary-muted">Loading quotations...</div>
          ) : quotations.length === 0 ? (
            <div className="py-16 text-center text-secondary-muted">
              No quotations found. Create your first quotation to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quotation Number</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Quotation Date</TableHead>
                    <TableHead>Total Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotations.map((quotation) => (
                    <TableRow key={quotation.id}>
                      <TableCell className="font-semibold">{quotation.quotation_number}</TableCell>
                      <TableCell>
                        {quotation.organization_customers?.customer_name || "—"}
                      </TableCell>
                      <TableCell>{quotation.invoice_date}</TableCell>
                      <TableCell>{formatOrganizationCurrency(quotation.grand_total)}</TableCell>
                      <TableCell className="capitalize">{quotation.status.replace("_", " ")}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedQuotation(quotation);
                            setViewOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedQuotation(quotation);
                            setEditOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setSelectedQuotation(quotation);
                            setArchiveOpen(true);
                          }}
                          disabled={isPending}
                        >
                          <Archive className="h-4 w-4 mr-1" />
                          Archive
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Quotation</DialogTitle>
            <DialogDescription>
              Create a proforma quotation using your organization template.
            </DialogDescription>
          </DialogHeader>
          {customers.length === 0 ? (
            <p className="text-sm text-secondary-muted">
              Add at least one customer before creating a quotation.
            </p>
          ) : (
            <OrganizationQuotationForm
              key={`${nextQuotationNumber}-${nextRfqNumber}`}
              organization={organization}
              customers={customers}
              quotationNumber={nextQuotationNumber}
              rfqNumber={nextRfqNumber}
              onSubmit={handleCreate}
              isPending={isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Quotation</DialogTitle>
            <DialogDescription>Update quotation details.</DialogDescription>
          </DialogHeader>
          {selectedQuotation ? (
            <OrganizationQuotationForm
              key={selectedQuotation.id}
              organization={organization}
              customers={customers}
              quotation={selectedQuotation}
              onSubmit={handleEdit}
              isPending={isPending}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>View Quotation</DialogTitle>
          </DialogHeader>
          {selectedQuotation ? (
            <OrganizationQuotationPreview
              organization={organization}
              quotation={selectedQuotation}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Quotation</DialogTitle>
            <DialogDescription>
              Archive {selectedQuotation?.quotation_number}? Archived quotations are hidden from the default list.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmArchive} disabled={isPending}>
              {isPending ? "Archiving..." : "Archive Quotation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
