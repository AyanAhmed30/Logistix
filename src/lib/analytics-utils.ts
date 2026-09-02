import type { KpiGoal } from "@/app/actions/kpiGoals";
import type { AttendanceRecord } from "@/app/actions/attendance";
import type { LeaveRequest } from "@/app/actions/leave";
import type { PayrollRecord } from "@/app/actions/payroll";
import { calculateGoalCompletion } from "@/lib/kpi-utils";
import { buildAttendanceSummary } from "@/lib/attendance-summary";
import { calculateNetSalary } from "@/lib/payroll-utils";

export interface MonthlyKpiData {
  month: string;
  year: number;
  goalCompletion: number;
  attendanceScore: number;
  overallKpiScore: number;
}

export interface AttendanceDistribution {
  present: number;
  late: number;
  halfDay: number;
  leave: number;
  absent: number;
  holiday: number;
}

export interface GoalProgress {
  completed: number;
  incomplete: number;
  completionPercentage: number;
}

export interface PayrollTrendData {
  month: string;
  netSalary: number;
}

export interface QuickInsight {
  title: string;
  message: string;
  type: "positive" | "warning" | "negative" | "info";
}

/**
 * Filter records by month and year
 */
export function filterByMonth<T extends { date: string }>(
  records: T[],
  year: number,
  month: number
): T[] {
  return records.filter((record) => {
    const recordDate = new Date(record.date);
    return (
      recordDate.getFullYear() === year && recordDate.getMonth() === month
    );
  });
}

/**
 * Calculate monthly KPI data for trend analysis
 */
export function calculateMonthlyKpiTrend(
  goals: KpiGoal[],
  attendanceRecords: AttendanceRecord[],
  leaveRequests: LeaveRequest[],
  months: number = 6
): MonthlyKpiData[] {
  const now = new Date();
  const monthlyData: MonthlyKpiData[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = date.getFullYear();
    const month = date.getMonth();

    const monthName = date.toLocaleString("default", { month: "short" });

    // Filter goals for this month (use all goals since they don't have dates)
    const monthlyGoals = goals;

    // Filter attendance for this month
    const monthlyAttendance = filterByMonth(attendanceRecords, year, month);

    // Filter leave requests for this month
    const monthlyLeave = leaveRequests.filter((request) => {
      const startDate = new Date(request.start_date);
      return (
        startDate.getFullYear() === year && startDate.getMonth() === month
      );
    });

    // Calculate goal completion
    const goalCompletion = calculateGoalCompletion(monthlyGoals);

    // Calculate attendance score
    const attendanceSummary = buildAttendanceSummary(
      monthlyAttendance,
      monthlyLeave
    );
    const attendanceScore = attendanceSummary.attendancePercentage;

    // Calculate overall KPI score
    const overallKpiScore = Math.round(
      goalCompletion * 0.7 + attendanceScore * 0.3
    );

    monthlyData.push({
      month: monthName,
      year,
      goalCompletion,
      attendanceScore,
      overallKpiScore,
    });
  }

  return monthlyData;
}

/**
 * Calculate attendance distribution
 */
export function calculateAttendanceDistribution(
  attendanceRecords: AttendanceRecord[]
): AttendanceDistribution {
  return {
    present: attendanceRecords.filter((r) => r.attendance_type === "present")
      .length,
    late: attendanceRecords.filter((r) => r.attendance_type === "late").length,
    halfDay: attendanceRecords.filter((r) => r.attendance_type === "half_day")
      .length,
    leave: attendanceRecords.filter((r) => r.attendance_type === "leave").length,
    absent: attendanceRecords.filter((r) => r.attendance_type === "absent")
      .length,
    holiday: attendanceRecords.filter((r) => r.attendance_type === "holiday")
      .length,
  };
}

/**
 * Calculate goal progress
 */
export function calculateGoalProgress(goals: KpiGoal[]): GoalProgress {
  if (!goals || goals.length === 0) {
    return { completed: 0, incomplete: 0, completionPercentage: 0 };
  }

  const completed = goals.filter((g) => g.status === "completed").length;
  const incomplete = goals.length - completed;
  const completionPercentage = Math.round((completed / goals.length) * 100);

  return { completed, incomplete, completionPercentage };
}

/**
 * Calculate payroll trend data (oldest → newest by payroll month).
 */
export function calculatePayrollTrend(
  payrollRecords: PayrollRecord[]
): PayrollTrendData[] {
  return [...(payrollRecords || [])]
    .map((record) => {
      const raw = String(record.payment_date || record.created_at || "");
      const date = new Date(
        raw.includes("T") ? raw : `${raw.slice(0, 10)}T00:00:00`,
      );
      const valid = !Number.isNaN(date.getTime());
      const monthYear = valid
        ? date.toLocaleString("default", {
            month: "short",
            year: "numeric",
          })
        : "—";
      return {
        month: monthYear,
        netSalary: calculateNetSalary(record),
        sortKey: valid ? date.getTime() : 0,
      };
    })
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ month, netSalary }) => ({ month, netSalary }));
}

