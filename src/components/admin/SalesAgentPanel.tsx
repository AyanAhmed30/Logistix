"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createSalesAgent,
  getAllSalesAgents,
  updateSalesAgent,
  deleteSalesAgent,
  type SalesAgent,
} from "@/app/actions/sales_agents";
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
import { PlusCircle, Trash2, Edit, TrendingUp, Truck, Bell, Package, Container, FileText, Settings, ClipboardList, Receipt, UserPlus, Users, ShoppingCart } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";


// Available permissions that can be assigned to sales agents
const AVAILABLE_PERMISSIONS = [
  { key: "lead", label: "Lead", icon: UserPlus },
  { key: "pipeline", label: "Pipeline", icon: FileText },
  { key: "customer-list", label: "Customer List", icon: Users },
  { key: "manage-request", label: "Manage Request", icon: ShoppingCart },
  { key: "dashboard", label: "Dashboard", icon: TrendingUp },
  { key: "tracking", label: "Order Tracking", icon: Truck },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "management", label: "Order Management", icon: Package },
  { key: "console", label: "Console", icon: Container },
  { key: "loading-instruction", label: "Loading Instruction", icon: FileText },
  { key: "operations", label: "Operations", icon: Settings },
  { key: "import-packing-list", label: "Import Packing List", icon: ClipboardList },
  { key: "import-invoice", label: "Import Invoice", icon: Receipt },
] as const;

export type PermissionKey = typeof AVAILABLE_PERMISSIONS[number]["key"];

type Props = {
  initialCreateOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
};

