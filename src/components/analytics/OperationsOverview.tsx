"use client";

import { useMemo, useState } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  getOperationsAdminInquiries,
  getOperationsAdminSummary,
  getOperationsEmployees,
  getOperationsTeamPerformance,
  type OperationsAdminInquiryRow,
  type OperationsTeamRow,
} from "@/app/actions/analytics/operations";
import { getSalesEmployees, type AnalyticsEmployee } from "@/app/actions/analytics/sales";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAnalyticsRange } from "@/components/analytics/AnalyticsDateFilter";
import {
  DashboardHeader,
  PagedTable,
  Panel,
  useLoad,
  usePaged,
} from "@/components/analytics/AnalyticsDashboardKit";
import { OperationsTeamTable } from "@/components/analytics/OperationsTeamTable";
import { formatDuration } from "@/lib/analytics/format-duration";
import { AnalyticsInquiryDetail } from "@/components/analytics/AnalyticsInquiryDetail";
import {
  AnalyticsError,
  AnalyticsLoading,
  KpiCards,
  StatusBadge,
  formatDateTime,
} from "@/components/analytics/AnalyticsParts";

type Summary = Exclude<Awaited<ReturnType<typeof getOperationsAdminSummary>>, { error: string }>;
type People = { employees: AnalyticsEmployee[] };

