"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Info,
  Percent,
  Target,
  TrendingUp,
  CalendarDays,
} from "lucide-react";
import type { KpiGoal, KpiGoalStatus } from "@/app/actions/kpiGoals";
import type { AttendanceRecord } from "@/app/actions/attendance";
import type { LeaveRequest } from "@/app/actions/leave";
import type { PayrollRecord } from "@/app/actions/payroll";
import {
  calculateAttendanceDistribution,
  calculateGoalProgress,
  calculatePayrollTrend,
  generateQuickInsights,
} from "@/lib/analytics-utils";
import { buildAttendanceSummary } from "@/lib/attendance-summary";
import { calculateKpiScores } from "@/lib/kpi-utils";
import { formatCurrency, calculateNetSalary } from "@/lib/payroll-utils";
import { formatGoalMonthLabel } from "@/lib/kpi-goal-month";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AnalyticsPanelProps {
  goals: KpiGoal[];
  attendanceRecords: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  payrollRecords: PayrollRecord[];
}

const ATTENDANCE_PIE_COLORS = {
  present: "#22c55e",
  absent: "#ef4444",
  halfDay: "#f97316",
  late: "#eab308",
} as const;

const INSIGHT_STYLES = {
  positive: {
    card: "border-emerald-200 bg-emerald-50 text-emerald-900",
    icon: CheckCircle2,
  },
  warning: {
    card: "border-amber-200 bg-amber-50 text-amber-900",
    icon: AlertTriangle,
  },
  negative: {
    card: "border-red-200 bg-red-50 text-red-900",
    icon: AlertTriangle,
  },
  info: {
    card: "border-sky-200 bg-sky-50 text-sky-900",
    icon: Info,
  },
} as const;

