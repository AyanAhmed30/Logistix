"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import SummaryCard from "./SummaryCard";
import {
  readAttendance,
  createAttendance,
  updateAttendance,
  deleteAttendance,
  AttendanceRecord as AttendanceRecordType,
  AttendanceStatus,
} from "@/lib/attendance-store";
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
import type { HrPersonRecord } from "@/lib/hr-people-store";

function readEmployees() {
  if (typeof window === "undefined") return [] as HrPersonRecord[];
  try {
    const raw = window.localStorage.getItem("logistix-hr-persons");
    if (!raw) return [] as HrPersonRecord[];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [] as HrPersonRecord[];
    return parsed as HrPersonRecord[];
  } catch {
    return [] as HrPersonRecord[];
  }
}

export default function AttendancePanel() {
  const [records, setRecords] = useState<AttendanceRecordType[]>([]);
  const [employees, setEmployees] = useState<HrPersonRecord[]>([]);
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | "all">(
    "all",
  );
  const [form, setForm] = useState({
    employeeId: "",
    date: new Date().toISOString().slice(0, 10),
    checkIn: "",
    checkOut: "",
    status: "Present" as AttendanceStatus,
    remarks: "",
  });
  const [viewing, setViewing] = useState<AttendanceRecordType | null>(null);
  const [editing, setEditing] = useState<AttendanceRecordType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AttendanceRecordType | null>(
    null,
  );

  function load() {
    setRecords(readAttendance());
  }

  useEffect(() => {
    load();
    setEmployees(readEmployees());
  }, []);

  const todayString = new Date().toISOString().slice(0, 10);

  const stats = useMemo(() => {
    const today = records.filter((r) => r.date === todayString);
    return {
      totalToday: today.length,
      present: today.filter((r) => r.status === "Present").length,
      absent: today.filter((r) => r.status === "Absent").length,
      late: today.filter((r) => r.status === "Late").length,
      wfh: today.filter((r) => r.status === "Work From Home").length,
    };
  }, [records, todayString]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((r) => {
      const matchesQ =
        !q || `${r.employeeName} ${r.department}`.toLowerCase().includes(q);
      const matchesDate = !dateFilter || r.date === dateFilter;
      const matchesDept =
        !departmentFilter || r.department === departmentFilter;
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      return matchesQ && matchesDate && matchesDept && matchesStatus;
    });
  }, [records, query, dateFilter, departmentFilter, statusFilter]);

  function resetForm() {
    setForm({
      employeeId: "",
      date: new Date().toISOString().slice(0, 10),
      checkIn: "",
      checkOut: "",
      status: "Present",
      remarks: "",
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employeeId) return toast.error("Employee is required");
    const emp = employees.find((p) => p.id === form.employeeId);
    if (!emp) return toast.error("Selected employee not found");
    const res = createAttendance({
      employeeId: form.employeeId,
      employeeName: emp.fullName,
      department: emp.department || "",
      date: form.date,
      checkIn: form.checkIn || undefined,
      checkOut: form.checkOut || undefined,
      status: form.status,
      remarks: form.remarks || undefined,
    });
    if ("error" in res) return toast.error(res.error);
    toast.success("Attendance recorded");
    resetForm();
    load();
  }

  function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const res = updateAttendance(editing.id, {
      checkIn: editing.checkIn,
      checkOut: editing.checkOut,
      status: editing.status,
      remarks: editing.remarks,
    });
    if ("error" in res) return toast.error(res.error);
    toast.success("Attendance updated");
    setEditing(null);
    load();
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const res = deleteAttendance(deleteTarget.id);
    if ("error" in res) return toast.error(res.error);
    toast.success("Attendance removed");
    setDeleteTarget(null);
    load();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Attendance Management</CardTitle>
          <div className="text-sm text-slate-500">
            Record and manage daily attendance.
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 md:grid-cols-5">
            <SummaryCard title="Total Today" count={stats.totalToday} />
            <SummaryCard title="Present" count={stats.present} />
            <SummaryCard title="Absent" count={stats.absent} />
            <SummaryCard title="Late" count={stats.late} />
            <SummaryCard title="WFH" count={stats.wfh} />
          </div>

          <div className="rounded-lg border border-slate-200 p-4 mb-6">
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Employee</Label>
                  <select
                    className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.employeeId}
                    onChange={(e) =>
                      setForm({ ...form, employeeId: e.target.value })
                    }
                    required
                  >
                    <option value="">Select employee</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName} ({emp.department || "—"})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
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
                        status: e.target.value as AttendanceStatus,
                      })
                    }
                  >
                    <option value="Present">Present</option>
                    <option value="Absent">Absent</option>
                    <option value="Late">Late</option>
                    <option value="Half Day">Half Day</option>
                    <option value="Work From Home">Work From Home</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Check-in</Label>
                  <Input
                    type="time"
                    value={form.checkIn}
                    onChange={(e) =>
                      setForm({ ...form, checkIn: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Check-out</Label>
                  <Input
                    type="time"
                    value={form.checkOut}
                    onChange={(e) =>
                      setForm({ ...form, checkOut: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2 md:col-span-3">
                  <Label>Remarks</Label>
                  <textarea
                    value={form.remarks}
                    onChange={(e) =>
                      setForm({ ...form, remarks: e.target.value })
                    }
                    className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button type="submit">Mark Attendance</Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Reset
                </Button>
              </div>
            </form>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <Input
              placeholder="Search by employee or department"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All departments</option>
              {Array.from(
                new Set(employees.map((p) => p.department).filter(Boolean)),
              ).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as AttendanceStatus | "all")
              }
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="Present">Present</option>
              <option value="Absent">Absent</option>
              <option value="Late">Late</option>
              <option value="Half Day">Half Day</option>
              <option value="Work From Home">Work From Home</option>
            </select>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-secondary-muted">
                No attendance records found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Check-In</TableHead>
                      <TableHead>Check-Out</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-semibold">
                          {r.employeeName}
                        </TableCell>
                        <TableCell>{r.department || "—"}</TableCell>
                        <TableCell>{r.date}</TableCell>
                        <TableCell>{r.checkIn || "—"}</TableCell>
                        <TableCell>{r.checkOut || "—"}</TableCell>
                        <TableCell>{r.status}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setViewing(r)}
                          >
                            View
                          </Button>
                          <Button size="sm" onClick={() => setEditing(r)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeleteTarget(r)}
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
                <DialogTitle>Attendance Details</DialogTitle>
              </DialogHeader>
              {viewing && (
                <div className="space-y-2 p-2">
                  <div>
                    <strong>Employee:</strong> {viewing.employeeName}
                  </div>
                  <div>
                    <strong>Department:</strong> {viewing.department || "—"}
                  </div>
                  <div>
                    <strong>Date:</strong> {viewing.date}
                  </div>
                  <div>
                    <strong>Check-In:</strong> {viewing.checkIn || "—"}
                  </div>
                  <div>
                    <strong>Check-Out:</strong> {viewing.checkOut || "—"}
                  </div>
                  <div>
                    <strong>Status:</strong> {viewing.status}
                  </div>
                  <div>
                    <strong>Remarks:</strong> {viewing.remarks || "—"}
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={Boolean(editing)} onOpenChange={() => setEditing(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Attendance</DialogTitle>
              </DialogHeader>
              {editing && (
                <form onSubmit={handleEditSave} className="space-y-3 p-2">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Check-In</Label>
                      <Input
                        type="time"
                        value={editing.checkIn || ""}
                        onChange={(e) =>
                          setEditing({ ...editing, checkIn: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Check-Out</Label>
                      <Input
                        type="time"
                        value={editing.checkOut || ""}
                        onChange={(e) =>
                          setEditing({ ...editing, checkOut: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Status</Label>
                      <select
                        value={editing.status}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            status: e.target.value as AttendanceStatus,
                          })
                        }
                        className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="Present">Present</option>
                        <option value="Absent">Absent</option>
                        <option value="Late">Late</option>
                        <option value="Half Day">Half Day</option>
                        <option value="Work From Home">Work From Home</option>
                      </select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Remarks</Label>
                      <textarea
                        value={editing.remarks || ""}
                        onChange={(e) =>
                          setEditing({ ...editing, remarks: e.target.value })
                        }
                        className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
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
                <DialogTitle>Delete Attendance</DialogTitle>
              </DialogHeader>
              <div className="p-2">
                Are you sure you want to delete this attendance record?
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
