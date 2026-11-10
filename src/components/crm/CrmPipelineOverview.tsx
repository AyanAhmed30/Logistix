"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CrmOpportunityCard, CrmPipelineStage } from "@/app/actions/crm/types";
import type { PipelineSummary } from "@/lib/crm-pipeline-filter";

/** Same colours as the Analytics charts; validated as a pair for colour-blind readers. */
const DEALS_COLOR = "#00919b";
const INQUIRIES_COLOR = "#b4530a";
const AXIS_TICK = { fontSize: 12, fill: "#475569" };
const TOOLTIP_STYLE = { fontSize: 12, borderRadius: 6, borderColor: "#e2e8f0" };
const OFFSET_MS = 5 * 60 * 60 * 1000;
const DAILY_LIMIT_DAYS = 62;

const CARDS: Array<{ key: keyof PipelineSummary; label: string }> = [
  { key: "contacts", label: "Contacts" },
  { key: "inquiriesSent", label: "Inquiries sent" },
  { key: "approved", label: "Approved inquiries" },
  { key: "rejected", label: "Rejected inquiries" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];

const localDay = (iso: string) => new Date(Date.parse(iso) + OFFSET_MS).toISOString().slice(0, 10);

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-lg border border-slate-200 bg-white p-3">
      <h2 className="text-sm font-semibold text-primary-dark">{title}</h2>
      {children}
    </section>
  );
}

function TableView({ head, rows }: { head: string[]; rows: Array<Array<string | number>> }) {
  return (
    <details className="mt-1 text-xs text-slate-600">
      <summary className="cursor-pointer">View as table</summary>
      <table className="mt-2 w-full text-left tabular-nums">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`py-1 pr-3 font-semibold ${i ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row[0])} className="border-t border-slate-100">
              {row.map((cell, i) => (
                <td key={i} className={`py-1 pr-3 ${i ? "text-right" : ""}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Deals created and inquiries sent per day (short periods) or per month. */
function buildTimeline(opportunities: CrmOpportunityCard[]) {
  const days = opportunities.map((o) => localDay(o.created_at)).sort();
  if (days.length === 0) return { daily: true, rows: [] as Array<{ key: string; label: string; deals: number; inquiries: number }> };
  const spanDays = (Date.parse(days[days.length - 1]) - Date.parse(days[0])) / 86_400_000;
  const daily = spanDays <= DAILY_LIMIT_DAYS;
  const bucket = (iso: string) => (daily ? localDay(iso) : localDay(iso).slice(0, 7));

  const rows = new Map<string, { deals: number; inquiries: number }>();
  const add = (key: string, field: "deals" | "inquiries") => {
    const row = rows.get(key) ?? { deals: 0, inquiries: 0 };
    row[field]++;
    rows.set(key, row);
  };
  for (const opp of opportunities) {
    add(bucket(opp.created_at), "deals");
    for (const inquiry of opp.inquiries ?? []) {
      if (inquiry.status !== "draft") add(bucket(inquiry.sent_at || opp.created_at), "inquiries");
    }
  }

  const label = (key: string) =>
    daily
      ? new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
      : new Date(`${key}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });

  // Every day (or month) between the first and last, so quiet periods show as gaps.
  const keys = [...rows.keys()].sort();
  const all: string[] = [];
  for (let cursor = keys[0]; cursor <= keys[keys.length - 1]; ) {
    all.push(cursor);
    const next = daily ? new Date(`${cursor}T12:00:00Z`) : new Date(`${cursor}-15T12:00:00Z`);
    if (daily) next.setUTCDate(next.getUTCDate() + 1);
    else next.setUTCMonth(next.getUTCMonth() + 1);
    cursor = daily ? next.toISOString().slice(0, 10) : next.toISOString().slice(0, 7);
  }
  return {
    daily,
    rows: all.map((key) => ({ key, label: label(key), ...(rows.get(key) ?? { deals: 0, inquiries: 0 }) })),
  };
}

/** Super Admin's summary for the filtered pipeline: six numbers and two simple charts. */
export function CrmPipelineOverview({
  summary,
  opportunities,
  stages,
  isGlobalAdminView,
}: {
  summary: PipelineSummary;
  opportunities: CrmOpportunityCard[];
  stages: CrmPipelineStage[];
  isGlobalAdminView: boolean;
}) {
  const byStage = useMemo(
    () =>
      stages.map((stage) => ({
        name: stage.name,
        count: opportunities.filter((o) => (isGlobalAdminView ? o.stage_name === stage.name : o.stage_id === stage.id)).length,
      })),
    [stages, opportunities, isGlobalAdminView]
  );
  const timeline = useMemo(() => buildTimeline(opportunities), [opportunities]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {CARDS.map((card) => (
          <div key={card.key} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-xs font-medium text-slate-600">{card.label}</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-primary-dark">
              {summary[card.key].toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Deals by stage">
          <div className="mt-2 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byStage} margin={{ top: 18, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "#cbd5e1" }} interval={0} />
                <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" name="Deals" fill={DEALS_COLOR} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
                  <LabelList dataKey="count" position="top" style={{ fontSize: 12, fill: "#334155" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <TableView head={["Stage", "Deals"]} rows={byStage.map((s) => [s.name, s.count])} />
        </ChartCard>

        <ChartCard title={`Deals created and inquiries sent, by ${timeline.daily ? "day" : "month"}`}>
          {timeline.rows.length === 0 ? (
            <p className="mt-2 flex h-52 items-center justify-center text-sm text-slate-500">No deals in this period.</p>
          ) : (
            <div className="mt-2 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeline.rows} barGap={2} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "#cbd5e1" }} minTickGap={16} />
                  <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={TOOLTIP_STYLE} />
                  <Legend iconType="square" wrapperStyle={{ fontSize: 12, color: "#475569" }} />
                  <Bar dataKey="deals" name="Deals created" fill={DEALS_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                  <Bar dataKey="inquiries" name="Inquiries sent" fill={INQUIRIES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <TableView
            head={[timeline.daily ? "Day" : "Month", "Deals created", "Inquiries sent"]}
            rows={timeline.rows.map((r) => [r.label, r.deals, r.inquiries])}
          />
        </ChartCard>
      </div>
    </div>
  );
}
