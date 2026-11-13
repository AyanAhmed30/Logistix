"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, FileText, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getAgentDayDetail,
  type ActivityDayRow,
  type AgentDayDetail,
  type DayTimelineKind,
} from "@/app/actions/sales-activity";
import { formatDuration } from "@/lib/analytics/format-duration";
import { LatestInquiryStatus, StatusBadge, TimeCell } from "@/components/admin/lead-distribution/DistributionTrackingPanel";
import { ReportDialog } from "@/components/sales-activity/DailyReportsPanel";
import { WorkLogList } from "@/components/sales-activity/WorkLogList";
import { SetupNotice, dayOf, timeOf } from "@/components/sales-activity/activity-format";

const duration = (seconds: number) => (seconds === 0 ? "0 minutes" : formatDuration(seconds));

// Dot colour per kind of entry; the title always says what happened.
const KIND_DOT: Record<DayTimelineKind, string> = {
  login: "bg-[#017e84]",
  active: "bg-[#017e84]",
  inactive: "bg-amber-500",
  logout: "bg-slate-500",
  expired: "bg-red-600",
  work_log: "bg-[#073D51]",
  start_day: "bg-emerald-600",
  end_day: "bg-emerald-600",
  lead_assigned: "bg-[#b4530a]",
  inquiry_sent: "bg-sky-600",
  inquiry_to_admin: "bg-sky-600",
  inquiry_calculated: "bg-violet-600",
  inquiry_approved: "bg-emerald-600",
  inquiry_rejected: "bg-red-600",
};

