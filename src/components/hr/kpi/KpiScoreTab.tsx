"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  calculateKpiScores,
  generateScoreBreakdown,
  KPI_ATTENDANCE_WEIGHT,
  KPI_GOAL_COMPLETION_WEIGHT,
  type KpiScores,
} from "@/lib/kpi-utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type KpiScoreTabProps = {
  employee: Employee;
};

function ScoreSummaryCard({
  title,
  value,
  hint,
  badge,
}: {
  title: string;
  value: string;
  hint?: string;
  badge?: { label: string; className: string } | null;
}) {
  return (
    <Card className="border bg-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-[#0f766e]">{title}</CardTitle>
        {hint ? (
          <CardDescription className="text-xs">{hint}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-3xl font-semibold text-slate-900">{value}</p>
          {badge ? (
            <span
              className={`inline-flex rounded px-2.5 py-1 text-xs font-medium text-white ${badge.className}`}
            >
              {badge.label}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function KpiScoreTab({ employee }: KpiScoreTabProps) {
  const [goals, setGoals] = useState<KpiGoal[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadScoreData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [goalsResult, attendanceResult, leaveResult] = await Promise.all([
        getGoals(employee.id),
        getAttendance(employee.id),
        getLeaveRequests(employee.id),
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
    } catch (err) {
      toast.error(String(err || "Failed to load KPI score data"));
      setGoals([]);
      setAttendanceRecords([]);
      setLeaveRequests([]);
    } finally {
      setIsLoading(false);
    }
  }, [employee.id]);

  useEffect(() => {
    void loadScoreData();
  }, [loadScoreData]);

  // Refresh when returning to this tab after goals/attendance edits in the same session.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") {
        void loadScoreData();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadScoreData]);

  const scores: KpiScores = useMemo(
    () => calculateKpiScores(goals, attendanceRecords, leaveRequests),
    [goals, attendanceRecords, leaveRequests],
  );

  const breakdown = useMemo(
    () =>
      generateScoreBreakdown(
        scores.goalCompletion,
        scores.attendanceScore,
        scores.overallKpiScore,
      ),
    [scores],
  );

  const goalWeightPercent = Math.round(KPI_GOAL_COMPLETION_WEIGHT * 100);
  const attendanceWeightPercent = Math.round(KPI_ATTENDANCE_WEIGHT * 100);

  if (isLoading) {
    return (
      <div className="py-16 text-center text-sm text-slate-500">
        Loading KPI scores...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">KPI Score</h3>
        <p className="mt-1 text-sm text-slate-600">
          Read-only performance score based on goal completion (
          {goalWeightPercent}%) and attendance ({attendanceWeightPercent}%).
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <ScoreSummaryCard
          title="Goal Completion"
          value={`${scores.goalCompletion}%`}
          hint="Weighted progress from current-month goals"
        />
        <ScoreSummaryCard
          title="Attendance Score"
          value={`${scores.attendanceScore}%`}
          hint="Calculated from attendance and approved leave"
        />
        <ScoreSummaryCard
          title="Overall KPI Score"
          value={`${scores.overallKpiScore}%`}
          hint={`(${goalWeightPercent}% goals) + (${attendanceWeightPercent}% attendance)`}
          badge={{
            label: scores.performanceRating,
            className: scores.performanceRatingColor,
          }}
        />
      </div>

      <Card className="border bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">
            Score Breakdown
          </CardTitle>
          <CardDescription>
            Contribution of each metric toward the overall KPI score.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Contribution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakdown.map((row) => {
                  const isTotal = row.metric === "Total KPI Score";
                  return (
                    <TableRow
                      key={row.metric}
                      className={isTotal ? "bg-slate-50 font-medium" : undefined}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{row.metric}</span>
                          {isTotal ? (
                            <Badge className="border-transparent bg-slate-200 text-slate-700">
                              Final
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{row.weight}%</TableCell>
                      <TableCell>{row.score}%</TableCell>
                      <TableCell>{row.contribution}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
