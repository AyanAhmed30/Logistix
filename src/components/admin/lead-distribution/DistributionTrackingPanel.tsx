"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, History, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getDistributionTracking,
  getTrackedInquiryTimeline,
  type DistributionTracking,
  type TimelineEntry,
  type TrackedInquiry,
  type TrackedInquiryStatus,
  type TrackingStatusFilter,
} from "@/app/actions/lead-distribution";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { INQUIRY_APPROVAL_STATUS_LABELS } from "@/lib/inquiry-workflow";
import { isValidYmd, karachiDayEndExclusiveUtc, karachiDayStartUtc } from "@/lib/contact-date-range";

// Same colours the All Inquiries page uses for each status.
const STATUS_STYLE: Record<TrackedInquiryStatus, string> = {
  sent: "border-amber-300 bg-amber-50 text-amber-800",
  sent_to_admin: "border-sky-300 bg-sky-50 text-sky-800",
  calculated_by_admin: "border-violet-300 bg-violet-50 text-violet-800",
  approved: "border-emerald-300 bg-emerald-50 text-emerald-800",
  rejected: "border-rose-300 bg-rose-50 text-rose-800",
  other: "border-slate-300 bg-slate-50 text-slate-700",
};

const statusLabel = (status: TrackedInquiryStatus) =>
  status === "other" ? "Other" : INQUIRY_APPROVAL_STATUS_LABELS[status];

const STATUS_FILTERS: Array<{ id: TrackingStatusFilter; label: string }> = [
  { id: "all", label: "All statuses" },
  { id: "pending", label: "Pending (not decided yet)" },
  { id: "sent", label: INQUIRY_APPROVAL_STATUS_LABELS.sent },
  { id: "sent_to_admin", label: INQUIRY_APPROVAL_STATUS_LABELS.sent_to_admin },
  { id: "calculated_by_admin", label: INQUIRY_APPROVAL_STATUS_LABELS.calculated_by_admin },
  { id: "approved", label: INQUIRY_APPROVAL_STATUS_LABELS.approved },
  { id: "rejected", label: INQUIRY_APPROVAL_STATUS_LABELS.rejected },
  { id: "none", label: "Leads with no inquiry yet" },
];

const dateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Karachi",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
/** Real timestamp in Pakistan time, or N/A when the step never happened. */
const when = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : "N/A");

function StatusBadge({ status }: { status: TrackedInquiryStatus }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {statusLabel(status)}
    </span>
  );
}

