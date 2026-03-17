"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createOperationsUser,
  getAllOperationsUsers,
  updateOperationsUser,
  deleteOperationsUser,
  type OperationsUser,
} from "@/app/actions/operations_users";
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
import { PlusCircle, Trash2, Edit, Wrench } from "lucide-react";

type Props = {
  initialCreateOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
};

export function OperationsUserPanel({ initialCreateOpen = false, onCreateOpenChange }: Props) {
  const router = useRouter();
  const [operationsUsers, setOperationsUsers] = useState<OperationsUser[]>([]);
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
  const [editUser, setEditUser] = useState<OperationsUser | null>(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState<OperationsUser | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);
    try {
      const result = await getAllOperationsUsers();
      if ("error" in result) {
        toast.error(result.error || "Unable to load operations users");
        setOperationsUsers([]);
      } else {
        setOperationsUsers(result.operationsUsers || []);
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

    startTransition(async () => {
      const result = await createOperationsUser(formData);
      if (result && "error" in result) {
        toast.error(result.error, {
          className: "bg-red-600 text-white border-red-600",
        });
        return;
      }
      toast.success("Operations user created successfully", {
        className: "bg-green-400 text-white border-green-400",
      });
      setCreateOpen(false);
      form.reset();
      router.refresh();
      fetchData();
    });
  }

  function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editUser) return;
    const formData = new FormData(event.currentTarget);
    formData.set("id", editUser.id);
    const name = String(formData.get("name") || "").trim();
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "").trim();

    if (!name || !username || !password) {
      toast.error("All fields are required");
      return;
    }

    startTransition(async () => {
      const result = await updateOperationsUser(formData);
      if (result && "error" in result) {
        toast.error(result.error, {
          className: "bg-red-600 text-white border-red-600",
        });
        return;
      }
      toast.success("Operations user updated successfully", {
        className: "bg-green-400 text-white border-green-400",
      });
      setEditOpen(false);
      setEditUser(null);
      router.refresh();
      fetchData();
    });
  }

  function handleDelete(user: OperationsUser) {
    setDeleteUserTarget(user);
    setDeleteOpen(true);
  }

  function confirmDelete() {
    if (!deleteUserTarget) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", deleteUserTarget.id);
      const result = await deleteOperationsUser(formData);
      if (result && "error" in result) {
        toast.error(result.error, {
          className: "bg-red-600 text-white border-red-600",
        });
        return;
      }
      toast.success("Operations user deleted successfully", {
        className: "bg-green-400 text-white border-green-400",
      });
      setDeleteOpen(false);
      setDeleteUserTarget(null);
      router.refresh();
      fetchData();
    });
  }

  function openEdit(user: OperationsUser) {
    setEditUser(user);
    setEditOpen(true);
  }

  function handleCreateOpenChange(open: boolean) {
    setCreateOpen(open);
    if (onCreateOpenChange) {
      onCreateOpenChange(open);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="bg-white border shadow-sm">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Operations Users
            </CardTitle>
            <CardDescription>
              Create and manage operations team users. They can access the Operations dashboard.
            </CardDescription>
          </div>
          <Button onClick={() => handleCreateOpenChange(true)} className="create-console-btn">
            <PlusCircle className="h-4 w-4 mr-2" />
            Create Operations User
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-16 text-center text-secondary-muted">
              Loading operations users...
            </div>
          ) : operationsUsers.length === 0 ? (
            <div className="py-16 text-center text-secondary-muted">
              No operations users found. Create your first operations user to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operationsUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-semibold">{user.name}</TableCell>
                      <TableCell>{user.username}</TableCell>
                      <TableCell className="text-secondary-muted">
                        {new Date(user.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(user)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(user)}
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

      {/* Create Operations User Dialog */}
      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Operations User</DialogTitle>
            <DialogDescription>
              Add a new operations team user with login credentials.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ops-create-name">Name *</Label>
              <Input id="ops-create-name" name="name" placeholder="John Doe" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ops-create-username">Username *</Label>
              <Input id="ops-create-username" name="username" placeholder="johndoe" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ops-create-password">Password *</Label>
              <Input id="ops-create-password" name="password" type="password" placeholder="Enter password" required />
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
                {isPending ? "Creating..." : "Create Operations User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Operations User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Operations User</DialogTitle>
            <DialogDescription>
              Update operations user information.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ops-edit-name">Name *</Label>
              <Input
                id="ops-edit-name"
                name="name"
                defaultValue={editUser?.name ?? ""}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ops-edit-username">Username *</Label>
              <Input
                id="ops-edit-username"
                name="username"
                defaultValue={editUser?.username ?? ""}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ops-edit-password">Password *</Label>
              <Input
                id="ops-edit-password"
                name="password"
                type="password"
                defaultValue={editUser?.password ?? ""}
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

      {/* Delete Operations User Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Operations User</DialogTitle>
            <DialogDescription>
              Delete {deleteUserTarget?.name}? This cannot be undone.
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
              {isPending ? "Deleting..." : "Delete Operations User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
