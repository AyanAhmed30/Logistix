"use client";

import type { ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Inbox,
  Send,
  UserPlus,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FunnelSeriesPoint, FunnelWindow, SalesAgentFunnel } from "@/app/actions/analytics/sales";
import { AnalyticsDateFilter } from "@/components/analytics/AnalyticsDateFilter";
import { AnalyticsEmpty, formatDate } from "@/components/analytics/AnalyticsParts";
import { formatDuration } from "@/lib/analytics/format-duration";
import { bucketForDays, groupSeries, trimLeadingEmpty, type SeriesBucket } from "@/lib/analytics/series-buckets";
import { formatMoney } from "@/lib/sales-quotation-form";

/*
 * Colours: teal and orange are the validated chart pair; won and lost use the
 * status greens and reds with a text label, never colour alone. Icons use
 * stroke-* because globals.css colours every element, SVG paths included.
 */
const TEAL = "#00919b";
const ORANGE = "#b4530a";
const WON = "#047857";
const LOST = "#b91c1c";
const GRID = "#e2e8f0";
const AXIS = { fontSize: 12, fill: "#475569" };

export const NO_SOURCE = "__none__";

const SOURCE_LABELS: Record<string, string> = { mobile_app: "Mobile app" };
export const sourceLabel = (source: string) => SOURCE_LABELS[source] ?? source;

const compactMoney = (value: number) =>
  `PKR ${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
const share = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

function change(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

// ---------------------------------------------------------------------------
// Header and filters
// ---------------------------------------------------------------------------

export function FunnelHeader({
  name,
  role = "Sales agent",
  periodLabel,
  back,
}: {
  name: string;
  role?: string;
  periodLabel: string;
  back?: ReactNode;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <div className="space-y-2">
      {back}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e6f4f5] text-base font-semibold text-[#016970]"
          >
            {initials || "?"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-primary-dark">
              {name} <span className="font-normal text-slate-600">({role})</span>
            </p>
            <p className="text-sm text-slate-600 tabular-nums">{periodLabel}</p>
          </div>
        </div>
        <h1 className="text-base font-bold uppercase tracking-wide text-primary-dark sm:text-lg">
          Full sales funnel &amp; inquiry analytics: <span className="font-semibold normal-case">{name}</span>
        </h1>
      </header>
    </div>
  );
}

export function FunnelFilters({
  sources,
  hasUnsourced,
  source,
  onSource,
  extra,
}: {
  sources: string[];
  hasUnsourced: boolean;
  source: string;
  onSource: (value: string) => void;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <AnalyticsDateFilter />
      <div className="flex flex-wrap items-center gap-2">
        {extra}
        <label htmlFor="deal-source" className="text-sm font-medium text-primary-dark">
          Deal source
        </label>
        <select
          id="deal-source"
          value={source}
          onChange={(e) => onSource(e.target.value)}
          className="h-9 w-full min-w-[180px] rounded-md border border-slate-200 bg-white px-2 text-sm text-primary-dark sm:w-56"
        >
          <option value="">All sources</option>
          {sources.map((value) => (
            <option key={value} value={value}>
              {sourceLabel(value)}
            </option>
          ))}
          {hasUnsourced ? <option value={NO_SOURCE}>No source recorded</option> : null}
        </select>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI tiles
// ---------------------------------------------------------------------------

function Tile({
  icon: Icon,
  label,
  value,
  note,
  children,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  note?: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="flex items-center gap-1.5">
        <Icon className="h-4 w-4 shrink-0 stroke-[#017e84]" aria-hidden />
        <span className="truncate text-xs font-semibold uppercase tracking-wide text-primary-dark">{label}</span>
      </span>
      <span className="mt-1 block text-2xl font-bold tabular-nums text-primary-dark">
        {typeof value === "number" ? value.toLocaleString() : value}
      </span>
      {note ? <span className="block text-xs text-slate-600">{note}</span> : null}
      {children ? <span className="mt-2 block">{children}</span> : null}
    </>
  );
  const className = "flex h-full min-h-[132px] flex-col rounded-lg border border-slate-200 bg-white p-3 text-left";
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`${className} hover:border-[#017e84] focus-visible:outline-2 focus-visible:outline-[#017e84]`}
    >
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

function ChangeChip({ value, label = "vs previous period" }: { value: number | null; label?: string }) {
  if (value === null) return <span className="text-xs text-slate-600">No earlier period to compare</span>;
  const up = value > 0;
  const flat = value === 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
      <span
        className={`inline-flex items-center gap-0.5 rounded-sm border px-1.5 py-0.5 font-semibold tabular-nums ${
          flat
            ? "border-slate-300 bg-slate-100 text-slate-700"
            : up
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
        }`}
      >
        {flat ? null : <Icon className={`h-3 w-3 ${up ? "stroke-emerald-700" : "stroke-red-700"}`} aria-hidden />}
        {up ? "+" : ""}
        {value}%
      </span>
      {label}
    </span>
  );
}

