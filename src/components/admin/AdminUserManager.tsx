"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createUser, deleteUser, updateUser } from "@/app/actions/user";
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
import { PlusCircle, UsersRound, X, Truck, Bell, Package, Container, FileText, TrendingUp, ShoppingCart, Settings, ClipboardList, Receipt, UserCog, ChevronDown } from "lucide-react";
import { OrderTrackingPanel } from "@/components/admin/OrderTrackingPanel";
import { AdminNotificationsPanel } from "@/components/admin/AdminNotificationsPanel";
import { OrderManagementPanel } from "@/components/admin/OrderManagementPanel";
import { ConsolePanel } from "@/components/admin/ConsolePanel";
import { LoadingInstructionPanel } from "@/components/admin/LoadingInstructionPanel";
import { AdminDashboardOverview } from "@/components/admin/AdminDashboardOverview";
import { SalesPanel } from "@/components/admin/SalesPanel";
import { OperationsPanel } from "@/components/admin/OperationsPanel";
import { ImportPackingListPanel } from "@/components/admin/ImportPackingListPanel";
import { ImportInvoicePanel } from "@/components/admin/ImportInvoicePanel";
import { SalesAgentPanel } from "@/components/admin/SalesAgentPanel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AppUser = {
  id: string;
  username: string;
  password: string;
  created_at: string;
};

type Props = {
  users: AppUser[];
  userCount: number;
  isSidebarOpen: boolean;
  isSidebarCollapsed: boolean;
  onSidebarClose: () => void;
  activeTab:
    | "dashboard"
    | "create"
    | "profiles"
    | "tracking"
    | "notifications"
    | "management"
    | "console"
    | "loading-instruction"
    | "sales"
    | "operations"
    | "import-packing-list"
    | "import-invoice";
  onTabChange: (
    tab:
      | "dashboard"
      | "create"
      | "profiles"
      | "tracking"
      | "notifications"
      | "management"
      | "console"
      | "loading-instruction"
      | "sales"
      | "operations"
      | "import-packing-list"
      | "import-invoice"
  ) => void;
};

