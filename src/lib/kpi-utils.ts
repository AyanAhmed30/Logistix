import type { KpiGoal } from "@/app/actions/kpiGoals";
import type { AttendanceRecord } from "@/app/actions/attendance";
import type { LeaveRequest } from "@/app/actions/leave";
import {
  calculateAttendancePercentage,
  calculateAttendancePoints,
  countApprovedLeaveDays,
} from "@/lib/attendance-summary";

/** Overall KPI mix — keep in one place for cards, formula, and breakdown table. */
export const KPI_GOAL_COMPLETION_WEIGHT = 0.7;
export const KPI_ATTENDANCE_WEIGHT = 0.3;

export interface KpiScores {
  goalCompletion: number;
  attendanceScore: number;
  overallKpiScore: number;
  performanceRating: string;
  performanceRatingColor: string;
}

export interface ScoreBreakdown {
  metric: string;
  weight: number;
  score: number;
  contribution: number;
}

/**
 * Keep goals that belong to the current calendar month only.
 * Goals without goal_month are excluded from KPI calculations.
 */
export function filterGoalsForCurrentMonth(
  goals: KpiGoal[],
  referenceDate: Date = new Date(),
): KpiGoal[] {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, "0");
  const currentKey = `${year}-${month}`;

  return (goals || []).filter((goal) => {
    if (!goal.goal_month) return false;
    return String(goal.goal_month).slice(0, 7) === currentKey;
  });
}

/**
 * Calculate Goal Completion Score
 * Formula: SUM(weight × progress) / SUM(weight)
 * Uses current-month goals only.
 * Returns a percentage between 0 and 100
 */
export function calculateGoalCompletion(
  goals: KpiGoal[],
  referenceDate: Date = new Date(),
): number {
  const monthGoals = filterGoalsForCurrentMonth(goals, referenceDate);

  if (!monthGoals || monthGoals.length === 0) {
    return 0;
  }

  const totalWeight = monthGoals.reduce((sum, goal) => sum + goal.weight, 0);

  if (totalWeight === 0) {
    return 0;
  }

  const weightedProgress = monthGoals.reduce(
    (sum, goal) => sum + goal.weight * goal.progress,
    0,
  );

  return Math.round(weightedProgress / totalWeight);
}

/**
 * Calculate Attendance Score using the shared attendance formula:
 * Points = Present + Late + Holiday + Approved Leave + (Half Day × 0.5)
 * Score = (Points / Total Working Days) × 100
 */
export function calculateAttendanceScore(
  attendanceRecords: AttendanceRecord[],
  leaveRequests: LeaveRequest[],
): number {
  if (!attendanceRecords || attendanceRecords.length === 0) {
    return 0;
  }

  const presentDays = attendanceRecords.filter(
    (record) => record.attendance_type === "present",
  ).length;
  const lateDays = attendanceRecords.filter(
    (record) => record.attendance_type === "late",
  ).length;
  const halfDays = attendanceRecords.filter(
    (record) => record.attendance_type === "half_day",
  ).length;
  const holidays = attendanceRecords.filter(
    (record) => record.attendance_type === "holiday",
  ).length;

  const leaveDays = countApprovedLeaveDays(leaveRequests || []);

  const attendancePoints = calculateAttendancePoints({
    presentDays,
    lateDays,
    holidays,
    leaveDays,
    halfDays,
  });

  return calculateAttendancePercentage(
    attendancePoints,
    attendanceRecords.length,
  );
}

/**
 * Calculate Overall KPI Score
 * Formula: (Goal Completion × 70%) + (Attendance × 30%)
 * Returns a percentage rounded to nearest integer
 */
export function calculateOverallKpiScore(
  goalCompletion: number,
  attendanceScore: number
): number {
  const overallScore =
    goalCompletion * KPI_GOAL_COMPLETION_WEIGHT +
    attendanceScore * KPI_ATTENDANCE_WEIGHT;
  return Math.round(overallScore);
}

/**
 * Get Performance Rating based on KPI Score
 * 90–100: Excellent (Green)
 * 80–89: Very Good (Green)
 * 70–79: Good (Blue)
 * 60–69: Needs Improvement (Yellow)
 * Below 60: Poor (Red)
 */
export function getPerformanceRating(kpiScore: number): {
  rating: string;
  color: string;
} {
  if (kpiScore >= 90) {
    return { rating: "Excellent", color: "bg-emerald-500" };
  }
  if (kpiScore >= 80) {
    return { rating: "Very Good", color: "bg-emerald-500" };
  }
  if (kpiScore >= 70) {
    return { rating: "Good", color: "bg-blue-500" };
  }
  if (kpiScore >= 60) {
    return { rating: "Needs Improvement", color: "bg-amber-500" };
  }
  return { rating: "Poor", color: "bg-red-500" };
}

/**
 * Calculate all KPI scores
 */
export function calculateKpiScores(
  goals: KpiGoal[],
  attendanceRecords: AttendanceRecord[],
  leaveRequests: LeaveRequest[],
): KpiScores {
  const goalCompletion = calculateGoalCompletion(goals);
  const attendanceScore = calculateAttendanceScore(
    attendanceRecords,
    leaveRequests
  );
  const overallKpiScore = calculateOverallKpiScore(
    goalCompletion,
    attendanceScore
  );
  const { rating: performanceRating, color: performanceRatingColor } =
    getPerformanceRating(overallKpiScore);

  return {
    goalCompletion,
    attendanceScore,
    overallKpiScore,
    performanceRating,
    performanceRatingColor,
  };
}

/**
 * Generate score breakdown table data
 */
export function generateScoreBreakdown(
  goalCompletion: number,
  attendanceScore: number,
  overallKpiScore: number
): ScoreBreakdown[] {
  const goalWeightPercent = Math.round(KPI_GOAL_COMPLETION_WEIGHT * 100);
  const attendanceWeightPercent = Math.round(KPI_ATTENDANCE_WEIGHT * 100);
  const goalContribution = Number(
    (goalCompletion * KPI_GOAL_COMPLETION_WEIGHT).toFixed(1),
  );
  const attendanceContribution = Number(
    (attendanceScore * KPI_ATTENDANCE_WEIGHT).toFixed(1),
  );

  return [
    {
      metric: "Goal Completion",
      weight: goalWeightPercent,
      score: goalCompletion,
      contribution: goalContribution,
    },
    {
      metric: "Attendance",
      weight: attendanceWeightPercent,
      score: attendanceScore,
      contribution: attendanceContribution,
    },
    {
      metric: "Total KPI Score",
      weight: 100,
      score: overallKpiScore,
      contribution: overallKpiScore,
    },
  ];
}