/** One horizontal bar split into labelled parts. */
function SplitBar({ parts, label }: { parts: Array<{ label: string; value: number; color: string }>; label: string }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  return (
    <span className="block">
      <span
        role="img"
        aria-label={`${label}: ${parts.map((p) => `${p.label} ${p.value}`).join(", ")}`}
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
      >
        {total
          ? parts.map((part) =>
              part.value ? (
                <span key={part.label} style={{ width: `${(part.value / total) * 100}%`, background: part.color }} />
              ) : null
            )
          : null}
      </span>
      <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-slate-600">
        {parts.map((part) => (
          <span key={part.label} className="inline-flex items-center gap-1 tabular-nums">
            <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: part.color }} />
            {part.label} {part.value}
          </span>
        ))}
      </span>
    </span>
  );
}

function Sparkline({ points }: { points: Array<{ day: string; value: number }> }) {
  if (points.length < 2) return null;
  return (
    <span className="block h-10" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Area type="monotone" dataKey="value" stroke={TEAL} strokeWidth={2} fill={TEAL} fillOpacity={0.12} isAnimationActive={false} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </span>
  );
}

export function FunnelKpis({
  data,
  onRecords,
}: {
  data: SalesAgentFunnel;
  onRecords?: (target: "contacts" | "inquiries" | "approved" | "rejected") => void;
}) {
  const c = data.current;
  const p = data.previous;
  // Running total of contacts over the period, ending at today's total.
  const start = data.totalContacts - data.series.reduce((sum, point) => sum + point.contacts_added, 0);
  const growth = trimLeadingEmpty(data.series).reduce<Array<{ day: string; value: number }>>((out, point) => {
    out.push({ day: point.day, value: (out.at(-1)?.value ?? start) + point.contacts_added });
    return out;
  }, []);
  const decided = c.approved + c.rejected;

  return (
    <section aria-label="Funnel summary" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Tile
        icon={Users}
        label="Total contacts"
        value={data.totalContacts}
        note={`${c.contactsAdded.toLocaleString()} added in period`}
        onClick={onRecords ? () => onRecords("contacts") : undefined}
      >
        <Sparkline points={growth} />
      </Tile>
      <Tile icon={UserPlus} label="New contacts" value={c.contactsAdded} note="In this period">
        <ChangeChip value={change(c.contactsAdded, p?.contactsAdded)} label={p ? `Previous period ${p.contactsAdded}` : undefined} />
      </Tile>
      <Tile
        icon={Inbox}
        label="Inquiries received"
        value={c.inquiriesReceived}
        note={`${c.receivedFromMobile.toLocaleString()} from the mobile app`}
        onClick={onRecords ? () => onRecords("inquiries") : undefined}
      >
        <SplitBar
          label="Status of inquiries received in the period"
          parts={[
            { label: "Sent on", value: c.inquiriesReceived - c.receivedStillDraft, color: TEAL },
            { label: "Still draft", value: c.receivedStillDraft, color: ORANGE },
          ]}
        />
      </Tile>
      <Tile
        icon={Send}
        label="Inquiries sent"
        value={c.inquiriesSent}
        note={`To Operations for review, ${data.inProgress.toLocaleString()} in progress now`}
        onClick={onRecords ? () => onRecords("inquiries") : undefined}
      >
        <SplitBar
          label="Decisions in period"
          parts={[
            { label: "Approved", value: c.approved, color: WON },
            { label: "Rejected", value: c.rejected, color: LOST },
          ]}
        />
      </Tile>
      <Tile
        icon={CheckCircle2}
        label="Inquiries approved"
        value={c.approved}
        note={decided ? `${share(c.approved, decided)}% of decisions approved` : "No decisions in period"}
        onClick={onRecords ? () => onRecords("approved") : undefined}
      >
        <span className="block h-2.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden>
          <span className="block h-full rounded-full" style={{ width: `${share(c.approved, decided)}%`, background: WON }} />
        </span>
      </Tile>
      <Tile
        icon={XCircle}
        label="Inquiries rejected"
        value={c.rejected}
        note={decided ? `${share(c.rejected, decided)}% of decisions` : "No decisions in period"}
        onClick={onRecords ? () => onRecords("rejected") : undefined}
      >
        {data.rejectionReasons.length ? (
          <span className="block space-y-0.5">
            <span className="block text-xs font-semibold text-primary-dark">Latest reasons</span>
            {data.rejectionReasons.slice(0, 2).map((reason) => (
              <span key={reason.at} className="block truncate text-xs text-slate-600" title={reason.reason}>
                {reason.reason}
              </span>
            ))}
          </span>
        ) : (
          <span className="block text-xs text-slate-600">No written reasons in this period</span>
        )}
      </Tile>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

function ChartPanel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-3">
      <h2 className="text-sm font-bold uppercase tracking-wide text-primary-dark">{title}</h2>
      {description ? <p className="text-xs text-slate-600">{description}</p> : null}
      <div className="mt-2 flex-1">{children}</div>
    </section>
  );
}