const STATUS_OPTIONS = [
  { id: "sent", label: "Pending with Operations" },
  { id: "sent_to_admin", label: "Submitted to Admin" },
  { id: "calculated_by_admin", label: "Calculated by Admin" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

const selectClass = "h-8 max-w-[190px] rounded-md border border-slate-200 bg-white px-2 text-sm text-primary-dark";

function FilterSelect({
  label,
  value,
  onChange,
  all,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  all: string;
  options: Array<{ id: string; label: string }>;
}) {
  return (
    <select aria-label={label} className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{all}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function OperationsOverview() {
  const { switchVersion } = useAdminOrganization();
  const { range, rangeError, query } = useAnalyticsRange();
  const [search, setSearch] = useState("");
  const needle = useDebouncedValue(search, 280);
  const [status, setStatus] = useState("");
  const [salesAgent, setSalesAgent] = useState("");
  const [actor, setActor] = useState("");
  const [flags, setFlags] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const from = range?.from ?? "";
  const to = range?.to ?? "";
  const period = { from, to };
  const noPeriod = () => Promise.resolve({ error: rangeError ?? "Choose a period." });

  const summary = useLoad<Summary>(
    () => (from ? getOperationsAdminSummary(period) : noPeriod()),
    `${from}|${to}|${switchVersion}`
  );
  const team = useLoad<{ rows: OperationsTeamRow[] }>(
    () => (from ? getOperationsTeamPerformance(period) : noPeriod()),
    `team|${from}|${to}|${switchVersion}`
  );
  const sales = useLoad<People>(() => getSalesEmployees(), `sales|${switchVersion}`);
  const operations = useLoad<People>(() => getOperationsEmployees(), `ops|${switchVersion}`);

  const inquiries = usePaged<OperationsAdminInquiryRow>(
    (page) =>
      from
        ? getOperationsAdminInquiries({
            page,
            period,
            search: needle,
            status: status || null,
            salesAgentId: salesAgent || null,
            actor: actor || null,
            flags: flags === "any" || flags === "multiple" ? flags : null,
          })
        : noPeriod(),
    `${from}|${to}|${needle}|${status}|${salesAgent}|${actor}|${flags}|${switchVersion}`
  );

  const actorNames = useMemo(
    () => new Map((operations.data?.employees ?? []).map((e) => [e.id, e.name])),
    [operations.data]
  );

  if (openId) {
    return <AnalyticsInquiryDetail inquiryId={openId} backLabel="Inquiries" onBack={() => setOpenId(null)} />;
  }

  const s = summary.data;

  return (
    <div className="space-y-4">
      <DashboardHeader
        backHref="/analytics"
        backLabel="Analytics"
        name="Operations"
        title="Operations analytics"
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search inquiry or customer"
      />

      {summary.error ? (
        <AnalyticsError message={summary.error} onRetry={summary.onRetry} />
      ) : !s ? (
        <AnalyticsLoading />
      ) : (
        <div className={`space-y-4 transition-opacity ${summary.loading ? "opacity-60" : ""}`} aria-busy={summary.loading}>
          <KpiCards
            label="Inquiry summary"
            items={[
              { label: "Inquiries received", value: s.received, tone: "brand", note: "From Sales" },
              { label: "Inquiries submitted", value: s.submitted, note: "By Operations", onClick: () => setStatus("sent_to_admin") },
              { label: "Approved by Admin", value: s.approved, tone: "success", onClick: () => setStatus("approved") },
              { label: "Rejected by Admin", value: s.rejected, tone: "danger", onClick: () => setStatus("rejected") },
              { label: "Calculated by Admin", value: s.calculated, tone: "warning", onClick: () => setStatus("calculated_by_admin") },
            ]}
          />

          <KpiCards
            label="Queues and response times"
            items={[
              {
                label: "Waiting at Operations",
                value: s.atOperations,
                tone: "warning",
                note: "Right now",
              },
              {
                label: "Waiting too long",
                value: s.waitingTooLong,
                tone: s.waitingTooLong > 0 ? "danger" : "neutral",
                note: `At Operations over ${s.alertHours} hours`,
              },
              {
                label: "Waiting for Admin",
                value: s.withAdmin,
                note: "Right now",
              },
              { label: "Avg Operations time", value: formatDuration(s.avgOperationsSeconds), note: "Received to sent to Admin" },
              { label: "Avg Admin decision", value: formatDuration(s.avgAdminDecisionSeconds), note: "Sent to Admin to decision" },
              { label: "Avg total time", value: formatDuration(s.avgTurnaroundSeconds), note: "Received to decision" },
            ]}
          />

          <OperationsTeamTable
            state={team}
            personHref={(id) => `/analytics/operations/${encodeURIComponent(id)}${query ? `?${query}` : ""}`}
          />

          <Panel
            title="Inquiries received by Operations"
            description="Click an inquiry to see its full timeline and flags."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <FilterSelect label="Status" value={status} onChange={setStatus} all="All statuses" options={STATUS_OPTIONS} />
                <FilterSelect
                  label="Sales agent"
                  value={salesAgent}
                  onChange={setSalesAgent}
                  all="All sales agents"
                  options={(sales.data?.employees ?? []).map((e) => ({ id: e.id, label: e.name }))}
                />
                <FilterSelect
                  label="Operation user"
                  value={actor}
                  onChange={setActor}
                  all="All operation users"
                  options={(operations.data?.employees ?? []).map((e) => ({ id: e.id, label: e.name }))}
                />
                <FilterSelect
                  label="Flags"
                  value={flags}
                  onChange={setFlags}
                  all="All flags"
                  options={[
                    { id: "any", label: "With flags" },
                    { id: "multiple", label: "Multiple flags" },
                  ]}
                />
              </div>
            }
          >
            <PagedTable
              state={inquiries}
              headers={[
                { label: "Inquiry ID" },
                { label: "Customer ID" },
                { label: "Customer name" },
                { label: "Sales agent" },
                { label: "Operation user" },
                { label: "Sales submission" },
                { label: "Operation submission" },
                { label: "Admin decision" },
                { label: "Status" },
                { label: "Flags", right: true },
              ]}
              emptyTitle="No inquiries match these filters"
              renderRow={(row) => (
                <TableRow key={row.inquiryId}>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setOpenId(row.inquiryId)}
                      className="whitespace-nowrap font-medium text-[#017e84] hover:underline"
                    >
                      {row.reference || row.inquiryId.slice(0, 8)}
                    </button>
                  </TableCell>
                  <TableCell>{row.customerId || "—"}</TableCell>
                  <TableCell>{row.customer || "—"}</TableCell>
                  <TableCell>{row.salesAgent || "—"}</TableCell>
                  <TableCell>{row.actor ? actorNames.get(row.actor.toLowerCase()) ?? row.actor : "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDateTime(row.receivedAt)}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDateTime(row.respondedAt)}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDateTime(row.decidedAt)}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.approvalStatus} />
                  </TableCell>
                  <TableCell className="text-right">
                    {row.flagCount > 0 ? (
                      <StatusBadge status={row.flagCount > 1 ? "rejected" : "sent_to_admin"} label={String(row.flagCount)} />
                    ) : (
                      <span className="tabular-nums text-slate-600">0</span>
                    )}
                  </TableCell>
                </TableRow>
              )}
            />
          </Panel>

        </div>
      )}
    </div>
  );
}
