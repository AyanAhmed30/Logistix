"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import {
  BriefcaseBusiness,
  Edit,
  PlusCircle,
  Trash2,
  Users,
  UserCheck,
  UserMinus,
} from "lucide-react";
import SummaryCard from "./SummaryCard";
import { toast } from "sonner";
import { canAccessHrModule } from "@/app/actions/hr_people";
import {
  createHR,
  deleteHR,
  getAllHRs,
  updateHR,
  type HRStaff,
} from "@/app/actions/hr";
import { getAllEmployees, type Employee } from "@/app/actions/employees";
import { toEmployeeListStatus } from "@/lib/employee-utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { HrPersonRecord, HrPersonStatus } from "@/lib/hr-people-store";

function mapHRStaffToRecord(row: HRStaff): HrPersonRecord {
  return {
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    email: row.email || "",
    phone: row.phone || "",
    department: row.department || "",
    designation: row.designation || "",
    employeeId: row.employee_id || "",
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapEmployeeToRecord(row: Employee): HrPersonRecord {
  return {
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    email: row.email || "",
    phone: row.phone || "",
    department: row.department || "",
    designation: row.designation || "",
    employeeId: row.employee_id || "",
    status: toEmployeeListStatus(row.status),
    createdAt: row.created_at,
  };
}

function filterAndSortHrPersons(
  records: HrPersonRecord[],
  filters: {
    query: string;
    status: "all" | HrPersonStatus;
    sortBy: "createdAt" | "fullName" | "department" | "status";
    sortOrder: "asc" | "desc";
  },
) {
  const query = filters.query.trim().toLowerCase();
  const status =
    filters.status === "active" || filters.status === "inactive"
      ? filters.status
      : "all";

  const filtered = records.filter((record) => {
    const matchesQuery =
      !query ||
      [
        record.fullName,
        record.username,
        record.department,
        record.designation,
        record.employeeId,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);

    const matchesStatus = status === "all" || record.status === status;
    return matchesQuery && matchesStatus;
  });

  filtered.sort((a, b) => {
    const left = a[filters.sortBy] ?? "";
    const right = b[filters.sortBy] ?? "";
    const comparison = String(left).localeCompare(String(right), undefined, {
      sensitivity: "base",
    });
    return filters.sortOrder === "asc" ? comparison : -comparison;
  });

  return filtered;
}

type AttendanceRecord = {
  id: string;
  employeeId: string;
  date: string;
  type: "Present" | "Absent" | "Leave" | "Half Day";
  status: "approved" | "pending" | "rejected";
  notes: string;
  createdAt: string;
};

type LeaveRecord = {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  type: "Annual" | "Sick" | "Casual" | "Other";
  status: "pending" | "approved" | "rejected";
  notes: string;
  createdAt: string;
};

type DocumentRecord = {
  id: string;
  employeeId: string;
  title: string;
  category: "ID" | "Contract" | "Certificate" | "Policy" | "Other";
  expiryDate: string;
  status: "active" | "expired" | "pending";
  notes: string;
  createdAt: string;
};

type PayrollRecord = {
  id: string;
  employeeId: string;
  period: string;
  basicSalary: string;
  bonus: string;
  deductions: string;
  netSalary: string;
  status: "draft" | "processed" | "paid";
  notes: string;
  createdAt: string;
};

type NotificationRecord = {
  id: string;
  title: string;
  message: string;
  type: "notice" | "reminder" | "report";
  priority: "low" | "medium" | "high";
  createdAt: string;
};

function readLocalArray<T>(key: string, fallback: T[]): T[] {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalArray<T>(key: string, value: T[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors for the lightweight foundation version.
  }
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function HRPersonPanel() {
  const [persons, setPersons] = useState<HrPersonRecord[]>([]);
  const [employees, setEmployees] = useState<HrPersonRecord[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | HrPersonStatus>(
    "all",
  );
  const [sortBy, setSortBy] = useState<
    "createdAt" | "fullName" | "department" | "status"
  >("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<HrPersonRecord | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<HrPersonRecord | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [leaveRecords, setLeaveRecords] = useState<LeaveRecord[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [attendanceForm, setAttendanceForm] = useState({
    employeeId: "",
    date: "",
    type: "Present" as AttendanceRecord["type"],
    status: "approved" as AttendanceRecord["status"],
    notes: "",
  });
  const [leaveForm, setLeaveForm] = useState({
    employeeId: "",
    startDate: "",
    endDate: "",
    type: "Annual" as LeaveRecord["type"],
    status: "pending" as LeaveRecord["status"],
    notes: "",
  });
  const [documentForm, setDocumentForm] = useState({
    employeeId: "",
    title: "",
    category: "ID" as DocumentRecord["category"],
    expiryDate: "",
    status: "active" as DocumentRecord["status"],
    notes: "",
  });
  const [payrollForm, setPayrollForm] = useState({
    employeeId: "",
    period: "",
    basicSalary: "",
    bonus: "",
    deductions: "",
    netSalary: "",
    status: "draft" as PayrollRecord["status"],
    notes: "",
  });

  useEffect(() => {
    async function loadAccess() {
      const result = await canAccessHrModule();
      setIsAuthorized(result.authorized);
    }

    loadAccess();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setAttendanceRecords(readLocalArray("logistix-hr-attendance", []));
    setLeaveRecords(readLocalArray("logistix-hr-leaves", []));
    setDocuments(readLocalArray("logistix-hr-documents", []));
    setPayrollRecords(readLocalArray("logistix-hr-payroll", []));
    setNotifications(readLocalArray("logistix-hr-notifications", []));
  }, []);

  useEffect(() => {
    writeLocalArray("logistix-hr-attendance", attendanceRecords);
    writeLocalArray("logistix-hr-leaves", leaveRecords);
    writeLocalArray("logistix-hr-documents", documents);
    writeLocalArray("logistix-hr-payroll", payrollRecords);
    writeLocalArray("logistix-hr-notifications", notifications);
  }, [
    attendanceRecords,
    leaveRecords,
    documents,
    payrollRecords,
    notifications,
  ]);

  useEffect(() => {
    if (!isAuthorized) {
      setIsLoading(false);
      return;
    }

    async function loadPeople() {
      setIsLoading(true);
      try {
        const [staffResult, employeeResult] = await Promise.all([
          getAllHRs(),
          getAllEmployees(),
        ]);

        if ("error" in staffResult) {
          toast.error(staffResult.error);
          setPersons([]);
        } else {
          const mapped = (staffResult.hrStaff || []).map(mapHRStaffToRecord);
          setPersons(
            filterAndSortHrPersons(mapped, {
              query,
              status: statusFilter,
              sortBy,
              sortOrder,
            }),
          );
        }

        if (!("error" in employeeResult)) {
          setEmployees((employeeResult.employees || []).map(mapEmployeeToRecord));
        } else {
          setEmployees([]);
        }
      } catch (err) {
        toast.error(String(err || "Failed to load HR people"));
        setPersons([]);
      } finally {
        setIsLoading(false);
      }
    }

    loadPeople();
  }, [isAuthorized, query, statusFilter, sortBy, sortOrder]);

  const sortedPersons = useMemo(() => persons, [persons]);
  const tableRef = useRef<HTMLDivElement | null>(null);

  const summaryStats = useMemo(() => {
    const total = persons.length;
    const active = persons.filter((p) => p.status === "active").length;
    const inactive = persons.filter((p) => p.status === "inactive").length;
    const departments = Array.from(
      new Set(persons.map((p) => p.department).filter(Boolean)),
    ).length;

    return { total, active, inactive, departments };
  }, [persons]);

  async function refreshData() {
    setAttendanceRecords(readLocalArray("logistix-hr-attendance", []));
    setLeaveRecords(readLocalArray("logistix-hr-leaves", []));
    setDocuments(readLocalArray("logistix-hr-documents", []));
    setPayrollRecords(readLocalArray("logistix-hr-payroll", []));
    setNotifications(readLocalArray("logistix-hr-notifications", []));
    setIsLoading(true);
    try {
      const refreshed = await getAllHRs();
      if (!("error" in refreshed)) {
        const mapped = (refreshed.hrStaff || []).map(mapHRStaffToRecord);
        setPersons(
          filterAndSortHrPersons(mapped, {
            query,
            status: statusFilter,
            sortBy,
            sortOrder,
          }),
        );
      }
    } catch (err) {
      toast.error(String(err || "Failed to refresh HR people"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const result = await createHR(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("HR person created");
      setCreateOpen(false);
      if (form instanceof HTMLFormElement) {
        form.reset();
      }

      try {
        const refreshed = await getAllHRs();
        if (!("error" in refreshed)) {
          const mapped = (refreshed.hrStaff || []).map(
            mapHRStaffToRecord,
          );
          setPersons(
            filterAndSortHrPersons(mapped, {
              query,
              status: statusFilter,
              sortBy,
              sortOrder,
            }),
          );
        }
      } catch (err) {
        toast.error(String(err || "Failed to refresh HR people"));
      }
    } catch (err) {
      toast.error(String(err || "Failed to create HR person"));
    }
  }

  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPerson) return;

    if (!editingPerson) return;

    const formData = new FormData(event.currentTarget);
    formData.append("id", editingPerson.id);

    try {
      const result = await updateHR(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("HR person updated");
      setEditOpen(false);
      setEditingPerson(null);

      try {
        const refreshed = await getAllHRs();
        if (!("error" in refreshed)) {
          const mapped = (refreshed.hrStaff || []).map(
            mapHRStaffToRecord,
          );
          setPersons(
            filterAndSortHrPersons(mapped, {
              query,
              status: statusFilter,
              sortBy,
              sortOrder,
            }),
          );
        }
      } catch (err) {
        toast.error(String(err || "Failed to refresh HR people"));
      }
    } catch (err) {
      toast.error(String(err || "Failed to update HR person"));
    }
  }

  function openEdit(person: HrPersonRecord) {
    setEditingPerson(person);
    setEditOpen(true);
  }

  function handleDelete(person: HrPersonRecord) {
    setDeleteTarget(person);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      const formData = new FormData();
      formData.append("id", deleteTarget.id);
      const result = await deleteHR(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("HR person removed");
      setDeleteTarget(null);
      try {
        const refreshed = await getAllHRs();
        if (!("error" in refreshed)) {
          const mapped = (refreshed.hrStaff || []).map(
            mapHRStaffToRecord,
          );
          setPersons(
            filterAndSortHrPersons(mapped, {
              query,
              status: statusFilter,
              sortBy,
              sortOrder,
            }),
          );
        }
      } catch (err) {
        toast.error(String(err || "Failed to refresh HR people"));
      }
    } catch (err) {
      toast.error(String(err || "Failed to delete HR person"));
    }
  }

  function handleAttendanceSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!attendanceForm.employeeId || !attendanceForm.date) {
      toast.error("Please select an employee and a date for attendance.");
      return;
    }

    const nextRecord: AttendanceRecord = {
      id: createId(),
      employeeId: attendanceForm.employeeId,
      date: attendanceForm.date,
      type: attendanceForm.type,
      status: attendanceForm.status,
      notes: attendanceForm.notes,
      createdAt: new Date().toISOString(),
    };

    setAttendanceRecords((current) => [nextRecord, ...current]);
    setAttendanceForm({
      employeeId: "",
      date: "",
      type: "Present",
      status: "approved",
      notes: "",
    });
    setNotifications((current) => [
      {
        id: createId(),
        title: "Attendance logged",
        message: `Attendance noted for ${nextRecord.date}.`,
        type: "reminder",
        priority: "medium",
        createdAt: new Date().toISOString(),
      },
      ...current,
    ]);
    toast.success("Attendance entry added");
  }

  function handleLeaveSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!leaveForm.employeeId || !leaveForm.startDate || !leaveForm.endDate) {
      toast.error("Please complete the leave request details.");
      return;
    }

    const nextRecord: LeaveRecord = {
      id: createId(),
      employeeId: leaveForm.employeeId,
      startDate: leaveForm.startDate,
      endDate: leaveForm.endDate,
      type: leaveForm.type,
      status: leaveForm.status,
      notes: leaveForm.notes,
      createdAt: new Date().toISOString(),
    };

    setLeaveRecords((current) => [nextRecord, ...current]);
    setLeaveForm({
      employeeId: "",
      startDate: "",
      endDate: "",
      type: "Annual",
      status: "pending",
      notes: "",
    });
    setNotifications((current) => [
      {
        id: createId(),
        title: "Leave request added",
        message: `Leave request submitted for ${nextRecord.startDate}.`,
        type: "notice",
        priority: "high",
        createdAt: new Date().toISOString(),
      },
      ...current,
    ]);
    toast.success("Leave request added");
  }

  function handleDocumentSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!documentForm.employeeId || !documentForm.title) {
      toast.error("Please enter a document title and select an employee.");
      return;
    }

    const nextRecord: DocumentRecord = {
      id: createId(),
      employeeId: documentForm.employeeId,
      title: documentForm.title,
      category: documentForm.category,
      expiryDate: documentForm.expiryDate,
      status: documentForm.status,
      notes: documentForm.notes,
      createdAt: new Date().toISOString(),
    };

    setDocuments((current) => [nextRecord, ...current]);
    setDocumentForm({
      employeeId: "",
      title: "",
      category: "ID",
      expiryDate: "",
      status: "active",
      notes: "",
    });
    toast.success("Document added");
  }

  function handlePayrollSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!payrollForm.employeeId || !payrollForm.period) {
      toast.error("Please select an employee and payroll period.");
      return;
    }

    const nextRecord: PayrollRecord = {
      id: createId(),
      employeeId: payrollForm.employeeId,
      period: payrollForm.period,
      basicSalary: payrollForm.basicSalary,
      bonus: payrollForm.bonus,
      deductions: payrollForm.deductions,
      netSalary: payrollForm.netSalary,
      status: payrollForm.status,
      notes: payrollForm.notes,
      createdAt: new Date().toISOString(),
    };

    setPayrollRecords((current) => [nextRecord, ...current]);
    setPayrollForm({
      employeeId: "",
      period: "",
      basicSalary: "",
      bonus: "",
      deductions: "",
      netSalary: "",
      status: "draft",
      notes: "",
    });
    setNotifications((current) => [
      {
        id: createId(),
        title: "Payroll record updated",
        message: `Payroll prepared for ${nextRecord.period}.`,
        type: "report",
        priority: "medium",
        createdAt: new Date().toISOString(),
      },
      ...current,
    ]);
    toast.success("Payroll record added");
  }

  function handleGenerateReport() {
    const summary = `HR summary: ${persons.length} profiles, ${attendanceRecords.length} attendance logs, ${documents.length} documents, ${payrollRecords.length} payroll entries.`;
    const nextNotification: NotificationRecord = {
      id: createId(),
      title: "Monthly HR report generated",
      message: summary,
      type: "report",
      priority: "high",
      createdAt: new Date().toISOString(),
    };

    setNotifications((current) => [nextNotification, ...current]);
    toast.success("HR report generated");
  }

  if (!isAuthorized) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
        Only admins can manage HR person profiles from this module.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-16 text-center text-secondary-muted">
        Loading HR persons...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-white border shadow-sm">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BriefcaseBusiness className="h-5 w-5" />
              HR Persons
            </CardTitle>
            <CardDescription>
              Admin-only foundation for creating and managing HR person profiles
              with basic employee details.
            </CardDescription>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-slate-900 text-white hover:bg-slate-800"
          >
            <PlusCircle className="mr-2 h-4 w-4 text-white stroke-white" />
            Create HR Person
          </Button>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, username, department..."
            />
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "all" | HrPersonStatus)
              }
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(event) => {
                const [nextSortBy, nextSortOrder] =
                  event.target.value.split(":");
                setSortBy(
                  nextSortBy as
                    | "createdAt"
                    | "fullName"
                    | "department"
                    | "status",
                );
                setSortOrder(nextSortOrder as "asc" | "desc");
              }}
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="createdAt:desc">Newest first</option>
              <option value="createdAt:asc">Oldest first</option>
              <option value="fullName:asc">Name A-Z</option>
              <option value="fullName:desc">Name Z-A</option>
              <option value="department:asc">Department A-Z</option>
            </select>
          </div>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <SummaryCard
              title="Total HR Employees"
              count={summaryStats.total}
              icon={<Users className="h-5 w-5" />}
            />
            <SummaryCard
              title="Active HR Employees"
              count={summaryStats.active}
              icon={<UserCheck className="h-5 w-5" />}
            />
            <SummaryCard
              title="Inactive HR Employees"
              count={summaryStats.inactive}
              icon={<UserMinus className="h-5 w-5" />}
            />
            <SummaryCard
              title="Departments"
              count={summaryStats.departments}
              icon={<BriefcaseBusiness className="h-5 w-5" />}
            />
          </div>

          <div className="mb-6 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Button
              onClick={() =>
                tableRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
              }
              size="sm"
              variant="outline"
            >
              View Employee List
            </Button>
            <Button onClick={refreshData} size="sm" variant="ghost">
              Refresh Data
            </Button>
          </div>

          <div className="space-y-6">
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-200">
                    Employee profile management
                  </h3>
                  <p className="text-sm text-slate-500">
                    Core HR profiles with basic employee details.
                  </p>
                </div>
              </div>
              {sortedPersons.length === 0 ? (
                <div className="py-8 text-center text-secondary-muted">
                  No HR persons yet. Create the first profile to get started.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Full Name</TableHead>
                        <TableHead>Username</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedPersons.map((person) => (
                        <TableRow key={person.id}>
                          <TableCell className="font-semibold">
                            {person.fullName}
                          </TableCell>
                          <TableCell>{person.username}</TableCell>
                          <TableCell>{person.department || "—"}</TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${person.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}
                            >
                              {person.status === "active"
                                ? "Active"
                                : "Inactive"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEdit(person)}
                            >
                              <Edit className="mr-1 h-4 w-4" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDelete(person)}
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
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

            <div className="grid gap-4 xl:grid-cols-2">
              <div
                ref={tableRef}
                id="hr-employee-list"
                className="rounded-lg border border-slate-200 p-4"
              >
                <div className="mb-3">
                  <h3 className="text-lg font-semibold text-slate-900">
                    Attendance and leave tracking
                  </h3>
                  <p className="text-sm text-slate-500">
                    Log attendance, leave requests, and approvals.
                  </p>
                </div>
                <form onSubmit={handleAttendanceSubmit} className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      value={attendanceForm.employeeId}
                      onChange={(event) =>
                        setAttendanceForm((current) => ({
                          ...current,
                          employeeId: event.target.value,
                        }))
                      }
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                    >
                      <option value="">Select employee</option>
                      {employees.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.fullName}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={attendanceForm.date}
                      onChange={(event) =>
                        setAttendanceForm((current) => ({
                          ...current,
                          date: event.target.value,
                        }))
                      }
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                    />
                    <select
                      value={attendanceForm.type}
                      onChange={(event) =>
                        setAttendanceForm((current) => ({
                          ...current,
                          type: event.target.value as AttendanceRecord["type"],
                        }))
                      }
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="Present">Present</option>
                      <option value="Absent">Absent</option>
                      <option value="Leave">Leave</option>
                      <option value="Half Day">Half Day</option>
                    </select>
                    <select
                      value={attendanceForm.status}
                      onChange={(event) =>
                        setAttendanceForm((current) => ({
                          ...current,
                          status: event.target
                            .value as AttendanceRecord["status"],
                        }))
                      }
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="approved">Approved</option>
                      <option value="pending">Pending</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                  <textarea
                    value={attendanceForm.notes}
                    onChange={(event) =>
                      setAttendanceForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    placeholder="Notes"
                    className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <Button type="submit" size="sm">
                    Log attendance
                  </Button>
                </form>
                <div className="mt-4 space-y-2">
                  {attendanceRecords.slice(0, 4).map((record) => (
                    <div
                      key={record.id}
                      className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
                    >
                      <span>
                        {employees.find(
                          (person) => person.id === record.employeeId,
                        )?.fullName || "Unknown employee"}{" "}
                        • {record.date}
                      </span>
                      <span className="text-slate-500">{record.type}</span>
                    </div>
                  ))}
                </div>
                <form
                  onSubmit={handleLeaveSubmit}
                  className="mt-4 space-y-3 border-t border-slate-200 pt-4"
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      value={leaveForm.employeeId}
                      onChange={(event) =>
                        setLeaveForm((current) => ({
                          ...current,
                          employeeId: event.target.value,
                        }))
                      }
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                    >
                      <option value="">Select employee</option>
                      {employees.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.fullName}
                        </option>
                      ))}
                    </select>
                    <select
                      value={leaveForm.type}
                      onChange={(event) =>
                        setLeaveForm((current) => ({
                          ...current,
                          type: event.target.value as LeaveRecord["type"],
                        }))
                      }
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="Annual">Annual</option>
                      <option value="Sick">Sick</option>
                      <option value="Casual">Casual</option>
                      <option value="Other">Other</option>
                    </select>
                    <input
                      type="date"
                      value={leaveForm.startDate}
                      onChange={(event) =>
                        setLeaveForm((current) => ({
                          ...current,
                          startDate: event.target.value,
                        }))
                      }
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                    />
                    <input
                      type="date"
                      value={leaveForm.endDate}
                      onChange={(event) =>
                        setLeaveForm((current) => ({
                          ...current,
                          endDate: event.target.value,
                        }))
                      }
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                    />
                  </div>
                  <textarea
                    value={leaveForm.notes}
                    onChange={(event) =>
                      setLeaveForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    placeholder="Leave reason"
                    className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <div className="flex items-center gap-2">
                    <Button type="submit" size="sm">
                      Submit leave
                    </Button>
                    <select
                      value={leaveForm.status}
                      onChange={(event) =>
                        setLeaveForm((current) => ({
                          ...current,
                          status: event.target.value as LeaveRecord["status"],
                        }))
                      }
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                </form>
              </div>

              <div className="rounded-lg border border-slate-200 p-4">
                <div className="mb-3">
                  <h3 className="text-lg font-semibold text-slate-900">
                    Document management
                  </h3>
                  <p className="text-sm text-slate-500">
                    Track contracts, certificates, and other HR documents.
                  </p>
                </div>
                <form onSubmit={handleDocumentSubmit} className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      value={documentForm.employeeId}
                      onChange={(event) =>
                        setDocumentForm((current) => ({
                          ...current,
                          employeeId: event.target.value,
                        }))
                      }
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                    >
                      <option value="">Select employee</option>
                      {employees.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.fullName}
                        </option>
                      ))}
                    </select>
                    <input
                      value={documentForm.title}
                      onChange={(event) =>
                        setDocumentForm((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      placeholder="Document title"
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                    />
                    <select
                      value={documentForm.category}
                      onChange={(event) =>
                        setDocumentForm((current) => ({
                          ...current,
                          category: event.target
                            .value as DocumentRecord["category"],
                        }))
                      }
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="ID">ID</option>
                      <option value="Contract">Contract</option>
                      <option value="Certificate">Certificate</option>
                      <option value="Policy">Policy</option>
                      <option value="Other">Other</option>
                    </select>
                    <input
                      type="date"
                      value={documentForm.expiryDate}
                      onChange={(event) =>
                        setDocumentForm((current) => ({
                          ...current,
                          expiryDate: event.target.value,
                        }))
                      }
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <textarea
                    value={documentForm.notes}
                    onChange={(event) =>
                      setDocumentForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    placeholder="Notes"
                    className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <div className="flex items-center gap-2">
                    <Button type="submit" size="sm">
                      Add document
                    </Button>
                    <select
                      value={documentForm.status}
                      onChange={(event) =>
                        setDocumentForm((current) => ({
                          ...current,
                          status: event.target
                            .value as DocumentRecord["status"],
                        }))
                      }
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="active">Active</option>
                      <option value="expired">Expired</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>
                </form>
                <div className="mt-4 space-y-2">
                  {documents.slice(0, 4).map((document) => (
                    <div
                      key={document.id}
                      className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{document.title}</span>
                        <span className="text-slate-500">
                          {document.category}
                        </span>
                      </div>
                      <div className="text-slate-500">
                        {employees.find(
                          (person) => person.id === document.employeeId,
                        )?.fullName || "Unknown employee"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="mb-3">
                  <h3 className="text-lg font-semibold text-slate-900">
                    Payroll / salary-related records
                  </h3>
                  <p className="text-sm text-slate-500">
                    Track salary components and payment status.
                  </p>
                </div>
                <form onSubmit={handlePayrollSubmit} className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      value={payrollForm.employeeId}
                      onChange={(event) =>
                        setPayrollForm((current) => ({
                          ...current,
                          employeeId: event.target.value,
                        }))
                      }
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                    >
                      <option value="">Select employee</option>
                      {employees.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.fullName}
                        </option>
                      ))}
                    </select>
                    <input
                      value={payrollForm.period}
                      onChange={(event) =>
                        setPayrollForm((current) => ({
                          ...current,
                          period: event.target.value,
                        }))
                      }
                      placeholder="Payroll period"
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                    />
                    <input
                      value={payrollForm.basicSalary}
                      onChange={(event) =>
                        setPayrollForm((current) => ({
                          ...current,
                          basicSalary: event.target.value,
                        }))
                      }
                      placeholder="Basic salary"
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                    <input
                      value={payrollForm.bonus}
                      onChange={(event) =>
                        setPayrollForm((current) => ({
                          ...current,
                          bonus: event.target.value,
                        }))
                      }
                      placeholder="Bonus"
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                    <input
                      value={payrollForm.deductions}
                      onChange={(event) =>
                        setPayrollForm((current) => ({
                          ...current,
                          deductions: event.target.value,
                        }))
                      }
                      placeholder="Deductions"
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                    <input
                      value={payrollForm.netSalary}
                      onChange={(event) =>
                        setPayrollForm((current) => ({
                          ...current,
                          netSalary: event.target.value,
                        }))
                      }
                      placeholder="Net salary"
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <textarea
                    value={payrollForm.notes}
                    onChange={(event) =>
                      setPayrollForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    placeholder="Notes"
                    className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <div className="flex items-center gap-2">
                    <Button type="submit" size="sm">
                      Add payroll
                    </Button>
                    <select
                      value={payrollForm.status}
                      onChange={(event) =>
                        setPayrollForm((current) => ({
                          ...current,
                          status: event.target.value as PayrollRecord["status"],
                        }))
                      }
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="draft">Draft</option>
                      <option value="processed">Processed</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>
                </form>
                <div className="mt-4 space-y-2">
                  {payrollRecords.slice(0, 4).map((record) => (
                    <div
                      key={record.id}
                      className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
                    >
                      <span>
                        {employees.find(
                          (person) => person.id === record.employeeId,
                        )?.fullName || "Unknown employee"}{" "}
                        • {record.period}
                      </span>
                      <span className="text-slate-500">
                        {record.netSalary || "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      Notifications and reports
                    </h3>
                    <p className="text-sm text-slate-500">
                      Keep HR updates visible and generate quick summaries.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleGenerateReport}
                  >
                    Generate report
                  </Button>
                </div>
                <div className="space-y-2">
                  {notifications.slice(0, 6).map((notification) => (
                    <div
                      key={notification.id}
                      className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {notification.title}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {notification.priority}
                        </span>
                      </div>
                      <div className="mt-1 text-slate-500">
                        {notification.message}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Create HR Person</DialogTitle>
            <DialogDescription>
              Add a new HR person profile with core employee details.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="create-full-name">Full name</Label>
                <Input
                  id="create-full-name"
                  name="fullName"
                  placeholder="Ayesha Khan"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-username">Username</Label>
                <Input
                  id="create-username"
                  name="username"
                  placeholder="ayesha"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-password">Password</Label>
                <Input
                  id="create-password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-email">Email</Label>
                <Input
                  id="create-email"
                  name="email"
                  type="email"
                  placeholder="ayesha@company.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-phone">Phone</Label>
                <Input
                  id="create-phone"
                  name="phone"
                  placeholder="03XX-XXXXXXX"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-department">Department</Label>
                <Input
                  id="create-department"
                  name="department"
                  placeholder="Human Resources"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-designation">Designation</Label>
                <Input
                  id="create-designation"
                  name="designation"
                  placeholder="HR Coordinator"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-employee-id">Employee ID</Label>
                <Input
                  id="create-employee-id"
                  name="employeeId"
                  placeholder="EMP-1001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-status">Status</Label>
                <select
                  id="create-status"
                  name="status"
                  defaultValue="active"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Save HR Person</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditingPerson(null);
        }}
      >
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Edit HR Person</DialogTitle>
            <DialogDescription>
              Update the selected HR person profile.
            </DialogDescription>
          </DialogHeader>
          {editingPerson && (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-full-name">Full name</Label>
                  <Input
                    id="edit-full-name"
                    name="fullName"
                    defaultValue={editingPerson.fullName}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-username">Username</Label>
                  <Input
                    id="edit-username"
                    name="username"
                    defaultValue={editingPerson.username}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    name="email"
                    type="email"
                    defaultValue={editingPerson.email}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">Phone</Label>
                  <Input
                    id="edit-phone"
                    name="phone"
                    defaultValue={editingPerson.phone}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-department">Department</Label>
                  <Input
                    id="edit-department"
                    name="department"
                    defaultValue={editingPerson.department}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-designation">Designation</Label>
                  <Input
                    id="edit-designation"
                    name="designation"
                    defaultValue={editingPerson.designation}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-employee-id">Employee ID</Label>
                  <Input
                    id="edit-employee-id"
                    name="employeeId"
                    defaultValue={editingPerson.employeeId}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-status">Status</Label>
                  <select
                    id="edit-status"
                    name="status"
                    defaultValue={editingPerson.status}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Update HR Person</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Remove HR Person</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              {deleteTarget?.fullName || "this profile"} from the list?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
