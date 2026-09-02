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
  readMeetings,
  createMeeting,
  updateMeeting,
  deleteMeeting,
  MeetingRecord,
  MeetingStatus,
  MeetingType,
} from "@/lib/meetings-store";
import type { HrPersonRecord } from "@/lib/hr-people-store";

function readEmployees() {
  if (typeof window === "undefined") return [] as HrPersonRecord[];
  try {
    const raw = window.localStorage.getItem("logistix-hr-persons");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as HrPersonRecord[];
  } catch {
    return [] as HrPersonRecord[];
  }
}

export default function MeetingsPanel() {
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [employees, setEmployees] = useState<HrPersonRecord[]>([]);
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<MeetingStatus | "all">(
    "all",
  );
  const [typeFilter, setTypeFilter] = useState<MeetingType | "all">("all");
  const [form, setForm] = useState({
    title: "",
    agenda: "",
    date: "",
    startTime: "",
    endTime: "",
    organizer: "",
    participants: [] as string[],
    location: "",
    meetingType: "Online" as MeetingType,
    status: "Scheduled" as MeetingStatus,
    notes: "",
  });
  const [viewing, setViewing] = useState<MeetingRecord | null>(null);
  const [editing, setEditing] = useState<MeetingRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MeetingRecord | null>(null);

  function load() {
    setMeetings(readMeetings());
  }

  useEffect(() => {
    load();
    setEmployees(readEmployees());
  }, []);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: meetings.length,
      todays: meetings.filter((m) => m.date === today).length,
      upcoming: meetings.filter((m) => m.date >= today).length,
      completed: meetings.filter((m) => m.status === "Completed").length,
    };
  }, [meetings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return meetings.filter((m) => {
      const matchesQ =
        !q || `${m.title} ${m.organizer}`.toLowerCase().includes(q);
      const matchesDate = !dateFilter || m.date === dateFilter;
      const matchesStatus = statusFilter === "all" || m.status === statusFilter;
      const matchesType = typeFilter === "all" || m.meetingType === typeFilter;
      return matchesQ && matchesDate && matchesStatus && matchesType;
    });
  }, [meetings, query, dateFilter, statusFilter, typeFilter]);

  function resetForm() {
    setForm({
      title: "",
      agenda: "",
      date: "",
      startTime: "",
      endTime: "",
      organizer: "",
      participants: [],
      location: "",
      meetingType: "Online",
      status: "Scheduled",
      notes: "",
    });
  }

  function handleSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title) return toast.error("Title required");
    if (!form.date) return toast.error("Date required");
    if (!form.startTime) return toast.error("Start time required");
    if (!form.endTime) return toast.error("End time required");
    const res = createMeeting({
      title: form.title,
      agenda: form.agenda,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      organizer: form.organizer,
      participants: form.participants,
      location: form.location,
      meetingType: form.meetingType,
      status: form.status,
      notes: form.notes,
    });
    if ("error" in res) return toast.error(res.error);
    toast.success("Meeting scheduled");
    resetForm();
    load();
  }

  function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const res = updateMeeting(editing.id, editing);
    if ("error" in res) return toast.error(res.error);
    toast.success("Meeting updated");
    setEditing(null);
    load();
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const res = deleteMeeting(deleteTarget.id);
    if ("error" in res) return toast.error(res.error);
    toast.success("Meeting removed");
    setDeleteTarget(null);
    load();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Meetings</CardTitle>
          <div className="text-sm text-slate-500">
            Schedule and manage meetings.
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <SummaryCard title="Total Meetings" count={stats.total} />
            <SummaryCard title="Today's Meetings" count={stats.todays} />
            <SummaryCard title="Upcoming" count={stats.upcoming} />
            <SummaryCard title="Completed" count={stats.completed} />
          </div>

          <div className="rounded-lg border border-slate-200 p-4 mb-6">
            <form onSubmit={handleSchedule} className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    value={form.title}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={form.startTime}
                    onChange={(e) =>
                      setForm({ ...form, startTime: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={form.endTime}
                    onChange={(e) =>
                      setForm({ ...form, endTime: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Organizer</Label>
                  <select
                    className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.organizer}
                    onChange={(e) =>
                      setForm({ ...form, organizer: e.target.value })
                    }
                  >
                    <option value="">Select organizer</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.fullName}>
                        {emp.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 md:col-span-3">
                  <Label>Participants</Label>
                  <select
                    multiple
                    value={form.participants}
                    onChange={(e) => {
                      const opts = Array.from(e.target.selectedOptions).map(
                        (o) => o.value,
                      );
                      setForm({ ...form, participants: opts });
                    }}
                    className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.fullName}>
                        {emp.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input
                    value={form.location}
                    onChange={(e) =>
                      setForm({ ...form, location: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <select
                    value={form.meetingType}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        meetingType: e.target.value as MeetingType,
                      })
                    }
                    className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="Online">Online</option>
                    <option value="In Person">In Person</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        status: e.target.value as MeetingStatus,
                      })
                    }
                    className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="Scheduled">Scheduled</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="space-y-2 md:col-span-3">
                  <Label>Agenda / Notes</Label>
                  <textarea
                    value={form.agenda}
                    onChange={(e) =>
                      setForm({ ...form, agenda: e.target.value })
                    }
                    className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button type="submit">Schedule Meeting</Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Reset
                </Button>
              </div>
            </form>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <Input
              placeholder="Search title or organizer"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as MeetingStatus | "all")
              }
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value as MeetingType | "all")
              }
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="all">All types</option>
              <option value="Online">Online</option>
              <option value="In Person">In Person</option>
            </select>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-secondary-muted">
                No meetings have been scheduled.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Organizer</TableHead>
                      <TableHead>Participants</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-semibold">
                          {m.title}
                        </TableCell>
                        <TableCell>{m.date}</TableCell>
                        <TableCell>
                          {m.startTime} - {m.endTime}
                        </TableCell>
                        <TableCell>{m.organizer}</TableCell>
                        <TableCell>{m.participants.length}</TableCell>
                        <TableCell>{m.status}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setViewing(m)}
                          >
                            View
                          </Button>
                          <Button size="sm" onClick={() => setEditing(m)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeleteTarget(m)}
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
                <DialogTitle>Meeting Details</DialogTitle>
              </DialogHeader>
              {viewing && (
                <div className="space-y-2 p-2">
                  <div>
                    <strong>Title:</strong> {viewing.title}
                  </div>
                  <div>
                    <strong>Agenda:</strong> {viewing.agenda || "—"}
                  </div>
                  <div>
                    <strong>Date:</strong> {viewing.date}
                  </div>
                  <div>
                    <strong>Time:</strong> {viewing.startTime} -{" "}
                    {viewing.endTime}
                  </div>
                  <div>
                    <strong>Organizer:</strong> {viewing.organizer}
                  </div>
                  <div>
                    <strong>Participants:</strong>{" "}
                    {viewing.participants.join(", ") || "—"}
                  </div>
                  <div>
                    <strong>Location:</strong> {viewing.location || "—"}
                  </div>
                  <div>
                    <strong>Type:</strong> {viewing.meetingType}
                  </div>
                  <div>
                    <strong>Status:</strong> {viewing.status}
                  </div>
                  <div>
                    <strong>Notes:</strong> {viewing.notes || "—"}
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={Boolean(editing)} onOpenChange={() => setEditing(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Meeting</DialogTitle>
              </DialogHeader>
              {editing && (
                <form onSubmit={handleEditSave} className="space-y-3 p-2">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input
                        value={editing.title}
                        onChange={(e) =>
                          setEditing({ ...editing, title: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input
                        type="date"
                        value={editing.date}
                        onChange={(e) =>
                          setEditing({ ...editing, date: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Start Time</Label>
                      <Input
                        type="time"
                        value={editing.startTime}
                        onChange={(e) =>
                          setEditing({ ...editing, startTime: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Time</Label>
                      <Input
                        type="time"
                        value={editing.endTime}
                        onChange={(e) =>
                          setEditing({ ...editing, endTime: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Organizer</Label>
                      <Input
                        value={editing.organizer}
                        onChange={(e) =>
                          setEditing({ ...editing, organizer: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Participants</Label>
                      <select
                        multiple
                        value={editing.participants}
                        onChange={(e) => {
                          const opts = Array.from(e.target.selectedOptions).map(
                            (o) => o.value,
                          );
                          setEditing({ ...editing, participants: opts });
                        }}
                        className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.fullName}>
                            {emp.fullName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Notes</Label>
                      <textarea
                        value={editing.notes || ""}
                        onChange={(e) =>
                          setEditing({ ...editing, notes: e.target.value })
                        }
                        className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <select
                        value={editing.meetingType}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            meetingType: e.target.value as MeetingType,
                          })
                        }
                        className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="Online">Online</option>
                        <option value="In Person">In Person</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <select
                        value={editing.status}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            status: e.target.value as MeetingStatus,
                          })
                        }
                        className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="Scheduled">Scheduled</option>
                        <option value="Completed">Completed</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
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
                <DialogTitle>Delete Meeting</DialogTitle>
              </DialogHeader>
              <div className="p-2">
                Are you sure you want to delete this meeting?
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
