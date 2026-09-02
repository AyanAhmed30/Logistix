"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { Employee } from "@/app/actions/employees";
import { getGoals, type KpiGoal } from "@/app/actions/kpiGoals";
import {
  getAttendance,
  type AttendanceRecord,
} from "@/app/actions/attendance";
import {
  getLeaveRequests,
  type LeaveRequest,
} from "@/app/actions/leave";
import { getPayroll, type PayrollRecord } from "@/app/actions/payroll";
import { AnalyticsPanel } from "@/components/hr/AnalyticsPanel";

type AnalyticsTabProps = {
  employee: Employee;
};

export function AnalyticsTab({ employee }: AnalyticsTabProps) {
  const [goals, setGoals] = useState<KpiGoal[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadAnalyticsData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [goalsResult, attendanceResult, leaveResult, payrollResult] =
        await Promise.all([
          getGoals(employee.id),
          getAttendance(employee.id),
          getLeaveRequests(employee.id),
          getPayroll(employee.id),
        ]);

      if ("error" in goalsResult) {
        toast.error(goalsResult.error);
        setGoals([]);
      } else {
        setGoals(goalsResult.goals || []);
      }

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

      if ("error" in payrollResult) {
        toast.error(payrollResult.error);
        setPayrollRecords([]);
      } else {
        setPayrollRecords(payrollResult.payrollRecords || []);
      }
    } catch (err) {
      toast.error(String(err || "Failed to load analytics"));
      setGoals([]);
      setAttendanceRecords([]);
      setLeaveRequests([]);
      setPayrollRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, [employee.id]);

  useEffect(() => {
    void loadAnalyticsData();
  }, [loadAnalyticsData]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") {
        void loadAnalyticsData();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadAnalyticsData]);

  if (isLoading) {
    return (
      <div className="py-16 text-center text-sm text-slate-500">
        Loading analytics...
      </div>
    );
  }

  return (
    <AnalyticsPanel
      goals={goals}
      attendanceRecords={attendanceRecords}
      leaveRequests={leaveRequests}
      payrollRecords={payrollRecords}
    />
  );
}
