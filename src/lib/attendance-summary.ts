import type { AttendanceRecord } from "@/app/actions/attendance";
import type { LeaveRequest } from "@/app/actions/leave";

export type AttendanceSummary = {
  presentDays: number;
  absentDays: number;
  lateDays: number;
  halfDays: number;
  leaveDays: number;
  holidays: number;
  totalWorkingDays: number;
  attendancePoints: number;
  attendancePercentage: number;
  attendanceRate: number;
  absenceRate: number;
  lateRate: number;
  halfDayRate: number;
  leaveRate: number;
  monthLabel: string;
  isEmpty: boolean;
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toDateKey(value: string | Date) {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  return String(value).slice(0, 10);
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function daysBetweenInclusive(startKey: string, endKey: string) {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  const ms = end.getTime() - start.getTime();
  if (Number.isNaN(ms) || ms < 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(100, Math.max(0, value)));
}

function rate(count: number, total: number) {
  if (!total) return 0;
  return clampPercent((count / total) * 100);
}

/**
 * Returns the inclusive date range for the current calendar month.
 * Example (22 July 2026): 2026-07-01 through 2026-07-31
 */
export function getCurrentMonthBounds(referenceDate: Date = new Date()) {
  const year = referenceDate.getFullYear();
  const monthIndex = referenceDate.getMonth();
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);

  return {
    year,
    month: monthIndex + 1,
    startDate: toDateKey(start),
    endDate: toDateKey(end),
    monthLabel: start.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    }),
  };
}

export function filterAttendanceForCurrentMonth(
  records: AttendanceRecord[],
  referenceDate: Date = new Date(),
): AttendanceRecord[] {
  const { startDate, endDate } = getCurrentMonthBounds(referenceDate);
  return (records || []).filter((record) => {
    const date = toDateKey(record.date);
    return date >= startDate && date <= endDate;
  });
}

/**
 * Count calendar days covered by approved leave requests.
 * Optional start/end bounds limit the count to an inclusive date range.
 */
export function countApprovedLeaveDays(
  leaveRequests: LeaveRequest[],
  startDate?: string,
  endDate?: string,
): number {
  return (leaveRequests || []).reduce((total, request) => {
    if (request.status !== "approved") return total;

    const leaveStart = toDateKey(request.start_date);
    const leaveEnd = toDateKey(request.end_date);

    const overlapStart =
      startDate && leaveStart < startDate ? startDate : leaveStart;
    const overlapEnd = endDate && leaveEnd > endDate ? endDate : leaveEnd;

    if (overlapStart > overlapEnd) return total;
    return total + daysBetweenInclusive(overlapStart, overlapEnd);
  }, 0);
}

/**
 * Leave Days for the current calendar month (approved leave requests only).
 */
export function countApprovedLeaveDaysInCurrentMonth(
  leaveRequests: LeaveRequest[],
  referenceDate: Date = new Date(),
): number {
  const { startDate, endDate } = getCurrentMonthBounds(referenceDate);
  return countApprovedLeaveDays(leaveRequests, startDate, endDate);
}

/**
 * Attendance Points =
 * Present + Late + Holiday + Approved Leave + (Half Day × 0.5)
 */
export function calculateAttendancePoints(input: {
  presentDays: number;
  lateDays: number;
  holidays: number;
  leaveDays: number;
  halfDays: number;
}) {
  return (
    input.presentDays +
    input.lateDays +
    input.holidays +
    input.leaveDays +
    input.halfDays * 0.5
  );
}

/**
 * Attendance % = (Attendance Points / Total Working Days) × 100
 * Clamped 0–100 and rounded to nearest integer.
 */
export function calculateAttendancePercentage(
  attendancePoints: number,
  totalWorkingDays: number,
): number {
  if (!totalWorkingDays) return 0;
  return clampPercent((attendancePoints / totalWorkingDays) * 100);
}

export function buildAttendanceSummary(
  attendanceRecords: AttendanceRecord[],
  leaveRequests: LeaveRequest[],
  referenceDate: Date = new Date(),
): AttendanceSummary {
  const { monthLabel } = getCurrentMonthBounds(referenceDate);
  const monthRecords = filterAttendanceForCurrentMonth(
    attendanceRecords,
    referenceDate,
  );
  const leaveDays = countApprovedLeaveDaysInCurrentMonth(
    leaveRequests,
    referenceDate,
  );

  const presentDays = monthRecords.filter(
    (record) => record.attendance_type === "present",
  ).length;
  const absentDays = monthRecords.filter(
    (record) => record.attendance_type === "absent",
  ).length;
  const lateDays = monthRecords.filter(
    (record) => record.attendance_type === "late",
  ).length;
  const halfDays = monthRecords.filter(
    (record) => record.attendance_type === "half_day",
  ).length;
  const holidays = monthRecords.filter(
    (record) => record.attendance_type === "holiday",
  ).length;

  const totalWorkingDays = monthRecords.length;
  const isEmpty = totalWorkingDays === 0;

  const attendancePoints = calculateAttendancePoints({
    presentDays,
    lateDays,
    holidays,
    leaveDays,
    halfDays,
  });

  const attendancePercentage = calculateAttendancePercentage(
    attendancePoints,
    totalWorkingDays,
  );

  return {
    presentDays,
    absentDays,
    lateDays,
    halfDays,
    leaveDays,
    holidays,
    totalWorkingDays,
    attendancePoints,
    attendancePercentage,
    attendanceRate: rate(presentDays, totalWorkingDays),
    absenceRate: rate(absentDays, totalWorkingDays),
    lateRate: rate(lateDays, totalWorkingDays),
    halfDayRate: rate(halfDays, totalWorkingDays),
    leaveRate: rate(leaveDays, totalWorkingDays),
    monthLabel,
    isEmpty,
  };
}
