"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsSeriesPoint } from "@/app/actions/analytics/sales";
import type { SeriesBucket } from "@/lib/analytics/series-buckets";

type Series = { key: keyof AnalyticsSeriesPoint; label: string; color: string };

/** Fixed order, validated for colour-blind separation. A metric keeps its colour. */
const SALES_SERIES: Series[] = [
  { key: "contacts_added", label: "Contacts added", color: "#00919b" },
  { key: "inquiries_received", label: "Inquiries submitted", color: "#b4530a" },
  { key: "followups_completed", label: "Follow-ups completed", color: "#6b4fbb" },
  { key: "quotations_sent", label: "Quotations sent", color: "#c0355f" },
];

export const OPERATIONS_SELF_SERIES: Series[] = [
  { key: "operations_submitted", label: "Sent to Admin", color: "#00919b" },
];

const shortDay = (day: string) =>
  new Date(`${day}T12:00:00+05:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

const monthLabel = (day: string) =>
  new Date(`${day}T12:00:00+05:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

const BUCKET_LABELS: Record<SeriesBucket, { column: string; format: (day: string) => string; tooltip: (day: string) => string }> = {
  day: { column: "Day", format: shortDay, tooltip: shortDay },
  week: { column: "Week of", format: shortDay, tooltip: (day) => `Week of ${shortDay(day)}` },
  month: { column: "Month", format: monthLabel, tooltip: monthLabel },
};

export function AnalyticsTrendChart({
  data,
  title,
  series: SERIES = SALES_SERIES,
  bucket = "day",
  description,
}: {
  data: AnalyticsSeriesPoint[];
  title: string;
  series?: Series[];
  /** Set when the caller grouped the daily series; changes labels only. */
  bucket?: SeriesBucket;
  description?: string;
}) {
  const labels = BUCKET_LABELS[bucket];
  return (
    <section aria-label={title} className="rounded-lg border border-slate-200 bg-white p-3">
      <h2 className="text-base font-semibold text-primary-dark">{title}</h2>
      {description ? <p className="text-xs text-slate-600">{description}</p> : null}
      <div className="mt-2 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="day"
              tickFormatter={labels.format}
              tick={{ fontSize: 12, fill: "#475569" }}
              tickLine={false}
              axisLine={{ stroke: "#cbd5e1" }}
              minTickGap={32}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12, fill: "#475569" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              labelFormatter={(label) => labels.tooltip(String(label))}
              contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: "#e2e8f0" }}
            />
            {SERIES.length > 1 ? (
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: "#475569" }} />
            ) : null}
            {SERIES.map((series) => (
              <Line
                key={series.key}
                type="monotone"
                dataKey={series.key}
                name={series.label}
                stroke={series.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs text-slate-600">
        <summary className="cursor-pointer">View as table</summary>
        <div className="mt-2 max-h-56 overflow-auto">
          <table className="w-full text-left tabular-nums">
            <thead>
              <tr>
                <th className="py-1 pr-3 font-semibold">{labels.column}</th>
                {SERIES.map((s) => (
                  <th key={s.key} className="py-1 pr-3 text-right font-semibold">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.day} className="border-t border-slate-100">
                  <td className="py-1 pr-3">{labels.format(point.day)}</td>
                  {SERIES.map((s) => (
                    <td key={s.key} className="py-1 pr-3 text-right">
                      {point[s.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
