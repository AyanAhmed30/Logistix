"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createCustomer, getAllCustomers, updateCustomer, deleteCustomer, type Customer } from "@/app/actions/customers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { PlusCircle, Users, Trash2, Edit, UserPlus } from "lucide-react";

type SalesSubTab = "create-user" | "customer-list" | "leads";

export function SalesPanel() {
  const router = useRouter();
  const [activeSubTab, setActiveSubTab] = useState<SalesSubTab>("create-user");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [deleteCustomerTarget, setDeleteCustomerTarget] = useState<Customer | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (activeSubTab === "customer-list") {
      fetchCustomers();
    }
  }, [activeSubTab]);

  async function fetchCustomers() {
    setIsLoading(true);
    try {
      const result = await getAllCustomers();
      if ("error" in result) {
        toast.error(result.error || "Unable to load customers");
        setCustomers([]);
      } else {
        setCustomers(result.customers || []);
      }
    } catch (err) {
      toast.error("An unexpected error occurred while loading customers");
      setCustomers([]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const address = String(formData.get("address") || "").trim();
    const city = String(formData.get("city") || "").trim();
    const phone_number = String(formData.get("phone_number") || "").trim();
    const company_name = String(formData.get("company_name") || "").trim();

    if (!name || !address || !city || !phone_number || !company_name) {
      toast.error("All fields are required");
      return;
    }

    startTransition(async () => {
      const result = await createCustomer(formData);
      if (result && "error" in result) {
        toast.error(result.error, {
          className: "bg-red-600 text-white border-red-600",
        });
        return;
      }
      toast.success("Customer created successfully", {
        className: "bg-green-400 text-white border-green-400",
      });
      setCreateOpen(false);
      form.reset();
      router.refresh();
      if (activeSubTab === "customer-list") {
        fetchCustomers();
      }
    });
  }

  function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editCustomer) return;
    const formData = new FormData(event.currentTarget);
    formData.set("id", editCustomer.id);
    const name = String(formData.get("name") || "").trim();
    const address = String(formData.get("address") || "").trim();
    const city = String(formData.get("city") || "").trim();
    const phone_number = String(formData.get("phone_number") || "").trim();
    const company_name = String(formData.get("company_name") || "").trim();

    if (!name || !address || !city || !phone_number || !company_name) {
      toast.error("All fields are required");
      return;
    }

    startTransition(async () => {
      const result = await updateCustomer(formData);
      if (result && "error" in result) {
        toast.error(result.error, {
          className: "bg-red-600 text-white border-red-600",
        });
        return;
      }
      toast.success("Customer updated successfully", {
        className: "bg-green-400 text-white border-green-400",
      });
      setEditOpen(false);
      setEditCustomer(null);
      router.refresh();
      fetchCustomers();
    });
  }

  function handleDelete(customer: Customer) {
    setDeleteCustomerTarget(customer);
    setDeleteOpen(true);
  }

  function confirmDelete() {
    if (!deleteCustomerTarget) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", deleteCustomerTarget.id);
      const result = await deleteCustomer(formData);
      if (result && "error" in result) {
        toast.error(result.error, {
          className: "bg-red-600 text-white border-red-600",
        });
        return;
      }
      toast.success("Customer deleted successfully", {
        className: "bg-green-400 text-white border-green-400",
      });
      setDeleteOpen(false);
      setDeleteCustomerTarget(null);
      router.refresh();
      fetchCustomers();
    });
  }

  function openEdit(customer: Customer) {
    setEditCustomer(customer);
    setEditOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-2 border-b">
        <Button
          variant={activeSubTab === "create-user" ? "default" : "ghost"}
          onClick={() => setActiveSubTab("create-user")}
          className="rounded-b-none"
        >
          <UserPlus className="h-4 w-4 mr-2" />
          Create User
        </Button>
        <Button
          variant={activeSubTab === "customer-list" ? "default" : "ghost"}
          onClick={() => setActiveSubTab("customer-list")}
          className="rounded-b-none"
        >
          <Users className="h-4 w-4 mr-2" />
          Customer List
        </Button>
        <Button
          variant={activeSubTab === "leads" ? "default" : "ghost"}
          onClick={() => setActiveSubTab("leads")}
          className="rounded-b-none"
        >
          Leads
        </Button>
      </div>

      {/* Create User Tab */}
      {activeSubTab === "create-user" && (
        <Card className="bg-white border shadow-sm">
          <CardHeader>
            <CardTitle>Create Customer</CardTitle>
            <CardDescription>
              Add a new customer to the system. Fill in all required fields.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input id="name" name="name" placeholder="John Doe" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_name">Company Name *</Label>
                  <Input id="company_name" name="company_name" placeholder="ABC Corporation" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone_number">Phone Number *</Label>
                  <Input id="phone_number" name="phone_number" placeholder="+1 234 567 8900" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">City *</Label>
                  <Input id="city" name="city" placeholder="New York" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address *</Label>
                <Input id="address" name="address" placeholder="123 Main Street" required />
              </div>
              <Button type="submit" disabled={isPending} className="create-console-btn">
                <PlusCircle className="h-4 w-4 mr-2" />
                {isPending ? "Creating..." : "Create Customer"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Customer List Tab */}
      {activeSubTab === "customer-list" && (
        <Card className="bg-white border shadow-sm">
          <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Customer List</CardTitle>
              <CardDescription>
                View, edit, and delete customer records.
              </CardDescription>
            </div>
            <Button onClick={() => setCreateOpen(true)} className="create-console-btn">
              <PlusCircle className="h-4 w-4 mr-2" />
              Create Customer
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-16 text-center text-secondary-muted">
                Loading customers...
              </div>
            ) : customers.length === 0 ? (
              <div className="py-16 text-center text-secondary-muted">
                No customers found. Create your first customer to get started.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell className="font-semibold">{customer.name}</TableCell>
                        <TableCell>{customer.company_name}</TableCell>
                        <TableCell>{customer.phone_number}</TableCell>
                        <TableCell>{customer.city}</TableCell>
                        <TableCell className="text-secondary-muted">{customer.address}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(customer)}
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(customer)}
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
      )}

      {/* Leads Tab */}
      {activeSubTab === "leads" && (
        <Card className="bg-white border shadow-sm">
          <CardHeader>
            <CardTitle>Leads</CardTitle>
            <CardDescription>
              This section will be implemented in the future.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="py-16 text-center text-secondary-muted">
              Leads functionality coming soon...
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Customer Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Create Customer</DialogTitle>
            <DialogDescription>
              Add a new customer to the system. Fill in all required fields.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dialog-name">Name *</Label>
                <Input id="dialog-name" name="name" placeholder="John Doe" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dialog-company_name">Company Name *</Label>
                <Input id="dialog-company_name" name="company_name" placeholder="ABC Corporation" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dialog-phone_number">Phone Number *</Label>
                <Input id="dialog-phone_number" name="phone_number" placeholder="+1 234 567 8900" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dialog-city">City *</Label>
                <Input id="dialog-city" name="city" placeholder="New York" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dialog-address">Address *</Label>
              <Input id="dialog-address" name="address" placeholder="123 Main Street" required />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending} className="create-console-btn">
                {isPending ? "Creating..." : "Create Customer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>
              Update customer information.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name *</Label>
                <Input
                  id="edit-name"
                  name="name"
                  defaultValue={editCustomer?.name ?? ""}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-company_name">Company Name *</Label>
                <Input
                  id="edit-company_name"
                  name="company_name"
                  defaultValue={editCustomer?.company_name ?? ""}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone_number">Phone Number *</Label>
                <Input
                  id="edit-phone_number"
                  name="phone_number"
                  defaultValue={editCustomer?.phone_number ?? ""}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-city">City *</Label>
                <Input
                  id="edit-city"
                  name="city"
                  defaultValue={editCustomer?.city ?? ""}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-address">Address *</Label>
              <Input
                id="edit-address"
                name="address"
                defaultValue={editCustomer?.address ?? ""}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Customer Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Customer</DialogTitle>
            <DialogDescription>
              Delete {deleteCustomerTarget?.name} ({deleteCustomerTarget?.company_name})? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting..." : "Delete Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
