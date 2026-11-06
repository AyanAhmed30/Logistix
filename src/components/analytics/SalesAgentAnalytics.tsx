"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { TableCell, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  getAgentContacts,
  getAgentInquiries,
  getAgentTimeline,
  getContactInquiryHistory,
  getSalesAgentDetail,
  type AgentContactRow,
  type AgentInquiryRow,
  type AnalyticsPeriod,
  type CrmPipelineStageCount,
  type TimelineItem,
} from "@/app/actions/analytics/sales";
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
  AnalyticsEmpty,
  AnalyticsError,
  AnalyticsLoading,
  KpiCards,
  StatusBadge,
  formatDate,
  formatDateTime,
} from "@/components/analytics/AnalyticsParts";
import { AnalyticsInquiryDetail } from "@/components/analytics/AnalyticsInquiryDetail";
import { AnalyticsTrendChart } from "@/components/analytics/AnalyticsTrendChart";

type Detail = Exclude<Awaited<ReturnType<typeof getSalesAgentDetail>>, { error: string }>;
type Section = "contacts" | "inquiries";

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: "contacts", label: "Contacts" },
  { id: "inquiries", label: "Inquiries" },
];

const INQUIRY_STATUSES: Record<string, string> = {
  draft: "Draft",
  sent: "With Operations",
  sent_to_admin: "With Admin",
  calculated_by_admin: "Admin calculated",
  approved: "Approved",
  rejected: "Rejected",
};

// Teal deepens through open stages; won and lost use their semantic colours.
const STAGE_RAMP = [
  { fill: "bg-[#cfe9eb]", text: "text-[#073D51]" },
  { fill: "bg-[#a6d8dc]", text: "text-[#073D51]" },
  { fill: "bg-[#7cc4c9]", text: "text-[#073D51]" },
  { fill: "bg-[#017e84]", text: "text-white" },
  { fill: "bg-[#016970]", text: "text-white" },
];

function toPipelineStage(stage: CrmPipelineStageCount, index: number): PipelineStage {
  const colours = stage.isWon
    ? { fill: "bg-emerald-700", text: "text-white" }
    : stage.isLost
      ? { fill: "bg-red-700", text: "text-white" }
      : STAGE_RAMP[Math.min(index, STAGE_RAMP.length - 1)];
  return { id: stage.name, label: stage.name, count: stage.count, ...colours };
}

const linkClass = "font-medium text-[#017e84] hover:underline";
const selectClass = "h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-primary-dark";

function ContactsSection({
  agentId,
  period,
  search,
  onOpen,
}: {
  agentId: string;
  period: AnalyticsPeriod;
  search: string;
  onOpen: (contact: AgentContactRow) => void;
}) {
  const [inPeriod, setInPeriod] = useState(false);
  const state = usePaged<AgentContactRow>(
    (page) => getAgentContacts(agentId, { page, search, period: inPeriod ? period : null }),
    `${agentId}|${search}|${inPeriod ? `${period.from}|${period.to}` : "all"}`
  );
  return (
    <>
      <label className="flex items-center gap-1.5 px-3 py-2 text-sm text-primary-dark">
        <input type="checkbox" checked={inPeriod} onChange={(e) => setInPeriod(e.target.checked)} />
        Only contacts added in this period
      </label>
      <PagedTable
        state={state}
        headers={[
          { label: "Contact" },
          { label: "Phone and email" },
          { label: "Inquiries", right: true },
          { label: "Approved", right: true },
          { label: "Rejected", right: true },
          { label: "Pending", right: true },
          { label: "Last inquiry" },
          { label: "Latest status" },
        ]}
        emptyTitle={search || inPeriod ? "No contacts match these filters" : "No contacts yet"}
        renderRow={(row) => (
          <TableRow key={row.id}>
            <TableCell>
              <button type="button" onClick={() => onOpen(row)} className={`${linkClass} text-left`}>
                {row.name || "Unnamed"}
              </button>
              <span className="block text-xs text-slate-600">
                {[row.customerId ? `#${row.customerId}` : null, row.company].filter(Boolean).join(", ")}
              </span>
            </TableCell>
            <TableCell>
              <span className="block whitespace-nowrap">{row.phone ?? "—"}</span>
              {row.email ? <span className="block text-xs text-slate-600">{row.email}</span> : null}
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.totalInquiries}</TableCell>
            <TableCell className="text-right tabular-nums">{row.approved}</TableCell>
            <TableCell className="text-right tabular-nums">{row.rejected}</TableCell>
            <TableCell className="text-right tabular-nums">{row.pending}</TableCell>
            <TableCell className="whitespace-nowrap">{formatDate(row.lastInquiryAt)}</TableCell>
            <TableCell>
              <StatusBadge status={row.latestStatus} />
            </TableCell>
          </TableRow>
        )}
      />
    </>
  );
}

