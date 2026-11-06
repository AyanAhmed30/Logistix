"use client";

import { useMemo, useRef, useState } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  getOperationsActivity,
  getOperationsEmployeeDetail,
  getOperationsInquiries,
  type OperationsInquiryRow,
} from "@/app/actions/analytics/operations";
import type { AnalyticsPeriod, AnalyticsSeriesPoint, TimelineItem } from "@/app/actions/analytics/sales";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatDuration } from "@/lib/analytics/format-duration";
import { useAnalyticsRange } from "@/components/analytics/AnalyticsDateFilter";
import {
  ActivityRail,
  DashboardHeader,
  PagedTable,
  Panel,
  PipelineRow,
  SectionTabs,
  useLoad,
  usePaged,
  type PipelineStage,
} from "@/components/analytics/AnalyticsDashboardKit";
import {
  AnalyticsError,
  AnalyticsLoading,
  KpiCards,
  StatusBadge,
  formatDateTime,
} from "@/components/analytics/AnalyticsParts";
import { AnalyticsInquiryDetail } from "@/components/analytics/AnalyticsInquiryDetail";
import { AnalyticsTrendChart, OPERATIONS_SELF_SERIES } from "@/components/analytics/AnalyticsTrendChart";

type Detail = Exclude<Awaited<ReturnType<typeof getOperationsEmployeeDetail>>, { error: string }>;
type Section = "mine" | "shared";
type Bucket = "day" | "week" | "month";

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: "mine", label: "Attributed to this person" },
  { id: "shared", label: "Shared team queue" },
];