export function SalesAgentPanel({ initialCreateOpen = false, onCreateOpenChange }: Props = {}) {
  const router = useRouter();
  const [salesAgents, setSalesAgents] = useState<SalesAgent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(initialCreateOpen);
  
  // Sync with external prop changes
  useEffect(() => {
    if (initialCreateOpen !== undefined) {
      setCreateOpen(initialCreateOpen);
    }
  }, [initialCreateOpen]);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editSalesAgent, setEditSalesAgent] = useState<SalesAgent | null>(null);
  const [deleteSalesAgentTarget, setDeleteSalesAgentTarget] = useState<SalesAgent | null>(null);
  const [isPending, startTransition] = useTransition();
  const [selectedPermissions, setSelectedPermissions] = useState<PermissionKey[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);
    try {
      const agentsResult = await getAllSalesAgents();

      if ("error" in agentsResult) {
        toast.error(agentsResult.error || "Unable to load sales agents");
        setSalesAgents([]);
      } else {
        setSalesAgents(agentsResult.salesAgents || []);
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
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "").trim();

    if (!name || !username || !password) {
      toast.error("Name, username, and password are required");
      return;
    }

    // Add permissions to formData
    formData.set("permissions", JSON.stringify(selectedPermissions));

    startTransition(async () => {
      const result = await createSalesAgent(formData);
      if (result && "error" in result) {
        toast.error(result.error, {
          className: "bg-red-600 text-white border-red-600",
        });
        return;
      }
      toast.success("Sales agent created successfully", {
        className: "bg-green-400 text-white border-green-400",
      });
      setCreateOpen(false);
      setSelectedPermissions([]);
      form.reset();
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
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "").trim();

    if (!name || !username) {
      toast.error("Name and username are required");
      return;
    }

    // Only update password if provided
    if (password) {
      formData.set("password", password);
    }

    // Add permissions to formData
    formData.set("permissions", JSON.stringify(selectedPermissions));

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
      setSelectedPermissions([]);
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
    // Load existing permissions
    const permissions = Array.isArray(salesAgent.permissions) 
      ? (salesAgent.permissions as PermissionKey[])
      : [];
    setSelectedPermissions(permissions);
    setEditOpen(true);
  }

  function togglePermission(permission: PermissionKey) {
    setSelectedPermissions((prev) =>
      prev.includes(permission)
        ? prev.filter((p) => p !== permission)
        : [...prev, permission]
    );
  }

  function handleCreateOpenChange(open: boolean) {
    setCreateOpen(open);
    if (onCreateOpenChange) {
      onCreateOpenChange(open);
    }
    if (!open) {
      setSelectedPermissions([]);
    }
  }

  function handleEditOpenChange(open: boolean) {
    setEditOpen(open);
    if (!open) {
      setEditSalesAgent(null);
      setSelectedPermissions([]);
    }
  }

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
                <TableHead>Username</TableHead>
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
                      <TableCell>{agent.username || "-"}</TableCell>
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
      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Sales Agent</DialogTitle>
            <DialogDescription>
              Add a new sales agent with login credentials and assign module permissions.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Side - Form Fields */}
            <div className="space-y-4">
              <form onSubmit={handleCreateSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="create-name">Name *</Label>
                  <Input id="create-name" name="name" placeholder="John Doe" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-username">Username *</Label>
                  <Input id="create-username" name="username" placeholder="johndoe" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-password">Password *</Label>
                  <Input id="create-password" name="password" type="password" placeholder="Enter password" required />
                </div>
                <DialogFooter className="sm:justify-start pt-4">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => handleCreateOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isPending} className="create-console-btn">
                    {isPending ? "Creating..." : "Create Sales Agent"}
                  </Button>
                </DialogFooter>
              </form>
            </div>

            {/* Right Side - Permission Selector */}
            <div className="space-y-4 border-l pl-6">
              <div>
                <Label className="text-base font-semibold">Module Permissions</Label>
                <p className="text-sm text-secondary-muted mt-1">
                  Select additional modules this sales agent can access.
                </p>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {AVAILABLE_PERMISSIONS.map((permission) => {
                  const Icon = permission.icon;
                  return (
                    <div
                      key={permission.key}
                      className="flex items-center space-x-2 p-2 rounded-md hover:bg-slate-50 cursor-pointer"
                      onClick={() => togglePermission(permission.key)}
                    >
                      <Checkbox
                        id={`create-permission-${permission.key}`}
                        checked={selectedPermissions.includes(permission.key)}
                        onCheckedChange={() => togglePermission(permission.key)}
                      />
                      <Label
                        htmlFor={`create-permission-${permission.key}`}
                        className="flex items-center gap-2 cursor-pointer flex-1"
                      >
                        <Icon className="h-4 w-4" />
                        <span>{permission.label}</span>
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Sales Agent Dialog */}
      <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Sales Agent</DialogTitle>
            <DialogDescription>
              Update sales agent information and module permissions.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Side - Form Fields */}
            <div className="space-y-4">
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
                  <Label htmlFor="edit-username">Username *</Label>
                  <Input
                    id="edit-username"
                    name="username"
                    defaultValue={editSalesAgent?.username ?? ""}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-password">Password (leave blank to keep current)</Label>
                  <Input
                    id="edit-password"
                    name="password"
                    type="password"
                    placeholder="Enter new password"
                  />
                </div>
                <DialogFooter className="sm:justify-start pt-4">
                  <Button type="submit" disabled={isPending}>
                    {isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </form>
            </div>

            {/* Right Side - Permission Selector */}
            <div className="space-y-4 border-l pl-6">
              <div>
                <Label className="text-base font-semibold">Module Permissions</Label>
                <p className="text-sm text-secondary-muted mt-1">
                  Select additional modules this sales agent can access.
                </p>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {AVAILABLE_PERMISSIONS.map((permission) => {
                  const Icon = permission.icon;
                  return (
                    <div
                      key={permission.key}
                      className="flex items-center space-x-2 p-2 rounded-md hover:bg-slate-50 cursor-pointer"
                      onClick={() => togglePermission(permission.key)}
                    >
                      <Checkbox
                        id={`edit-permission-${permission.key}`}
                        checked={selectedPermissions.includes(permission.key)}
                        onCheckedChange={() => togglePermission(permission.key)}
                      />
                      <Label
                        htmlFor={`edit-permission-${permission.key}`}
                        className="flex items-center gap-2 cursor-pointer flex-1"
                      >
                        <Icon className="h-4 w-4" />
                        <span>{permission.label}</span>
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
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