function statusLabel(status: KpiGoalStatus) {
  switch (status) {
    case "not_started":
      return "Not Started";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    case "on_hold":
      return "On Hold";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function statusBadgeClass(status: KpiGoalStatus) {
  switch (status) {
    case "not_started":
      return "border-transparent bg-slate-100 text-slate-700";
    case "in_progress":
      return "border-transparent bg-blue-100 text-blue-700";
    case "completed":
      return "border-transparent bg-emerald-100 text-emerald-700";
    case "on_hold":
      return "border-transparent bg-amber-100 text-amber-800";
    case "cancelled":
      return "border-transparent bg-red-100 text-red-700";
    default:
      return "border-transparent bg-slate-100 text-slate-700";
  }
}

function SummaryMetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  badge,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: typeof Target;
  badge?: { label: string; className: string } | null;
}) {
  return (
    <Card className="border bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">
          {title}
        </CardTitle>
        <div className="rounded-md bg-slate-100 p-2 text-slate-700">
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-3xl font-semibold text-slate-900">{value}</p>
          {badge ? (
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium text-white ${badge.className}`}
            >
              {badge.label}
            </span>
          ) : null}
        </div>
        {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
      </CardContent>
    </Card>
  );
}

export function AnalyticsPanel({
  goals,
  attendanceRecords,
  leaveRequests,
  payrollRecords,
}: AnalyticsPanelProps) {
  const kpiScores = useMemo(
    () => calculateKpiScores(goals, attendanceRecords, leaveRequests),
    [goals, attendanceRecords, leaveRequests],
  );

  const attendanceSummary = useMemo(
    () => buildAttendanceSummary(attendanceRecords, leaveRequests),
    [attendanceRecords, leaveRequests],
  );

  const attendanceDistribution = useMemo(
    () => calculateAttendanceDistribution(attendanceRecords),
    [attendanceRecords],
  );

  const goalProgress = useMemo(() => calculateGoalProgress(goals), [goals]);

  const payrollTrend = useMemo(
    () => calculatePayrollTrend(payrollRecords),
    [payrollRecords],
  );

  const quickInsights = useMemo(
    () =>
      generateQuickInsights(
        kpiScores,
        attendanceSummary,
        goals,
        payrollRecords,
        attendanceRecords,
        leaveRequests,
      ),
    [
      kpiScores,
      attendanceSummary,
      goals,
      payrollRecords,
      attendanceRecords,
      leaveRequests,
    ],
  );

  const pieChartData = useMemo(() => {
    const dist = attendanceDistribution;
    return [
      { name: "Present", value: dist.present, color: ATTENDANCE_PIE_COLORS.present },
      { name: "Absent", value: dist.absent, color: ATTENDANCE_PIE_COLORS.absent },
      { name: "Half Day", value: dist.halfDay, color: ATTENDANCE_PIE_COLORS.halfDay },
      { name: "Late", value: dist.late, color: ATTENDANCE_PIE_COLORS.late },
    ].filter((item) => item.value > 0);
  }, [attendanceDistribution]);

  const currentNetSalary = useMemo(() => {
    if (payrollRecords.length === 0) return 0;
    const latest = [...payrollRecords].sort((a, b) =>
      String(b.payment_date || b.created_at).localeCompare(
        String(a.payment_date || a.created_at),
      ),
    )[0];
    return calculateNetSalary(latest);
  }, [payrollRecords]);

  const sortedGoals = useMemo(
    () =>
      [...goals].sort((a, b) =>
        String(b.goal_month || b.created_at).localeCompare(
          String(a.goal_month || a.created_at),
        ),
      ),
    [goals],
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Analytics</h3>
        <p className="mt-1 text-sm text-slate-600">
          Performance overview, goals, attendance, payroll trends, and insights.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetricCard
          title="Current KPI Score"
          value={`${kpiScores.overallKpiScore}%`}
          subtitle="Weighted goals and attendance"
          icon={Percent}
          badge={{
            label: kpiScores.performanceRating,
            className: kpiScores.performanceRatingColor,
          }}
        />
        <SummaryMetricCard
          title="Attendance Rate"
          value={`${attendanceSummary.attendancePercentage}%`}
          subtitle={`${attendanceSummary.monthLabel} · Present ${attendanceSummary.presentDays}`}
          icon={CalendarDays}
        />
        <SummaryMetricCard
          title="Goals Completed"
          value={`${goalProgress.completed} / ${goals.length}`}
          subtitle={`Completion ${goalProgress.completionPercentage}%`}
          icon={Target}
        />
        <SummaryMetricCard
          title="Current Net Salary"
          value={formatCurrency(currentNetSalary)}
          subtitle={
            payrollRecords.length > 0
              ? "Latest payroll record"
              : "No payroll records available"
          }
          icon={DollarSign}
        />
      </div>

      <section className="space-y-3">
        <div>
          <h4 className="text-base font-semibold text-slate-900">
            Goal Progress
          </h4>
          <p className="text-sm text-slate-500">
            Progress for every assigned goal.
          </p>
        </div>
        {sortedGoals.length === 0 ? (
          <Card className="border bg-white shadow-sm">
            <CardContent className="py-10 text-center text-sm text-slate-500">
              No goals assigned.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {sortedGoals.map((goal) => {
              const progress = Math.max(0, Math.min(100, goal.progress || 0));
              return (
                <Card
                  key={goal.id}
                  className="border bg-white shadow-sm transition-all duration-200 hover:shadow-md"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base text-slate-900">
                        {goal.goal}
                      </CardTitle>
                      <Badge className={statusBadgeClass(goal.status)}>
                        {statusLabel(goal.status)}
                      </Badge>
                    </div>
                    <CardDescription className="line-clamp-3 whitespace-pre-wrap">
                      {goal.target || "No description provided."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Progress</span>
                      <span className="font-medium text-slate-900">
                        {progress}%
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-[#0f766e] transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      Month: {formatGoalMonthLabel(goal.goal_month)}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h4 className="text-base font-semibold text-slate-900">
            Attendance Distribution
          </h4>
          <p className="text-sm text-slate-500">
            Present, Absent, Half Day, and Late share of attendance records.
          </p>
        </div>
        <Card className="border bg-white shadow-sm">
          <CardContent className="pt-6">
            {pieChartData.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                No attendance data available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                    outerRadius={95}
                    dataKey="value"
                    isAnimationActive
                  >
                    {pieChartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h4 className="text-base font-semibold text-slate-900">
            Payroll Trend
          </h4>
          <p className="text-sm text-slate-500">
            Monthly net salary history for this employee.
          </p>
        </div>
        <Card className="border bg-white shadow-sm">
          <CardContent className="pt-6">
            {payrollTrend.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                No payroll records available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={payrollTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis
                    tickFormatter={(value) =>
                      `Rs. ${Number(value).toLocaleString()}`
                    }
                  />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                  />
                  <Legend />
                  <Bar
                    dataKey="netSalary"
                    fill="#0f766e"
                    name="Net Salary"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-slate-600" />
          <div>
            <h4 className="text-base font-semibold text-slate-900">
              Quick Insights
            </h4>
            <p className="text-sm text-slate-500">
              Rule-based highlights from current dashboard data.
            </p>
          </div>
        </div>
        {quickInsights.length === 0 ? (
          <Card className="border bg-white shadow-sm">
            <CardContent className="py-10 text-center text-sm text-slate-500">
              No insights available yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {quickInsights.map((insight, index) => {
              const style = INSIGHT_STYLES[insight.type];
              const Icon = style.icon;
              return (
                <div
                  key={`${insight.title}-${index}`}
                  className={`rounded-lg border px-4 py-3 ${style.card}`}
                >
                  <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">{insight.title}</p>
                      <p className="mt-1 text-sm opacity-90">
                        {insight.message}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
