"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getSalesAgentFunnel,
  getSalesTeamFunnel,
  getSalesTeamOverview,
  type SalesAgentFunnel,
  type SalesAgentMetrics,
  type SalesTeamAgentRow,
  type SalesTeamOverview as Overview,
} from "@/app/actions/analytics/sales";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAnalyticsRange } from "@/components/analytics/AnalyticsDateFilter";
import { Panel, useLoad } from "@/components/analytics/AnalyticsDashboardKit";
import {
  FunnelBoard,
  FunnelFilters,
  FunnelHeader,
  NO_SOURCE,
  funnelPeriodLabel,
  sourceLabel,
} from "@/components/analytics/SalesAgentFunnel";
import {
  AnalyticsEmpty,
  AnalyticsError,
  AnalyticsLoading,
  formatDate,
} from "@/components/analytics/AnalyticsParts";
import { AnalyticsTrendChart } from "@/components/analytics/AnalyticsTrendChart";
import { bucketForDays, groupSeries, trimLeadingEmpty } from "@/lib/analytics/series-buckets";

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

type MetricKey = keyof Omit<SalesAgentMetrics, "sales_agent_id">;
type SortKey = "name" | "approval_rate" | "last_inquiry" | MetricKey;
type Sort = { key: SortKey; desc: boolean };
type Show = "all" | "attention" | "idle";

type Column = {
  key: SortKey;
  label: string;
  /** Spoken and exported label, since the group heading isn't repeated per cell. */
  full: string;
  group: "Contacts" | "Inquiries" | "Follow-ups" | "Quotations" | "Activity";
  /** Current state rather than activity inside the period. */
  now?: boolean;
  /** A non-zero value needs action. */
  alert?: boolean;
};

const COLUMNS: Column[] = [
  { key: "total_contacts", label: "Total", full: "Total contacts", group: "Contacts", now: true },
  { key: "new_contacts", label: "Added", full: "Contacts added", group: "Contacts" },
  { key: "inquiries_submitted", label: "Sent", full: "Inquiries sent", group: "Inquiries" },
  { key: "inquiries_approved", label: "Approved", full: "Inquiries approved", group: "Inquiries" },
  { key: "inquiries_rejected", label: "Rejected", full: "Inquiries rejected", group: "Inquiries" },
  { key: "approval_rate", label: "Approval rate", full: "Approval rate", group: "Inquiries" },
  { key: "inquiries_pending", label: "In progress", full: "Inquiries in progress now", group: "Inquiries", now: true },
  { key: "followups_completed", label: "Done", full: "Follow-ups done", group: "Follow-ups" },
  { key: "followups_overdue", label: "Overdue", full: "Follow-ups overdue now", group: "Follow-ups", now: true, alert: true },
  { key: "quotations_sent", label: "Sent", full: "Quotations sent", group: "Quotations" },
  { key: "quotations_open", label: "Not sent", full: "Quotations not sent yet", group: "Quotations", now: true },
  { key: "last_inquiry", label: "Last inquiry", full: "Last inquiry sent, any time", group: "Activity" },
];

const GROUPS = COLUMNS.reduce<Array<{ name: Column["group"]; span: number }>>((groups, column) => {
  const last = groups[groups.length - 1];
  if (last?.name === column.group) last.span += 1;
  else groups.push({ name: column.group, span: 1 });
  return groups;
}, []);

const SUMMED: MetricKey[] = [
  "total_contacts",
  "new_contacts",
  "followups_scheduled",
  "followups_completed",
  "followups_pending",
  "followups_overdue",
  "inquiries_submitted",
  "inquiries_pending",
  "inquiries_approved",
  "inquiries_rejected",
  "quotations_created",
  "quotations_sent",
  "quotations_open",
];

// ---------------------------------------------------------------------------
// Calculations
// ---------------------------------------------------------------------------

function approvalRate(m: Pick<SalesAgentMetrics, "inquiries_approved" | "inquiries_rejected">): number | null {
  const decided = m.inquiries_approved + m.inquiries_rejected;
  return decided ? m.inquiries_approved / decided : null;
}

const percent = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);

