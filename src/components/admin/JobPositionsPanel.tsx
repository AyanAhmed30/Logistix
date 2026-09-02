"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import SummaryCard from "./SummaryCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  readPositions,
  createPosition,
  updatePosition,
  deletePosition,
  JobPosition,
  JobPositionStatus,
} from "@/lib/job-positions-store";

function readDepartmentsFromPersons() {
  if (typeof window === "undefined") return [] as string[];
  try {
    const raw = window.localStorage.getItem("logistix-hr-persons");
    if (!raw) return [] as string[];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [] as string[];
    const depts = Array.from(
      new Set(
        parsed
          .map((p: { department?: unknown }) => String(p?.department || ""))
          .filter(Boolean),
      ),
    );
    return depts;
  } catch {
    return [];
  }
}

export default function JobPositionsPanel() {
  const [positions, setPositions] = useState<JobPosition[]>([]);
  const [query, setQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<JobPositionStatus | "all">(
    "all",
  );
  const [sortBy, setSortBy] = useState<"title" | "createdAt">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [form, setForm] = useState({
    title: "",
    department: "",
    description: "",
    status: "Active" as JobPositionStatus,
  });
  const [viewing, setViewing] = useState<JobPosition | null>(null);
  const [editing, setEditing] = useState<JobPosition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JobPosition | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);

  function load() {
    setPositions(readPositions());
  }

  useEffect(() => {
    load();
    setDepartments(readDepartmentsFromPersons());
  }, []);

  function resetForm() {
    setForm({ title: "", department: "", description: "", status: "Active" });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) return toast.error("Position title is required.");

    const res = createPosition({
      title,
      department: form.department.trim(),
      description: form.description.trim(),
      status: form.status,
    });
    if ("error" in res) return toast.error(res.error);
    toast.success("Position saved");
    resetForm();
    load();
  }

  function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const res = updatePosition(editing.id, {
      title: editing.title,
      department: editing.department,
      description: editing.description,
      status: editing.status,
    });
    if ("error" in res) return toast.error(res.error);
    toast.success("Position updated");
    setEditing(null);
    load();
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const res = deletePosition(deleteTarget.id);
    if ("error" in res) return toast.error(res.error);
    toast.success("Position removed");
    setDeleteTarget(null);
    load();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return positions
      .filter((p) => {
        const matchesQ =
          !q || `${p.title} ${p.department}`.toLowerCase().includes(q);
        const matchesDept =
          !departmentFilter || p.department === departmentFilter;
        const matchesStatus =
          statusFilter === "all" || p.status === statusFilter;
        return matchesQ && matchesDept && matchesStatus;
      })
      .sort((a, b) => {
        const left = a[sortBy] || "";
        const right = b[sortBy] || "";
        const cmp = String(left).localeCompare(String(right), undefined, {
          sensitivity: "base",
        });
        return sortOrder === "asc" ? cmp : -cmp;
      });
  }, [positions, query, departmentFilter, statusFilter, sortBy, sortOrder]);

  const stats = useMemo(
    () => ({
      total: positions.length,
      active: positions.filter((p) => p.status === "Active").length,
      inactive: positions.filter((p) => p.status === "Inactive").length,
    }),
    [positions],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Job Positions</CardTitle>
          <div className="text-sm text-slate-500">
            Manage company job positions.
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <SummaryCard title="Total Positions" count={stats.total} />
            <SummaryCard title="Active Positions" count={stats.active} />
            <SummaryCard title="Inactive Positions" count={stats.inactive} />
          </div>

          <div className="rounded-lg border border-slate-200 p-4 mb-6">
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Position Title</Label>
                  <Input
                    value={form.title}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  {departments.length > 0 ? (
                    <select
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={form.department}
                      onChange={(e) =>
                        setForm({ ...form, department: e.target.value })
                      }
                    >
                      <option value="">-- Select department --</option>
                      {departments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                      <option value="">Other</option>
                    </select>
                  ) : (
                    <Input
                      value={form.department}
                      onChange={(e) =>
                        setForm({ ...form, department: e.target.value })
                      }
                    />
                  )}
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Description</Label>
                  <textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <select
                    className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.status}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        status: e.target.value as JobPositionStatus,
                      })
                    }
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button type="submit">Save Position</Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Reset
                </Button>
              </div>
            </form>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <Input
              placeholder="Search title or department"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
            >
              <option value="">All departments</option>
              {Array.from(
                new Set(positions.map((p) => p.department).filter(Boolean)),
              ).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as JobPositionStatus | "all")
              }
            >
              <option value="all">All statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
            <select
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [s, o] = e.target.value.split(":");
                setSortBy(s as "title" | "createdAt");
                setSortOrder(o as "asc" | "desc");
              }}
            >
              <option value="createdAt:desc">Newest</option>
              <option value="createdAt:asc">Oldest</option>
              <option value="title:asc">Title A-Z</option>
              <option value="title:desc">Title Z-A</option>
            </select>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-secondary-muted">
                No job positions have been created yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Position Title</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-semibold">
                          {p.title}
                        </TableCell>
                        <TableCell>{p.department || "—"}</TableCell>
                        <TableCell>{p.status}</TableCell>
                        <TableCell>
                          {new Date(p.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setViewing(p)}
                          >
                            View
                          </Button>
                          <Button size="sm" onClick={() => setEditing(p)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeleteTarget(p)}
                          >
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <Dialog open={Boolean(viewing)} onOpenChange={() => setViewing(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Position Details</DialogTitle>
              </DialogHeader>
              {viewing && (
                <div className="space-y-2 p-2">
                  <div>
                    <strong>Title:</strong> {viewing.title}
                  </div>
                  <div>
                    <strong>Department:</strong> {viewing.department || "—"}
                  </div>
                  <div>
                    <strong>Description:</strong> {viewing.description || "—"}
                  </div>
                  <div>
                    <strong>Status:</strong> {viewing.status}
                  </div>
                  <div>
                    <strong>Created:</strong>{" "}
                    {new Date(viewing.createdAt).toLocaleString()}
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={Boolean(editing)} onOpenChange={() => setEditing(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Position</DialogTitle>
              </DialogHeader>
              {editing && (
                <form onSubmit={handleEditSave} className="space-y-3 p-2">
                  <div className="space-y-2">
                    <Label>Position Title</Label>
                    <Input
                      value={editing.title}
                      onChange={(e) =>
                        setEditing({ ...editing, title: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Department</Label>
                    <Input
                      value={editing.department}
                      onChange={(e) =>
                        setEditing({ ...editing, department: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <textarea
                      value={editing.description}
                      onChange={(e) =>
                        setEditing({ ...editing, description: e.target.value })
                      }
                      className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <select
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={editing.status}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          status: e.target.value as JobPositionStatus,
                        })
                      }
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit">Save</Button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>

          <Dialog
            open={Boolean(deleteTarget)}
            onOpenChange={() => setDeleteTarget(null)}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Position</DialogTitle>
              </DialogHeader>
              <div className="p-2">
                Are you sure you want to delete {deleteTarget?.title}?
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeleteTarget(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDeleteConfirm}
                >
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
