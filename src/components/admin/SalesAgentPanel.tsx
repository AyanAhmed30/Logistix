"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createSalesAgent,
  getAllSalesAgents,
  getAllCustomersWithAssignments,
  updateSalesAgent,
  deleteSalesAgent,
  type SalesAgent,
} from "@/app/actions/sales_agents";
import { getAvailableCustomerSequences } from "@/app/actions/customers";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlusCircle, Trash2, Edit } from "lucide-react";


export function SalesAgentPanel() {
  const router = useRouter();
  const [salesAgents, setSalesAgents] = useState<SalesAgent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editSalesAgent, setEditSalesAgent] = useState<SalesAgent | null>(null);
  const [deleteSalesAgentTarget, setDeleteSalesAgentTarget] = useState<SalesAgent | null>(null);
  const [createFromSeq, setCreateFromSeq] = useState<string>("");
  const [createToSeq, setCreateToSeq] = useState<string>("");
  const [availableSequences, setAvailableSequences] = useState<number[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);
    try {
      const [agentsResult, customersResult, sequencesResult] = await Promise.all([
        getAllSalesAgents(),
        getAllCustomersWithAssignments(),
        getAvailableCustomerSequences(),
      ]);

      if ("error" in agentsResult) {
        toast.error(agentsResult.error || "Unable to load sales agents");
        setSalesAgents([]);
      } else {
        setSalesAgents(agentsResult.salesAgents || []);
      }

      if ("error" in customersResult) {
        toast.error(customersResult.error || "Unable to load customers");
      }

      if ("error" in sequencesResult) {
        setAvailableSequences([]);
      } else {
        // Remove duplicates and sort
        const uniqueSequences = Array.from(new Set(sequencesResult.sequences || [])).sort((a, b) => a - b);
        setAvailableSequences(uniqueSequences);
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

    // Add sequence range if provided
    if (createFromSeq && createToSeq) {
      formData.set("from_seq", createFromSeq);
      formData.set("to_seq", createToSeq);
    }

    startTransition(async () => {
      const result = await createSalesAgent(formData);
      if (result && "error" in result) {
        if (result.details) {
          const detailsMsg = Array.isArray(result.details)
            ? result.details.map((d) => {
                const detail = d as { agentName?: string; customerId?: string };
                return detail.agentName || detail.customerId;
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
      setCreateFromSeq("");
      setCreateToSeq("");
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

  // Calculate available range info
  const minSeq = availableSequences.length > 0 ? Math.min(...availableSequences) : null;
  const maxSeq = availableSequences.length > 0 ? Math.max(...availableSequences) : null;

  return (
    <div className="space-y-6">
      <Card className="bg-white border shadow-sm">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Sales Agents</CardTitle>
            <CardDescription>
              Create and manage sales agents. Assign customers during creation.
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
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesAgents.map((agent) => (
                    <TableRow key={agent.id}>
                      <TableCell>
                        {agent.code ? (
                          <span className="font-mono font-semibold text-primary-accent">{agent.code}</span>
                        ) : (
                          <span className="text-secondary-muted text-sm">-</span>
                        )}
                      </TableCell>
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
          setCreateFromSeq("");
          setCreateToSeq("");
        }
      }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Sales Agent</DialogTitle>
            <DialogDescription>
              Add a new sales agent. You can allocate a range of customer sequences during creation. Customer IDs will be generated automatically (e.g., 10101-10115).
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

            {/* Customer Sequence Range Allocation */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Customer Sequence Range Allocation (Optional)</h3>
              <p className="text-xs text-secondary-muted">
                Select a range of customer sequences to allocate. Example: If you select 01-15, customer IDs will be 10101-10115.
              </p>
              {minSeq !== null && maxSeq !== null ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="create-from-seq">From Sequence</Label>
                      <Select
                        value={createFromSeq}
                        onValueChange={setCreateFromSeq}
                      >
                        <SelectTrigger id="create-from-seq" className="w-full">
                          <SelectValue placeholder="Select start" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px] overflow-y-auto bg-white border border-gray-200 shadow-lg">
                          {availableSequences.map((seq, index) => (
                            <SelectItem
                              key={`from-seq-${seq}-${index}`}
                              value={seq.toString()}
                              className="hover:bg-blue-50 cursor-pointer bg-white py-2 px-3"
                            >
                              <span className="font-mono text-sm font-medium">{seq.toString().padStart(2, '0')}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="create-to-seq">To Sequence</Label>
                      <Select
                        value={createToSeq}
                        onValueChange={setCreateToSeq}
                        disabled={!createFromSeq}
                      >
                        <SelectTrigger 
                          id="create-to-seq" 
                          className={`w-full ${
                            !createFromSeq 
                              ? "bg-gray-50 border-gray-200 cursor-not-allowed" 
                              : "bg-white border-gray-300"
                          }`}
                        >
                          <SelectValue placeholder={createFromSeq ? "Select end" : "Select start first"} />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px] overflow-y-auto bg-white border border-gray-200 shadow-lg">
                          {availableSequences
                            .filter((seq) => !createFromSeq || seq >= parseInt(createFromSeq, 10))
                            .map((seq, index) => (
                              <SelectItem
                                key={`to-seq-${seq}-${index}`}
                                value={seq.toString()}
                                className="hover:bg-blue-50 cursor-pointer bg-white py-2 px-3"
                              >
                                <span className="font-mono text-sm font-medium">{seq.toString().padStart(2, '0')}</span>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {createFromSeq && createToSeq && (
                    <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
                      <div className="text-sm font-semibold text-blue-900">
                        Selected Range: {createFromSeq.padStart(2, '0')} - {createToSeq.padStart(2, '0')}
                      </div>
                      <div className="text-xs text-blue-700 mt-1">
                        Customer IDs will be generated as: 101{createFromSeq.padStart(2, '0')} - 101{createToSeq.padStart(2, '0')}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                  <div className="text-sm text-gray-600">
                    No unassigned customers available. Create customers first.
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
                  setCreateFromSeq("");
                  setCreateToSeq("");
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