function InquiriesSection({
  agentId,
  period,
  search,
  status,
  onStatus,
  onOpen,
}: {
  agentId: string;
  period: AnalyticsPeriod;
  search: string;
  status: string | null;
  onStatus: (status: string | null) => void;
  onOpen: (inquiryId: string) => void;
}) {
  const state = usePaged<AgentInquiryRow>(
    (page) => getAgentInquiries(agentId, { page, period, status, search }),
    `${agentId}|${period.from}|${period.to}|${status}|${search}`
  );
  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2">
        <label htmlFor="inquiry-status" className="text-sm text-primary-dark">
          Status
        </label>
        <select
          id="inquiry-status"
          className={selectClass}
          value={status ?? ""}
          onChange={(e) => onStatus(e.target.value || null)}
        >
          <option value="">All statuses</option>
          {Object.entries(INQUIRY_STATUSES).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <PagedTable
        state={state}
        headers={[
          { label: "Customer ID" },
          { label: "Customer name" },
          { label: "Inquiry submission" },
          { label: "Operation submission" },
          { label: "Admin approval / rejection" },
        ]}
        emptyTitle="No inquiries match these filters"
        renderRow={(row) => (
          <TableRow key={row.inquiryId}>
            <TableCell className="whitespace-nowrap">{row.customerId || "—"}</TableCell>
            <TableCell>
              {row.submittedAt ? (
                <button type="button" onClick={() => onOpen(row.inquiryId)} className={`${linkClass} text-left`}>
                  {row.customer || "Unnamed"}
                </button>
              ) : (
                <span>{row.customer || "Unnamed"}</span>
              )}
              {row.submittedAt ? null : <span className="block text-xs text-slate-600">Draft, not submitted yet</span>}
            </TableCell>
            <TableCell className="whitespace-nowrap">{formatDateTime(row.submittedAt)}</TableCell>
            <TableCell className="whitespace-nowrap">{formatDateTime(row.operationsSubmittedAt)}</TableCell>
            <TableCell className="whitespace-nowrap">
              {formatDateTime(row.decidedAt)}
              {row.decision ? (
                <span className="block mt-0.5">
                  <StatusBadge status={row.decision} />
                </span>
              ) : null}
            </TableCell>
          </TableRow>
        )}
      />
    </>
  );
}

