"use client";

import { useState } from "react";
import { toast } from "sonner";
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
  createTodo,
  type TodoPriority,
  type TodoStatus,
} from "@/app/actions/todos";

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const EMPTY_FORM = {
  title: "",
  description: "",
  dueDate: "",
  priority: "medium" as TodoPriority,
  status: "pending" as TodoStatus,
};

export function CreateTodoForm() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    const title = form.title.trim();
    if (!title) {
      toast.error("Title is required");
      return;
    }
    if (!form.dueDate) {
      toast.error("Due date is required");
      return;
    }

    setIsSaving(true);
    const payload = new FormData();
    payload.set("title", title);
    payload.set("description", form.description);
    payload.set("due_date", form.dueDate);
    payload.set("priority", form.priority);
    payload.set("status", form.status);

    try {
      const result = await createTodo(payload);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("To-do created successfully");
      setForm({ ...EMPTY_FORM });
    } catch {
      toast.error("Failed to create to-do");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Create a To-Do</h2>
        <p className="mt-1 text-sm text-slate-600">
          Enter the task details. The to-do will be assigned to you.
        </p>
      </div>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle>Task details</CardTitle>
          <CardDescription>
            Status defaults to pending. Priority defaults to medium. Created by,
            assignee, and timestamps are saved automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="todo-title">Title</Label>
              <Input
                id="todo-title"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Task title"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="todo-description">Description</Label>
              <Textarea
                id="todo-description"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="What needs to be done?"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="todo-due-date">Due date</Label>
              <Input
                id="todo-due-date"
                type="date"
                value={form.dueDate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    dueDate: event.target.value,
                  }))
                }
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="todo-priority">Priority</Label>
                <select
                  id="todo-priority"
                  className={selectClassName}
                  value={form.priority}
                  onChange={(event) =>
                    setForm((current) => ({
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
                <Label htmlFor="todo-status">Status</Label>
                <select
                  id="todo-status"
                  className={selectClassName}
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
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

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Creating..." : "Create To-Do"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
