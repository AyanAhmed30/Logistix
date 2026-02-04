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
import { PlusCircle, Users, Trash2, Edit, UserPlus, UserCog } from "lucide-react";
import { SalesAgentPanel } from "@/components/admin/SalesAgentPanel";
import {
  getAllCustomersWithAssignments,
  getSerialRangesWithAssignments,
} from "@/app/actions/sales_agents";

type SalesSubTab = "sales-agent" | "create-user" | "customer-list" | "leads";

type CustomerWithAssignment = {
  id: string;
  name: string;
  company_name: string;
  phone_number: string;
  city: string;
  address: string;
  sales_agent_customers: Array<{
    sales_agent_id: string;
    sales_agents: {
      id: string;
      name: string;
      email: string;
    } | null;
  }>;
};

export function SalesPanel() {
  const router = useRouter();
  const [activeSubTab, setActiveSubTab] = useState<SalesSubTab>("sales-agent");
  const [customers, setCustomers] = useState<CustomerWithAssignment[]>([]);
  const [serialRanges, setSerialRanges] = useState<any[]>([]);
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
      const [customersResult, rangesResult] = await Promise.all([
        getAllCustomersWithAssignments(),
        getSerialRangesWithAssignments(),
      ]);

      if ("error" in customersResult) {
        toast.error(customersResult.error || "Unable to load customers");
        setCustomers([]);
      } else {
        setCustomers((customersResult.customers || []) as CustomerWithAssignment[]);
      }

      if ("error" in rangesResult) {
        // Don't show error if table doesn't exist yet
        if (rangesResult.error && !rangesResult.error.includes("does not exist")) {
          // Silent fail for serial ranges
        }
        setSerialRanges([]);
      } else {
        setSerialRanges(rangesResult.serialRanges || []);
      }
    } catch (err) {
      toast.error("An unexpected error occurred while loading customers");
      setCustomers([]);
      setSerialRanges([]);
    } finally {
      setIsLoading(false);
    }
  }

  function getCustomerSerialRange(customerId: string): string | null {
    // Find serial ranges assigned to the sales agent who has this customer
    const customer = customers.find((c) => c.id === customerId);
    if (!customer || !customer.sales_agent_customers?.[0]) {
      return null;
    }

    const agentId = customer.sales_agent_customers[0].sales_agent_id;
    const ranges = serialRanges.filter((r: any) => r.sales_agent_id === agentId);
    
    if (ranges.length === 0) {
      return null;
    }

    // Return the first range (or combine if multiple)
    if (ranges.length === 1) {
      return `${ranges[0].serial_from}-${ranges[0].serial_to}`;
    }
    
    // Multiple ranges - show all
    return ranges.map((r: any) => `${r.serial_from}-${r.serial_to}`).join(", ");
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
      <div className="flex gap-2 border-b overflow-x-auto">
        <Button
          variant={activeSubTab === "sales-agent" ? "default" : "ghost"}
          onClick={() => setActiveSubTab("sales-agent")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeSubTab === "sales-agent" ? "default" : "outline"}
        >
          <UserCog className="h-4 w-4 mr-2 sidebar-icon" />
          <span className="sidebar-text">Sales Agent</span>
        </Button>
        <Button
          variant={activeSubTab === "create-user" ? "default" : "ghost"}
          onClick={() => setActiveSubTab("create-user")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeSubTab === "create-user" ? "default" : "outline"}
        >
          <UserPlus className="h-4 w-4 mr-2 sidebar-icon" />
          <span className="sidebar-text">Customer Creation</span>
        </Button>
        <Button
          variant={activeSubTab === "customer-list" ? "default" : "ghost"}
          onClick={() => setActiveSubTab("customer-list")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeSubTab === "customer-list" ? "default" : "outline"}
        >
          <Users className="h-4 w-4 mr-2 sidebar-icon" />
          <span className="sidebar-text">Customer List</span>
        </Button>
        <Button
          variant={activeSubTab === "leads" ? "default" : "ghost"}
          onClick={() => setActiveSubTab("leads")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeSubTab === "leads" ? "default" : "outline"}
        >
          <span className="sidebar-text">Leads</span>
        </Button>
      </div>

      {/* Sales Agent Tab */}
      {activeSubTab === "sales-agent" && <SalesAgentPanel />}

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
                      <TableHead>Assigned Sales Agent</TableHead>
                      <TableHead>Serial Number Range</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((customer) => {
                      const assignment = customer.sales_agent_customers?.[0];
                      const serialRange = getCustomerSerialRange(customer.id);
                      
                      return (
                        <TableRow key={customer.id}>
                          <TableCell className="font-semibold">{customer.name}</TableCell>
                          <TableCell>{customer.company_name}</TableCell>
                          <TableCell>{customer.phone_number}</TableCell>
                          <TableCell>{customer.city}</TableCell>
                          <TableCell>
                            {assignment?.sales_agents ? (
                              <div>
                                <div className="font-medium">{assignment.sales_agents.name}</div>
                                <div className="text-xs text-secondary-muted">{assignment.sales_agents.email}</div>
                              </div>
                            ) : (
                              <span className="text-secondary-muted text-sm">Not assigned</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {serialRange ? (
                              <span className="font-mono text-sm">{serialRange}</span>
                            ) : (
                              <span className="text-secondary-muted text-sm">No range assigned</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEdit(customer as any)}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDelete(customer as any)}
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