const dayLabel = (day: string, bucket: SeriesBucket) =>
  new Date(`${day}T12:00:00+05:00`).toLocaleDateString(
    "en-GB",
    bucket === "month" ? { month: "short", year: "2-digit" } : { day: "2-digit", month: "short" }
  );

/** Least-squares line through the quoted value, so the direction is easy to read. */
function withTrend(points: Array<FunnelSeriesPoint>) {
  const n = points.length;
  if (n < 2) return points.map((p) => ({ ...p, trend: p.quoted_value }));
  const xs = points.map((_, i) => i);
  const ys = points.map((p) => p.quoted_value);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / (xs.reduce((s, x) => s + (x - mx) ** 2, 0) || 1);
  return points.map((p, i) => ({ ...p, trend: Math.max(0, my + slope * (i - mx)) }));
}

export function RevenueTrend({ data, allTime }: { data: SalesAgentFunnel; allTime: boolean }) {
  const bucket = bucketForDays(data.series.length);
  const points = withTrend(groupSeries(allTime ? trimLeadingEmpty(data.series) : data.series, bucket));
  const total = data.current.quotedValue;
  return (
    <ChartPanel
      title="Revenue trend"
      description={`Quotation value sent to customers ${bucket === "day" ? "per day" : bucket === "week" ? "per week" : "per month"}: ${formatMoney(total)} in total, ${formatMoney(data.current.salesOrderValue)} confirmed as sales orders.`}
    >
      {total === 0 ? (
        <AnalyticsEmpty title="No quotations sent in this period" />
      ) : (
        <>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="day" tickFormatter={(d) => dayLabel(String(d), bucket)} tick={AXIS} tickLine={false} axisLine={{ stroke: "#cbd5e1" }} minTickGap={24} />
                <YAxis tickFormatter={(v) => compactMoney(Number(v))} tick={AXIS} tickLine={false} axisLine={false} width={78} />
                <Tooltip
                  labelFormatter={(d) => dayLabel(String(d), bucket)}
                  formatter={(value, name) => [formatMoney(Number(value)), String(name)]}
                  contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: GRID }}
                />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: "#475569" }} />
                <Area type="linear" dataKey="quoted_value" name="Quoted value" stroke={TEAL} strokeWidth={2} fill={TEAL} fillOpacity={0.12} isAnimationActive={false} dot={false} activeDot={{ r: 4 }} />
                <Line type="linear" dataKey="sales_order_value" name="Became sales orders" stroke={ORANGE} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="linear" dataKey="trend" name="Trend" stroke="#475569" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} activeDot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-1 text-xs text-slate-600">
            <summary className="cursor-pointer">View as table</summary>
            <div className="mt-2 max-h-48 overflow-auto">
              <table className="w-full text-left tabular-nums">
                <thead>
                  <tr>
                    <th className="py-1 pr-3 font-semibold">{bucket === "day" ? "Day" : bucket === "week" ? "Week of" : "Month"}</th>
                    <th className="py-1 pr-3 text-right font-semibold">Quoted value</th>
                    <th className="py-1 text-right font-semibold">Became sales orders</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.day} className="border-t border-slate-100">
                      <td className="py-1 pr-3">{dayLabel(p.day, bucket)}</td>
                      <td className="py-1 pr-3 text-right">{formatMoney(p.quoted_value)}</td>
                      <td className="py-1 text-right">{formatMoney(p.sales_order_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </ChartPanel>
  );
}

