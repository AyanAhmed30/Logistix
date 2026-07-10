"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  archiveOrganizationCustomer,
  createOrganizationCustomer,
  getOrganizationCustomers,
  restoreOrganizationCustomer,
  updateOrganizationCustomer,
  type OrganizationCustomer,
} from "@/app/actions/organization_customers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Archive, ArchiveRestore, Edit, PlusCircle, UsersRound } from "lucide-react";

type CustomerView = "active" | "archived";

export function OrganizationCustomersPanel() {
  const router = useRouter();
  const [customers, setCustomers] = useState<OrganizationCustomer[]>([]);
  const [customerView, setCustomerView] = useState<CustomerView>("active");
  const [isLoading, setIsLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<OrganizationCustomer | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<OrganizationCustomer | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<OrganizationCustomer | null>(null);
  const [isPending, startTransition] = useTransition();

  const fetchData = useCallback(async (view: CustomerView = customerView) => {
    setIsLoading(true);
    try {
      const result = await getOrganizationCustomers({ status: view });
      if ("error" in result) {
        toast.error(result.error || "Unable to load customers");
        setCustomers([]);
      } else {
        setCustomers(result.customers || []);
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [customerView]);

  useEffect(() => {
    void fetchData(customerView);
  }, [customerView, fetchData]);

  function handleViewChange(view: CustomerView) {
    setCustomerView(view);
  }

  function handleCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createOrganizationCustomer(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Customer created successfully");
      setCreateOpen(false);
      router.refresh();
      if (customerView !== "active") {
        setCustomerView("active");
      } else {
        await fetchData("active");
      }
    });
  }

  function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editCustomer) return;

    const formData = new FormData(event.currentTarget);
    formData.set("id", editCustomer.id);

    startTransition(async () => {
      const result = await updateOrganizationCustomer(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Customer updated successfully");
      setEditOpen(false);
      setEditCustomer(null);
      router.refresh();
      await fetchData(customerView);
    });
  }

  function confirmArchive() {
    if (!archiveTarget) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", archiveTarget.id);
      const result = await archiveOrganizationCustomer(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Customer archived successfully");
      setArchiveOpen(false);
      setArchiveTarget(null);
      router.refresh();
      await fetchData(customerView);
    });
  }

  function confirmRestore() {
    if (!restoreTarget) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", restoreTarget.id);
      const result = await restoreOrganizationCustomer(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Customer restored successfully");
      setRestoreOpen(false);
      setRestoreTarget(null);
      router.refresh();
      await fetchData(customerView);
    });
  }

  function CustomerFormFields({ customer }: { customer?: OrganizationCustomer | null }) {
    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="customer_name">Customer Name *</Label>
            <Input
              id="customer_name"
              name="customer_name"
              defaultValue={customer?.customer_name ?? ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company_name">Company Name</Label>
            <Input id="company_name" name="company_name" defaultValue={customer?.company_name ?? ""} />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={customer?.email ?? ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number *</Label>
            <Input id="phone" name="phone" defaultValue={customer?.phone ?? ""} required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="address">Address</Label>
          <Input id="address" name="address" defaultValue={customer?.address ?? ""} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input id="city" name="city" defaultValue={customer?.city ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <Input id="country" name="country" defaultValue={customer?.country ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="postal_code">Postal Code</Label>
            <Input id="postal_code" name="postal_code" defaultValue={customer?.postal_code ?? ""} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tax_vat_number">Tax/VAT Number</Label>
          <Input id="tax_vat_number" name="tax_vat_number" defaultValue={customer?.tax_vat_number ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" rows={3} defaultValue={customer?.notes ?? ""} />
        </div>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-white border shadow-sm">
        <CardHeader className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <CardTitle className="flex items-center gap-2">
              <UsersRound className="h-5 w-5" />
              Customers
            </CardTitle>
            {customerView === "active" ? (
              <Button onClick={() => setCreateOpen(true)} className="create-console-btn">
                <PlusCircle className="h-4 w-4 mr-2" />
                Add Customer
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              variant={customerView === "active" ? "default" : "outline"}
              size="sm"
              onClick={() => handleViewChange("active")}
            >
              Active
            </Button>
            <Button
              variant={customerView === "archived" ? "default" : "outline"}
              size="sm"
              onClick={() => handleViewChange("archived")}
            >
              Archived
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-16 text-center text-secondary-muted">Loading customers...</div>
          ) : customers.length === 0 ? (
            <div className="py-16 text-center text-secondary-muted">
              {customerView === "active"
                ? "No customers found. Create your first customer to get started."
                : "No archived customers found."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Created Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-semibold">{customer.customer_name}</TableCell>
                      <TableCell>{customer.company_name || "—"}</TableCell>
                      <TableCell>{customer.email}</TableCell>
                      <TableCell>{customer.phone}</TableCell>
                      <TableCell className="text-secondary-muted">
                        {new Date(customer.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="capitalize">{customer.status}</TableCell>
                      <TableCell className="text-right space-x-2">
                        {customerView === "active" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditCustomer(customer);
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
                                setArchiveTarget(customer);
                                setArchiveOpen(true);
                              }}
                              disabled={isPending}
                            >
                              <Archive className="h-4 w-4 mr-1" />
                              Archive
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setRestoreTarget(customer);
                              setRestoreOpen(true);
                            }}
                            disabled={isPending}
                          >
                            <ArchiveRestore className="h-4 w-4 mr-1" />
                            Restore
                          </Button>
                        )}
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
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Customer</DialogTitle>
            <DialogDescription>Create a new customer for your organization.</DialogDescription>
          </DialogHeader>
          <form key={createOpen ? "create-open" : "create-closed"} onSubmit={handleCreateSubmit} className="space-y-4">
            <CustomerFormFields />
            <DialogFooter className="sm:justify-start pt-4">
              <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} className="create-console-btn">
                {isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>Update customer information.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <CustomerFormFields customer={editCustomer} />
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Customer</DialogTitle>
            <DialogDescription>
              Archive {archiveTarget?.customer_name}? You can view and restore archived customers from the Archived tab.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmArchive} disabled={isPending}>
              {isPending ? "Archiving..." : "Archive Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Customer</DialogTitle>
            <DialogDescription>
              Restore {restoreTarget?.customer_name}? The customer will appear again in the Active list.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmRestore} disabled={isPending}>
              {isPending ? "Restoring..." : "Restore Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