function sumMetrics(rows: SalesTeamAgentRow[]): Omit<SalesAgentMetrics, "sales_agent_id"> {
  const total = Object.fromEntries(SUMMED.map((key) => [key, 0])) as Omit<SalesAgentMetrics, "sales_agent_id">;
  for (const row of rows) for (const key of SUMMED) total[key] += row.metrics[key];
  return total;
}

/** Why an agent needs attention, in plain words. Each rule is listed on screen. */
function attentionReasons(m: SalesAgentMetrics): string[] {
  const reasons: string[] = [];
  if (m.followups_overdue > 0) {
    reasons.push(`${m.followups_overdue} overdue follow-up${m.followups_overdue === 1 ? "" : "s"}`);
  }
  if (m.total_contacts > 0 && m.inquiries_submitted === 0) reasons.push("No inquiries sent in this period");
  const decided = m.inquiries_approved + m.inquiries_rejected;
  if (m.inquiries_rejected >= 2 && m.inquiries_rejected / decided >= 0.3) {
    reasons.push(`${m.inquiries_rejected} of ${decided} decisions rejected`);
  }
  if (m.quotations_open > 0) {
    reasons.push(`${m.quotations_open} quotation${m.quotations_open === 1 ? "" : "s"} not sent to the customer`);
  }
  return reasons;
}

function sortValue(row: SalesTeamAgentRow, key: SortKey): number | string {
  if (key === "name") return row.name.toLowerCase();
  if (key === "approval_rate") return approvalRate(row.metrics) ?? -1;
  if (key === "last_inquiry") return row.lastInquiryAt ?? "";
  return row.metrics[key];
}

function cellValue(row: SalesTeamAgentRow, key: SortKey): string {
  if (key === "approval_rate") return percent(approvalRate(row.metrics));
  if (key === "last_inquiry") return row.lastInquiryAt ? formatDate(row.lastInquiryAt) : "Never";
  if (key === "name") return row.name;
  return row.metrics[key].toLocaleString();
}

