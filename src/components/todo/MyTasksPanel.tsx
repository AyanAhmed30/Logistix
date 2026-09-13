"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createAssignedTodo,
  deleteTodo,
  getMyTodos,
  getTodoAssignableUsers,
  updateTodo,
  updateTodoStatus,
  type TodoAssignableUser,
  type TodoListItem,
  type TodoPriority,
  type TodoStatus,
} from "@/app/actions/todos";

const selectClassName =
  "flex h-9 w-full min-w-[140px] rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const formSelectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const PRIORITY_LABELS: Record<TodoPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const STATUS_LABELS: Record<TodoStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
};

const EMPTY_ASSIGN_FORM = {
  title: "",
  description: "",
  dueDate: "",
  priority: "medium" as TodoPriority,
  status: "pending" as TodoStatus,
  assigneeKey: "",
};

function priorityBadgeClass(priority: TodoPriority) {
  switch (priority) {
    case "high":
      return "border-transparent bg-red-100 text-red-700";
    case "low":
      return "border-transparent bg-slate-100 text-slate-700";
    case "medium":
    default:
      return "border-transparent bg-amber-100 text-amber-700";
  }
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function dueDateInputValue(value: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

export function MyTasksPanel() {
  const [todos, setTodos] = useState<TodoListItem[]>([]);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingTodo, setEditingTodo] = useState<TodoListItem | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    dueDate: "",
    priority: "medium" as TodoPriority,
    status: "pending" as TodoStatus,
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TodoListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState(EMPTY_ASSIGN_FORM);
  const [assignableUsers, setAssignableUsers] = useState<TodoAssignableUser[]>(
    []
  );
  const [isSavingAssign, setIsSavingAssign] = useState(false);

  async function loadTasks() {
    setIsLoading(true);
    try {
      const result = await getMyTodos();
      if ("error" in result) {
        toast.error(result.error);
        setTodos([]);
        return;
      }
      setTodos(result.todos);
      setIsSystemAdmin(Boolean(result.isSystemAdmin));
    } catch {
      toast.error("Failed to load tasks");
      setTodos([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadTasks();
  }, []);

  function withCanManage(
    previous: TodoListItem,
    next: Omit<TodoListItem, "canManage">
  ): TodoListItem {
    return {
      ...next,
      canManage: previous.canManage,
    };
  }

  async function openAssignDialog() {
    setAssignForm(EMPTY_ASSIGN_FORM);
    setAssignOpen(true);
    const result = await getTodoAssignableUsers();
    if ("error" in result) {
      toast.error(result.error);
      setAssignableUsers([]);
      return;
    }
    setAssignableUsers(result.users);
  }

  function openEdit(todo: TodoListItem) {
    if (!todo.canManage) return;
    setEditingTodo(todo);
    setEditForm({
      title: todo.title,
      description: todo.description || "",
      dueDate: dueDateInputValue(todo.due_date),
      priority: todo.priority,
      status: todo.status,
    });
  }

  async function handleStatusChange(todoId: string, status: TodoStatus) {
    const current = todos.find((item) => item.id === todoId);
    if (!current?.canManage) return;
    setUpdatingId(todoId);
    try {
      const result = await updateTodoStatus(todoId, status);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setTodos((current) =>
        current.map((item) =>
          item.id === todoId ? withCanManage(item, result.todo) : item
        )
      );
      toast.success("Task status updated");
    } catch {
      toast.error("Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleSaveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTodo || isSavingEdit || !editingTodo.canManage) return;

    const title = editForm.title.trim();
    if (!title) {
      toast.error("Title is required");
      return;
    }
    if (!editForm.dueDate) {
      toast.error("Due date is required");
      return;
    }

    setIsSavingEdit(true);
    const payload = new FormData();
    payload.set("id", editingTodo.id);
    payload.set("title", title);
    payload.set("description", editForm.description);
    payload.set("due_date", editForm.dueDate);
    payload.set("priority", editForm.priority);
    payload.set("status", editForm.status);

    try {
      const result = await updateTodo(payload);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setTodos((current) =>
        current.map((item) =>
          item.id === editingTodo.id ? withCanManage(item, result.todo) : item
        )
      );
      setEditingTodo(null);
      toast.success("To-do updated successfully");
    } catch {
      toast.error("Failed to update to-do");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || isDeleting || !deleteTarget.canManage) return;
    setIsDeleting(true);
    try {
      const result = await deleteTodo(deleteTarget.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setTodos((current) =>
        current.filter((item) => item.id !== deleteTarget.id)
      );
      setDeleteTarget(null);
      toast.success("To-do deleted successfully");
    } catch {
      toast.error("Failed to delete to-do");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleAssignSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSavingAssign) return;

    const title = assignForm.title.trim();
    if (!title) {
      toast.error("Title is required");
      return;
    }
    if (!assignForm.dueDate) {
      toast.error("Due date is required");
      return;
    }
    if (!assignForm.assigneeKey) {
      toast.error("Assigned user is required");
      return;
    }

    setIsSavingAssign(true);
    const payload = new FormData();
    payload.set("title", title);
    payload.set("description", assignForm.description);
    payload.set("due_date", assignForm.dueDate);
    payload.set("priority", assignForm.priority);
    payload.set("status", assignForm.status);
    payload.set("assignee_key", assignForm.assigneeKey);

    try {
      const result = await createAssignedTodo(payload);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Task assigned successfully");
      setAssignOpen(false);
      setAssignForm(EMPTY_ASSIGN_FORM);
      await loadTasks();
    } catch {
      toast.error("Failed to assign task");
    } finally {
      setIsSavingAssign(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">
            {isSystemAdmin ? "All To-Dos" : "View My Tasks"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {isSystemAdmin
              ? "View every to-do in the system. User self-created tasks are view-only."
              : "Tasks assigned to you. Update the status as you work through them."}
          </p>
        </div>
        {isSystemAdmin ? (
          <Button type="button" onClick={() => void openAssignDialog()}>
            Assign a Task
          </Button>
        ) : null}
      </div>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle>{isSystemAdmin ? "All tasks" : "Assigned to me"}</CardTitle>
          <CardDescription>
            {isLoading
              ? "Loading tasks..."
              : `${todos.length} task${todos.length === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading your tasks...</p>
          ) : todos.length === 0 ? (
            <p className="text-sm text-slate-500">
              {isSystemAdmin
                ? "No to-dos have been created yet."
                : "No tasks are assigned to you yet."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Description</TableHead>
                  {isSystemAdmin ? <TableHead>Assigned user</TableHead> : null}
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Created by</TableHead>
                  <TableHead>Created date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {todos.map((todo) => (
                  <TableRow key={todo.id}>
                    <TableCell className="font-medium text-slate-900">
                      {todo.title}
                    </TableCell>
                    <TableCell className="max-w-[280px] whitespace-normal text-slate-600">
                      {todo.description || "—"}
                    </TableCell>
                    {isSystemAdmin ? (
                      <TableCell>
                        {todo.assigned_to_name || todo.assigned_to_username || "—"}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <Badge className={priorityBadgeClass(todo.priority)}>
                        {PRIORITY_LABELS[todo.priority]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {todo.canManage ? (
                        <select
                          className={selectClassName}
                          value={todo.status}
                          disabled={updatingId === todo.id}
                          onChange={(event) =>
                            void handleStatusChange(
                              todo.id,
                              event.target.value as TodoStatus
                            )
                          }
                          aria-label={`Update status for ${todo.title}`}
                        >
                          <option value="pending">Pending</option>
                          <option value="in_progress">In Progress</option>
                          <option value="completed">Completed</option>
                        </select>
                      ) : (
                        STATUS_LABELS[todo.status]
                      )}
                    </TableCell>
                    <TableCell>{formatDate(todo.due_date)}</TableCell>
                    <TableCell>{todo.created_by_name}</TableCell>
                    <TableCell>{formatDateTime(todo.created_at)}</TableCell>
                    <TableCell className="text-right">
                      {todo.canManage ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(todo)}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteTarget(todo)}
                          >
                            Delete
                          </Button>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-500">View only</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(editingTodo)}
        onOpenChange={(open) => {
          if (!open) setEditingTodo(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit To-Do</DialogTitle>
            <DialogDescription>
              Update the task details. Assignment cannot be changed.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSaveEdit}>
            <div className="space-y-2">
              <Label htmlFor="edit-todo-title">Title</Label>
              <Input
                id="edit-todo-title"
                value={editForm.title}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-todo-description">Description</Label>
              <Textarea
                id="edit-todo-description"
                value={editForm.description}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-todo-due-date">Due date</Label>
              <Input
                id="edit-todo-due-date"
                type="date"
                value={editForm.dueDate}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    dueDate: event.target.value,
                  }))
                }
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-todo-priority">Priority</Label>
                <select
                  id="edit-todo-priority"
                  className={formSelectClassName}
                  value={editForm.priority}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      priority: event.target.value as TodoPriority,
                    }))
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-todo-status">Status</Label>
                <select
                  id="edit-todo-status"
                  className={formSelectClassName}
                  value={editForm.status}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      status: event.target.value as TodoStatus,
                    }))
                  }
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingTodo(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSavingEdit}>
                {isSavingEdit ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete To-Do</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this To-Do?
            </DialogDescription>
          </DialogHeader>
          {deleteTarget ? (
            <p className="text-sm text-slate-700">{deleteTarget.title}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isDeleting}
              onClick={() => void handleConfirmDelete()}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={assignOpen}
        onOpenChange={(open) => {
          if (!open && !isSavingAssign) setAssignOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign a Task</DialogTitle>
            <DialogDescription>
              Create a to-do and assign it to a system user.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleAssignSubmit}>
            <div className="space-y-2">
              <Label htmlFor="assign-todo-title">Title</Label>
              <Input
                id="assign-todo-title"
                value={assignForm.title}
                onChange={(event) =>
                  setAssignForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assign-todo-description">Description</Label>
              <Textarea
                id="assign-todo-description"
                value={assignForm.description}
                onChange={(event) =>
                  setAssignForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assign-todo-due-date">Due date</Label>
              <Input
                id="assign-todo-due-date"
                type="date"
                value={assignForm.dueDate}
                onChange={(event) =>
                  setAssignForm((current) => ({
                    ...current,
                    dueDate: event.target.value,
                  }))
                }
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="assign-todo-priority">Priority</Label>
                <select
                  id="assign-todo-priority"
                  className={formSelectClassName}
                  value={assignForm.priority}
                  onChange={(event) =>
                    setAssignForm((current) => ({
                      ...current,
                      priority: event.target.value as TodoPriority,
                    }))
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assign-todo-status">Status</Label>
                <select
                  id="assign-todo-status"
                  className={formSelectClassName}
                  value={assignForm.status}
                  onChange={(event) =>
                    setAssignForm((current) => ({
                      ...current,
                      status: event.target.value as TodoStatus,
                    }))
                  }
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assign-todo-user">Assigned to</Label>
              <select
                id="assign-todo-user"
                className={formSelectClassName}
                value={assignForm.assigneeKey}
                onChange={(event) =>
                  setAssignForm((current) => ({
                    ...current,
                    assigneeKey: event.target.value,
                  }))
                }
                required
              >
                <option value="">Select a user</option>
                {assignableUsers.map((user) => (
                  <option key={user.key} value={user.key}>
                    {user.name}
                    {user.username && user.username !== user.name
                      ? ` (${user.username})`
                      : ""}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSavingAssign}
                onClick={() => setAssignOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSavingAssign}>
                {isSavingAssign ? "Assigning..." : "Assign task"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