/** Latest inquiry's status, with when it was sent to Operations and when Admin decided. */
function LatestInquiryStatus({ inquiry }: { inquiry: TrackedInquiry }) {
  const decision =
    inquiry.status === "approved"
      ? { label: "Approved by Admin", at: inquiry.approvedAt }
      : inquiry.status === "rejected"
        ? { label: "Rejected by Admin", at: inquiry.rejectedAt }
        : null;
  return (
    <div className="space-y-1">
      <StatusBadge status={inquiry.status} />
      <dl className="text-xs text-slate-600">
        <div className="flex gap-1 whitespace-nowrap">
          <dt>Sent to Operations:</dt>
          <dd className="tabular-nums text-primary-dark">{when(inquiry.sentToOperationsAt)}</dd>
        </div>
        <div className="flex gap-1 whitespace-nowrap">
          <dt>{decision ? `${decision.label}:` : "Admin decision:"}</dt>
          <dd className={`tabular-nums ${decision?.at ? "text-primary-dark" : ""}`}>
            {decision ? when(decision.at) : "Not decided yet"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function TimeCell({ iso }: { iso: string | null }) {
  return <span className={`whitespace-nowrap tabular-nums ${iso ? "" : "text-slate-500"}`}>{when(iso)}</span>;
}

type DateFilter = { day: string; from: string; to: string };
const NO_DATES: DateFilter = { day: "", from: "", to: "" };

/** One date, or a from–to range (choosing one clears the other). */
function DateFilterFields({ value, onChange }: { value: DateFilter; onChange: (next: DateFilter) => void }) {
  return (
    <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <legend className="sr-only">Date filter</legend>
      <label className="flex items-center gap-1.5">
        <span className="text-sm font-medium text-primary-dark">Date</span>
        <Input
          type="date"
          className="h-9 w-[150px] bg-white"
          value={value.day}
          onChange={(e) => onChange({ day: e.target.value, from: "", to: "" })}
        />
      </label>
      <span className="text-sm text-slate-600">or</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium text-primary-dark" id="date-range-label">
          Date range
        </span>
        <Input
          type="date"
          aria-label="From date"
          aria-describedby="date-range-label"
          className="h-9 w-[150px] bg-white"
          value={value.from}
          max={value.to || undefined}
          onChange={(e) => onChange({ day: "", from: e.target.value, to: value.to })}
        />
        <span className="text-sm text-slate-600">to</span>
        <Input
          type="date"
          aria-label="To date"
          aria-describedby="date-range-label"
          className="h-9 w-[150px] bg-white"
          value={value.to}
          min={value.from || undefined}
          onChange={(e) => onChange({ day: "", from: value.from, to: e.target.value })}
        />
      </div>
      {value.day || value.from || value.to ? (
        <Button variant="ghost" size="sm" className="text-[#017e84] hover:text-[#016970]" onClick={() => onChange(NO_DATES)}>
          <X className="h-3.5 w-3.5 stroke-[#017e84]" aria-hidden />
          Clear dates
        </Button>
      ) : null}
    </fieldset>
  );
}

/** Pakistan-time window: a single day, or from the start of "from" to the end of "to". */
function dateWindow(d: DateFilter): { from: string | null; to: string | null } {
  if (isValidYmd(d.day)) return { from: karachiDayStartUtc(d.day), to: karachiDayEndExclusiveUtc(d.day) };
  return {
    from: isValidYmd(d.from) ? karachiDayStartUtc(d.from) : null,
    to: isValidYmd(d.to) ? karachiDayEndExclusiveUtc(d.to) : null,
  };
}

function TimelineDialog({ inquiry, onClose }: { inquiry: TrackedInquiry | null; onClose: () => void }) {
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inquiry) return;
    let cancelled = false;
    setEntries(null);
    setError(null);
    getTrackedInquiryTimeline(inquiry.id).then((res) => {
      if (cancelled) return;
      if ("error" in res) setError(res.error);
      else setEntries(res.entries);
    });
    return () => {
      cancelled = true;
    };
  }, [inquiry]);

  return (
    <Dialog open={Boolean(inquiry)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Status history{inquiry?.reference ? `: ${inquiry.reference}` : ""}</DialogTitle>
          <DialogDescription>
            Recorded times only, in Pakistan time. Steps that did not happen are not listed.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : !entries ? (
          <p className="flex items-center gap-2 text-sm text-slate-600" aria-busy="true">
            <Loader2 className="h-4 w-4 animate-spin stroke-[#017e84]" aria-hidden /> Loading the history…
          </p>
        ) : (
          <ol className="space-y-0">
            {entries.map((entry, i) => (
              <li key={`${entry.at}-${i}`} className="border-l-2 border-slate-200 pb-3 pl-3 last:pb-0">
                <p className="text-sm font-medium text-primary-dark">{entry.label}</p>
                <p className="text-xs text-slate-600 tabular-nums">
                  {when(entry.at)}
                  {entry.actor ? ` · ${entry.actor}` : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DistributionTrackingPanel() {
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const [agentId, setAgentId] = useState("");
  const [status, setStatus] = useState<TrackingStatusFilter>("all");
  const [dates, setDates] = useState<DateFilter>(NO_DATES);
  const [search, setSearch] = useState("");
  const needle = useDebouncedValue(search, 300);
  const [data, setData] = useState<DistributionTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [retry, setRetry] = useState(0);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TrackedInquiry | null>(null);
  const leadsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (isAdminContext) return;
    let cancelled = false;
    setLoading(true);
    const range = dateWindow(dates);
    getDistributionTracking({
      agentId: agentId || null,
      status,
      dateFrom: range.from,
      dateTo: range.to,
      search: needle,
    })
      .then((res) => {
        if (cancelled) return;
        if ("setupRequired" in res) setSetupRequired(true);
        else if ("error" in res) setError(res.error);
        else {
          setError(null);
          setData(res);
        }
      })
      .catch(() => {
        if (!cancelled) setError("The request failed. Check your connection and try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdminContext, agentId, status, dates, needle, retry, switchVersion]);

  if (isAdminContext) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-600">
        Choose a company from the header switcher to track its distributed leads.
      </div>
    );
  }
  if (setupRequired) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-600">
        Lead Distribution needs its database update (<code>056_lead_distribution.sql</code>). Run it, then refresh.
      </div>
    );
  }

  const filtersActive = Boolean(agentId || status !== "all" || dates.day || dates.from || dates.to || search.trim());
  const agentName = data?.agentOptions.find((a) => a.id === agentId)?.name ?? "";
  const c = data?.cards;
  const cards: Array<{ label: string; value: number | undefined; note?: string; filter?: TrackingStatusFilter }> = [
    { label: "Total leads assigned", value: c?.assignedLeads },
    { label: "Total inquiries sent", value: c?.inquiries, note: "From assigned leads" },
    { label: INQUIRY_APPROVAL_STATUS_LABELS.sent, value: c?.sent, note: "Status now", filter: "sent" },
    { label: INQUIRY_APPROVAL_STATUS_LABELS.sent_to_admin, value: c?.sentToAdmin, note: "Status now", filter: "sent_to_admin" },
    { label: INQUIRY_APPROVAL_STATUS_LABELS.calculated_by_admin, value: c?.calculated, note: "Status now", filter: "calculated_by_admin" },
    { label: INQUIRY_APPROVAL_STATUS_LABELS.approved, value: c?.approved, filter: "approved" },
    { label: INQUIRY_APPROVAL_STATUS_LABELS.rejected, value: c?.rejected, filter: "rejected" },
    { label: "Pending inquiries", value: c?.pending, note: "Not approved or rejected yet", filter: "pending" },
  ];


  return (
    <div className="space-y-4">
      {/* Filters */}
      <section aria-label="Filters" className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 stroke-slate-500" aria-hidden />
            <Input
              type="search"
              aria-label="Search lead name, phone or inquiry number"
              placeholder="Lead name, phone or inquiry number"
              className="h-9 bg-white pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={agentId || "all"} onValueChange={(v) => setAgentId(v === "all" ? "" : v)}>
            <SelectTrigger className="h-9 w-[200px] bg-white" aria-label="Sales agent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sales agents</SelectItem>
              {(data?.agentOptions ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as TrackingStatusFilter)}>
            <SelectTrigger className="h-9 w-[220px] bg-white" aria-label="Inquiry status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtersActive ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-[#017e84] hover:text-[#016970]"
              onClick={() => {
                setAgentId("");
                setStatus("all");
                setDates(NO_DATES);
                setSearch("");
              }}
            >
              <X className="h-3.5 w-3.5 stroke-[#017e84]" aria-hidden />
              Clear filters
            </Button>
          ) : null}
          {loading && data ? <Loader2 className="h-4 w-4 animate-spin stroke-[#017e84]" aria-label="Updating" /> : null}
        </div>
        <DateFilterFields value={dates} onChange={setDates} />
      </section>

      {error ? (
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-primary-dark">Tracking couldn&apos;t be loaded.</p>
          <p className="mt-1 text-xs text-slate-600">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setRetry((n) => n + 1)}>
            Retry
          </Button>
        </div>
      ) : !data ? (
        <div className="grid grid-cols-2 gap-3 animate-pulse sm:grid-cols-4 2xl:grid-cols-8" aria-busy="true" aria-label="Loading tracking">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[82px] rounded-lg border border-slate-200 bg-white" />
          ))}
        </div>
      ) : (
        <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          {/* Summary cards */}
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4 2xl:grid-cols-8">
            {cards.map((card) => {
              const body = (
                <>
                  <span className="block text-xs font-medium text-slate-600">{card.label}</span>
                  <span className="mt-0.5 block text-2xl font-semibold tabular-nums text-primary-dark">
                    {(card.value ?? 0).toLocaleString()}
                  </span>
                  <span className="block min-h-4 text-xs text-slate-600">{card.note}</span>
                </>
              );
              const cls = "rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left";
              return card.filter ? (
                <button
                  key={card.label}
                  type="button"
                  aria-pressed={status === card.filter}
                  onClick={() => setStatus(status === card.filter ? "all" : card.filter!)}
                  className={`${cls} hover:border-[#017e84] focus-visible:outline-2 focus-visible:outline-[#017e84] ${status === card.filter ? "border-[#017e84] bg-[#e6f4f5]" : ""}`}
                >
                  {body}
                </button>
              ) : (
                <div key={card.label} className={cls}>
                  {body}
                </div>
              );
            })}
          </section>

          {/* Lead-wise tracking */}
          <section ref={leadsRef} aria-label="Assigned leads" className="scroll-mt-20 rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-wrap items-start justify-between gap-2 px-3 pt-3">
              <div>
                <h2 className="text-base font-semibold text-primary-dark">
                  {agentName ? `Leads assigned to ${agentName}` : "Assigned leads"}
                </h2>
                <p className="text-xs text-slate-600">Open a lead to see each of its inquiries, then its status history.</p>
              </div>
              {agentId ? (
                <Button variant="outline" size="sm" onClick={() => setAgentId("")}>
                  Show all agents
                </Button>
              ) : null}
            </div>
            {data.leads.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-slate-600">No leads match these filters.</p>
            ) : (
              <Table className="mt-2 min-w-[980px]">
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="w-8" />
                    <TableHead className="font-semibold text-primary-dark">Contact name</TableHead>
                    <TableHead className="font-semibold text-primary-dark">Phone number</TableHead>
                    {agentId ? null : <TableHead className="font-semibold text-primary-dark">Sales agent</TableHead>}
                    <TableHead className="font-semibold text-primary-dark">Assigned</TableHead>
                    <TableHead className="font-semibold text-primary-dark">Assignment</TableHead>
                    <TableHead className="text-right font-semibold text-primary-dark">Total inquiries</TableHead>
                    <TableHead className="font-semibold text-primary-dark">Latest inquiry status</TableHead>
                    <TableHead className="font-semibold text-primary-dark">Last activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.leads.map((lead) => {
                    const open = openLead === lead.id;
                    const columns = agentId ? 8 : 9;
                    return (
                      <Fragment key={lead.id}>
                        <TableRow className={open ? "bg-slate-50" : undefined}>
                          <TableCell>
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-label={`${open ? "Hide" : "Show"} inquiries of ${lead.name}`}
                              onClick={() => setOpenLead(open ? null : lead.id)}
                              className="rounded-sm p-1 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-[#017e84]"
                            >
                              {open ? <ChevronDown className="h-4 w-4 stroke-slate-600" aria-hidden /> : <ChevronRight className="h-4 w-4 stroke-slate-600" aria-hidden />}
                            </button>
                          </TableCell>
                          <TableCell>
                            <button
                              type="button"
                              onClick={() => setOpenLead(open ? null : lead.id)}
                              className="text-left font-medium text-[#017e84] hover:underline"
                            >
                              {lead.name}
                            </button>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{lead.phone ?? "N/A"}</TableCell>
                          {agentId ? null : <TableCell>{lead.agentName}</TableCell>}
                          <TableCell>
                            <TimeCell iso={lead.assignedAt} />
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex rounded-sm border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-800">
                              {lead.assignmentStatus === "assigned" ? "Assigned" : "Unassigned"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{lead.inquiries.length}</TableCell>
                          <TableCell>
                            {lead.inquiries[0] ? (
                              <LatestInquiryStatus inquiry={lead.inquiries[0]} />
                            ) : (
                              <span className="text-slate-500">No inquiry yet</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <TimeCell iso={lead.lastActivityAt} />
                          </TableCell>
                        </TableRow>
                        {open ? (
                          <TableRow className="bg-slate-50 hover:bg-slate-50">
                            <TableCell colSpan={columns} className="p-3">
                              {lead.inquiries.length === 0 ? (
                                <p className="text-sm text-slate-600">No inquiry has been sent from this lead since it was assigned.</p>
                              ) : (
                                <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                                  <table className="w-full min-w-[1100px] text-left text-sm">
                                    <thead className="bg-slate-50">
                                      <tr className="border-b border-slate-200">
                                        {[
                                          "Inquiry no.",
                                          "Created",
                                          "Status now",
                                          INQUIRY_APPROVAL_STATUS_LABELS.sent,
                                          INQUIRY_APPROVAL_STATUS_LABELS.sent_to_admin,
                                          INQUIRY_APPROVAL_STATUS_LABELS.calculated_by_admin,
                                          INQUIRY_APPROVAL_STATUS_LABELS.approved,
                                          INQUIRY_APPROVAL_STATUS_LABELS.rejected,
                                          "Last updated",
                                          "",
                                        ].map((h, i) => (
                                          <th key={`${h}-${i}`} className="px-2.5 py-2 text-xs font-semibold text-primary-dark whitespace-nowrap">
                                            {h}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {lead.inquiries.map((q) => (
                                        <tr key={q.id} className="border-b border-slate-100 last:border-0">
                                          <td className="px-2.5 py-2 font-mono text-xs text-primary-dark whitespace-nowrap">{q.reference ?? q.id.slice(0, 8)}</td>
                                          <td className="px-2.5 py-2"><TimeCell iso={q.createdAt} /></td>
                                          <td className="px-2.5 py-2"><StatusBadge status={q.status} /></td>
                                          <td className="px-2.5 py-2"><TimeCell iso={q.sentToOperationsAt} /></td>
                                          <td className="px-2.5 py-2"><TimeCell iso={q.sentToAdminAt} /></td>
                                          <td className="px-2.5 py-2"><TimeCell iso={q.calculatedByAdminAt} /></td>
                                          <td className="px-2.5 py-2"><TimeCell iso={q.approvedAt} /></td>
                                          <td className="px-2.5 py-2"><TimeCell iso={q.rejectedAt} /></td>
                                          <td className="px-2.5 py-2"><TimeCell iso={q.updatedAt} /></td>
                                          <td className="px-2.5 py-2">
                                            <Button variant="outline" size="xs" onClick={() => setTimeline(q)}>
                                              <History className="h-3.5 w-3.5" aria-hidden />
                                              History
                                            </Button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {data.truncated ? (
              <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
                Showing the latest {data.leads.length.toLocaleString()} leads. Use the filters to narrow the list; the totals above count all of them.
              </p>
            ) : null}
          </section>
        </div>
      )}

      <TimelineDialog inquiry={timeline} onClose={() => setTimeline(null)} />
    </div>
  );
}