function downloadCsv(rows: SalesTeamAgentRow[], fileName: string) {
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const header = ["Sales agent", ...COLUMNS.map((c) => c.full)];
  const body = rows.map((row) => [
    row.name,
    ...COLUMNS.map((c) => (c.key === "last_inquiry" ? row.lastInquiryAt?.slice(0, 10) ?? "" : cellValue(row, c.key).replace(/,/g, ""))),
  ]);
  const csv = [header, ...body].map((line) => line.map(escape).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const selectClass = "h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-primary-dark";

function NumberCell({ value, alert }: { value: number; alert?: boolean }) {
  if (value === 0) return <span className="text-slate-500">0</span>;
  return (
    <span className={alert ? "font-semibold text-red-700" : "text-primary-dark"}>{value.toLocaleString()}</span>
  );
}

function AttentionPanel({
  rows,
  unassigned,
  agentHref,
}: {
  rows: SalesTeamAgentRow[];
  unassigned: number;
  agentHref: (id: string) => string;
}) {
  const flagged = rows
    .map((row) => ({ row, reasons: attentionReasons(row.metrics) }))
    .filter((item) => item.reasons.length > 0)
    .sort((a, b) => b.reasons.length - a.reasons.length || b.row.metrics.followups_overdue - a.row.metrics.followups_overdue);

  return (
    <Panel
      title="Needs attention"
      description="Overdue follow-ups, no inquiries in the period, 30% or more of decisions rejected, or quotations not sent."
      className="h-full"
    >
      {flagged.length === 0 && unassigned === 0 ? (
        <AnalyticsEmpty title="Nothing needs attention" description="Every agent is on track for this period." />
      ) : (
        <ul className="divide-y divide-slate-100 px-3 pb-2" aria-label="Agents needing attention">
          {unassigned > 0 ? (
            <li className="flex items-start gap-2 py-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 stroke-amber-600" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary-dark">Contacts without a sales agent</p>
                <p className="text-sm text-slate-600">
                  {unassigned.toLocaleString()} contact{unassigned === 1 ? " has" : "s have"} no one following up
                </p>
              </div>
            </li>
          ) : null}
          {flagged.map(({ row, reasons }) => (
            <li key={row.id} className="flex items-start gap-2 py-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 stroke-amber-600" aria-hidden />
              <div className="min-w-0">
                <Link href={agentHref(row.id)} className="text-sm font-medium text-[#017e84] hover:underline">
                  {row.name}
                </Link>
                <ul className="text-sm text-slate-600">
                  {reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function SalesTeamOverview() {
  const { switchVersion } = useAdminOrganization();
  const params = useSearchParams();
  const { range, rangeError, update, query } = useAnalyticsRange();
  const [search, setSearch] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [sort, setSort] = useState<Sort>({ key: "inquiries_submitted", desc: true });
  const tableRef = useRef<HTMLDivElement>(null);

  const agentFilter = params.get("agent") ?? "";
  const source = params.get("source") ?? "";
  const from = range?.from ?? "";
  const to = range?.to ?? "";

  const { data, error, loading, onRetry } = useLoad<Overview>(
    () =>
      from
        ? getSalesTeamOverview({ from, to }, agentFilter || null)
        : Promise.resolve({ error: rangeError ?? "Choose a period." }),
    `${from}|${to}|${agentFilter}|${switchVersion}`
  );

  const allTime = range?.preset === "all_time";
  const funnel = useLoad<SalesAgentFunnel>(
    () =>
      !from
        ? Promise.resolve({ error: rangeError ?? "Choose a period." })
        : agentFilter
          ? getSalesAgentFunnel(agentFilter, { from, to }, { source: source || null, allTime })
          : getSalesTeamFunnel({ from, to }, { source: source || null, allTime }),
    `${from}|${to}|${agentFilter}|${source}|${switchVersion}`
  );

  const agentHref = (id: string) => `/analytics/sales/${encodeURIComponent(id)}${query ? `?${query}` : ""}`;

  // An agent from another company may still be in the URL after switching.
  const selectedAgent = data?.agents.find((a) => a.id === agentFilter) ?? null;
  const scoped = useMemo(
    () => (data ? (selectedAgent ? [selectedAgent] : data.agents) : []),
    [data, selectedAgent]
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = scoped.filter((row) => {
      if (needle && !row.name.toLowerCase().includes(needle)) return false;
      if (show === "attention") return attentionReasons(row.metrics).length > 0;
      if (show === "idle") return row.metrics.inquiries_submitted === 0;
      return true;
    });
    return [...filtered].sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      const order = x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name);
      return sort.desc && x !== y ? -order : order;
    });
  }, [scoped, search, show, sort]);

  const chart = useMemo(() => {
    if (!data || !range) return null;
    const days = data.series.length;
    const bucket = bucketForDays(days);
    const points = groupSeries(range.preset === "all_time" ? trimLeadingEmpty(data.series) : data.series, bucket);
    return { bucket, points };
  }, [data, range]);

  const sortBy = (key: SortKey) => {
    setSort((current) => (current.key === key ? { key, desc: !current.desc } : { key, desc: key !== "name" }));
  };

  const filtersActive = Boolean(search.trim()) || show !== "all";
  const showUnassigned = !selectedAgent && !filtersActive && (data?.unassigned.total ?? 0) > 0;
  const shownTotal = sumMetrics(rows);
  const unassigned = selectedAgent || !data ? { total: 0, added: 0 } : data.unassigned;

  return (
    <div className="space-y-4">
      <FunnelHeader
        name={selectedAgent ? selectedAgent.name : "Sales team"}
        role={selectedAgent ? "Sales agent" : "All sales agents"}
        periodLabel={range ? funnelPeriodLabel(range.preset, range.from, range.to) : rangeError ?? ""}
        back={
          <Link href="/analytics" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-[#017e84]">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Analytics
          </Link>
        }
      />

      <FunnelFilters
        sources={funnel.data?.sources ?? []}
        hasUnsourced={funnel.data?.hasUnsourced ?? false}
        source={source}
        onSource={(value) => update({ source: value })}
        extra={
          <span className="flex items-center gap-2">
            <label htmlFor="sales-agent-filter" className="whitespace-nowrap text-sm font-medium text-primary-dark">
              Sales agent
            </label>
            <select
              id="sales-agent-filter"
              className={`${selectClass} w-full min-w-[180px] sm:w-56`}
              value={selectedAgent ? agentFilter : ""}
              onChange={(e) => update({ agent: e.target.value })}
            >
              <option value="">All sales agents</option>
              {(data?.agents ?? []).map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </span>
        }
      />
      {source ? (
        <p className="text-xs text-slate-600" role="status">
          The board shows only contacts from{" "}
          <span className="font-semibold text-primary-dark">{source === NO_SOURCE ? "no recorded source" : sourceLabel(source)}</span>{" "}
          and their inquiries, quotations and deals. Needs attention and Agent performance below are not filtered by source.
        </p>
      ) : null}

      {funnel.error ? (
        <AnalyticsError message={funnel.error} onRetry={funnel.onRetry} />
      ) : !funnel.data ? (
        <AnalyticsLoading />
      ) : (
        <FunnelBoard data={funnel.data} allTime={allTime} loading={funnel.loading} />
      )}

      {error ? (
        <AnalyticsError message={error} onRetry={onRetry} />
      ) : !data ? (
        <AnalyticsLoading />
      ) : (
        <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="min-w-0 xl:col-span-5">
              <AttentionPanel rows={scoped} unassigned={unassigned.total} agentHref={agentHref} />
            </div>
            <div className="min-w-0 xl:col-span-7">
              {chart ? (
                <AnalyticsTrendChart
                  data={chart.points}
                  bucket={chart.bucket}
                  title={selectedAgent ? `${selectedAgent.name}: activity` : "Team activity"}
                  description={
                    chart.bucket === "day" ? "Per day" : chart.bucket === "week" ? "Per week, weeks start on Monday" : "Per month"
                  }
                />
              ) : null}
            </div>
          </div>

          <div ref={tableRef} className="scroll-mt-16">
            <Panel
              title="Agent performance"
              description="Numbers count activity in the period, except columns marked “now”, which show the current state. Click a column to sort and an agent to open their dashboard."
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="search"
                    aria-label="Search sales agent"
                    placeholder="Search sales agent"
                    className="h-9 w-full bg-white sm:w-52"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <label htmlFor="sales-show-filter" className="text-sm font-medium text-primary-dark">
                    Show
                  </label>
                  <select
                    id="sales-show-filter"
                    className={selectClass}
                    value={show}
                    onChange={(e) => setShow(e.target.value as Show)}
                  >
                    <option value="all">All agents</option>
                    <option value="attention">Needs attention</option>
                    <option value="idle">No inquiries in period</option>
                  </select>
                  {filtersActive ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[#017e84] hover:text-[#016970]"
                      onClick={() => {
                        setSearch("");
                        setShow("all");
                      }}
                    >
                      Clear
                    </Button>
                  ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={rows.length === 0}
                  onClick={() => downloadCsv(rows, `sales-team-${range?.startYmd ?? ""}-to-${range?.endYmd ?? ""}.csv`)}
                >
                  <Download className="h-4 w-4" aria-hidden />
                  Export CSV
                </Button>
                </div>
              }
            >
              {data.agents.length === 0 ? (
                <AnalyticsEmpty title="No sales agents in this company" />
              ) : rows.length === 0 ? (
                <AnalyticsEmpty
                  title="No agents match these filters"
                  description="Change the search or the Show filter to see more agents."
                />
              ) : (
                <Table className="min-w-[1180px]">
                  <TableHeader>
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableHead rowSpan={2} className="sticky left-0 z-10 bg-slate-50 align-bottom">
                        <SortButton column={{ key: "name", label: "Sales agent" }} sort={sort} onSort={sortBy} />
                      </TableHead>
                      {GROUPS.map((group) => (
                        <TableHead
                          key={group.name}
                          colSpan={group.span}
                          scope="colgroup"
                          className="h-8 border-l border-slate-200 text-center text-xs font-semibold text-slate-600"
                        >
                          {group.name}
                        </TableHead>
                      ))}
                    </TableRow>
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      {COLUMNS.map((column, index) => (
                        <TableHead
                          key={column.key}
                          aria-sort={sort.key === column.key ? (sort.desc ? "descending" : "ascending") : undefined}
                          className={`text-right ${index === 0 || COLUMNS[index - 1].group !== column.group ? "border-l border-slate-200" : ""}`}
                        >
                          <SortButton column={column} sort={sort} onSort={sortBy} right />
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const m = row.metrics;
                      return (
                        <TableRow key={row.id} className={selectedAgent?.id === row.id ? "bg-[#e6f4f5]" : undefined}>
                          <TableCell className="sticky left-0 z-10 bg-white">
                            <Link href={agentHref(row.id)} className="font-medium text-[#017e84] hover:underline">
                              {row.name}
                            </Link>
                          </TableCell>
                          {COLUMNS.map((column, index) => (
                            <TableCell
                              key={column.key}
                              className={`text-right tabular-nums whitespace-nowrap ${
                                index === 0 || COLUMNS[index - 1].group !== column.group ? "border-l border-slate-100" : ""
                              }`}
                            >
                              {column.key === "approval_rate" ? (
                                percent(approvalRate(m))
                              ) : column.key === "last_inquiry" ? (
                                row.lastInquiryAt ? (
                                  formatDate(row.lastInquiryAt)
                                ) : (
                                  <span className="text-slate-500">Never</span>
                                )
                              ) : column.key === "name" ? null : (
                                <NumberCell value={m[column.key]} alert={column.alert} />
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                    {showUnassigned ? (
                      <TableRow>
                        <TableCell className="sticky left-0 z-10 bg-white text-slate-600">No sales agent</TableCell>
                        {COLUMNS.map((column, index) => (
                          <TableCell
                            key={column.key}
                            className={`text-right tabular-nums text-slate-600 ${
                              index === 0 || COLUMNS[index - 1].group !== column.group ? "border-l border-slate-100" : ""
                            }`}
                          >
                            {column.key === "total_contacts"
                              ? unassigned.total.toLocaleString()
                              : column.key === "new_contacts"
                                ? unassigned.added.toLocaleString()
                                : ""}
                          </TableCell>
                        ))}
                      </TableRow>
                    ) : null}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableCell className="sticky left-0 z-10 bg-slate-50 font-semibold text-primary-dark">
                        {filtersActive ? `Total of ${rows.length} shown` : selectedAgent ? "Total" : "Team total"}
                      </TableCell>
                      {COLUMNS.map((column, index) => {
                        const extra = showUnassigned
                          ? column.key === "total_contacts"
                            ? unassigned.total
                            : column.key === "new_contacts"
                              ? unassigned.added
                              : 0
                          : 0;
                        return (
                          <TableCell
                            key={column.key}
                            className={`text-right font-semibold tabular-nums text-primary-dark ${
                              index === 0 || COLUMNS[index - 1].group !== column.group ? "border-l border-slate-200" : ""
                            }`}
                          >
                            {column.key === "approval_rate"
                              ? percent(approvalRate(shownTotal))
                              : column.key === "last_inquiry" || column.key === "name"
                                ? ""
                                : (shownTotal[column.key] + extra).toLocaleString()}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

function SortButton({
  column,
  sort,
  onSort,
  right = false,
}: {
  column: Pick<Column, "key" | "label"> & { full?: string; now?: boolean };
  sort: Sort;
  onSort: (key: SortKey) => void;
  right?: boolean;
}) {
  const active = sort.key === column.key;
  const Arrow = sort.desc ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={() => onSort(column.key)}
      aria-label={`Sort by ${column.full ?? column.label}`}
      title={column.full}
      className={`inline-flex w-full items-center gap-1 whitespace-nowrap text-xs font-semibold hover:text-[#017e84] focus-visible:outline-2 focus-visible:outline-[#017e84] ${
        right ? "justify-end" : "justify-start"
      } ${active ? "text-[#016970]" : "text-primary-dark"}`}
    >
      <span>
        {column.label}
        {column.now ? <span className="ml-1 font-normal text-slate-600">now</span> : null}
      </span>
      {active ? <Arrow className="h-3.5 w-3.5 stroke-[#016970]" aria-hidden /> : null}
    </button>
  );
}
