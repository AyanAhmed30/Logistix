"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AgentOption } from "@/app/actions/sales-activity";
import { karachiTodayYmd } from "@/lib/contact-date-range";

const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "numeric", minute: "2-digit", hour12: true });
const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", day: "2-digit", month: "short", year: "numeric" });

/** Time of day in Pakistan time, or N/A. */
export const timeOf = (iso: string | null) => (iso ? timeFormat.format(new Date(iso)) : "N/A");
/** A Pakistan date (YYYY-MM-DD) as "13 Nov 2026". */
export const dayOf = (ymd: string) => dayFormat.format(new Date(`${ymd}T12:00:00+05:00`));

export function SetupNotice() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-600">
      Sales activity needs its database update (<code>057_sales_agent_activity.sql</code>). Run it, then refresh.
    </div>
  );
}

/** Agent, from and to filters shared by the Activity Logs and Daily Reports tabs. */
export function ActivityFilters({
  agents,
  agentId,
  from,
  to,
  onChange,
}: {
  agents: AgentOption[];
  agentId: string;
  from: string;
  to: string;
  onChange: (next: { agentId: string; from: string; to: string }) => void;
}) {
  const today = karachiTodayYmd();
  return (
    <section aria-label="Filters" className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <Select value={agentId || "all"} onValueChange={(v) => onChange({ agentId: v === "all" ? "" : v, from, to })}>
        <SelectTrigger className="h-9 w-[210px] bg-white" aria-label="Sales agent">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All sales agents</SelectItem>
          {agents.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="ml-1 text-sm font-medium text-primary-dark">From</span>
      <Input type="date" aria-label="From date" className="h-9 w-[150px] bg-white" value={from} max={to} onChange={(e) => e.target.value && onChange({ agentId, from: e.target.value, to })} />
      <span className="text-sm font-medium text-primary-dark">to</span>
      <Input type="date" aria-label="To date" className="h-9 w-[150px] bg-white" value={to} min={from} max={today} onChange={(e) => e.target.value && onChange({ agentId, from, to: e.target.value })} />
      {from !== today || to !== today ? (
        <Button variant="ghost" size="sm" className="text-[#017e84] hover:text-[#016970]" onClick={() => onChange({ agentId, from: today, to: today })}>
          Today
        </Button>
      ) : null}
    </section>
  );
}