function Section({ title, note, children, action }: { title: string; note?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-2 px-3 pt-3">
        <div>
          <h3 className="text-base font-semibold text-primary-dark">{title}</h3>
          {note ? <p className="text-xs text-slate-600">{note}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-4 text-center text-sm text-slate-600">{children}</p>;
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-primary-dark">{value}</dd>
    </div>
  );
}

const END_REASON: Record<string, string> = {
  logout: "Logged out",
  inactivity: "Automatic (25 minutes inactive)",
};

export function ActivityDayDetail({ row, onBack }: { row: ActivityDayRow; onBack: () => void }) {
  const [detail, setDetail] = useState<AgentDayDetail | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getAgentDayDetail(row.agentId, row.date)
      .then((res) => {
        if (cancelled) return;
        if ("setupRequired" in res) setSetupRequired(true);
        else if ("error" in res) setError(res.error);
        else setDetail(res);
      })
      .catch(() => !cancelled && setError("The request failed. Check your connection and try again."));
    return () => {
      cancelled = true;
    };
  }, [row.agentId, row.date, retry]);

  const header = (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Activity Logs
      </Button>
      <h2 className="text-base sm:text-lg font-semibold text-primary-dark">
        {row.agentName} · {dayOf(row.date)}
      </h2>
    </div>
  );

  if (setupRequired) return <div className="space-y-4">{header}<SetupNotice /></div>;
  if (error) {
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center">
          <p className="text-sm text-slate-600">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setRetry((n) => n + 1)}>Retry</Button>
        </div>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="space-y-4">
        {header}
        <div className="space-y-3 animate-pulse" aria-busy="true" aria-label="Loading the day">
          <div className="h-24 rounded-lg bg-slate-100" />
          <div className="h-64 rounded-lg bg-slate-100" />
        </div>
      </div>
    );
  }

  const s = detail.summary;
  const report = detail.report;

  return (
    <div className="space-y-4">
      {header}

      {/* A. Daily session information */}
      <Section
        title="Day summary"
        note="Recorded by the server, in Pakistan time."
        action={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setReportOpen(true)} disabled={!report?.checkIn && !report?.endOfDay}>
            <FileText className="h-4 w-4" aria-hidden />
            Start Day and End Day report
          </Button>
        }
      >
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          <Fact label="First login" value={timeOf(s.firstLogin)} />
          <Fact label="Last logout / expiry" value={s.openSessions ? "Still signed in" : timeOf(s.lastEnd)} />
          <Fact label="Total active time" value={duration(s.activeSeconds)} />
          <Fact label="Inactive time" value={duration(s.inactiveSeconds)} />
          <Fact label="Login sessions" value={s.sessions} />
          <Fact label="Manual logouts" value={s.manualLogouts} />
          <Fact label="Automatic logouts" value={s.autoLogouts} />
          <Fact label="Work logs" value={detail.workLogs ? detail.workLogs.length : "N/A"} />
          <Fact label="Start Day" value={report?.checkIn ? timeOf(report.checkIn.submittedAt) : <span className="text-red-700">Not submitted</span>} />
          <Fact label="End Day" value={report?.endOfDay ? timeOf(report.endOfDay.submittedAt) : <span className="text-red-700">Not submitted</span>} />
        </dl>
      </Section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <div className="min-w-0 space-y-4">
          {/* B. Manual work logs */}
          <Section title="Work logs" note="Entries the agent saved on the Logs page.">
            {detail.workLogs === null ? (
              <Empty>Work logs need their database update (058_sales_agent_work_logs.sql).</Empty>
            ) : detail.workLogs.length === 0 ? (
              <Empty>No work logs saved on this day.</Empty>
            ) : (
              <WorkLogList logs={detail.workLogs} />
            )}
          </Section>

          {/* A. Sessions */}
          <Section title="Login sessions">
            {detail.sessions.length === 0 ? (
              <Empty>No tracked login on this day.</Empty>
            ) : (
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    {["Logged in", "Last activity", "Ended", "How it ended", "Active time"].map((h, i) => (
                      <TableHead key={h} className={`font-semibold text-primary-dark whitespace-nowrap ${i === 4 ? "text-right" : ""}`}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.sessions.map((x) => (
                    <TableRow key={x.id}>
                      <TableCell className="tabular-nums">{timeOf(x.startedAt)}</TableCell>
                      <TableCell className="tabular-nums">{timeOf(x.lastActivityAt)}</TableCell>
                      <TableCell className="tabular-nums">{x.endedAt ? timeOf(x.endedAt) : "N/A"}</TableCell>
                      <TableCell>{x.endReason ? END_REASON[x.endReason] : <span className="text-emerald-800">Still signed in</span>}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{duration(x.activeSeconds)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Section>
        </div>

        {/* E. Complete daily timeline */}
        <Section title="Timeline" note="Everything recorded on this day, in time order.">
          {detail.timeline.length === 0 ? (
            <Empty>Nothing was recorded on this day.</Empty>
          ) : (
            <ol className="max-h-[640px] overflow-y-auto pr-1">
              {detail.timeline.map((item, i) => (
                <li key={`${item.at}-${i}`} className="relative flex gap-3 pb-3 last:pb-0">
                  <span className="w-[68px] shrink-0 pt-0.5 text-right text-xs tabular-nums text-slate-600">{timeOf(item.at)}</span>
                  <span className="relative flex w-3 shrink-0 justify-center" aria-hidden>
                    <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${KIND_DOT[item.kind]}`} />
                    {i < detail.timeline.length - 1 ? <span className="absolute top-4 bottom-[-12px] w-px bg-slate-200" /> : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-primary-dark">{item.title}</p>
                    {item.detail ? <p className="line-clamp-2 break-words text-xs text-slate-600" title={item.detail}>{item.detail}</p> : null}
                    {item.attachments ? (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-600">
                        <Paperclip className="h-3.5 w-3.5 stroke-slate-600" aria-hidden />
                        {item.attachments} {item.attachments === 1 ? "attachment" : "attachments"}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>

      {/* C + D. Leads assigned that day and their inquiries */}
      <Section title="Leads assigned on this day" note="Each lead with the inquiries sent from it after the assignment. Statuses are current.">
        {detail.leads === null ? (
          <Empty>Select a company in the header to see the leads assigned on this day.</Empty>
        ) : detail.leads.length === 0 ? (
          <Empty>No leads were assigned to this agent on this day.</Empty>
        ) : (
          <Table className="min-w-[1000px]">
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                {["Lead / customer", "Phone", "Assigned", "Lead status", "Inquiries sent", "Latest inquiry status", "Last activity"].map((h, i) => (
                  <TableHead key={h} className={`font-semibold text-primary-dark whitespace-nowrap ${i === 4 ? "text-right" : ""}`}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.leads.map((lead) => (
                <Fragment key={lead.id}>
                  <TableRow>
                    <TableCell className="font-medium text-primary-dark">{lead.name || "Unnamed"}</TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">{lead.phone || "N/A"}</TableCell>
                    <TableCell><TimeCell iso={lead.assignedAt} /></TableCell>
                    <TableCell>{lead.leadStatus ?? "N/A"}</TableCell>
                    <TableCell className="text-right tabular-nums">{lead.inquiries.length}</TableCell>
                    <TableCell>{lead.inquiries[0] ? <LatestInquiryStatus inquiry={lead.inquiries[0]} /> : <span className="text-slate-600">No inquiry yet</span>}</TableCell>
                    <TableCell><TimeCell iso={lead.lastActivityAt} /></TableCell>
                  </TableRow>
                  {lead.inquiries.length ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="bg-slate-50/60 py-2 pl-6">
                        <table className="w-full text-xs">
                          <caption className="sr-only">Inquiries of {lead.name}</caption>
                          <thead>
                            <tr className="text-left text-slate-600">
                              {["Inquiry", "Created", "Status", "Sent to Operations", "Calculated by Admin", "Approved / rejected"].map((h) => (
                                <th key={h} scope="col" className="py-1 pr-4 font-semibold whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {lead.inquiries.map((q) => (
                              <tr key={q.id} className="border-t border-slate-200">
                                <td className="py-1.5 pr-4 font-medium text-primary-dark whitespace-nowrap">{q.reference ?? "No number"}</td>
                                <td className="py-1.5 pr-4"><TimeCell iso={q.createdAt} /></td>
                                <td className="py-1.5 pr-4"><StatusBadge status={q.status} /></td>
                                <td className="py-1.5 pr-4"><TimeCell iso={q.sentToOperationsAt} /></td>
                                <td className="py-1.5 pr-4"><TimeCell iso={q.calculatedByAdminAt} /></td>
                                <td className="py-1.5 pr-4">
                                  {q.approvedAt ? (
                                    <span className="whitespace-nowrap">Approved · <TimeCell iso={q.approvedAt} /></span>
                                  ) : q.rejectedAt ? (
                                    <span className="whitespace-nowrap">Rejected · <TimeCell iso={q.rejectedAt} /></span>
                                  ) : (
                                    <span className="text-slate-600">Not decided yet</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <ReportDialog row={reportOpen ? report : null} onClose={() => setReportOpen(false)} />
    </div>
  );
}
