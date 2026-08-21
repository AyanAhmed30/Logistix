"use client";

import type { AttendanceSummary } from "@/lib/attendance-summary";
import { getPerformanceRating } from "@/lib/kpi-utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const CHART_COLORS = {
  present: "#22c55e",
  absent: "#ef4444",
  late: "#f59e0b",
  halfDay: "#8b5cf6",
  leave: "#3b82f6",
  holiday: "#06b6d4",
} as const;

type ChartSlice = {
  key: string;
  label: string;
  value: number;
  color: string;
};

function buildChartSlices(summary: AttendanceSummary): ChartSlice[] {
  return [
    {
      key: "present",
      label: "Present",
      value: summary.presentDays,
      color: CHART_COLORS.present,
    },
    {
      key: "absent",
      label: "Absent",
      value: summary.absentDays,
      color: CHART_COLORS.absent,
    },
    {
      key: "late",
      label: "Late",
      value: summary.lateDays,
      color: CHART_COLORS.late,
    },
    {
      key: "halfDay",
      label: "Half Day",
      value: summary.halfDays,
      color: CHART_COLORS.halfDay,
    },
    {
      key: "leave",
      label: "Leave",
      value: summary.leaveDays,
      color: CHART_COLORS.leave,
    },
    {
      key: "holiday",
      label: "Holiday",
      value: summary.holidays,
      color: CHART_COLORS.holiday,
    },
  ];
}

function DoughnutChart({ slices }: { slices: ChartSlice[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 70;
  const stroke = 28;
  const circumference = 2 * Math.PI * radius;

  if (total === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-slate-500">
        No data to chart
      </div>
    );
  }

  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-4 md:flex-row md:justify-center md:gap-8">
      <svg viewBox="0 0 200 200" className="h-52 w-52">
        <g transform="translate(100,100)">
          {slices
            .filter((slice) => slice.value > 0)
            .map((slice) => {
              const length = (slice.value / total) * circumference;
              const segment = (
                <circle
                  key={slice.key}
                  r={radius}
                  fill="transparent"
                  stroke={slice.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90)"
                />
              );
              offset += length;
              return segment;
            })}
          <circle r={radius - stroke / 2 - 4} fill="white" />
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-slate-900 text-xl font-bold"
            style={{ fontSize: "22px", fontWeight: 700 }}
          >
            {total}
          </text>
          <text
            y={22}
            textAnchor="middle"
            className="fill-slate-500"
            style={{ fontSize: "11px" }}
          >
            total
          </text>
        </g>
      </svg>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {slices.map((slice) => (
          <div key={slice.key} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: slice.color }}
            />
            <span className="text-slate-600">
              {slice.label}: {slice.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChart({ slices }: { slices: ChartSlice[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <div className="space-y-3">
      {slices.map((slice) => (
        <div key={slice.key} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">{slice.label}</span>
            <span className="font-medium text-slate-900">{slice.value}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${total > 0 ? (slice.value / total) * 100 : 0}%`,
                backgroundColor: slice.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

type AttendanceSummaryPanelProps = {
  summary: AttendanceSummary;
};

export function AttendanceSummaryPanel({
  summary,
}: AttendanceSummaryPanelProps) {
  const slices = buildChartSlices(summary);
  const { rating, color: ratingColor } = getPerformanceRating(
    summary.attendancePercentage,
  );

  const summaryCards = [
    { label: "Present Days", value: summary.presentDays },
    { label: "Absent Days", value: summary.absentDays },
    { label: "Late Days", value: summary.lateDays },
    { label: "Half Days", value: summary.halfDays },
    { label: "Leave Days", value: summary.leaveDays },
    { label: "Holiday Days", value: summary.holidays },
    { label: "Total Working Days", value: summary.totalWorkingDays },
    {
      label: "Attendance Percentage",
      value: `${summary.attendancePercentage}%`,
      badge: true,
    },
  ];

  const rateCards = [
    { label: "Attendance Rate", value: summary.attendanceRate },
    { label: "Absence Rate", value: summary.absenceRate },
    { label: "Late Rate", value: summary.lateRate },
    { label: "Half Day Rate", value: summary.halfDayRate },
    { label: "Leave Rate", value: summary.leaveRate },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Attendance Summary
          </h2>
          <p className="text-sm text-slate-500">{summary.monthLabel}</p>
        </div>
        <span
          className={`inline-flex w-fit rounded px-2 py-1 text-xs text-white ${ratingColor}`}
        >
          {rating}
        </span>
      </div>

      {summary.isEmpty ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center">
          <p className="text-sm font-medium text-slate-700">
            No attendance records available for this month.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Showing {summary.monthLabel}. Counts remain at 0 until attendance is
            logged.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className="border bg-white shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-500">
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {"badge" in card && card.badge ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-3xl font-bold text-slate-900">
                    {card.value}
                  </p>
                  <span
                    className={`rounded px-2 py-1 text-xs text-white ${ratingColor}`}
                  >
                    {rating}
                  </span>
                </div>
              ) : (
                <p className="text-3xl font-bold text-slate-900">{card.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Attendance Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <DoughnutChart slices={slices} />
          </CardContent>
        </Card>
        <Card className="border bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Attendance Counts</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart slices={slices} />
          </CardContent>
        </Card>
      </div>

      <Card className="border bg-white shadow-sm">
        <CardHeader>
          <CardTitle>Extra Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {rateCards.map((card) => (
              <div
                key={card.label}
                className="rounded-lg border border-slate-200 bg-slate-50/40 p-4"
              >
                <p className="text-sm text-slate-500">{card.label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {card.value}%
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