/**
 * Generate rule-based quick insights (no AI).
 */
export function generateQuickInsights(
  kpiScores: { overallKpiScore: number } | null,
  attendanceSummary: {
    totalWorkingDays?: number;
    attendancePercentage?: number;
    attendanceRate?: number;
    leaveDays?: number;
  } | null,
  goals: KpiGoal[],
  payrollRecords: PayrollRecord[],
  attendanceRecords: AttendanceRecord[] = [],
  leaveRequests: LeaveRequest[] = [],
): QuickInsight[] {
  const insights: QuickInsight[] = [];

  if (kpiScores) {
    if (kpiScores.overallKpiScore >= 90) {
      insights.push({
        title: "Excellent KPI performance",
        message: `Current KPI is ${kpiScores.overallKpiScore}%. Keep up the strong results.`,
        type: "positive",
      });
    } else if (kpiScores.overallKpiScore >= 70) {
      insights.push({
        title: "Solid KPI performance",
        message: `Current KPI is ${kpiScores.overallKpiScore}%. There is still room to grow.`,
        type: "info",
      });
    } else {
      insights.push({
        title: "KPI score needs improvement",
        message: `Current KPI is below 70% (${kpiScores.overallKpiScore}%). Focus on goals and attendance.`,
        type: "negative",
      });
    }
  }

  const attendanceRate =
    attendanceSummary?.attendancePercentage ??
    attendanceSummary?.attendanceRate ??
    0;
  const hasAttendance = (attendanceSummary?.totalWorkingDays || 0) > 0;

  if (hasAttendance) {
    if (attendanceRate >= 90) {
      insights.push({
        title: "Strong attendance",
        message: `Attendance rate is above 90% (${attendanceRate}%).`,
        type: "positive",
      });
    } else if (attendanceRate < 70) {
      insights.push({
        title: "Attendance rate is low",
        message: `Attendance is ${attendanceRate}%. Consider improving consistency.`,
        type: "warning",
      });
    }
  } else {
    insights.push({
      title: "No attendance data",
      message: "No attendance records available for insight generation.",
      type: "info",
    });
  }

  if (attendanceRecords.length > 0) {
    const now = new Date();
    const priorMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    const priorSummary = buildAttendanceSummary(
      attendanceRecords,
      leaveRequests,
      priorMonthDate,
    );
    if (
      hasAttendance &&
      priorSummary.totalWorkingDays > 0 &&
      attendanceRate > priorSummary.attendancePercentage + 2
    ) {
      insights.push({
        title: "Attendance improved",
        message: "Attendance has improved compared to last month.",
        type: "positive",
      });
    }
  }

  if (goals.length === 0) {
    insights.push({
      title: "No goals assigned",
      message: "Assign goals to track progress and completion.",
      type: "info",
    });
  } else {
    const completedGoals = goals.filter((g) => g.status === "completed").length;
    if (completedGoals === goals.length) {
      insights.push({
        title: "All goals completed",
        message: "You completed all assigned goals. Great work!",
        type: "positive",
      });
    } else {
      insights.push({
        title: "Goals in progress",
        message: `Only ${completedGoals} of ${goals.length} goals completed. Focus on pending goals.`,
        type: completedGoals / goals.length < 0.5 ? "warning" : "info",
      });
    }
  }

  if (payrollRecords.length === 0) {
    insights.push({
      title: "No payroll history",
      message: "No payroll history available.",
      type: "info",
    });
  } else if (payrollRecords.length >= 3) {
    const recent = [...payrollRecords]
      .sort((a, b) =>
        String(a.payment_date || a.created_at).localeCompare(
          String(b.payment_date || b.created_at),
        ),
      )
      .slice(-3)
      .map((r) => calculateNetSalary(r));

    const first = recent[0];
    const last = recent[recent.length - 1];
    const maxSalary = Math.max(...recent);
    const minSalary = Math.min(...recent);
    const variance =
      minSalary > 0 ? ((maxSalary - minSalary) / minSalary) * 100 : 0;

    if (last > first * 1.02) {
      insights.push({
        title: "Salary increased",
        message: "Salary has increased over the last three payroll periods.",
        type: "positive",
      });
    } else if (variance < 5) {
      insights.push({
        title: "Stable payroll",
        message: "Salary remained stable this quarter.",
        type: "info",
      });
    }
  }

  return insights.slice(0, 6);
}
