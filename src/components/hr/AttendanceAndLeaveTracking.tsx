"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAllEmployees, type Employee } from "@/app/actions/employees";
import {
  getAttendance,
  createAttendance,
  type AttendanceRecord,
} from "@/app/actions/attendance";
import {
  getLeaveRequests,
  createLeaveRequest,
  type LeaveRequest,
} from "@/app/actions/leave";

type EmployeeOption = {
  id: string;
  fullName: string;
};

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const ATTENDANCE_TYPE_LABELS: Record<AttendanceRecord["attendance_type"], string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  half_day: "Half Day",
  leave: "Leave",
  holiday: "Holiday",
};

const LEAVE_TYPE_LABELS: Record<LeaveRequest["leave_type"], string> = {
  annual: "Annual",
  sick: "Sick",
  personal: "Personal",
  maternity: "Maternity",
  paternity: "Paternity",
  unpaid: "Unpaid",
  other: "Other",
};

const STATUS_LABELS: Record<"pending" | "approved" | "rejected", string> = {
  approved: "Approved",
  pending: "Pending",
  rejected: "Rejected",
};

function attendanceBadgeClass(type: AttendanceRecord["attendance_type"]) {
  switch (type) {
    case "present":
      return "border-transparent bg-emerald-100 text-emerald-700";
    case "absent":
      return "border-transparent bg-red-100 text-red-700";
    case "late":
      return "border-transparent bg-amber-100 text-amber-700";
    case "half_day":
      return "border-transparent bg-blue-100 text-blue-700";
    case "leave":
      return "border-transparent bg-purple-100 text-purple-700";
    case "holiday":
      return "border-transparent bg-slate-100 text-slate-700";
    default:
      return "border-transparent bg-slate-100 text-slate-700";
  }
}

function leaveStatusBadgeClass(status: LeaveRequest["status"]) {
  switch (status) {
    case "approved":
      return "border-transparent bg-emerald-100 text-emerald-700";
    case "rejected":
      return "border-transparent bg-red-100 text-red-700";
    case "cancelled":
      return "border-transparent bg-slate-100 text-slate-700";
    case "pending":
    default:
      return "border-transparent bg-amber-100 text-amber-700";
  }
}

function EmployeeSelect({
  id,
  value,
  employees,
  onChange,
}: {
  id: string;
  value: string;
  employees: EmployeeOption[];
  onChange: (employeeId: string) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((employee) =>
      employee.fullName.toLowerCase().includes(q),
    );
  }, [employees, query]);

  const selectedName =
    employees.find((employee) => employee.id === value)?.fullName || "";

  return (
    <div className="space-y-2">
      <Label htmlFor={`${id}-search`}>Employee</Label>
      <Input
        id={`${id}-search`}
        value={query || (value ? selectedName : "")}
        onChange={(event) => {
          setQuery(event.target.value);
          if (value) onChange("");
        }}
        onFocus={() => {
          if (value && !query) setQuery(selectedName);
        }}
        placeholder="Search employee..."
      />
      <select
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          const name =
            employees.find((employee) => employee.id === event.target.value)
              ?.fullName || "";
          setQuery(name);
        }}
        className={selectClassName}
        required
      >
        <option value="">Select employee</option>
        {filtered.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.fullName}
          </option>
        ))}
      </select>
    </div>
  );
}

