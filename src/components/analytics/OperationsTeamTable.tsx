"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { OperationsTeamRow } from "@/app/actions/analytics/operations";
import { formatDuration } from "@/lib/analytics/format-duration";
import { Panel, useLoad } from "@/components/analytics/AnalyticsDashboardKit";
import { AnalyticsEmpty, AnalyticsError, AnalyticsLoading } from "@/components/analytics/AnalyticsParts";

const percent = (approved: number, rejected: number) =>
  approved + rejected ? `${Math.round((approved / (approved + rejected)) * 100)}%` : "—";

function Count({ value }: { value: number }) {
  return value === 0 ? <span className="text-slate-500">0</span> : <>{value.toLocaleString()}</>;
}

/** One row per Operations person: what they handled in the period and how fast. */
export function OperationsTeamTable({
  state,
  personHref,
}: {
  state: ReturnType<typeof useLoad<{ rows: OperationsTeamRow[] }>>;
  personHref: (id: string) => string;
}) {
  const { data, error, loading, onRetry } = state;

  const rows = useMemo(
    () =>
      [...(data?.rows ?? [])].sort(
        (a, b) => b.metrics.inquiries_processed - a.metrics.inquiries_processed || a.name.localeCompare(b.name)
      ),
    [data]
  );
  const total = rows.reduce(
    (sum, row) => ({
      processed: sum.processed + row.metrics.inquiries_processed,
      submissions: sum.submissions + row.metrics.submissions,
      approved: sum.approved + row.metrics.approved,
      rejected: sum.rejected + row.metrics.rejected,
      flags: sum.flags + row.metrics.flags_raised,
    }),
    { processed: 0, submissions: 0, approved: 0, rejected: 0, flags: 0 }
  );

  return (
    <Panel
      title="Operations team performance"
      description="Work each person sent to Admin in the period. Pending inquiries are a shared queue, so they aren't credited to anyone. Click a name to open their dashboard."
    >
      {error ? (
        <AnalyticsError message={error} onRetry={onRetry} />
      ) : !data ? (
        <div className="p-3">
          <AnalyticsLoading label="Loading team performance" />
        </div>
      ) : rows.length === 0 ? (
        <AnalyticsEmpty title="No Operations employees found" />
      ) : (
        <div className={`transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <Table className="min-w-[820px]">
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="sticky left-0 z-10 bg-slate-50 font-semibold text-primary-dark">Operations user</TableHead>
                <TableHead className="text-right font-semibold text-primary-dark">Inquiries handled</TableHead>
                <TableHead className="text-right font-semibold text-primary-dark" title="Includes resubmissions after a rejection">
                  Submissions to Admin
                </TableHead>
                <TableHead className="text-right font-semibold text-primary-dark">Approved</TableHead>
                <TableHead className="text-right font-semibold text-primary-dark">Rejected</TableHead>
                <TableHead className="text-right font-semibold text-primary-dark">Approval rate</TableHead>
                <TableHead className="text-right font-semibold text-primary-dark">Flags raised</TableHead>
                <TableHead className="text-right font-semibold text-primary-dark">Avg handling time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const m = row.metrics;
                const idle = m.inquiries_processed === 0 && m.flags_raised === 0;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="sticky left-0 z-10 bg-white">
                      <Link href={personHref(row.id)} className="font-medium text-[#017e84] hover:underline">
                        {row.name}
                      </Link>
                      {idle ? <span className="block text-xs text-slate-600">No work recorded in this period</span> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums"><Count value={m.inquiries_processed} /></TableCell>
                    <TableCell className="text-right tabular-nums"><Count value={m.submissions} /></TableCell>
                    <TableCell className="text-right tabular-nums"><Count value={m.approved} /></TableCell>
                    <TableCell className="text-right tabular-nums"><Count value={m.rejected} /></TableCell>
                    <TableCell className="text-right tabular-nums">{percent(m.approved, m.rejected)}</TableCell>
                    <TableCell className="text-right tabular-nums"><Count value={m.flags_raised} /></TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{formatDuration(m.avg_operations_seconds)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableCell className="sticky left-0 z-10 bg-slate-50 font-semibold text-primary-dark">Team total</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{total.processed.toLocaleString()}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{total.submissions.toLocaleString()}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{total.approved.toLocaleString()}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{total.rejected.toLocaleString()}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{percent(total.approved, total.rejected)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{total.flags.toLocaleString()}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </Panel>
  );
}
