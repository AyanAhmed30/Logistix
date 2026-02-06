"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createSalesAgent,
  getAllSalesAgents,
  getAllCustomersWithAssignments,
  getAllSerialNumbers,
  getSerialRangesWithAssignments,
  updateSalesAgent,
  deleteSalesAgent,
  type SalesAgent,
} from "@/app/actions/sales_agents";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlusCircle, Trash2, Edit } from "lucide-react";

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

export function SalesAgentPanel() {
  const router = useRouter();
  const [salesAgents, setSalesAgents] = useState<SalesAgent[]>([]);
  const [customers, setCustomers] = useState<CustomerWithAssignment[]>([]);
  const [serialNumbers, setSerialNumbers] = useState<string[]>([]);
type SerialRangeWithAgent = {
  id: string;
  serial_from: string;
  serial_to: string;
  sales_agent_id: string;
  sales_agents: {
    id: string;
    name: string;
    email: string;
  } | null;
};

  const [serialRanges, setSerialRanges] = useState<SerialRangeWithAgent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editSalesAgent, setEditSalesAgent] = useState<SalesAgent | null>(null);
  const [deleteSalesAgentTarget, setDeleteSalesAgentTarget] = useState<SalesAgent | null>(null);
  const [createSelectedCustomers, setCreateSelectedCustomers] = useState<Set<string>>(new Set());
  const [createSerialFrom, setCreateSerialFrom] = useState<string>("");
  const [createSerialTo, setCreateSerialTo] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);
    try {
      const [agentsResult, customersResult, serialsResult, rangesResult] = await Promise.all([
        getAllSalesAgents(),
        getAllCustomersWithAssignments(),
        getAllSerialNumbers(),
        getSerialRangesWithAssignments(),
      ]);

      if ("error" in agentsResult) {
        toast.error(agentsResult.error || "Unable to load sales agents");
        setSalesAgents([]);
      } else {
        setSalesAgents(agentsResult.salesAgents || []);
      }

      if ("error" in customersResult) {
        toast.error(customersResult.error || "Unable to load customers");
        setCustomers([]);
      } else {
        setCustomers((customersResult.customers || []) as CustomerWithAssignment[]);
      }

      if ("error" in serialsResult) {
        toast.error(serialsResult.error || "Unable to load serial numbers");
        setSerialNumbers([]);
      } else {
        setSerialNumbers(serialsResult.serialNumbers || []);
      }

      if ("error" in rangesResult) {
        // Don't show error if table doesn't exist yet
        if (rangesResult.error && !rangesResult.error.includes("does not exist")) {
          toast.error(rangesResult.error || "Unable to load serial ranges");
        }
        setSerialRanges([]);
      } else {
        setSerialRanges((rangesResult.serialRanges || []) as SerialRangeWithAgent[]);
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  function handleCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const phone_number = String(formData.get("phone_number") || "").trim();

    if (!name || !email || !phone_number) {
      toast.error("Name, email, and phone number are required");
      return;
    }

    // Add selected customers to formData
    createSelectedCustomers.forEach((customerId) => {
      formData.append("customer_ids", customerId);
    });

    // Add serial range to formData
    if (createSerialFrom && createSerialTo) {
      formData.set("serial_from", createSerialFrom);
      formData.set("serial_to", createSerialTo);
    }

    startTransition(async () => {
      const result = await createSalesAgent(formData);
      if (result && "error" in result) {
        if (result.details) {
          const detailsMsg = Array.isArray(result.details)
            ? result.details.map((d) => {
                const detail = d as { agentName?: string; range?: string; customerId?: string };
                return detail.agentName || detail.range || detail.customerId;
              }).join(", ")
            : "";
          toast.error(`${result.error}${detailsMsg ? `: ${detailsMsg}` : ""}`, {
            className: "bg-red-600 text-white border-red-600",
          });
        } else {
          toast.error(result.error, {
            className: "bg-red-600 text-white border-red-600",
          });
        }
        return;
      }
      toast.success("Sales agent created successfully", {
        className: "bg-green-400 text-white border-green-400",
      });
      setCreateOpen(false);
      form.reset();
      setCreateSelectedCustomers(new Set());
      setCreateSerialFrom("");
      setCreateSerialTo("");
      router.refresh();
      fetchData();
    });
  }

  function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editSalesAgent) return;
    const formData = new FormData(event.currentTarget);
    formData.set("id", editSalesAgent.id);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const phone_number = String(formData.get("phone_number") || "").trim();

    if (!name || !email || !phone_number) {
      toast.error("All fields are required");
      return;
    }

    startTransition(async () => {
      const result = await updateSalesAgent(formData);
      if (result && "error" in result) {
        toast.error(result.error, {
          className: "bg-red-600 text-white border-red-600",
        });
        return;
      }
      toast.success("Sales agent updated successfully", {
        className: "bg-green-400 text-white border-green-400",
      });
      setEditOpen(false);
      setEditSalesAgent(null);
      router.refresh();
      fetchData();
    });
  }

  function handleDelete(salesAgent: SalesAgent) {
    setDeleteSalesAgentTarget(salesAgent);
    setDeleteOpen(true);
  }

  function confirmDelete() {
    if (!deleteSalesAgentTarget) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", deleteSalesAgentTarget.id);
      const result = await deleteSalesAgent(formData);
      if (result && "error" in result) {
        toast.error(result.error, {
          className: "bg-red-600 text-white border-red-600",
        });
        return;
      }
      toast.success("Sales agent deleted successfully", {
        className: "bg-green-400 text-white border-green-400",
      });
      setDeleteOpen(false);
      setDeleteSalesAgentTarget(null);
      router.refresh();
      fetchData();
    });
  }

  function openEdit(salesAgent: SalesAgent) {
    setEditSalesAgent(salesAgent);
    setEditOpen(true);
  }

  function toggleCreateCustomer(customerId: string) {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return;

    // Check if already assigned to another agent
    const assignment = customer.sales_agent_customers?.[0];
    if (assignment) {
      toast.error(`Customer is already assigned to ${assignment.sales_agents?.name || "another agent"}`);
      return;
    }

    setCreateSelectedCustomers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(customerId)) {
        newSet.delete(customerId);
      } else {
        newSet.add(customerId);
      }
      return newSet;
    });
  }

  function isSerialRangeAssigned(serial: string): { assigned: boolean; agentName?: string } {
    const range = serialRanges.find(
      (r) => r.serial_from <= serial && r.serial_to >= serial
    );
    if (range) {
      return { assigned: true, agentName: range.sales_agents?.name || "Unknown" };
    }
    return { assigned: false };
  }


  return (
    <div className="space-y-6">
      <Card className="bg-white border shadow-sm">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Sales Agents</CardTitle>
            <CardDescription>
              Create and manage sales agents, assign customers and serial number ranges.
            </CardDescription>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="create-console-btn">
            <PlusCircle className="h-4 w-4 mr-2" />
            Create Sales Agent
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-16 text-center text-secondary-muted">
              Loading sales agents...
            </div>
          ) : salesAgents.length === 0 ? (
            <div className="py-16 text-center text-secondary-muted">
              No sales agents found. Create your first sales agent to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesAgents.map((agent) => (
                    <TableRow key={agent.id}>
                      <TableCell className="font-semibold">{agent.name}</TableCell>
                      <TableCell>{agent.email}</TableCell>
                      <TableCell>{agent.phone_number}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(agent)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(agent)}
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

      {/* Create Sales Agent Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => {
        setCreateOpen(open);
        if (!open) {
          setCreateSelectedCustomers(new Set());
          setCreateSerialFrom("");
          setCreateSerialTo("");
        }
      }}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Sales Agent</DialogTitle>
            <DialogDescription>
              Add a new sales agent with customer and serial number allocations.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Basic Information</h3>
              <div className="space-y-2">
                <Label htmlFor="create-name">Name *</Label>
                <Input id="create-name" name="name" placeholder="John Doe" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-email">Email *</Label>
                <Input id="create-email" name="email" type="email" placeholder="john@example.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-phone_number">Phone Number *</Label>
                <Input id="create-phone_number" name="phone_number" placeholder="+1 234 567 8900" required />
              </div>
            </div>

            {/* Customer Allocation */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Customer Allocation</h3>
              <div className="max-h-[200px] overflow-y-auto border rounded-md p-3 space-y-2">
                {customers.length === 0 ? (
                  <div className="py-4 text-center text-sm text-secondary-muted">
                    No customers available.
                  </div>
                ) : (
                  customers.map((customer) => {
                    const assignment = customer.sales_agent_customers?.[0];
                    const isSelected = createSelectedCustomers.has(customer.id);
                    const isDisabled = !!assignment;

                    return (
                      <div
                        key={customer.id}
                        className={`flex items-center space-x-2 p-2 rounded border ${
                          isDisabled ? "bg-gray-100 opacity-60" : ""
                        }`}
                      >
                        <Checkbox
                          id={`create-customer-${customer.id}`}
                          checked={isSelected}
                          disabled={isDisabled}
                          onCheckedChange={() => toggleCreateCustomer(customer.id)}
                        />
                        <Label
                          htmlFor={`create-customer-${customer.id}`}
                          className={`flex-1 cursor-pointer text-sm ${isDisabled ? "cursor-not-allowed" : ""}`}
                        >
                          <div className="font-medium">{customer.name}</div>
                          <div className="text-xs text-secondary-muted">{customer.company_name}</div>
                          {isDisabled && (
                            <div className="text-xs text-red-600 mt-1">
                              Already assigned to: {assignment.sales_agents?.name || "Unknown"}
                            </div>
                          )}
                        </Label>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Serial Number Allocation */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Serial Number Range Allocation</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="create-serial-from">Serial From</Label>
                  <Select
                    value={createSerialFrom}
                    onValueChange={setCreateSerialFrom}
                  >
                    <SelectTrigger id="create-serial-from" className="w-full bg-white border border-gray-300 hover:border-gray-400 focus:border-primary-accent">
                      <SelectValue placeholder="Select start" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px] overflow-y-auto bg-white border border-gray-200 shadow-lg">
                      {serialNumbers.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-secondary-muted bg-gray-50">
                          No serial numbers available
                        </div>
                      ) : (
                        serialNumbers.map((serial) => {
                          const assigned = isSerialRangeAssigned(serial);
                          return (
                            <SelectItem
                              key={serial}
                              value={serial}
                              disabled={assigned.assigned}
                              className={`${
                                assigned.assigned 
                                  ? "opacity-60 cursor-not-allowed bg-gray-50 hover:bg-gray-50" 
                                  : "hover:bg-blue-50 cursor-pointer bg-white"
                              } py-2 px-3 border-b border-gray-100 last:border-b-0`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span className="font-mono text-sm font-medium text-gray-900">{serial}</span>
                                {assigned.assigned && (
                                  <span className="ml-2 text-xs text-red-600 font-medium">
                                    ({assigned.agentName})
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-serial-to">Serial To</Label>
                  <Select
                    value={createSerialTo}
                    onValueChange={setCreateSerialTo}
                    disabled={!createSerialFrom}
                  >
                    <SelectTrigger 
                      id="create-serial-to" 
                      className={`w-full border ${
                        !createSerialFrom 
                          ? "bg-gray-50 border-gray-200 cursor-not-allowed" 
                          : "bg-white border-gray-300 hover:border-gray-400 focus:border-primary-accent"
                      }`}
                    >
                      <SelectValue placeholder={createSerialFrom ? "Select end" : "Select start first"} />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px] overflow-y-auto bg-white border border-gray-200 shadow-lg">
                      {serialNumbers.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-secondary-muted bg-gray-50">
                          No serial numbers available
                        </div>
                      ) : (
                        serialNumbers
                          .filter((s) => !createSerialFrom || s >= createSerialFrom)
                          .map((serial) => {
                            const assigned = isSerialRangeAssigned(serial);
                            return (
                              <SelectItem
                                key={serial}
                                value={serial}
                                disabled={assigned.assigned}
                                className={`${
                                  assigned.assigned 
                                    ? "opacity-60 cursor-not-allowed bg-gray-50 hover:bg-gray-50" 
                                    : "hover:bg-blue-50 cursor-pointer bg-white"
                                } py-2 px-3 border-b border-gray-100 last:border-b-0`}
                              >
                                <div className="flex items-center justify-between w-full">
                                  <span className="font-mono text-sm font-medium text-gray-900">{serial}</span>
                                  {assigned.assigned && (
                                    <span className="ml-2 text-xs text-red-600 font-medium">
                                      ({assigned.agentName})
                                    </span>
                                  )}
                                </div>
                              </SelectItem>
                            );
                          })
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {createSerialFrom && createSerialTo && (
                <div className="p-3 bg-blue-50 rounded-md border border-blue-200 shadow-sm">
                  <div className="text-sm font-semibold text-blue-900">
                    Selected Range: <span className="font-mono text-blue-700">{createSerialFrom}</span> - <span className="font-mono text-blue-700">{createSerialTo}</span>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setCreateSelectedCustomers(new Set());
                  setCreateSerialFrom("");
                  setCreateSerialTo("");
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} className="create-console-btn">
                {isPending ? "Creating..." : "Create Sales Agent"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Sales Agent Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Sales Agent</DialogTitle>
            <DialogDescription>
              Update sales agent information.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                name="name"
                defaultValue={editSalesAgent?.name ?? ""}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email *</Label>
              <Input
                id="edit-email"
                name="email"
                type="email"
                defaultValue={editSalesAgent?.email ?? ""}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone_number">Phone Number *</Label>
              <Input
                id="edit-phone_number"
                name="phone_number"
                defaultValue={editSalesAgent?.phone_number ?? ""}
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

      {/* Delete Sales Agent Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sales Agent</DialogTitle>
            <DialogDescription>
              Delete {deleteSalesAgentTarget?.name}? This cannot be undone.
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
              {isPending ? "Deleting..." : "Delete Sales Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
