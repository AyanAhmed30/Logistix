"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getActivityLogs, type ActivityDayRow, type AgentOption } from "@/app/actions/sales-activity";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { formatDuration } from "@/lib/analytics/format-duration";
import { karachiTodayYmd } from "@/lib/contact-date-range";
import { ActivityDayDetail } from "@/components/sales-activity/ActivityDayDetail";
import { ActivityFilters, SetupNotice, dayOf, timeOf } from "@/components/sales-activity/activity-format";

const duration = (seconds: number) => (seconds === 0 ? "0 minutes" : formatDuration(seconds));

export function ActivityLogsPanel() {
  const { switchVersion } = useAdminOrganization();
  const today = karachiTodayYmd();
  const [filters, setFilters] = useState({ agentId: "", from: today, to: today });
  const [rows, setRows] = useState<ActivityDayRow[] | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<ActivityDayRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getActivityLogs({ agentId: filters.agentId || null, from: filters.from, to: filters.to })
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
  if (selected) return <ActivityDayDetail row={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="space-y-4">
      <ActivityFilters agents={agents} agentId={filters.agentId} from={filters.from} to={filters.to} onChange={setFilters} />
      <section aria-label="Activity" className="rounded-lg border border-slate-200 bg-white">
        <div className="px-3 pt-3">
          <h2 className="text-base font-semibold text-primary-dark">Activity by day</h2>
          <p className="text-xs text-slate-600">
            Logins and logouts are recorded automatically; work logs are what the agent saved on the Logs page; leads assigned come from Lead Distribution. Active
            time counts only time spent using Logistix in a visible tab, and a session ends after 25 minutes without
            activity. Open a row to see everything from that day.
          </p>
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
          <p className="px-3 py-10 text-center text-sm text-slate-600">No sales agent activity in this period.</p>
        ) : (
          <div className={`transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
            <Table className="mt-2 min-w-[1300px]">
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  {["Date", "Sales agent", "First login", "Last activity", "Total active time", "Inactive time", "Login sessions", "Auto logouts", "Manual logouts", "Work logs", "Leads assigned", "Last logout / expiry", ""].map((h, i) => (
                    <TableHead key={`${h}-${i}`} className={`font-semibold text-primary-dark whitespace-nowrap ${i >= 4 && i <= 10 ? "text-right" : ""}`}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.date}-${r.agentId}`} className="cursor-pointer" onClick={() => setSelected(r)}>
                    <TableCell className="whitespace-nowrap">{dayOf(r.date)}</TableCell>
                    <TableCell className="font-medium text-primary-dark">{r.agentName}</TableCell>
                    <TableCell className="tabular-nums">{r.firstLogin ? timeOf(r.firstLogin) : <span className="text-slate-600">Not tracked</span>}</TableCell>
                    <TableCell className="tabular-nums">{timeOf(r.lastActivity)}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{duration(r.activeSeconds)}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{duration(r.inactiveSeconds)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.sessions}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.autoLogouts}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.manualLogouts}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {r.workLogs}
                      {r.workLogsWithFiles ? (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-slate-600" title={`${r.workLogsWithFiles} with attachments`}>
                          <Paperclip className="h-3.5 w-3.5 stroke-slate-600" aria-hidden />
                          <span className="sr-only">with attachments:</span>
                          {r.workLogsWithFiles}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.leadsAssigned}</TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">
                      {r.openSessions ? <span className="text-emerald-800">Still signed in</span> : timeOf(r.lastEnd)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(r);
                        }}
                        aria-label={`Open ${r.agentName}, ${dayOf(r.date)}`}
                      >
                        Details
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