export function WinLossDonut({ data }: { data: SalesAgentFunnel }) {
  const won = data.pipeline.filter((s) => s.isWon).reduce((sum, s) => sum + s.count, 0);
  const lost = data.pipeline.filter((s) => s.isLost).reduce((sum, s) => sum + s.count, 0);
  const total = won + lost;
  const slices = [
    { name: "Won", value: won, color: WON },
    { name: "Lost", value: lost, color: LOST },
  ];
  return (
    <ChartPanel title="Deal win/loss ratio" description="Opportunities in won and lost stages now">
      {total === 0 ? (
        <AnalyticsEmpty title="No won or lost deals yet" />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative h-36 w-36 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="100%" stroke="#ffffff" strokeWidth={2} isAnimationActive={false}>
                  {slices.map((slice) => (
                    <Cell key={slice.name} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: GRID }} />
              </PieChart>
            </ResponsiveContainer>
            <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold tabular-nums text-primary-dark">{share(won, total)}%</span>
              <span className="text-xs text-slate-600">won</span>
            </span>
          </div>
          <ul className="space-y-1 text-sm">
            {slices.map((slice) => (
              <li key={slice.name} className="flex items-start gap-2">
                <span aria-hidden className="mt-1 inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: slice.color }} />
                <span>
                  <span className="font-semibold tabular-nums text-primary-dark">
                    {share(slice.value, total)}% {slice.name.toLowerCase()}
                  </span>
                  <span className="block text-xs text-slate-600 tabular-nums">
                    {slice.value} deal{slice.value === 1 ? "" : "s"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartPanel>
  );
}

const ACTIVITY_LABELS: Record<string, string> = { "follow-up": "Follow-ups", call: "Calls", email: "Emails", meeting: "Meetings", demo: "Demos" };
const activityLabel = (type: string) => ACTIVITY_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1).replace(/[-_]/g, " ");

export function SalesActivities({ data }: { data: SalesAgentFunnel }) {
  const rows = data.activityTypes.map((a) => ({ ...a, label: activityLabel(a.type) }));
  const any = rows.some((r) => r.logged > 0);
  return (
    <ChartPanel title="Sales activities" description="Activities logged in the period, by type">
      {!any ? (
        <AnalyticsEmpty title="No activities logged in this period" />
      ) : (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 18, right: 4, bottom: 0, left: -24 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "#cbd5e1" }} interval={0} />
              <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: "#f1f5f9" }}
                formatter={(value, _name, item) => [`${value} logged, ${(item.payload as { done: number }).done} done`, "Activities"]}
                contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: GRID }}
              />
              <Bar dataKey="logged" name="Logged" fill={TEAL} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
                <LabelList dataKey="logged" position="top" style={{ fontSize: 12, fill: "#073D51" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartPanel>
  );
}

// ---------------------------------------------------------------------------
// Pipeline stages: chart and table
// ---------------------------------------------------------------------------

/** Short age for a narrow column: "45 min", "6 h", "53 days". */
function ageLabel(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h`;
  const days = Math.round(seconds / 86_400);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function PipelineStages({ data }: { data: SalesAgentFunnel }) {
  const total = data.pipeline.reduce((sum, s) => sum + s.count, 0);
  const rows = data.pipeline.map((s) => ({ ...s, earlier: s.count - s.addedInPeriod }));
  const value = data.pipeline.reduce((sum, s) => sum + s.expectedRevenue, 0);
  return (
    <ChartPanel title="Pipeline stages" description="Opportunities in each CRM stage now, split by whether they were added in this period">
      {rows.length === 0 ? (
        <AnalyticsEmpty title="No CRM pipeline stages found" />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div style={{ height: Math.max(180, rows.length * 44 + 60) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 36, bottom: 0, left: 8 }} barCategoryGap={8}>
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis type="number" allowDecimals={false} tick={AXIS} tickLine={false} axisLine={{ stroke: "#cbd5e1" }} />
                <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={110} />
                <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: GRID }} />
                <Legend iconType="square" wrapperStyle={{ fontSize: 12, color: "#475569" }} />
                <Bar dataKey="earlier" name="Earlier" stackId="stage" fill={TEAL} isAnimationActive={false} />
                <Bar dataKey="addedInPeriod" name="Added this period" stackId="stage" fill={ORANGE} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  <LabelList dataKey="count" position="right" style={{ fontSize: 12, fill: "#073D51" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="font-semibold text-primary-dark">Stage</TableHead>
                <TableHead className="text-right font-semibold text-primary-dark">Count</TableHead>
                <TableHead className="text-right font-semibold text-primary-dark">Expected revenue</TableHead>
                <TableHead className="text-right font-semibold text-primary-dark">% of total</TableHead>
                <TableHead className="text-right font-semibold text-primary-dark">Average age</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.name}>
                  <TableCell className="font-medium">
                    {s.name}
                    {s.isWon ? <span className="ml-1 text-xs text-emerald-800">(won)</span> : s.isLost ? <span className="ml-1 text-xs text-red-700">(lost)</span> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{s.count.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(s.expectedRevenue)}</TableCell>
                  <TableCell className="text-right tabular-nums">{share(s.count, total)}%</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">{ageLabel(s.avgAgeSeconds)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{total.toLocaleString()}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap">{formatMoney(value)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{total ? "100%" : "—"}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </ChartPanel>
  );
}

// ---------------------------------------------------------------------------
// Top performance metrics
// ---------------------------------------------------------------------------

type MetricRow = {
  label: string;
  value: (w: FunnelWindow) => number | null;
  format: (n: number | null) => string;
  /** For times, a drop is the improvement. */
  lowerIsBetter?: boolean;
};

const count = (n: number | null) => (n === null ? "—" : n.toLocaleString());
const METRICS: MetricRow[] = [
  { label: "Contacts added", value: (w) => w.contactsAdded, format: count },
  { label: "Inquiries received", value: (w) => w.inquiriesReceived, format: count },
  { label: "Inquiries sent to Operations", value: (w) => w.inquiriesSent, format: count },
  {
    label: "Approval rate",
    value: (w) => (w.approved + w.rejected ? Math.round((w.approved / (w.approved + w.rejected)) * 100) : null),
    format: (n) => (n === null ? "—" : `${n}%`),
  },
  { label: "Quotations sent", value: (w) => w.quotationsSent, format: count },
  { label: "Quoted value", value: (w) => w.quotedValue, format: (n) => (n === null ? "—" : formatMoney(n)) },
  { label: "Sales orders", value: (w) => w.salesOrders, format: count },
  { label: "Activities logged", value: (w) => w.activitiesLogged, format: count },
  {
    label: "Avg inquiry approval time",
    value: (w) => w.avgApprovalSeconds,
    format: (n) => formatDuration(n),
    lowerIsBetter: true,
  },
];

export function TopMetrics({ data }: { data: SalesAgentFunnel }) {
  return (
    <ChartPanel title="Top performance metrics" description="This period compared with the same length of time just before it">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            <TableHead className="font-semibold text-primary-dark">Metric</TableHead>
            <TableHead className="text-right font-semibold text-primary-dark">Value</TableHead>
            <TableHead className="text-right font-semibold text-primary-dark">Previous period</TableHead>
            <TableHead className="font-semibold text-primary-dark">Progress</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {METRICS.map((metric) => {
            const now = metric.value(data.current);
            const before = data.previous ? metric.value(data.previous) : null;
            const max = Math.max(now ?? 0, before ?? 0);
            const pct = now !== null && before !== null && before > 0 ? Math.round(((now - before) / before) * 100) : null;
            const better = pct === null || pct === 0 ? null : metric.lowerIsBetter ? pct < 0 : pct > 0;
            return (
              <TableRow key={metric.label}>
                <TableCell className="whitespace-nowrap">{metric.label}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap">{metric.format(now)}</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap text-slate-600">
                  {data.previous ? metric.format(before) : "—"}
                </TableCell>
                <TableCell className="min-w-[140px]">
                  {!data.previous ? (
                    <span className="text-xs text-slate-600">No earlier period</span>
                  ) : (
                  <span className="flex items-center gap-2">
                    <span className="block h-2 w-16 shrink-0 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${max && now !== null ? (now / max) * 100 : 0}%`,
                          background: better === false ? ORANGE : TEAL,
                        }}
                      />
                    </span>
                    <span
                      className={`text-xs font-semibold tabular-nums ${
                        better === null ? "text-slate-600" : better ? "text-emerald-800" : "text-red-700"
                      }`}
                    >
                      {pct !== null ? `${pct > 0 ? "+" : ""}${pct}%` : data.previous && before === 0 && (now ?? 0) > 0 ? "New" : "—"}
                    </span>
                  </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ChartPanel>
  );
}

export function funnelPeriodLabel(preset: string, from: string, to: string) {
  const end = formatDate(new Date(Date.parse(to) - 1).toISOString());
  return preset === "all_time" ? `All time, up to ${end}` : `${formatDate(from)} – ${end}`;
}

/** The full board from the reference layout: cards and revenue, pipeline, win/loss, activities, metrics. */
export function FunnelBoard({
  data,
  allTime,
  loading,
  onRecords,
}: {
  data: SalesAgentFunnel;
  allTime: boolean;
  loading: boolean;
  onRecords?: (target: "contacts" | "inquiries" | "approved" | "rejected") => void;
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-4 xl:grid-cols-12 transition-opacity ${loading ? "opacity-60" : ""}`}
      aria-busy={loading}
    >
      <div className="min-w-0 xl:col-span-7">
        <FunnelKpis data={data} onRecords={onRecords} />
      </div>
      <div className="min-w-0 xl:col-span-5">
        <RevenueTrend data={data} allTime={allTime} />
      </div>
      <div className="min-w-0 xl:col-span-7">
        <PipelineStages data={data} />
      </div>
      <div className="min-w-0 space-y-4 xl:col-span-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <WinLossDonut data={data} />
          <SalesActivities data={data} />
        </div>
        <TopMetrics data={data} />
      </div>
    </div>
  );
}