export function AttendanceAndLeaveTracking() {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(
    [],
  );
  const [leaveRecords, setLeaveRecords] = useState<LeaveRequest[]>([]);
  const [attendanceForm, setAttendanceForm] = useState({
    employeeId: "",
    date: "",
    attendanceType: "present" as AttendanceRecord["attendance_type"],
    status: "pending" as AttendanceRecord["status"],
    notes: "",
  });
  const [leaveForm, setLeaveForm] = useState({
    employeeId: "",
    startDate: "",
    endDate: "",
    leaveType: "annual" as LeaveRequest["leave_type"],
    status: "pending" as LeaveRequest["status"],
    notes: "",
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [employeeResult, attendanceResult, leaveResult] =
          await Promise.all([
            getAllEmployees(),
            getAttendance(),
            getLeaveRequests(),
          ]);

        if (!("error" in employeeResult)) {
          setEmployees(
            (employeeResult.employees || []).map((row: Employee) => ({
              id: row.id,
              fullName: row.full_name,
            })),
          );
        } else {
          toast.error(employeeResult.error);
        }

        if (!("error" in attendanceResult)) {
          setAttendanceRecords(attendanceResult.attendanceRecords || []);
        } else {
          toast.error(attendanceResult.error);
        }

        if (!("error" in leaveResult)) {
          setLeaveRecords(leaveResult.leaveRequests || []);
        } else {
          toast.error(leaveResult.error);
        }
      } catch (err) {
        toast.error(String(err || "Failed to load data"));
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  function employeeName(employeeId: string) {
    return (
      employees.find((employee) => employee.id === employeeId)?.fullName ||
      "Unknown employee"
    );
  }

  async function handleAttendanceSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!attendanceForm.employeeId || !attendanceForm.date) {
      toast.error("Please select an employee and a date for attendance.");
      return;
    }

    const formData = new FormData();
    formData.append("employee_id", attendanceForm.employeeId);
    formData.append("date", attendanceForm.date);
    formData.append("attendance_type", attendanceForm.attendanceType);
    formData.append("status", attendanceForm.status);
    formData.append("notes", attendanceForm.notes);

    try {
      const result = await createAttendance(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("Attendance entry added");
      setAttendanceForm({
        employeeId: "",
        date: "",
        attendanceType: "present",
        status: "pending",
        notes: "",
      });

      const refreshed = await getAttendance();
      if (!("error" in refreshed)) {
        setAttendanceRecords(refreshed.attendanceRecords || []);
      }
    } catch (err) {
      toast.error(String(err || "Failed to create attendance"));
    }
  }

  async function handleLeaveSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!leaveForm.employeeId || !leaveForm.startDate || !leaveForm.endDate) {
      toast.error("Please complete the leave request details.");
      return;
    }

    if (leaveForm.endDate < leaveForm.startDate) {
      toast.error("End date cannot be before start date.");
      return;
    }

    const formData = new FormData();
    formData.append("employee_id", leaveForm.employeeId);
    formData.append("start_date", leaveForm.startDate);
    formData.append("end_date", leaveForm.endDate);
    formData.append("leave_type", leaveForm.leaveType);
    formData.append("status", leaveForm.status);
    formData.append("notes", leaveForm.notes);

    try {
      const result = await createLeaveRequest(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("Leave request added");
      setLeaveForm({
        employeeId: "",
        startDate: "",
        endDate: "",
        leaveType: "annual",
        status: "pending",
        notes: "",
      });

      const refreshed = await getLeaveRequests();
      if (!("error" in refreshed)) {
        setLeaveRecords(refreshed.leaveRequests || []);
      }
    } catch (err) {
      toast.error(String(err || "Failed to create leave request"));
    }
  }

  if (isLoading) {
    return (
      <div className="py-16 text-center text-secondary-muted">
        Loading attendance and leave data...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">
          Attendance & Leave Tracking
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Log attendance and manage leave requests for employees.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Attendance Logging</CardTitle>
            <p className="text-sm text-slate-500">
              Log daily attendance for employees.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleAttendanceSubmit} className="space-y-4">
              <EmployeeSelect
                id="attendance-employee"
                value={attendanceForm.employeeId}
                employees={employees}
                onChange={(employeeId) =>
                  setAttendanceForm((current) => ({
                    ...current,
                    employeeId,
                  }))
                }
              />

              <div className="space-y-2">
                <Label htmlFor="attendance-date">Attendance Date</Label>
                <Input
                  id="attendance-date"
                  type="date"
                  value={attendanceForm.date}
                  onChange={(event) =>
                    setAttendanceForm((current) => ({
                      ...current,
                      date: event.target.value,
                    }))
                  }
                  required
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="attendance-status-type">
                    Attendance Status
                  </Label>
                  <select
                    id="attendance-status-type"
                    value={attendanceForm.attendanceType}
                    onChange={(event) =>
                      setAttendanceForm((current) => ({
                        ...current,
                        attendanceType: event.target
                          .value as AttendanceRecord["attendance_type"],
                      }))
                    }
                    className={selectClassName}
                  >
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="late">Late</option>
                    <option value="half_day">Half Day</option>
                    <option value="leave">Leave</option>
                    <option value="holiday">Holiday</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="attendance-approval">Approval Status</Label>
                  <select
                    id="attendance-approval"
                    value={attendanceForm.status}
                    onChange={(event) =>
                      setAttendanceForm((current) => ({
                        ...current,
                        status: event.target
                          .value as AttendanceRecord["status"],
                      }))
                    }
                    className={selectClassName}
                  >
                    <option value="approved">Approved</option>
                    <option value="pending">Pending</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="attendance-notes">Notes</Label>
                <Textarea
                  id="attendance-notes"
                  value={attendanceForm.notes}
                  onChange={(event) =>
                    setAttendanceForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Optional notes"
                  rows={5}
                />
              </div>

              <Button type="submit">Log Attendance</Button>
            </form>

            <div className="space-y-3 border-t border-slate-200 pt-4">
              <h4 className="text-sm font-semibold text-slate-900">
                Recent Attendance
              </h4>
              {attendanceRecords.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No attendance records yet.
                </p>
              ) : (
                attendanceRecords.slice(0, 8).map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2.5"
                  >
                    <span className="text-sm text-slate-800">
                      {employeeName(record.employee_id)}
                      <span className="text-slate-400"> • </span>
                      {record.date}
                    </span>
                    <Badge
                      variant="outline"
                      className={attendanceBadgeClass(record.attendance_type)}
                    >
                      {ATTENDANCE_TYPE_LABELS[record.attendance_type]}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Leave Requests</CardTitle>
            <p className="text-sm text-slate-500">
              Submit and track leave requests.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleLeaveSubmit} className="space-y-4">
              <EmployeeSelect
                id="leave-employee"
                value={leaveForm.employeeId}
                employees={employees}
                onChange={(employeeId) =>
                  setLeaveForm((current) => ({
                    ...current,
                    employeeId,
                  }))
                }
              />

              <div className="space-y-2">
                <Label htmlFor="leave-type">Leave Type</Label>
                <select
                  id="leave-type"
                  value={leaveForm.leaveType}
                  onChange={(event) =>
                    setLeaveForm((current) => ({
                      ...current,
                      leaveType: event.target
                        .value as LeaveRequest["leave_type"],
                    }))
                  }
                  className={selectClassName}
                >
                  <option value="annual">Annual</option>
                  <option value="sick">Sick</option>
                  <option value="personal">Personal</option>
                  <option value="maternity">Maternity</option>
                  <option value="paternity">Paternity</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="leave-start">Start Date</Label>
                  <Input
                    id="leave-start"
                    type="date"
                    value={leaveForm.startDate}
                    onChange={(event) =>
                      setLeaveForm((current) => ({
                        ...current,
                        startDate: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="leave-end">End Date</Label>
                  <Input
                    id="leave-end"
                    type="date"
                    value={leaveForm.endDate}
                    onChange={(event) =>
                      setLeaveForm((current) => ({
                        ...current,
                        endDate: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="leave-reason">Leave Reason</Label>
                <Textarea
                  id="leave-reason"
                  value={leaveForm.notes}
                  onChange={(event) =>
                    setLeaveForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Reason for leave"
                  rows={5}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="leave-status">Leave Status</Label>
                <select
                  id="leave-status"
                  value={leaveForm.status}
                  onChange={(event) =>
                    setLeaveForm((current) => ({
                      ...current,
                      status: event.target.value as LeaveRequest["status"],
                    }))
                  }
                  className={selectClassName}
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <Button type="submit">Submit Leave</Button>
            </form>

            <div className="space-y-3 border-t border-slate-200 pt-4">
              <h4 className="text-sm font-semibold text-slate-900">
                Recent Leave Requests
              </h4>
              {leaveRecords.length === 0 ? (
                <p className="text-sm text-slate-500">No leave requests yet.</p>
              ) : (
                leaveRecords.slice(0, 8).map((record) => (
                  <div
                    key={record.id}
                    className="rounded-md border border-slate-200 px-3 py-2.5 text-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium text-slate-900">
                          {employeeName(record.employee_id)}
                        </p>
                        <p className="text-slate-600">
                          {LEAVE_TYPE_LABELS[record.leave_type]}
                        </p>
                        <p className="text-slate-500">
                          {record.start_date} → {record.end_date}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={leaveStatusBadgeClass(record.status)}
                      >
                        {STATUS_LABELS[
                          record.status as keyof typeof STATUS_LABELS
                        ] || record.status}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