export function AdminUserManager({
  users,
  userCount,
  isSidebarOpen,
  isSidebarCollapsed,
  onSidebarClose,
  activeTab,
  onTabChange,
}: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [createSalesAgentOpen, setCreateSalesAgentOpen] = useState(false);
  const [createType, setCreateType] = useState<"user" | "sales-agent">("user");
  const [profilesSubTab, setProfilesSubTab] = useState<"users" | "sales-agent">("users");
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState<AppUser | null>(null);
  const [isPending, startTransition] = useTransition();

  const sortedUsers = useMemo(() => {
    return [...users].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [users]);

  function handleCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "").trim();

    if (!username || !password) {
      toast.error("Username and password are required");
      return;
    }

    startTransition(async () => {
      const result = await createUser(formData);
      if (result && "error" in result) {
        toast.error(result.error, {
          className: "bg-red-600 text-white border-red-600",
        });
        return;
      }
      toast.success("User account generated", {
        className: "bg-green-400 text-white border-green-400",
      });
      setCreateOpen(false);
      form.reset();
      router.refresh();
    });
  }

  function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editUser) return;
    const formData = new FormData(event.currentTarget);
    formData.set("id", editUser.id);
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "").trim();

    if (!username || !password) {
      toast.error("Username and password are required");
      return;
    }

    startTransition(async () => {
      const result = await updateUser(formData);
      if (result && "error" in result) {
        toast.error(result.error, {
          className: "bg-red-600 text-white border-red-600",
        });
        return;
      }
      toast.success("User updated", {
        className: "bg-green-400 text-white border-green-400",
      });
      setEditOpen(false);
      setEditUser(null);
      router.refresh();
    });
  }

  function handleDelete(user: AppUser) {
    setDeleteUserTarget(user);
    setDeleteOpen(true);
  }

  function confirmDelete() {
    if (!deleteUserTarget) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", deleteUserTarget.id);
      const result = await deleteUser(formData);
      if (result && "error" in result) {
        toast.error(result.error, {
          className: "bg-red-600 text-white border-red-600",
        });
        return;
      }
      toast.success("User deleted", {
        className: "bg-green-400 text-white border-green-400",
      });
      setDeleteOpen(false);
      setDeleteUserTarget(null);
      router.refresh();
    });
  }

  function openEdit(user: AppUser) {
    setEditUser(user);
    setEditOpen(true);
  }

  function handleTabSelect(
    tab:
      | "dashboard"
      | "create"
      | "profiles"
      | "tracking"
      | "notifications"
      | "management"
      | "console"
      | "loading-instruction"
      | "sales"
      | "operations"
      | "import-packing-list"
      | "import-invoice"
  ) {
    onTabChange(tab);
    onSidebarClose();
  }

  const sidebarWidth = isSidebarCollapsed ? "md:w-20" : "md:w-72";
  const mainContentMargin = isSidebarCollapsed ? "md:pl-20" : "md:pl-72";

  return (
    <div className={`pt-20 ${mainContentMargin}`}>
      <aside
        className={`fixed inset-y-0 left-0 z-50 ${sidebarWidth} bg-white border-r shadow-lg transform transition-all duration-200 md:translate-x-0 md:top-16 md:h-[calc(100vh-4rem)] md:shadow-none overflow-y-auto ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between md:hidden">
            <h2 className="text-sm font-semibold text-secondary-muted uppercase tracking-widest">
              Menu
            </h2>
            <button
              className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-slate-200 text-primary-dark hover:bg-slate-50"
              onClick={onSidebarClose}
              aria-label="Close sidebar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className={`space-y-1 ${isSidebarCollapsed ? "hidden md:block" : ""}`}>
            <h2 className="text-lg font-black text-primary-dark">Admin Tools</h2>
            <p className="text-xs text-secondary-muted">Manage access and profiles</p>
          </div>
          <div className="grid gap-2 sidebar-buttons">
          <Button
            variant={activeTab === "dashboard" ? "default" : "outline"}
            className="justify-start gap-2 sidebar-button"
            onClick={() => handleTabSelect("dashboard")}
            title="Dashboard"
          >
            <TrendingUp className="h-4 w-4 shrink-0 sidebar-icon" />
            {!isSidebarCollapsed && <span className="sidebar-text">Dashboard</span>}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={activeTab === "create" ? "default" : "outline"}
                className="justify-start gap-2 sidebar-button"
                title="Create New User or Sales Agent"
              >
                <PlusCircle className="h-4 w-4 shrink-0 sidebar-icon" />
                {!isSidebarCollapsed && <span className="sidebar-text">Create New User</span>}
                {!isSidebarCollapsed && <ChevronDown className="h-4 w-4 ml-auto" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => {
                  setCreateType("user");
                  setCreateOpen(true);
                  handleTabSelect("create");
                }}
              >
                <UsersRound className="h-4 w-4 mr-2" />
                Create User
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setCreateType("sales-agent");
                  setCreateSalesAgentOpen(true);
                  handleTabSelect("profiles");
                  setProfilesSubTab("sales-agent");
                }}
              >
                <UserCog className="h-4 w-4 mr-2" />
                Create Sales Agent
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant={activeTab === "profiles" ? "default" : "outline"}
            className="justify-start gap-2 sidebar-button"
            onClick={() => handleTabSelect("profiles")}
            title="User Profiles"
          >
            <UsersRound className="h-4 w-4 shrink-0 sidebar-icon" />
            {!isSidebarCollapsed && <span className="sidebar-text">User Profiles</span>}
          </Button>
          <Button
            variant={activeTab === "tracking" ? "default" : "outline"}
            className="justify-start gap-2 sidebar-button"
            onClick={() => handleTabSelect("tracking")}
            title="Order Tracking"
          >
            <Truck className="h-4 w-4 shrink-0 sidebar-icon" />
            {!isSidebarCollapsed && <span className="sidebar-text">Order Tracking</span>}
          </Button>
          <Button
            variant={activeTab === "notifications" ? "default" : "outline"}
            className="justify-start gap-2 sidebar-button"
            onClick={() => handleTabSelect("notifications")}
            title="Notifications"
          >
            <Bell className="h-4 w-4 shrink-0 sidebar-icon" />
            {!isSidebarCollapsed && <span className="sidebar-text">Notifications</span>}
          </Button>
          <Button
            variant={activeTab === "management" ? "default" : "outline"}
            className="justify-start gap-2 sidebar-button"
            onClick={() => handleTabSelect("management")}
            title="Order Management"
          >
            <Package className="h-4 w-4 shrink-0 sidebar-icon" />
            {!isSidebarCollapsed && <span className="sidebar-text">Order Management</span>}
          </Button>
          <Button
            variant={activeTab === "console" ? "default" : "outline"}
            className="justify-start gap-2 sidebar-button"
            onClick={() => handleTabSelect("console")}
            title="Console"
          >
            <Container className="h-4 w-4 shrink-0 sidebar-icon" />
            {!isSidebarCollapsed && <span className="sidebar-text">Console</span>}
          </Button>
          <Button
            variant={activeTab === "loading-instruction" ? "default" : "outline"}
            className="justify-start gap-2 sidebar-button"
            onClick={() => handleTabSelect("loading-instruction")}
            title="Loading Instruction"
          >
            <FileText className="h-4 w-4 shrink-0 sidebar-icon" />
            {!isSidebarCollapsed && <span className="sidebar-text">Loading Instruction</span>}
          </Button>
          <Button
            variant={activeTab === "sales" ? "default" : "outline"}
            className="justify-start gap-2 sidebar-button"
            onClick={() => handleTabSelect("sales")}
            title="Sales"
          >
            <ShoppingCart className="h-4 w-4 shrink-0 sidebar-icon" />
            {!isSidebarCollapsed && <span className="sidebar-text">Sales</span>}
          </Button>
          <Button
            variant={activeTab === "operations" ? "default" : "outline"}
            className="justify-start gap-2 sidebar-button"
            onClick={() => handleTabSelect("operations")}
            title="Operations"
          >
            <Settings className="h-4 w-4 shrink-0 sidebar-icon" />
            {!isSidebarCollapsed && <span className="sidebar-text">Operations</span>}
          </Button>
          <Button
            variant={activeTab === "import-packing-list" ? "default" : "outline"}
            className="justify-start gap-2 sidebar-button"
            onClick={() => handleTabSelect("import-packing-list")}
            title="Import Packing List"
          >
            <ClipboardList className="h-4 w-4 shrink-0 sidebar-icon" />
            {!isSidebarCollapsed && <span className="sidebar-text">Import Packing List</span>}
          </Button>
          <Button
            variant={activeTab === "import-invoice" ? "default" : "outline"}
            className="justify-start gap-2 sidebar-button"
            onClick={() => handleTabSelect("import-invoice")}
            title="Import Invoice"
          >
            <Receipt className="h-4 w-4 shrink-0 sidebar-icon" />
            {!isSidebarCollapsed && <span className="sidebar-text">Import Invoice</span>}
          </Button>
          </div>
        </div>
      </aside>

      {isSidebarOpen && (
        <button
          className="fixed inset-0 z-40 bg-black/20 md:hidden"
          onClick={onSidebarClose}
          aria-label="Close sidebar"
        />
      )}

      <section className="px-6 pb-10 md:px-10">
        {activeTab === "dashboard" ? (
          <AdminDashboardOverview />
        ) : activeTab === "notifications" ? (
          <AdminNotificationsPanel />
        ) : activeTab === "tracking" ? (
          <OrderTrackingPanel />
        ) : activeTab === "management" ? (
          <OrderManagementPanel />
        ) : activeTab === "console" ? (
          <ConsolePanel />
        ) : activeTab === "loading-instruction" ? (
          <LoadingInstructionPanel />
        ) : activeTab === "sales" ? (
          <SalesPanel />
        ) : activeTab === "operations" ? (
          <OperationsPanel />
        ) : activeTab === "import-packing-list" ? (
          <ImportPackingListPanel />
        ) : activeTab === "import-invoice" ? (
          <ImportInvoicePanel />
        ) : activeTab === "profiles" ? (
          <div className="space-y-6">
            {/* Sub-tabs */}
            <div className="flex gap-2 border-b overflow-x-auto">
              <Button
                variant={profilesSubTab === "users" ? "default" : "ghost"}
                onClick={() => setProfilesSubTab("users")}
                className="rounded-b-none shrink-0 sidebar-button"
                data-variant={profilesSubTab === "users" ? "default" : "outline"}
              >
                <UsersRound className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Users</span>
              </Button>
              <Button
                variant={profilesSubTab === "sales-agent" ? "default" : "ghost"}
                onClick={() => setProfilesSubTab("sales-agent")}
                className="rounded-b-none shrink-0 sidebar-button"
                data-variant={profilesSubTab === "sales-agent" ? "default" : "outline"}
              >
                <UserCog className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Sales Agent</span>
              </Button>
            </div>

            {/* Users Sub-tab */}
            {profilesSubTab === "users" && (
              <>
                <Card className="bg-white border shadow-sm">
                  <CardHeader>
                    <CardTitle>Admin Profile</CardTitle>
                    <CardDescription>Total users in the system</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-black text-primary-dark">
                      {userCount.toString().padStart(2, "0")}
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-white border shadow-sm">
                  <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <CardTitle>User Profiles</CardTitle>
                      <CardDescription>
                        View, update, and remove user accounts in real time.
                      </CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button>
                          <PlusCircle className="h-4 w-4 mr-2" />
                          Create New User
                          <ChevronDown className="h-4 w-4 ml-2" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setCreateType("user");
                            setCreateOpen(true);
                          }}
                        >
                          <UsersRound className="h-4 w-4 mr-2" />
                          Create User
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setCreateType("sales-agent");
                            setCreateSalesAgentOpen(true);
                            setProfilesSubTab("sales-agent");
                          }}
                        >
                          <UserCog className="h-4 w-4 mr-2" />
                          Create Sales Agent
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardHeader>
                  <CardContent>
                    {sortedUsers.length === 0 ? (
                      <div className="py-16 text-center text-secondary-muted">
                        No users found. Create your first account to get started.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Username</TableHead>
                            <TableHead>Password</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedUsers.map((user) => (
                            <TableRow key={user.id}>
                              <TableCell className="font-semibold">{user.username}</TableCell>
                              <TableCell className="text-secondary-muted">{user.password}</TableCell>
                              <TableCell className="text-secondary-muted">
                                {new Date(user.created_at).toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right space-x-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openEdit(user)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDelete(user)}
                                  disabled={isPending}
                                >
                                  Delete
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {/* Sales Agent Sub-tab */}
            {profilesSubTab === "sales-agent" && (
              <SalesAgentPanel
                initialCreateOpen={createSalesAgentOpen}
                onCreateOpenChange={setCreateSalesAgentOpen}
              />
            )}
          </div>
        ) : null}
      </section>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              Add a new member account to the Logistix system.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-username">Username</Label>
              <Input id="create-username" name="username" placeholder="johndoe" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-password">Password</Label>
              <Input
                id="create-password"
                name="password"
                type="password"
                placeholder="••••••••"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Creating..." : "Generate User Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update credentials for this user profile.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-username">Username</Label>
              <Input
                id="edit-username"
                name="username"
                defaultValue={editUser?.username ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-password">Password</Label>
              <Input
                id="edit-password"
                name="password"
                type="password"
                defaultValue={editUser?.password ?? ""}
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

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Delete {deleteUserTarget?.username}? This cannot be undone.
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
              {isPending ? "Deleting..." : "Delete User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
