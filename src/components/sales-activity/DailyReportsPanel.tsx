"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDailyReports, type AgentOption, type DailyReportRow, type DayStats } from "@/app/actions/sales-activity";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { karachiTodayYmd } from "@/lib/contact-date-range";
import { ActivityFilters, SetupNotice, dayOf, timeOf } from "@/components/sales-activity/activity-format";

const PREVIOUS_TASKS: Record<string, string> = { yes: "Completed", no: "Not completed", partial: "Some still pending" };

function Missing() {
  return (
    <span className="inline-flex whitespace-nowrap rounded-sm border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">
      Not submitted
    </span>
  );
}

const orNo = (value: string | null | undefined) => (value && value.trim() ? value : "No");

function Clip({ value }: { value: string }) {
  return (
    <span className="block max-w-[220px] truncate" title={value}>
      {value}
    </span>
  );
}

const STATS: Array<[keyof DayStats, string]> = [
  ["leadsAssigned", "Leads assigned"],
  ["inquiriesSent", "Inquiries sent"],
  ["contactsAdded", "Contacts added"],
  ["followUpsCompleted", "Follow-ups completed"],
  ["quotationsSent", "Quotations sent"],
];

export function ReportDialog({ row, onClose }: { row: DailyReportRow | null; onClose: () => void }) {
  const c = row?.checkIn;
  const e = row?.endOfDay;
  const item = (label: string, value: React.ReactNode) => (
    <div className="space-y-0.5">
      <dt className="text-xs font-semibold text-slate-600">{label}</dt>
      <dd className="whitespace-pre-wrap text-sm text-primary-dark">{value}</dd>
    </div>
  );
  return (
    <Dialog open={Boolean(row)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{row ? `${row.agentName} · ${dayOf(row.date)}` : "Report"}</DialogTitle>
          <DialogDescription>Submission times are recorded by the server, in Pakistan time.</DialogDescription>
        </DialogHeader>
        <section aria-label="Start Day" className="space-y-2">
          <h3 className="text-sm font-semibold text-primary-dark">Start Day</h3>
          {c ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              {item("Submitted", timeOf(c.submittedAt))}
              {item("Internet working", c.internetOk ? "Yes" : "No")}
              {item("Previous day's tasks", PREVIOUS_TASKS[c.previousTasks] ?? c.previousTasks)}
              {item("Problems or issues", c.issue ?? "No issues")}
            </dl>
          ) : (
            <Missing />
          )}
        </section>
        <section aria-label="End Day" className="space-y-2 border-t border-slate-200 pt-3">
          <h3 className="text-sm font-semibold text-primary-dark">End Day</h3>
          {e ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              {item("Submitted", `${timeOf(e.submittedAt)}${e.isLate ? " (after the deadline)" : ""}`)}
              {item("Completed work", e.completedWork)}
              {item("Pending tasks", orNo(e.pendingTasks))}
              {item("Problems faced", orNo(e.problems))}
              {item("Support needed from Admin", orNo(e.support))}
              {item("Plan for the next working day", e.nextDayPlan || "N/A")}
              <div className="sm:col-span-2">
                {item(
                  "Recorded by the system that day",
                  STATS.map(([key, label]) => `${label}: ${e.stats[key] ?? "N/A"}`).join(" · ")
                )}
              </div>
            </dl>
          ) : (
            <Missing />
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

export function DailyReportsPanel() {
  const { switchVersion } = useAdminOrganization();
  const today = karachiTodayYmd();
  const [filters, setFilters] = useState({ agentId: "", from: today, to: today });
  const [rows, setRows] = useState<DailyReportRow[] | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [retry, setRetry] = useState(0);
  const [open, setOpen] = useState<DailyReportRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDailyReports({ agentId: filters.agentId || null, from: filters.from, to: filters.to })
      .then((res) => {
        if (cancelled) return;
        if ("setupRequired" in res) setSetupRequired(true);
        else if ("error" in res) setError(res.error);
        else {
          setError(null);
          setRows(res.rows);
          setAgents(res.agents);
        }
      })
      .catch(() => !cancelled && setError("The request failed. Check your connection and try again."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filters, retry, switchVersion]);

  if (setupRequired) return <SetupNotice />;

  return (
    <div className="space-y-4">
      <ActivityFilters agents={agents} agentId={filters.agentId} from={filters.from} to={filters.to} onChange={setFilters} />
      <section aria-label="Daily reports" className="rounded-lg border border-slate-200 bg-white">
        <div className="px-3 pt-3">
          <h2 className="text-base font-semibold text-primary-dark">Start Day and End Day reports</h2>
          <p className="text-xs text-slate-600">One row per sales agent and day. Open a row to read the full report.</p>
        </div>
        {error ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-slate-600">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setRetry((n) => n + 1)}>Retry</Button>
          </div>
        ) : !rows ? (
          <div className="space-y-2 p-3 animate-pulse" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-9 rounded bg-slate-100" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-slate-600">No sales agents in this company.</p>
        ) : (
          <div className={`transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
            <Table className="mt-2 min-w-[1400px]">
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  {["Date", "Sales agent", "Start Day", "Internet", "Previous tasks", "Reported problems", "End Day", "Completed work", "Pending tasks", "Support required", "Next-day plan", ""].map((h, i) => (
                    <TableHead key={`${h}-${i}`} className="font-semibold text-primary-dark whitespace-nowrap">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const c = r.checkIn;
                  const e = r.endOfDay;
                  return (
                    <TableRow key={`${r.date}-${r.agentId}`}>
                      <TableCell className="whitespace-nowrap">{dayOf(r.date)}</TableCell>
                      <TableCell className="font-medium text-primary-dark">{r.agentName}</TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">{c ? timeOf(c.submittedAt) : <Missing />}</TableCell>
                      <TableCell>{c ? (c.internetOk ? "Working" : <span className="font-medium text-red-700">Not working</span>) : "N/A"}</TableCell>
                      <TableCell className="whitespace-nowrap">{c ? PREVIOUS_TASKS[c.previousTasks] ?? c.previousTasks : "N/A"}</TableCell>
                      <TableCell>{c ? <Clip value={[c.issue, e?.problems].filter(Boolean).join(" · ") || "No"} /> : e?.problems ? <Clip value={e.problems} /> : "N/A"}</TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">
                        {e ? (
                          <>
                            {timeOf(e.submittedAt)}
                            {e.isLate ? <span className="block text-xs text-amber-800">After deadline</span> : null}
                          </>
                        ) : (
                          <Missing />
                        )}
                      </TableCell>
                      <TableCell>{e ? <Clip value={e.completedWork} /> : "N/A"}</TableCell>
                      <TableCell>{e ? <Clip value={orNo(e.pendingTasks)} /> : "N/A"}</TableCell>
                      <TableCell>{e ? (e.support ? <span className="font-medium text-amber-800"><Clip value={e.support} /></span> : "No") : "N/A"}</TableCell>
                      <TableCell>{e ? <Clip value={e.nextDayPlan || "N/A"} /> : "N/A"}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="xs" onClick={() => setOpen(r)} disabled={!c && !e}>
                          <FileText className="h-3.5 w-3.5" aria-hidden />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      <ReportDialog row={open} onClose={() => setOpen(null)} />
    </div>
  );
}
