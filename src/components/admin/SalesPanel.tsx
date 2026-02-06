"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createCustomer, updateCustomer, deleteCustomer, getAllCustomers, type Customer } from "@/app/actions/customers";
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
import { getAllCustomersWithAssignments } from "@/app/actions/sales_agents";

type SalesSubTab = "sales-agent" | "create-user" | "customer-list" | "leads";

type CustomerWithAssignment = {
  id: string;
  name: string;
  company_name: string;
  phone_number: string;
  city: string;
  address: string;
  customer_code: string | null;
  sequential_number: number | null;
  sales_agent_customers: Array<{
    sales_agent_id: string;
    sales_agents: {
      id: string;
      name: string;
      email: string;
      code: string | null;
    } | null;
  }>;
};

export function SalesPanel() {
  const router = useRouter();
  const [activeSubTab, setActiveSubTab] = useState<SalesSubTab>("sales-agent");
  const [customers, setCustomers] = useState<CustomerWithAssignment[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [deleteCustomerTarget, setDeleteCustomerTarget] = useState<Customer | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (activeSubTab === "customer-list" || activeSubTab === "create-user") {
      fetchCustomers();
    }
  }, [activeSubTab]);

  async function fetchCustomers() {
    setIsLoading(true);
    try {
      const [customersResult, allCustomersResult] = await Promise.all([
        getAllCustomersWithAssignments(),
        getAllCustomers(),
      ]);

      if ("error" in customersResult) {
        toast.error(customersResult.error || "Unable to load customers");
        setCustomers([]);
      } else {
        setCustomers((customersResult.customers || []) as CustomerWithAssignment[]);
      }

      if ("error" in allCustomersResult) {
        setAllCustomers([]);
      } else {
        setAllCustomers(allCustomersResult.customers || []);
      }
    } catch {
      toast.error("An unexpected error occurred while loading customers");
      setCustomers([]);
      setAllCustomers([]);
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
      fetchCustomers();
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

  function handleDelete(customer: Customer | CustomerWithAssignment) {
    setDeleteCustomerTarget(customer as Customer);
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

  function openEdit(customer: Customer | CustomerWithAssignment) {
    setEditCustomer(customer as Customer);
    setEditOpen(true);
  }

  // Group customers by sales agent and show ranges
  function getCustomerRangesByAgent() {
    const agentMap = new Map<string, {
      agent: { id: string; name: string; email: string; code: string | null };
      customers: CustomerWithAssignment[];
      range: string;
    }>();

    customers.forEach((customer) => {
      const assignment = customer.sales_agent_customers?.[0];
      if (assignment?.sales_agents) {
        const agentId = assignment.sales_agent_id;
        const agent = assignment.sales_agents;
        
        if (!agentMap.has(agentId)) {
          agentMap.set(agentId, {
            agent: {
              id: agent.id,
              name: agent.name,
              email: agent.email,
              code: agent.code
            },
            customers: [],
            range: ''
          });
        }
        
        const entry = agentMap.get(agentId)!;
        entry.customers.push(customer);
      }
    });

    // Calculate ranges for each agent
    agentMap.forEach((entry) => {
      const sortedCustomers = entry.customers.sort((a, b) => {
        const seqA = a.sequential_number || 0;
        const seqB = b.sequential_number || 0;
        return seqA - seqB;
      });

      if (sortedCustomers.length > 0) {
        const firstSeq = sortedCustomers[0].sequential_number;
        const lastSeq = sortedCustomers[sortedCustomers.length - 1].sequential_number;
        
        if (firstSeq && lastSeq && entry.agent.code) {
          const firstCode = `${entry.agent.code}${firstSeq.toString().padStart(2, '0')}`;
          const lastCode = `${entry.agent.code}${lastSeq.toString().padStart(2, '0')}`;
          entry.range = `${firstCode}-${lastCode}`;
        }
      }
    });

    return Array.from(agentMap.values());
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
        <div className="space-y-6">
          <Card className="bg-white border shadow-sm">
            <CardHeader>
              <CardTitle>Create Customer</CardTitle>
            <CardDescription>
              Add new customers to the system. Fill in all required fields. Each customer will be created with the next sequential number (01, 02, 03...).
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

          {/* Customer List in Create User Tab */}
          <Card className="bg-white border shadow-sm">
            <CardHeader>
              <CardTitle>Customer List</CardTitle>
              <CardDescription>
                View, edit, and delete customer records.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-16 text-center text-secondary-muted">
                  Loading customers...
                </div>
              ) : allCustomers.length === 0 ? (
                <div className="py-16 text-center text-secondary-muted">
                  No customers found. Create your first customer to get started.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Serial Number</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>City</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allCustomers.map((customer) => (
                        <TableRow key={customer.id}>
                          <TableCell>
                            {customer.sequential_number ? (
                              <span className="font-mono font-semibold">{customer.sequential_number.toString().padStart(2, '0')}</span>
                            ) : (
                              <span className="text-secondary-muted text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell className="font-semibold">{customer.name}</TableCell>
                          <TableCell>{customer.company_name}</TableCell>
                          <TableCell>{customer.phone_number}</TableCell>
                          <TableCell>{customer.city}</TableCell>
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
        </div>
      )}

      {/* Customer List Tab */}
      {activeSubTab === "customer-list" && (
        <Card className="bg-white border shadow-sm">
          <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Customer List</CardTitle>
              <CardDescription>
                View all customers with their assigned sales agents and customer codes.
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
                      <TableHead>Sales Agent</TableHead>
                      <TableHead>Customer Code Range</TableHead>
                      <TableHead>Sequence Range</TableHead>
                      <TableHead>Number of Customers</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getCustomerRangesByAgent().map((entry) => (
                      <TableRow key={entry.agent.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{entry.agent.name}</div>
                            <div className="text-xs text-secondary-muted">{entry.agent.email}</div>
                            {entry.agent.code && (
                              <div className="text-xs font-mono text-primary-accent">Code: {entry.agent.code}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {entry.range ? (
                            <span className="font-mono font-semibold text-primary-accent">{entry.range}</span>
                          ) : (
                            <span className="text-secondary-muted text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {entry.customers.length > 0 && (
                            <span className="font-mono text-sm">
                              {entry.customers[0].sequential_number?.toString().padStart(2, '0')} - {entry.customers[entry.customers.length - 1].sequential_number?.toString().padStart(2, '0')}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold">{entry.customers.length}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                    {getCustomerRangesByAgent().length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-secondary-muted py-8">
                          No customers assigned to sales agents yet.
                        </TableCell>
                      </TableRow>
                    )}
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
