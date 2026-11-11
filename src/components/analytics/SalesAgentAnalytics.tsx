"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  getAgentContacts,
  getAgentInquiries,
  getAgentTimeline,
  getContactInquiryHistory,
  getSalesAgentDetail,
  getSalesAgentFunnel,
  type AgentContactRow,
  type AgentInquiryRow,
  type AnalyticsPeriod,
  type SalesAgentFunnel,
  type TimelineItem,
} from "@/app/actions/analytics/sales";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatDuration } from "@/lib/analytics/format-duration";
import { useAnalyticsRange } from "@/components/analytics/AnalyticsDateFilter";
import {
  ActivityRail,
  PagedTable,
  SectionTabs,
  useLoad,
  usePaged,
} from "@/components/analytics/AnalyticsDashboardKit";
import {
  AnalyticsEmpty,
  AnalyticsError,
  AnalyticsLoading,
  StatusBadge,
  formatDate,
  formatDateTime,
} from "@/components/analytics/AnalyticsParts";
import { AnalyticsInquiryDetail } from "@/components/analytics/AnalyticsInquiryDetail";
import { AnalyticsTrendChart } from "@/components/analytics/AnalyticsTrendChart";
import {
  FunnelBoard,
  FunnelFilters,
  FunnelHeader,
  NO_SOURCE,
  funnelPeriodLabel,
  sourceLabel,
} from "@/components/analytics/SalesAgentFunnel";

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
  const params = useSearchParams();
  const { range, rangeError, query, update } = useAnalyticsRange();
  const source = params.get("source") ?? "";
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
  const noPeriod = () => Promise.resolve({ error: rangeError ?? "Choose a period." });
  const allTime = range?.preset === "all_time";

  const funnel = useLoad<SalesAgentFunnel>(
    () => (from ? getSalesAgentFunnel(agentId, period, { source: source || null, allTime }) : noPeriod()),
    `${periodKey}|${source}`
  );
  const detail = useLoad<Detail>(() => (from ? getSalesAgentDetail(agentId, period) : noPeriod()), periodKey);
  const timeline = useLoad<{ items: TimelineItem[]; truncated: boolean }>(
    () => (from ? getAgentTimeline(agentId, period) : noPeriod()),
    periodKey
  );

  const openRecords = (target: "contacts" | "inquiries" | "approved" | "rejected") => {
    if (target === "contacts") setSection("contacts");
    else {
      setStage(target === "inquiries" ? null : target);
      setSection("inquiries");
    }
    tablesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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

  const data = funnel.data;
  const name = selfView ? "My performance" : data?.agent.name ?? detail.data?.agent.name ?? "Sales agent";

  return (
    <div className="space-y-4">
      <FunnelHeader
        name={name}
        periodLabel={range ? funnelPeriodLabel(range.preset, range.from, range.to) : rangeError ?? ""}
        back={
          selfView ? undefined : (
            <Link
              href={`/analytics/sales${query ? `?${query}` : ""}`}
              className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-[#017e84]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Sales team
            </Link>
          )
        }
      />

      <FunnelFilters
        sources={data?.sources ?? []}
        hasUnsourced={data?.hasUnsourced ?? false}
        source={source}
        onSource={(value) => update({ source: value })}
      />
      {source ? (
        <p className="text-xs text-slate-600" role="status">
          Charts and totals show only contacts from{" "}
          <span className="font-semibold text-primary-dark">{source === NO_SOURCE ? "no recorded source" : sourceLabel(source)}</span>{" "}
          and their inquiries, quotations and deals. The record tables below are not filtered by source.
        </p>
      ) : null}

      {funnel.error ? (
        <AnalyticsError message={funnel.error} onRetry={funnel.onRetry} />
      ) : !data ? (
        <AnalyticsLoading />
      ) : (
        <FunnelBoard data={data} allTime={allTime} loading={funnel.loading} onRecords={openRecords} />
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div ref={tablesRef} className="min-w-0 scroll-mt-16 rounded-lg border border-slate-200 bg-white xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pr-3">
            <SectionTabs tabs={SECTIONS} active={section} onChange={setSection} label="Records" />
            <Input
              type="search"
              aria-label="Search contact or inquiry"
              placeholder="Search contact or inquiry"
              className="my-2 ml-3 h-9 w-full bg-white sm:ml-0 sm:w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {section === "contacts" ? (
            <ContactsSection agentId={agentId} period={period} search={needle} onOpen={setOpenContact} />
          ) : (
            <InquiriesSection agentId={agentId} period={period} search={needle} status={stage} onStatus={setStage} onOpen={setOpenInquiry} />
          )}
        </div>
        <div className="min-w-0 space-y-4 xl:col-span-4">
          {detail.data ? <AnalyticsTrendChart data={detail.data.series} title="Daily activity" /> : null}
          <ActivityRail title="Activity history" state={timeline} emptyTitle="No recorded activity in this period" />
        </div>
      </div>

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