const STATUS_FILTERS = [
  { id: "sent_to_admin", label: "With Admin" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

function bucketStart(day: string, bucket: Bucket): string {
  if (bucket === "day") return day;
  if (bucket === "month") return `${day.slice(0, 7)}-01`;
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function groupSeries(points: AnalyticsSeriesPoint[], bucket: Bucket): AnalyticsSeriesPoint[] {
  const grouped = new Map<string, AnalyticsSeriesPoint>();
  for (const point of points) {
    const day = bucketStart(point.day, bucket);
    const current = grouped.get(day);
    grouped.set(
      day,
      current
        ? { ...current, operations_submitted: current.operations_submitted + point.operations_submitted }
        : { ...point, day }
    );
  }
  return [...grouped.values()];
}

function InquiryTable({
  username,
  shared,
  period,
  search,
  status,
  onStatus,
  onOpen,
}: {
  username: string;
  shared: boolean;
  period: AnalyticsPeriod;
  search: string;
  status: string | null;
  onStatus: (status: string | null) => void;
  onOpen?: (inquiryId: string) => void;
}) {
  const state = usePaged<OperationsInquiryRow>(
    (page) => getOperationsInquiries({ username, shared, page, period, status, search }),
    `${username}|${shared}|${period.from}|${period.to}|${status}|${search}`
  );
  return (
    <>
      {shared ? (
        <p className="px-3 py-2 text-xs text-slate-600">
          Inquiries aren&apos;t assigned to individuals, so this queue belongs to the whole team and isn&apos;t counted against this person.
        </p>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2">
          <label htmlFor="ops-status" className="text-sm text-primary-dark">
            Status
          </label>
          <select
            id="ops-status"
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-primary-dark"
            value={status ?? ""}
            onChange={(e) => onStatus(e.target.value || null)}
          >
            <option value="">All statuses</option>
            {STATUS_FILTERS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <PagedTable
        state={state}
        headers={
          shared
            ? [
                { label: "Inquiry" },
                { label: "Customer" },
                { label: "Sales agent" },
                { label: "Received" },
                { label: "Waiting for", right: true },
                { label: "Status" },
              ]
            : [
                { label: "Inquiry" },
                { label: "Customer" },
                { label: "Sales agent" },
                { label: "Received" },
                { label: "Response sent" },
                { label: "Elapsed time", right: true },
                { label: "Status" },
                { label: "Admin review" },
              ]
        }
        emptyTitle={shared ? "The team queue is empty" : "No attributed inquiries match these filters"}
        renderRow={(row) => (
          <TableRow key={row.inquiryId}>
            <TableCell>
              {onOpen ? (
                <button
                  type="button"
                  onClick={() => onOpen(row.inquiryId)}
                  className="font-medium text-[#017e84] hover:underline"
                >
                  {row.reference || row.inquiryId.slice(0, 8)}
                </button>
              ) : (
                <span className="font-medium">{row.reference || row.inquiryId.slice(0, 8)}</span>
              )}
            </TableCell>
            <TableCell>{row.customer || "—"}</TableCell>
            <TableCell>{row.salesAgent || "—"}</TableCell>
            <TableCell className="whitespace-nowrap">{formatDateTime(row.receivedAt)}</TableCell>
            {shared ? (
              <TableCell className="text-right whitespace-nowrap">{formatDuration(row.waitingSeconds)}</TableCell>
            ) : (
              <>
                <TableCell className="whitespace-nowrap">{formatDateTime(row.respondedAt)}</TableCell>
                <TableCell className="text-right whitespace-nowrap">{formatDuration(row.operationsSeconds)}</TableCell>
              </>
            )}
            <TableCell>
              <div className="flex flex-wrap gap-1">
                <StatusBadge status={row.approvalStatus} />
                {row.flagCount > 0 ? <StatusBadge status="overdue" label="Flagged" /> : null}
              </div>
            </TableCell>
            {shared ? null : (
              <TableCell className="whitespace-nowrap">
                {row.decision ? <StatusBadge status={row.decision} /> : "—"}
                {row.decidedAt ? <span className="block text-xs text-slate-600">{formatDateTime(row.decidedAt)}</span> : null}
              </TableCell>
            )}
          </TableRow>
        )}
      />
    </>
  );
}

export function OperationsEmployeeAnalytics({
  username,
  selfView = false,
}: {
  username: string;
  selfView?: boolean;
}) {
  const { switchVersion } = useAdminOrganization();
  const { range, rangeError, query } = useAnalyticsRange();
  const [search, setSearch] = useState("");
  const needle = useDebouncedValue(search, 280);
  const [section, setSection] = useState<Section>("mine");
  const [status, setStatus] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [bucket, setBucket] = useState<Bucket>("day");
  const [openInquiry, setOpenInquiry] = useState<string | null>(null);
  const tablesRef = useRef<HTMLDivElement>(null);

  const from = range?.from ?? "";
  const to = range?.to ?? "";
  const period = { from, to };
  const periodKey = `${username}|${from}|${to}|${switchVersion}`;

  const { data, error, loading, onRetry } = useLoad<Detail>(
    () =>
      from
        ? getOperationsEmployeeDetail(username, period)
        : Promise.resolve({ error: rangeError ?? "Choose a period." }),
    periodKey
  );
  const activity = useLoad<{ items: TimelineItem[]; truncated: boolean }>(
    () =>
      from
        ? getOperationsActivity(username, period)
        : Promise.resolve({ error: rangeError ?? "Choose a period." }),
    periodKey
  );

  const series = useMemo(() => groupSeries(data?.series ?? [], bucket), [data, bucket]);

  const selectStage = (id: string | null) => {
    setStage(id);
    if (id === "shared") {
      setSection("shared");
    } else {
      setSection("mine");
      setStatus(id);
    }
    if (id) tablesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const m = data?.metrics;
  const stages: PipelineStage[] = data
    ? [
        { id: "shared", label: "With Operations (team)", count: data.teamQueue, fill: "bg-[#cfe9eb]", text: "text-[#073D51]" },
        { id: "sent_to_admin", label: "With Admin", count: data.workflow.withAdmin, fill: "bg-[#7cc4c9]", text: "text-[#073D51]" },
        { id: "approved", label: "Approved", count: data.workflow.approved, fill: "bg-emerald-700", text: "text-white" },
        { id: "rejected", label: "Rejected", count: data.workflow.rejected, fill: "bg-red-700", text: "text-white" },
      ]
    : [];

  if (openInquiry) {
    return <AnalyticsInquiryDetail inquiryId={openInquiry} backLabel="Inquiries" onBack={() => setOpenInquiry(null)} />;
  }

  return (
    <div className="space-y-4">
      <DashboardHeader
        backHref={selfView ? undefined : `/analytics/operations${query ? `?${query}` : ""}`}
        backLabel="Operations"
        name={selfView ? "My performance" : data?.name ?? username}
        title="Operations analytics"
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search inquiry or customer"
      />

      {error ? (
        <AnalyticsError message={error} onRetry={onRetry} />
      ) : !data || !m ? (
        <AnalyticsLoading />
      ) : (
        <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <KpiCards
            label="Performance overview"
            items={[
              {
                label: "Processed",
                value: m.inquiries_processed,
                tone: "brand",
                note: `${m.submissions.toLocaleString()} responses, ${m.flags_raised.toLocaleString()} flags`,
                onClick: () => selectStage(null),
              },
              { label: "Approved", value: m.approved, tone: "success", onClick: () => selectStage("approved") },
              { label: "Rejected", value: m.rejected, tone: "danger", onClick: () => selectStage("rejected") },
              { label: "Average elapsed", value: formatDuration(m.avg_operations_seconds), note: "Includes queue time" },
              { label: "Team queue", value: data.teamQueue, tone: "warning", note: "Right now, shared", onClick: () => selectStage("shared") },
              { label: "Overdue in queue", value: data.teamOverdue, tone: "warning", note: `Over ${data.alertHours} hours, shared`, onClick: () => selectStage("shared") },
            ]}
          />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="min-w-0 space-y-4 xl:col-span-8">
              <Panel title="Workflow" description="This person's inquiries by stage, plus the shared team queue. Click a stage to see the records.">
                <PipelineRow stages={stages} selected={stage} onSelect={selectStage} />
              </Panel>
              <div ref={tablesRef} className="scroll-mt-16 rounded-lg border border-slate-200 bg-white">
                <SectionTabs tabs={SECTIONS} active={section} onChange={setSection} label="Inquiries" />
                <InquiryTable
                  username={username}
                  shared={section === "shared"}
                  period={period}
                  search={needle}
                  status={status}
                  onStatus={(value) => {
                    setStatus(value);
                    setStage(value);
                  }}
                  onOpen={selfView ? undefined : setOpenInquiry}
                />
              </div>
            </div>
            <div className="min-w-0 space-y-4 xl:col-span-4">
              <div className="space-y-2">
                <div className="flex justify-end">
                  <label className="flex items-center gap-2 text-sm text-primary-dark">
                    Group by
                    <select
                      className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-primary-dark"
                      value={bucket}
                      onChange={(e) => setBucket(e.target.value as Bucket)}
                    >
                      <option value="day">Day</option>
                      <option value="week">Week</option>
                      <option value="month">Month</option>
                    </select>
                  </label>
                </div>
                <AnalyticsTrendChart data={series} title="Responses sent to Admin" series={OPERATIONS_SELF_SERIES} />
              </div>
              <ActivityRail title="Activity history" state={activity} emptyTitle="No recorded activity in this period" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