function ContactHistorySheet({
  agentId,
  contact,
  onClose,
  onOpenInquiry,
}: {
  agentId: string;
  contact: AgentContactRow;
  onClose: () => void;
  onOpenInquiry: (inquiryId: string) => void;
}) {
  const { data, error, onRetry } = useLoad<{ rows: AgentInquiryRow[] }>(
    () => getContactInquiryHistory(agentId, contact.id),
    contact.id
  );
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{contact.name || "Unnamed"}</SheetTitle>
          <SheetDescription>
            {contact.totalInquiries} {contact.totalInquiries === 1 ? "inquiry" : "inquiries"}
            {contact.company ? ` from ${contact.company}` : ""}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4 space-y-3">
          <Link href={`/crm/customers/${contact.id}`} className={`${linkClass} text-sm`}>
            Open full contact record
          </Link>
          {error ? (
            <AnalyticsError message={error} onRetry={onRetry} />
          ) : !data ? (
            <AnalyticsLoading label="Loading inquiry history" />
          ) : data.rows.length === 0 ? (
            <AnalyticsEmpty title="No inquiries for this contact" />
          ) : (
            <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {data.rows.map((row) => (
                <li key={row.inquiryId} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    {row.submittedAt ? (
                      <button type="button" onClick={() => onOpenInquiry(row.inquiryId)} className={`${linkClass} text-sm`}>
                        {row.reference || row.inquiryId.slice(0, 8)}
                      </button>
                    ) : (
                      <span className="text-sm font-medium text-primary-dark">{row.reference || row.inquiryId.slice(0, 8)}</span>
                    )}
                    <StatusBadge status={row.approvalStatus} />
                  </div>
                  {row.product ? <p className="text-sm text-slate-600">{row.product}</p> : null}
                  <p className="text-xs text-slate-600">
                    Submitted {formatDateTime(row.submittedAt)}
                    {row.turnaroundSeconds !== null ? `, total time ${formatDuration(row.turnaroundSeconds)}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function SalesAgentAnalytics({
  agentId,
  selfView = false,
}: {
  agentId: string;
  selfView?: boolean;
}) {
  const { switchVersion } = useAdminOrganization();
  const { range, rangeError, query } = useAnalyticsRange();
  const [search, setSearch] = useState("");
  const needle = useDebouncedValue(search, 280);
  const [section, setSection] = useState<Section>("contacts");
  const [stage, setStage] = useState<string | null>(null);
  const [openContact, setOpenContact] = useState<AgentContactRow | null>(null);
  const [openInquiry, setOpenInquiry] = useState<string | null>(null);
  const tablesRef = useRef<HTMLDivElement>(null);

  const from = range?.from ?? "";
  const to = range?.to ?? "";
  const period = { from, to };
  const periodKey = `${agentId}|${from}|${to}|${switchVersion}`;

  const { data, error, loading, onRetry } = useLoad<Detail>(
    () => (from ? getSalesAgentDetail(agentId, period) : Promise.resolve({ error: rangeError ?? "Choose a period." })),
    periodKey
  );
  const timeline = useLoad<{ items: TimelineItem[]; truncated: boolean }>(
    () => (from ? getAgentTimeline(agentId, period) : Promise.resolve({ error: rangeError ?? "Choose a period." })),
    periodKey
  );

  const selectStage = (id: string | null) => {
    setStage(id);
    if (id) {
      setSection("inquiries");
      tablesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const m = data?.metrics;
  const stages = (data?.pipeline ?? []).map(toPipelineStage);

  if (openInquiry) {
    return (
      <AnalyticsInquiryDetail
        inquiryId={openInquiry}
        backLabel="Inquiries"
        onBack={() => {
          setOpenInquiry(null);
          setSection("inquiries");
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <DashboardHeader
        backHref={selfView ? undefined : `/analytics/sales${query ? `?${query}` : ""}`}
        backLabel="Sales"
        name={selfView ? "My performance" : data?.agent.name ?? "Sales agent"}
        title="Sales analytics"
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search contact or inquiry"
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
                label: "Total contacts",
                value: m.total_contacts,
                note: `${m.new_contacts.toLocaleString()} added in period`,
                onClick: () => setSection("contacts"),
              },
              {
                label: "Inquiries sent",
                value: m.inquiries_submitted,
                tone: "brand",
                onClick: () => {
                  setStage(null);
                  setSection("inquiries");
                },
              },
              { label: "Approved", value: m.inquiries_approved, tone: "success", onClick: () => selectStage("approved") },
              { label: "Under processing", value: m.inquiries_pending, tone: "warning", note: "Right now", onClick: () => setSection("inquiries") },
              { label: "Rejected", value: m.inquiries_rejected, tone: "danger", onClick: () => selectStage("rejected") },
            ]}
          />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="min-w-0 space-y-4 xl:col-span-8">
              <Panel title="Inquiry pipeline" description="Opportunities in each CRM stage right now">
                {stages.length ? (
                  <PipelineRow stages={stages} />
                ) : (
                  <AnalyticsEmpty title="No CRM pipeline stages found" />
                )}
              </Panel>
              <div ref={tablesRef} className="scroll-mt-16 rounded-lg border border-slate-200 bg-white">
                <SectionTabs tabs={SECTIONS} active={section} onChange={setSection} label="Records" />
                {section === "contacts" ? (
                  <ContactsSection agentId={agentId} period={period} search={needle} onOpen={setOpenContact} />
                ) : (
                  <InquiriesSection agentId={agentId} period={period} search={needle} status={stage} onStatus={setStage} onOpen={setOpenInquiry} />
                )}
              </div>
            </div>
            <div className="min-w-0 space-y-4 xl:col-span-4">
              <AnalyticsTrendChart data={data.series} title="Daily activity" />
              <ActivityRail title="Activity history" state={timeline} emptyTitle="No recorded activity in this period" />
            </div>
          </div>
        </div>
      )}

      {openContact ? (
        <ContactHistorySheet
          agentId={agentId}
          contact={openContact}
          onClose={() => setOpenContact(null)}
          onOpenInquiry={(id) => {
            setOpenContact(null);
            setOpenInquiry(id);
          }}
        />
      ) : null}
    </div>
  );
}
