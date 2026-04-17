import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type {
  SalesAgentOverviewDetail,
  SalesAgentOverviewInquiry,
  TimeBucket,
} from "@/app/actions/admin_sales_agent_overview";
import type { LeadActivityLog } from "@/app/actions/inquiries";
import type { InquiryLog } from "@/app/actions/inquiries";

function takeRecentBuckets(buckets: TimeBucket[], max: number) {
  if (buckets.length <= max) return buckets;
  return buckets.slice(-max);
}

function BucketBars({ title, buckets, emptyHint }: { title: string; buckets: TimeBucket[]; emptyHint: string }) {
  const max = Math.max(...buckets.map((b) => b.count), 1);
  if (buckets.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-slate-200 bg-slate-50/50 p-4 text-sm text-slate-500">
        {emptyHint}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
        {buckets.map((row) => (
          <div key={row.key} className="flex items-center gap-2 text-xs">
            <span className="w-[5.5rem] shrink-0 font-mono text-slate-600 tabular-nums">{row.key}</span>
            <div className="flex-1 h-5 bg-slate-100 rounded-sm overflow-hidden min-w-0">
              <div
                className="h-full bg-teal-600 rounded-sm transition-all"
                style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }}
              />
            </div>
            <span className="w-8 text-right tabular-nums text-slate-800 font-medium shrink-0">{row.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function inquiryIsApproved(inq: SalesAgentOverviewInquiry) {
  if (inq.approval_status === "approved") return true;
  return (inq.inquiry_confirmations || []).some((c) => c.status === "approved");
}

function inquiryIsRejected(inq: SalesAgentOverviewInquiry) {
  if (inq.approval_status === "rejected") return true;
  return (inq.inquiry_confirmations || []).some((c) => c.status === "rejected");
}

function inquirySent(inq: SalesAgentOverviewInquiry) {
  return !!(inq.sent_at || inq.sent_to_accounting || inq.sent_to_operations);
}

function inquiryStatusLabel(inq: SalesAgentOverviewInquiry) {
  if (inquiryIsApproved(inq)) return { label: "Approved", className: "bg-emerald-600 text-white border-0" };
  if (inquiryIsRejected(inq)) return { label: "Rejected", className: "bg-slate-600 text-white border-0" };
  if (inquirySent(inq)) return { label: "Pending", className: "bg-amber-500 text-white border-0" };
  return { label: "Draft", className: "bg-slate-400 text-white border-0" };
}

function formatJsonCell(obj: Record<string, unknown>) {
  const omit = new Set(["id", "name", "phone_number", "customer_id_formatted", "sales_agent_id", "lead_id", "converted_at", "created_at"]);
  const rest = Object.entries(obj).filter(([k]) => !omit.has(k));
  if (rest.length === 0) return "—";
  return (
    <pre className="text-[10px] leading-snug whitespace-pre-wrap break-all max-w-[240px] max-h-24 overflow-y-auto text-slate-600">
      {JSON.stringify(Object.fromEntries(rest), null, 0)}
    </pre>
  );
}

function ActivityLogTable({ logs }: { logs: LeadActivityLog[] }) {
  return (
    <div className="overflow-x-auto max-h-[420px] overflow-y-auto border border-slate-100 rounded-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs">When</TableHead>
            <TableHead className="text-xs">Action</TableHead>
            <TableHead className="text-xs">By</TableHead>
            <TableHead className="text-xs">Lead / Inquiry</TableHead>
            <TableHead className="text-xs">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="text-xs whitespace-nowrap align-top">
                {new Date(log.performed_at).toLocaleString()}
              </TableCell>
              <TableCell className="text-xs align-top">
                <Badge variant="outline" className="text-[10px] font-normal">
                  {log.action_label || log.action_type}
                </Badge>
              </TableCell>
              <TableCell className="text-xs align-top">{log.performed_by}</TableCell>
              <TableCell className="text-xs font-mono align-top">
                {log.inquiry_id ? (
                  <span className="block">inq {log.inquiry_id.slice(0, 8)}…</span>
                ) : null}
                <span className="text-slate-500">lead {log.lead_id.slice(0, 8)}…</span>
              </TableCell>
              <TableCell className="text-xs align-top max-w-md">
                <pre className="text-[10px] whitespace-pre-wrap break-all text-slate-600 max-h-24 overflow-y-auto">
                  {JSON.stringify(
                    {
                      metadata: log.metadata,
                      new_values: log.new_values,
                      previous_values: log.previous_values,
                    },
                    null,
                    0
                  )}
                </pre>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function InquiryLogTable({
  logs,
  inquiryIdToMeta,
}: {
  logs: InquiryLog[];
  inquiryIdToMeta: Record<string, { lead_id: string; product_name: string }>;
}) {
  return (
    <div className="overflow-x-auto max-h-[420px] overflow-y-auto border border-slate-100 rounded-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs">When</TableHead>
            <TableHead className="text-xs">Action</TableHead>
            <TableHead className="text-xs">By</TableHead>
            <TableHead className="text-xs">Inquiry</TableHead>
            <TableHead className="text-xs">Snapshot</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => {
            const meta = inquiryIdToMeta[log.inquiry_id];
            return (
              <TableRow key={log.id}>
                <TableCell className="text-xs whitespace-nowrap align-top">
                  {new Date(log.performed_at).toLocaleString()}
                </TableCell>
                <TableCell className="text-xs align-top">{log.action}</TableCell>
                <TableCell className="text-xs align-top">{log.performed_by}</TableCell>
                <TableCell className="text-xs align-top">
                  <div className="font-mono text-[10px] text-slate-600">{log.inquiry_id.slice(0, 8)}…</div>
                  <div className="text-slate-700">{meta?.product_name?.trim() || "—"}</div>
                </TableCell>
                <TableCell className="text-xs align-top max-w-md">
                  <pre className="text-[10px] whitespace-pre-wrap break-all text-slate-600 max-h-20 overflow-y-auto">
                    {JSON.stringify({ new_values: log.new_values, previous_values: log.previous_values })}
                  </pre>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "emerald" | "amber" | "slate";
}) {
  const border =
    tone === "emerald"
      ? "border-emerald-100 bg-emerald-50/40"
      : tone === "amber"
        ? "border-amber-100 bg-amber-50/40"
        : tone === "slate"
          ? "border-slate-200 bg-slate-50/60"
          : "border-slate-200 bg-white";
  return (
    <div className={`rounded-sm border p-4 ${border}`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold text-slate-900 tabular-nums mt-1">{value}</p>
      {hint ? <p className="text-[11px] text-slate-500 mt-1">{hint}</p> : null}
    </div>
  );
}

export function SalesAgentOverviewDetailView({ overview }: { overview: SalesAgentOverviewDetail }) {
  const { agent, summary, leads, customers, inquiries, leadBreakdown, activityLogs, inquiryLogs, inquiryIdToMeta } =
    overview;

  const dailyLeads = takeRecentBuckets(overview.dailyLeads, 90);
  const dailyInq = takeRecentBuckets(overview.dailyInquiriesSent, 90);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 min-w-0">
            <Button variant="ghost" size="sm" className="h-8 px-2 -ml-2 text-slate-600" asChild>
              <Link href="/admin/dashboard">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Admin dashboard
              </Link>
            </Button>
            <h1 className="text-xl font-semibold text-slate-900 truncate">{agent.name}</h1>
            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              {agent.username ? (
                <span>
                  Username: <span className="font-mono text-slate-800">@{agent.username}</span>
                </span>
              ) : null}
              {agent.email ? (
                <span>
                  Email: <span className="text-slate-800">{agent.email}</span>
                </span>
              ) : null}
              {agent.phone_number ? (
                <span>
                  Phone: <span className="text-slate-800">{agent.phone_number}</span>
                </span>
              ) : null}
              <span className="font-mono text-slate-500">ID {agent.id}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <section aria-labelledby="summary-heading" className="space-y-3">
          <h2 id="summary-heading" className="text-sm font-semibold text-slate-800 uppercase tracking-wide">
            Summary
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard label="Total leads" value={summary.total_leads} />
            <SummaryCard label="Customers converted" value={summary.total_customers_converted} tone="emerald" />
            <SummaryCard label="Total inquiries" value={summary.total_inquiries} />
            <SummaryCard label="Inquiries sent" value={summary.inquiries_sent} hint="Submitted to accounting / ops" />
            <SummaryCard label="Approved inquiries" value={summary.inquiries_approved} tone="emerald" />
            <SummaryCard
              label="Awaiting decision"
              value={summary.inquiries_pending}
              hint="Sent, not approved or rejected"
              tone="amber"
            />
            <SummaryCard label="Rejected inquiries" value={summary.inquiries_rejected} tone="slate" />
            <SummaryCard label="Draft inquiries" value={summary.inquiries_draft} hint="Not yet sent" />
          </div>
        </section>

        <section aria-labelledby="charts-heading" className="space-y-3">
          <h2 id="charts-heading" className="text-sm font-semibold text-slate-800 uppercase tracking-wide">
            Performance (time)
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="rounded-sm border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Leads created</CardTitle>
                <CardDescription>Daily (last {dailyLeads.length} days with activity) and monthly totals.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <BucketBars
                  title="Daily"
                  buckets={dailyLeads}
                  emptyHint="No leads yet for this agent."
                />
                <BucketBars
                  title="Monthly"
                  buckets={overview.monthlyLeads}
                  emptyHint="No monthly lead data."
                />
              </CardContent>
            </Card>
            <Card className="rounded-sm border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Inquiries sent</CardTitle>
                <CardDescription>
                  By send date (uses sent timestamp when present). Daily (last {dailyInq.length} buckets) and monthly.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <BucketBars
                  title="Daily"
                  buckets={dailyInq}
                  emptyHint="No sent inquiries yet."
                />
                <BucketBars
                  title="Monthly"
                  buckets={overview.monthlyInquiriesSent}
                  emptyHint="No monthly inquiry data."
                />
              </CardContent>
            </Card>
          </div>
        </section>

        <section aria-labelledby="breakdown-heading" className="space-y-3">
          <h2 id="breakdown-heading" className="text-sm font-semibold text-slate-800 uppercase tracking-wide">
            Leads → inquiries (breakdown)
          </h2>
          <Card className="rounded-sm border-slate-200 shadow-sm">
            <CardContent className="pt-6">
              {leadBreakdown.length === 0 ? (
                <p className="text-sm text-slate-500">No leads for this agent.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Lead</TableHead>
                        <TableHead>Lead ID</TableHead>
                        <TableHead>Pipeline status</TableHead>
                        <TableHead>Converted</TableHead>
                        <TableHead className="text-right">Inquiries</TableHead>
                        <TableHead className="text-right">Approved</TableHead>
                        <TableHead className="text-right">Pending*</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leadBreakdown.map((row) => (
                        <TableRow key={row.lead_id}>
                          <TableCell className="font-medium">{row.lead_name}</TableCell>
                          <TableCell className="font-mono text-xs">{row.lead_id_formatted || row.lead_id.slice(0, 8)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-normal">
                              {row.lead_status}
                            </Badge>
                          </TableCell>
                          <TableCell>{row.lead_converted ? "Yes" : "No"}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.inquiry_count}</TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-700">{row.approved_count}</TableCell>
                          <TableCell className="text-right tabular-nums text-amber-700">{row.pending_count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <p className="text-[11px] text-slate-500 mt-3">
                *Pending = all inquiries not yet approved (includes drafts, in review, and rejected).
              </p>
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="leads-heading" className="space-y-3">
          <h2 id="leads-heading" className="text-sm font-semibold text-slate-800 uppercase tracking-wide">
            All leads
          </h2>
          <Card className="rounded-sm border-slate-200 shadow-sm">
            <CardContent className="pt-6">
              {leads.length === 0 ? (
                <p className="text-sm text-slate-500">No leads.</p>
              ) : (
                <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs">Formatted ID</TableHead>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">Phone</TableHead>
                        <TableHead className="text-xs">Source</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Converted</TableHead>
                        <TableHead className="text-xs">Created</TableHead>
                        <TableHead className="text-xs">UUID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leads.map((lead) => (
                        <TableRow key={lead.id}>
                          <TableCell className="font-mono text-xs">{lead.lead_id_formatted || "—"}</TableCell>
                          <TableCell className="text-sm font-medium">{lead.name}</TableCell>
                          <TableCell className="text-xs">{lead.number}</TableCell>
                          <TableCell className="text-xs">{lead.source}</TableCell>
                          <TableCell className="text-xs">{lead.status}</TableCell>
                          <TableCell className="text-xs">{lead.converted ? "Yes" : "No"}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {new Date(lead.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell className="font-mono text-[10px] text-slate-500">{lead.id}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="inquiries-heading" className="space-y-3">
          <h2 id="inquiries-heading" className="text-sm font-semibold text-slate-800 uppercase tracking-wide">
            All inquiries
          </h2>
          <Card className="rounded-sm border-slate-200 shadow-sm">
            <CardContent className="pt-6">
              {inquiries.length === 0 ? (
                <p className="text-sm text-slate-500">No inquiries.</p>
              ) : (
                <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs">Product</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Workflow</TableHead>
                        <TableHead className="text-xs">Sent at</TableHead>
                        <TableHead className="text-xs">Approved</TableHead>
                        <TableHead className="text-xs">Lead ID</TableHead>
                        <TableHead className="text-xs">Inquiry UUID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inquiries.map((inq) => {
                        const st = inquiryStatusLabel(inq);
                        return (
                          <TableRow key={inq.id}>
                            <TableCell className="text-sm max-w-[200px]">
                              {inq.product_name?.trim() || "—"}
                              {inq.description?.trim() ? (
                                <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">{inq.description}</p>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-[10px] ${st.className}`}>{st.label}</Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              <span className="block">pipe: {inq.status}</span>
                              <span className="text-slate-500">
                                acc {inq.sent_to_accounting ? "Y" : "N"} · ops {inq.sent_to_operations ? "Y" : "N"}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {inq.sent_at ? new Date(inq.sent_at).toLocaleString() : "—"}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {inq.approved_at ? new Date(inq.approved_at).toLocaleString() : "—"}
                            </TableCell>
                            <TableCell className="font-mono text-[10px]">{inq.lead_id.slice(0, 8)}…</TableCell>
                            <TableCell className="font-mono text-[10px] text-slate-500">{inq.id}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="customers-heading" className="space-y-3">
          <h2 id="customers-heading" className="text-sm font-semibold text-slate-800 uppercase tracking-wide">
            Customers
          </h2>
          <Card className="rounded-sm border-slate-200 shadow-sm">
            <CardContent className="pt-6">
              {customers.length === 0 ? (
                <p className="text-sm text-slate-500">No converted customers.</p>
              ) : (
                <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs">Customer #</TableHead>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">Phone</TableHead>
                        <TableHead className="text-xs">Lead ID</TableHead>
                        <TableHead className="text-xs">Converted</TableHead>
                        <TableHead className="text-xs">Extra fields</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customers.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-mono text-xs">{c.customer_id_formatted}</TableCell>
                          <TableCell className="text-sm font-medium">{c.name}</TableCell>
                          <TableCell className="text-xs">{c.phone_number}</TableCell>
                          <TableCell className="font-mono text-[10px]">{c.lead_id || "—"}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {c.converted_at ? new Date(c.converted_at).toLocaleString() : "—"}
                          </TableCell>
                          <TableCell className="align-top">{formatJsonCell(c as Record<string, unknown>)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="activity-heading" className="space-y-3">
          <h2 id="activity-heading" className="text-sm font-semibold text-slate-800 uppercase tracking-wide">
            Lead activity log
          </h2>
          <Card className="rounded-sm border-slate-200 shadow-sm">
            <CardContent className="pt-6">
              {activityLogs.length === 0 ? (
                <p className="text-sm text-slate-500">No activity entries.</p>
              ) : (
                <ActivityLogTable logs={activityLogs} />
              )}
              {activityLogs.length >= 4000 ? (
                <p className="text-[11px] text-amber-700 mt-2">Showing the most recent 4,000 entries.</p>
              ) : null}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="inqlog-heading" className="space-y-3">
          <h2 id="inqlog-heading" className="text-sm font-semibold text-slate-800 uppercase tracking-wide">
            Inquiry change log
          </h2>
          <Card className="rounded-sm border-slate-200 shadow-sm">
            <CardContent className="pt-6">
              {inquiryLogs.length === 0 ? (
                <p className="text-sm text-slate-500">No inquiry log entries.</p>
              ) : (
                <InquiryLogTable logs={inquiryLogs} inquiryIdToMeta={inquiryIdToMeta} />
              )}
              {inquiryLogs.length >= 4000 ? (
                <p className="text-[11px] text-amber-700 mt-2">Showing the most recent 4,000 entries.</p>
              ) : null}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
