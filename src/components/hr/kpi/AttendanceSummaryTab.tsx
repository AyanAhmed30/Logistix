"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Employee } from "@/app/actions/employees";
import {
  getAttendance,
  type AttendanceRecord,
} from "@/app/actions/attendance";
import {
  getLeaveRequests,
  type LeaveRequest,
} from "@/app/actions/leave";
import { AttendanceSummaryPanel } from "@/components/hr/AttendanceSummaryPanel";
import { buildAttendanceSummary } from "@/lib/attendance-summary";

type AttendanceSummaryTabProps = {
  employee: Employee;
};

export function AttendanceSummaryTab({ employee }: AttendanceSummaryTabProps) {
  const [attendanceRecords, setAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadAttendanceData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [attendanceResult, leaveResult] = await Promise.all([
        getAttendance(employee.id),
        getLeaveRequests(employee.id),
      ]);

      if ("error" in attendanceResult) {
        toast.error(attendanceResult.error);
        setAttendanceRecords([]);
      } else {
        setAttendanceRecords(attendanceResult.attendanceRecords || []);
      }

      if ("error" in leaveResult) {
        toast.error(leaveResult.error);
        setLeaveRequests([]);
      } else {
        setLeaveRequests(leaveResult.leaveRequests || []);
      }
    } catch (err) {
      toast.error(String(err || "Failed to load attendance summary"));
      setAttendanceRecords([]);
      setLeaveRequests([]);
    } finally {
      setIsLoading(false);
    }
  }, [employee.id]);

  useEffect(() => {
    void loadAttendanceData();
  }, [loadAttendanceData]);

  // Refresh when returning to the tab/dashboard after attendance edits elsewhere.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") {
        void loadAttendanceData();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadAttendanceData]);

  const summary = useMemo(
    () => buildAttendanceSummary(attendanceRecords, leaveRequests),
    [attendanceRecords, leaveRequests],
  );

  if (isLoading) {
    return (
      <div className="py-16 text-center text-sm text-slate-500">
        Loading attendance summary...
      </div>
    );
  }

  return <AttendanceSummaryPanel summary={summary} />;
}
