"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Mail,
  Phone,
  Search,
  Eye,
  User2,
  CalendarDays,
  TrendingUp,
  SlidersHorizontal,
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getSalesAgentOverviewDetailForAdmin,
  type SalesAgentOverviewDetail,
} from "@/app/actions/admin_sales_agent_overview";
import {
  getInquiriesForLead,
  getQuotationsForInquiry,
  type LeadInquiry,
  type InquiryQuotation,
} from "@/app/actions/inquiries";
import type { Lead, LeadStatus } from "@/app/actions/leads";

type OverviewNote = SalesAgentOverviewDetail["notes"][number];

export type DateRangeKey = "all" | "today" | "yesterday" | "7d" | "30d" | "custom";
export type QuickStatusKey = "all" | "new" | "in_progress" | "won" | "lost";

type Props = {
  salesAgentId: string | null;
  onOpenChange: (open: boolean) => void;
  initialDateRange?: DateRangeKey;
  initialCustomFrom?: string;
  initialCustomTo?: string;
};

const LEAD_STATUSES: LeadStatus[] = [
  "Leads",
  "Inquiry Received",
  "Quotation Sent",
  "Negotiation",
  "Win",
  "Follow up",
  "Lose",
];

const LEAD_SOURCES = ["Meta", "LinkedIn", "WhatsApp", "Others"] as const;

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  Leads: { bg: "bg-blue-50", text: "text-blue-800", border: "border-blue-200", dot: "bg-blue-500" },
  "Inquiry Received": { bg: "bg-indigo-50", text: "text-indigo-800", border: "border-indigo-200", dot: "bg-indigo-500" },
  "Quotation Sent": { bg: "bg-sky-50", text: "text-sky-800", border: "border-sky-200", dot: "bg-sky-500" },
  Negotiation: { bg: "bg-purple-50", text: "text-purple-800", border: "border-purple-200", dot: "bg-purple-500" },
  Win: { bg: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-200", dot: "bg-emerald-500" },
  "Follow up": { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200", dot: "bg-amber-500" },
  Lose: { bg: "bg-rose-50", text: "text-rose-800", border: "border-rose-200", dot: "bg-rose-500" },
};

const QUICK_STATUS_MAP: Record<Exclude<QuickStatusKey, "all">, LeadStatus[]> = {
  new: ["Leads", "Inquiry Received"],
  in_progress: ["Quotation Sent", "Negotiation", "Follow up"],
  won: ["Win"],
  lost: ["Lose"],
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function dateRangeBounds(key: DateRangeKey, customFrom: string, customTo: string): { from: Date; to: Date } | null {
  const now = new Date();
  if (key === "all") return null;
  if (key === "today") return { from: startOfDay(now), to: endOfDay(now) };
  if (key === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y) };
  }
  if (key === "7d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    return { from: startOfDay(from), to: endOfDay(now) };
  }
  if (key === "30d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 29);
    return { from: startOfDay(from), to: endOfDay(now) };
  }
  if (key === "custom") {
    if (!customFrom && !customTo) return null;
    const from = customFrom ? startOfDay(new Date(customFrom)) : new Date(0);
    const to = customTo ? endOfDay(new Date(customTo)) : new Date();
    return { from, to };
  }
  return null;
}

function StatusPill({ status }: { status: string }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.Leads;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${c.bg} ${c.text} ${c.border}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  );
}

type KpiTone = "default" | "green" | "amber" | "red" | "blue" | "indigo" | "purple" | "sky";

function KpiCard({
  label,
  value,
  tone = "default",
  accent,
  tooltip,
  highlight,
}: {
  label: string;
  value: number | string;
  tone?: KpiTone;
  accent?: string;
  tooltip?: string;
  highlight?: boolean;
}) {
  const gradient: Record<KpiTone, string> = {
    default: "from-slate-700 via-slate-800 to-slate-900",
    blue: "from-blue-600 via-indigo-600 to-indigo-700",
    indigo: "from-indigo-600 via-violet-600 to-purple-700",
    purple: "from-violet-600 via-fuchsia-600 to-pink-600",
    sky: "from-sky-500 via-cyan-500 to-blue-600",
    green: "from-emerald-500 via-teal-500 to-cyan-600",
    amber: "from-amber-500 via-orange-500 to-rose-500",
    red: "from-rose-500 via-red-500 to-red-600",
  };
  return (
    <div
      className={`group relative overflow-hidden rounded-xl p-4 text-white shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 bg-gradient-to-br ${gradient[tone]} ${highlight ? "ring-2 ring-white/70 ring-offset-2 ring-offset-slate-100" : ""}`}
      title={tooltip}
    >
      <div className="pointer-events-none absolute -top-8 -right-8 h-20 w-20 rounded-full bg-white/10 blur-xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-6 h-20 w-20 rounded-full bg-white/5 blur-xl" />
      <p className="relative text-[10px] font-semibold uppercase tracking-wider text-white/80">{label}</p>
      <p className="relative mt-1.5 text-3xl font-bold tabular-nums text-white drop-shadow-sm">{value}</p>
      {accent ? <p className="relative mt-0.5 text-[10px] text-white/75">{accent}</p> : null}
    </div>
  );
}

function GroupHeader({ tone, title, hint }: { tone: "green" | "amber" | "blue"; title: string; hint?: string }) {
  const dot =
    tone === "green"
      ? "bg-emerald-500"
      : tone === "amber"
        ? "bg-amber-500"
        : "bg-blue-500";
  return (
    <div className="flex items-baseline justify-between pt-1">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
      </div>
      {hint ? <span className="text-[11px] text-slate-500">{hint}</span> : null}
    </div>
  );
}

function SectionDivider() {
  return <div className="my-1 h-px bg-slate-100" />;
}

function FunnelChart({ steps }: { steps: Array<{ label: string; value: number }> }) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <div className="space-y-1.5">
      {steps.map((s, i) => {
        const prev = i === 0 ? s.value : steps[i - 1].value;
        const ratio = prev === 0 ? 0 : Math.round((s.value / prev) * 100);
        const width = (s.value / max) * 100;
        return (
          <div key={s.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-700">
              <span className="font-medium">{s.label}</span>
              <span className="tabular-nums">
                {s.value}
                {i > 0 ? <span className="text-slate-500 ml-2">· {ratio}% of prev</span> : null}
              </span>
            </div>
            <div className="h-5 w-full bg-slate-100 rounded">
              <div
                className="h-full rounded bg-gradient-to-r from-teal-500 to-teal-600 transition-all"
                style={{ width: `${Math.max(4, width)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || "")
    .join("");
}

function SourceDonut({
  slices,
}: {
  slices: Array<{ label: string; value: number; color: string }>;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return (
      <div className="h-48 rounded-md border border-dashed border-slate-200 bg-slate-50/60 flex items-center justify-center text-xs text-slate-500">
        No leads in the current filter window.
      </div>
    );
  }

  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;

  const arcs = slices.reduce<{
    items: Array<{ path: string; color: string; label: string; value: number; pct: number }>;
    angle: number;
  }>(
    (acc, sl) => {
      if (sl.value === 0) return acc;
      const fraction = sl.value / total;
      const delta = fraction * Math.PI * 2;
      const x1 = cx + r * Math.cos(acc.angle);
      const y1 = cy + r * Math.sin(acc.angle);
      const next = acc.angle + delta;
      const x2 = cx + r * Math.cos(next);
      const y2 = cy + r * Math.sin(next);
      const largeArc = delta > Math.PI ? 1 : 0;
      const path = `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${largeArc} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
      return {
        items: [
          ...acc.items,
          { path, color: sl.color, label: sl.label, value: sl.value, pct: Math.round(fraction * 100) },
        ],
        angle: next,
      };
    },
    { items: [], angle: -Math.PI / 2 }
  ).items;

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg width={size} height={size} role="img" aria-label="Leads by source">
        {arcs.map((a, i) => (
          <path key={i} d={a.path} fill={a.color}>
            <title>{`${a.label}: ${a.value} (${a.pct}%)`}</title>
          </path>
        ))}
        <circle cx={cx} cy={cy} r={r * 0.58} fill="white" />
        <text x={cx} y={cy - 2} fontSize="18" textAnchor="middle" fill="#0f172a" fontWeight="700">
          {total}
        </text>
        <text x={cx} y={cy + 14} fontSize="10" textAnchor="middle" fill="#64748b">
          leads
        </text>
      </svg>
      <ul className="flex-1 min-w-[180px] space-y-1.5 text-xs">
        {arcs.map((a) => (
          <li key={a.label} className="flex items-center gap-2 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: a.color }} />
            <span className="flex-1 truncate">{a.label}</span>
            <span className="tabular-nums text-slate-500">{a.value}</span>
            <span className="tabular-nums font-semibold text-slate-800 w-10 text-right">
              {a.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function inquiryApprovalBadge(status: string | null | undefined): {
  label: string;
  className: string;
} {
  switch (status) {
    case "approved":
      return {
        label: "Approved",
        className: "border-emerald-300 bg-emerald-100 text-emerald-800",
      };
    case "rejected":
      return {
        label: "Rejected",
        className: "border-rose-300 bg-rose-100 text-rose-800",
      };
    case "sent":
      return {
        label: "Pending with Admin",
        className: "border-amber-300 bg-amber-100 text-amber-800",
      };
    default:
      return {
        label: "Draft",
        className: "border-slate-300 bg-slate-100 text-slate-700",
      };
  }
}

function DetailField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <div
        className={`text-sm text-slate-800 ${mono ? "font-mono text-xs break-all" : "font-medium"}`}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "decimal",
      maximumFractionDigits: 2,
    }).format(Number(value));
  } catch {
    return String(value);
  }
}

function LeadDetailsDialog({
  lead,
  leadId,
  notes,
  onClose,
}: {
  lead: Lead | null;
  leadId: string | null;
  notes: OverviewNote[];
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fullInquiries, setFullInquiries] = useState<LeadInquiry[]>([]);
  const [quotationsByInquiry, setQuotationsByInquiry] = useState<
    Record<string, InquiryQuotation[]>
  >({});

  useEffect(() => {
    if (!leadId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErrorMsg(null);
      setFullInquiries([]);
      setQuotationsByInquiry({});

      const res = await getInquiriesForLead(leadId);
      if (cancelled) return;
      if ("error" in res && res.error) {
        setErrorMsg(res.error);
        setLoading(false);
        return;
      }
      const inquiries = (res as { inquiries: LeadInquiry[] }).inquiries || [];
      setFullInquiries(inquiries);

      const approved = inquiries.filter((i) => i.approval_status === "approved");
      if (approved.length === 0) {
        setLoading(false);
        return;
      }
      const pairs = await Promise.all(
        approved.map(async (inq) => {
          const qres = await getQuotationsForInquiry(inq.id);
          if ("error" in qres && qres.error) return [inq.id, [] as InquiryQuotation[]] as const;
          return [inq.id, ((qres as { quotations: InquiryQuotation[] }).quotations || [])] as const;
        })
      );
      if (cancelled) return;
      const next: Record<string, InquiryQuotation[]> = {};
      for (const [id, q] of pairs) next[id] = q;
      setQuotationsByInquiry(next);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [leadId]);

  return (
    <Dialog open={lead !== null} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {lead?.name || "Lead details"}
            {lead?.lead_id_formatted ? (
              <span className="font-mono text-xs text-slate-500">#{lead.lead_id_formatted}</span>
            ) : null}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Full inquiry details, approved rates, confirmations, and notes for this lead.
          </DialogDescription>
        </DialogHeader>

        {lead ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-3">
              <DetailField label="Phone" value={lead.number} />
              <DetailField label="Source" value={lead.source} />
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Status</p>
                <div className="mt-0.5">
                  <StatusPill status={lead.status} />
                </div>
              </div>
              <DetailField label="Added" value={formatDateTime(lead.created_at)} />
              <DetailField label="Last update" value={formatDateTime(lead.updated_at)} />
              <DetailField label="Inquiries" value={fullInquiries.length} />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">
                  Inquiries ({fullInquiries.length})
                </p>
                {loading ? (
                  <span className="text-[11px] text-slate-500">Loading full details…</span>
                ) : null}
              </div>

              {errorMsg ? (
                <p className="text-xs text-rose-600">{errorMsg}</p>
              ) : fullInquiries.length === 0 && !loading ? (
                <p className="text-xs italic text-slate-500">
                  No inquiries have been created for this lead yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {fullInquiries.map((inq, idx) => {
                    const badge = inquiryApprovalBadge(inq.approval_status);
                    const quotes = quotationsByInquiry[inq.id] || [];
                    const calculator = inq.calculator_values || {};
                    const calcKeys = Object.keys(calculator);
                    const extraImages = inq.additional_image_urls || [];
                    const confirmations = inq.inquiry_confirmations || [];

                    return (
                      <div
                        key={inq.id}
                        className={`rounded-lg border p-4 ${
                          inq.approval_status === "approved"
                            ? "border-emerald-300 bg-emerald-50/40"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900">
                                {inq.product_name || `Inquiry ${idx + 1}`}
                              </p>
                              <span className="text-[10px] text-slate-500">
                                Inquiry {fullInquiries.length - idx} of {fullInquiries.length}
                              </span>
                              {inq.version_number ? (
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600">
                                  v{inq.version_number}
                                  {inq.is_current_version ? " · current" : ""}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                              ID: {inq.id}
                            </p>
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </div>

                        {inq.description ? (
                          <div className="mt-3">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500">
                              Description
                            </p>
                            <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">
                              {inq.description}
                            </p>
                          </div>
                        ) : null}

                        <div className="mt-3 grid grid-cols-2 gap-3 rounded-md border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-3">
                          <DetailField label="Quantity" value={inq.quantity || "—"} />
                          <DetailField label="Total weight" value={inq.total_weight || "—"} />
                          <DetailField label="CBM" value={inq.cbm || "—"} />
                          <DetailField label="Workflow status" value={inq.status} />
                          <DetailField
                            label="Sent to operations"
                            value={inq.sent_to_operations ? "Yes" : "No"}
                          />
                          <DetailField
                            label="Sent to accounting"
                            value={inq.sent_to_accounting ? "Yes" : "No"}
                          />
                          <DetailField label="Created" value={formatDateTime(inq.created_at)} />
                          <DetailField label="Sent" value={formatDateTime(inq.sent_at)} />
                          <DetailField label="Approved" value={formatDateTime(inq.approved_at)} />
                        </div>

                        {(inq.image_url || inq.link_url || extraImages.length > 0) && (
                          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {inq.image_url ? (
                              <div>
                                <p className="text-[10px] uppercase tracking-wide text-slate-500">
                                  Primary image
                                </p>
                                <a
                                  href={inq.image_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="break-all text-xs font-medium text-blue-700 hover:underline"
                                >
                                  {inq.image_url}
                                </a>
                              </div>
                            ) : null}
                            {inq.link_url ? (
                              <div>
                                <p className="text-[10px] uppercase tracking-wide text-slate-500">
                                  Reference link
                                </p>
                                <a
                                  href={inq.link_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="break-all text-xs font-medium text-blue-700 hover:underline"
                                >
                                  {inq.link_url}
                                </a>
                              </div>
                            ) : null}
                            {extraImages.length > 0 ? (
                              <div className="sm:col-span-2">
                                <p className="text-[10px] uppercase tracking-wide text-slate-500">
                                  Additional images ({extraImages.length})
                                </p>
                                <ul className="mt-0.5 space-y-0.5">
                                  {extraImages.map((url, i) => (
                                    <li key={i}>
                                      <a
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="break-all text-xs text-blue-700 hover:underline"
                                      >
                                        {url}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        )}

                        {calcKeys.length > 0 ? (
                          <div className="mt-3">
                            <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                              Calculator values
                            </p>
                            <div className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 bg-white p-2 sm:grid-cols-3">
                              {calcKeys.map((k) => (
                                <div key={k} className="flex flex-col">
                                  <span className="text-[10px] text-slate-500">{k}</span>
                                  <span className="text-xs font-medium text-slate-800">
                                    {String(calculator[k] ?? "—")}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {confirmations.length > 0 ? (
                          <div className="mt-3">
                            <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                              Admin confirmations ({confirmations.length})
                            </p>
                            <ul className="space-y-1">
                              {confirmations.map((c) => (
                                <li
                                  key={c.id}
                                  className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1"
                                >
                                  <span className="text-xs font-medium capitalize text-slate-800">
                                    {c.status}
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    {formatDateTime(c.created_at)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {inq.approval_status === "approved" ? (
                          <div className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-3">
                            <p className="text-xs font-semibold text-emerald-900">
                              Final approved rates {quotes.length > 0 ? `(${quotes.length})` : ""}
                            </p>
                            {quotes.length === 0 ? (
                              <p className="mt-1 text-xs italic text-emerald-800/80">
                                {loading
                                  ? "Loading approved quotation…"
                                  : "No quotation attached to this approved inquiry."}
                              </p>
                            ) : (
                              <div className="mt-2 space-y-2">
                                {quotes.map((q) => (
                                  <div
                                    key={q.id}
                                    className="rounded-md border border-emerald-200 bg-white p-3"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="text-sm font-semibold text-slate-900">
                                        {q.quotation_number || "Quotation"}
                                      </div>
                                      <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                                        v{q.version}
                                      </span>
                                    </div>
                                    <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                                      <DetailField label="Customer" value={q.customer_name} />
                                      <DetailField
                                        label="Product / Service"
                                        value={q.product_service}
                                      />
                                      <DetailField
                                        label="Quantity"
                                        value={formatMoney(q.quantity)}
                                      />
                                      <DetailField
                                        label="Unit price"
                                        value={formatMoney(q.unit_price)}
                                      />
                                      <DetailField
                                        label="Total amount"
                                        value={formatMoney(q.total_amount)}
                                      />
                                      <DetailField
                                        label="Sent to client"
                                        value={
                                          q.sent_to_client
                                            ? `Yes · ${formatDateTime(q.sent_to_client_at)}`
                                            : "No"
                                        }
                                      />
                                      <DetailField
                                        label="Sent to agent"
                                        value={
                                          q.sent_to_agent
                                            ? `Yes · ${formatDateTime(q.sent_to_agent_at)}`
                                            : "No"
                                        }
                                      />
                                      <DetailField label="Created" value={formatDateTime(q.created_at)} />
                                      <DetailField
                                        label="Updated"
                                        value={formatDateTime(q.updated_at)}
                                      />
                                    </div>
                                    {q.notes ? (
                                      <div className="mt-2">
                                        <p className="text-[10px] uppercase tracking-wide text-slate-500">
                                          Notes
                                        </p>
                                        <p className="whitespace-pre-wrap text-xs text-slate-700">
                                          {q.notes}
                                        </p>
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-800">Notes ({notes.length})</p>
              {notes.length === 0 ? (
                <p className="text-xs italic text-slate-500">No notes recorded for this lead.</p>
              ) : (
                <ul className="space-y-2">
                  {notes.map((n) => (
                    <li
                      key={n.id}
                      className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-500">
                          {formatDateTime(n.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{n.comment}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function SalesAgentOverviewDrawer({
  salesAgentId,
  onOpenChange,
  initialDateRange = "all",
  initialCustomFrom = "",
  initialCustomTo = "",
}: Props) {
  const open = salesAgentId !== null;
  const [isLoading, setIsLoading] = useState(false);
  const [overview, setOverview] = useState<SalesAgentOverviewDetail | null>(null);

  const [dateRange, setDateRange] = useState<DateRangeKey>(initialDateRange);
  const [customFrom, setCustomFrom] = useState(initialCustomFrom);
  const [customTo, setCustomTo] = useState(initialCustomTo);
  const [quickStatus, setQuickStatus] = useState<QuickStatusKey>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [viewLeadId, setViewLeadId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !salesAgentId) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setOverview(null);
      const result = await getSalesAgentOverviewDetailForAdmin(salesAgentId);
      if (cancelled) return;
      if ("error" in result) {
        toast.error(result.error || "Unable to load agent overview");
        setOverview(null);
      } else {
        setOverview(result.overview);
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, salesAgentId]);

  const bounds = useMemo(
    () => dateRangeBounds(dateRange, customFrom, customTo),
    [dateRange, customFrom, customTo]
  );

  const quickStatusSet = useMemo<Set<string>>(() => {
    if (quickStatus === "all") return new Set<string>();
    return new Set(QUICK_STATUS_MAP[quickStatus]);
  }, [quickStatus]);

  const filteredLeads = useMemo<Lead[]>(() => {
    if (!overview) return [];
    const needle = search.trim().toLowerCase();
    return overview.leads.filter((l) => {
      if (bounds) {
        const t = new Date(l.created_at).getTime();
        if (t < bounds.from.getTime() || t > bounds.to.getTime()) return false;
      }
      if (quickStatusSet.size > 0 && !quickStatusSet.has(l.status)) return false;
      if (sourceFilter && l.source !== sourceFilter) return false;
      if (needle) {
        const hay = `${l.name} ${l.number} ${l.lead_id_formatted || ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [overview, bounds, quickStatusSet, sourceFilter, search]);

  const filteredCustomers = useMemo(() => {
    if (!overview) return [];
    if (!bounds) return overview.customers;
    return overview.customers.filter((c) => {
      const ts = c.converted_at || c.created_at;
      if (!ts) return false;
      const t = new Date(ts).getTime();
      return t >= bounds.from.getTime() && t <= bounds.to.getTime();
    });
  }, [overview, bounds]);

  const filteredInquiries = useMemo(() => {
    if (!overview) return [];
    const allowedLeadIds = new Set(filteredLeads.map((l) => l.id));
    return overview.inquiries.filter((i) => allowedLeadIds.has(i.lead_id));
  }, [overview, filteredLeads]);

  const statusCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of LEAD_STATUSES) m.set(s, 0);
    for (const l of filteredLeads) m.set(l.status, (m.get(l.status) || 0) + 1);
    return m;
  }, [filteredLeads]);

  const kpis = useMemo(() => {
    const inquiryReceived = filteredInquiries.length;
    const inqSentToOps = filteredInquiries.filter((i) => !!(i.sent_at || i.sent_to_operations)).length;
    const confirmed = filteredInquiries.filter(
      (i) =>
        i.approval_status === "approved" ||
        (i.inquiry_confirmations || []).some((c) => c.status === "approved")
    ).length;
    const rejectedInq = filteredInquiries.filter(
      (i) =>
        i.approval_status === "rejected" ||
        (i.inquiry_confirmations || []).some((c) => c.status === "rejected")
    ).length;
    const pendingInquiries = Math.max(0, inqSentToOps - confirmed - rejectedInq);
    const pendingLeads = filteredLeads.filter((l) => l.status !== "Win" && l.status !== "Lose").length;
    return {
      totalLeads: filteredLeads.length,
      totalInquiries: filteredInquiries.length,
      inquiryReceived,
      inqSentToOps,
      confirmed,
      pendingInquiries,
      pendingLeads,
      quotationSent: statusCounts.get("Quotation Sent") || 0,
      negotiation: statusCounts.get("Negotiation") || 0,
      won: statusCounts.get("Win") || 0,
      followUp: statusCounts.get("Follow up") || 0,
      lost: statusCounts.get("Lose") || 0,
      customers: filteredCustomers.length,
    };
  }, [filteredLeads, filteredInquiries, filteredCustomers, statusCounts]);

  const leadInquiryBreakdown = useMemo(() => {
    if (!overview) return [] as SalesAgentOverviewDetail["leadBreakdown"];
    const leadIds = new Set(filteredLeads.map((l) => l.id));
    return overview.leadBreakdown
      .filter((b) => leadIds.has(b.lead_id))
      .sort((a, b) => b.inquiry_count - a.inquiry_count);
  }, [overview, filteredLeads]);

  const sourceDonutData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of filteredLeads) counts.set(l.source, (counts.get(l.source) || 0) + 1);
    const palette: Record<string, string> = {
      Meta: "#2563eb",
      LinkedIn: "#0ea5e9",
      WhatsApp: "#10b981",
      Others: "#8b5cf6",
    };
    return [...counts.entries()]
      .map(([label, value]) => ({ label, value, color: palette[label] || "#64748b" }))
      .filter((s) => s.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [filteredLeads]);

  const funnelSteps = useMemo(
    () => [
      { label: "Inquiry (total)", value: filteredInquiries.length },
      {
        label: "Sent to Operations",
        value: filteredInquiries.filter((i) => !!(i.sent_at || i.sent_to_operations)).length,
      },
      {
        label: "Confirmed / Approved",
        value: filteredInquiries.filter(
          (i) =>
            i.approval_status === "approved" ||
            (i.inquiry_confirmations || []).some((c) => c.status === "approved")
        ).length,
      },
      { label: "Pending Inquiries", value: kpis.pendingInquiries },
    ],
    [filteredInquiries, kpis.pendingInquiries]
  );

  const notesByLead = useMemo(() => {
    const m = new Map<string, OverviewNote[]>();
    for (const n of overview?.notes || []) {
      const arr = m.get(n.lead_id);
      if (arr) arr.push(n);
      else m.set(n.lead_id, [n]);
    }
    return m;
  }, [overview]);

  const leadById = useMemo(() => {
    const m = new Map<string, Lead>();
    for (const l of overview?.leads || []) m.set(l.id, l);
    return m;
  }, [overview]);

  function changeQuickStatus(next: QuickStatusKey) {
    setQuickStatus(next);
  }
  function changeDateRange(next: DateRangeKey) {
    setDateRange(next);
  }
  function changeSearch(next: string) {
    setSearch(next);
  }

  function resetFilters() {
    setDateRange("all");
    setCustomFrom("");
    setCustomTo("");
    setQuickStatus("all");
    setSourceFilter("");
    setSearch("");
  }

  const activeFilterCount =
    (dateRange !== "all" ? 1 : 0) +
    (quickStatus !== "all" ? 1 : 0) +
    (sourceFilter ? 1 : 0) +
    (search.trim() ? 1 : 0);

  const viewLead = viewLeadId ? leadById.get(viewLeadId) || null : null;
  const viewLeadNotes = viewLeadId ? notesByLead.get(viewLeadId) || [] : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="p-0 flex flex-col">
        <SheetHeader className="!p-0 !gap-0 !border-b-0">
          <div className="px-5 pt-5 pb-3 pr-12">
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-full bg-teal-600 text-white flex items-center justify-center text-sm font-semibold shrink-0">
                {overview ? initials(overview.agent.name) : <User2 className="h-5 w-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-base truncate">
                  {overview ? overview.agent.name : "Sales Agent Overview"}
                </SheetTitle>
                <SheetDescription className="text-xs">
                  Complete, structured view of this agent&apos;s activity.
                </SheetDescription>
                {overview ? (
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                    {overview.agent.email ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-slate-400" />
                        {overview.agent.email}
                      </span>
                    ) : null}
                    {overview.agent.phone_number ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                        {overview.agent.phone_number}
                      </span>
                    ) : null}
                    {overview.agent.username ? (
                      <span className="font-mono text-slate-500">@{overview.agent.username}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div className="h-px bg-slate-200" />
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-sm text-slate-500">Loading agent data…</div>
          ) : !overview ? (
            <div className="p-8 text-sm text-slate-500">No agent selected.</div>
          ) : (
            <div className="p-5 space-y-7">
              {/* 1. FILTERS (first, flat, always visible) */}
              <section aria-labelledby="filter-heading" className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3
                    id="filter-heading"
                    className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Filters
                    {activeFilterCount > 0 ? (
                      <span className="ml-1 rounded-full bg-teal-100 border border-teal-200 text-teal-800 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                        {activeFilterCount} active
                      </span>
                    ) : null}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={resetFilters}
                    disabled={activeFilterCount === 0}
                  >
                    Reset all
                  </Button>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                    <p className="text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1.5 min-w-[70px]">
                      <CalendarDays className="h-3.5 w-3.5" />
                      When
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: "today", label: "Today" },
                          { id: "7d", label: "Last 7 days" },
                          { id: "30d", label: "Last 30 days" },
                          { id: "all", label: "All time" },
                          { id: "custom", label: "Custom…" },
                        ] as Array<{ id: DateRangeKey; label: string }>
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => changeDateRange(opt.id)}
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                            dateRange === opt.id
                              ? "bg-slate-900 text-white border-slate-900"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {dateRange === "custom" ? (
                      <div className="flex flex-wrap items-center gap-1.5 md:ml-auto">
                        <Input
                          type="date"
                          value={customFrom}
                          onChange={(e) => setCustomFrom(e.target.value)}
                          className="h-8 w-36 text-xs"
                          aria-label="From"
                        />
                        <span className="text-xs text-slate-500">to</span>
                        <Input
                          type="date"
                          value={customTo}
                          onChange={(e) => setCustomTo(e.target.value)}
                          className="h-8 w-36 text-xs"
                          aria-label="To"
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                    <p className="text-[11px] font-semibold text-slate-700 min-w-[70px]">Stage</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: "all", label: "All" },
                          { id: "new", label: "New" },
                          { id: "in_progress", label: "In progress" },
                          { id: "won", label: "Won" },
                          { id: "lost", label: "Lost" },
                        ] as Array<{ id: QuickStatusKey; label: string }>
                      ).map((opt) => {
                        const active = quickStatus === opt.id;
                        const toneClass =
                          opt.id === "won"
                            ? active
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "border-emerald-200 text-emerald-800 hover:bg-emerald-50"
                            : opt.id === "lost"
                              ? active
                                ? "bg-rose-600 text-white border-rose-600"
                                : "border-rose-200 text-rose-800 hover:bg-rose-50"
                              : opt.id === "in_progress"
                                ? active
                                  ? "bg-amber-500 text-white border-amber-500"
                                  : "border-amber-200 text-amber-800 hover:bg-amber-50"
                                : opt.id === "new"
                                  ? active
                                    ? "bg-blue-600 text-white border-blue-600"
                                    : "border-blue-200 text-blue-800 hover:bg-blue-50"
                                  : active
                                    ? "bg-slate-900 text-white border-slate-900"
                                    : "border-slate-200 text-slate-800 hover:bg-slate-50";
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => changeQuickStatus(opt.id)}
                            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors ${toneClass}`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                    <p className="text-[11px] font-semibold text-slate-700 min-w-[70px]">Source</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSourceFilter("")}
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          sourceFilter === ""
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        All
                      </button>
                      {LEAD_SOURCES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSourceFilter(s)}
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                            sourceFilter === s
                              ? "bg-teal-600 text-white border-teal-600"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                    <p className="text-[11px] font-semibold text-slate-700 min-w-[70px]">Search</p>
                    <div className="relative flex-1 md:max-w-md">
                      <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <Input
                        placeholder="Search leads by name, phone or ID"
                        value={search}
                        onChange={(e) => changeSearch(e.target.value)}
                        className="h-9 pl-9 text-sm"
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* 2. KPI SUMMARY — grouped gradient cards */}
              <section aria-labelledby="kpi-heading" className="space-y-4">
                <h3
                  id="kpi-heading"
                  className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2"
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  KPI summary
                </h3>

                <div className="space-y-2.5">
                  <GroupHeader tone="green" title="Lead Flow" hint="From first touch to approval" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                    <KpiCard
                      label="Total Leads"
                      value={kpis.totalLeads}
                      tone="blue"
                      highlight
                      tooltip="All leads in the current filter window"
                    />
                    <KpiCard
                      label="Inquiry Received"
                      value={kpis.inquiryReceived}
                      tone="indigo"
                      tooltip="Total inquiries this agent has created (across all leads) in the current filter window"
                    />
                    <KpiCard
                      label="Inquiries Sent to Operations"
                      value={kpis.inqSentToOps}
                      tone="sky"
                      tooltip="Inquiries forwarded to the operations team"
                    />
                    <KpiCard
                      label="Pending Inquiries"
                      value={kpis.pendingInquiries}
                      tone="amber"
                      tooltip="Inquiries sent to Operations that are still awaiting admin approval"
                    />
                    <KpiCard
                      label="Inquiries Confirmed"
                      value={kpis.confirmed}
                      tone="green"
                      tooltip="Inquiries approved by admin"
                    />
                  </div>
                </div>

                <SectionDivider />

                <div className="space-y-2.5">
                  <GroupHeader tone="amber" title="Sales Pipeline" hint="Deal stages and outcomes" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                    <KpiCard
                      label="Quotation Sent"
                      value={kpis.quotationSent}
                      tone="sky"
                      tooltip="Leads at 'Quotation Sent'"
                    />
                    <KpiCard
                      label="Negotiation"
                      value={kpis.negotiation}
                      tone="purple"
                      tooltip="Leads at 'Negotiation'"
                    />
                    <KpiCard
                      label="Follow-up"
                      value={kpis.followUp}
                      tone="amber"
                      tooltip="Leads at 'Follow up'"
                    />
                    <KpiCard label="Won" value={kpis.won} tone="green" highlight tooltip="Leads marked as Win" />
                    <KpiCard label="Lost" value={kpis.lost} tone="red" tooltip="Leads marked as Lose" />
                  </div>
                </div>

                <SectionDivider />

                <div className="space-y-2.5">
                  <GroupHeader tone="blue" title="Customer Data" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                    <KpiCard
                      label="Total Customers"
                      value={kpis.customers}
                      tone="blue"
                      tooltip="Leads converted to customers"
                    />
                  </div>
                </div>
              </section>

              {/* 3. AT A GLANCE — lead source donut + inquiry funnel */}
              <section aria-labelledby="glance-heading" className="space-y-3">
                <h3
                  id="glance-heading"
                  className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2"
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  At a glance
                </h3>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-800">Leads by source</p>
                  <p className="text-[11px] text-slate-500 mb-3">
                    Where this agent&apos;s leads are coming from (share of total).
                  </p>
                  <SourceDonut slices={sourceDonutData} />
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-800">Inquiry progress</p>
                  <p className="text-[11px] text-slate-500 mb-3">
                    How inquiries move from creation to approval, and how many are still pending.
                  </p>
                  <FunnelChart steps={funnelSteps} />
                </div>
              </section>

              {/* 4. INQUIRIES PER LEAD — the missing visibility the admin asked for */}
              <section aria-labelledby="breakdown-heading" className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3
                    id="breakdown-heading"
                    className="text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                  >
                    Inquiries per lead ({leadInquiryBreakdown.length})
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    Total inquiries: <span className="font-semibold text-slate-800">{kpis.totalInquiries}</span>
                    <span className="mx-1.5">·</span>
                    Pending:{" "}
                    <span className="font-semibold text-amber-700">{kpis.pendingInquiries}</span>
                  </span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-[11px]">Lead</TableHead>
                          <TableHead className="text-[11px]">Lead status</TableHead>
                          <TableHead className="text-[11px] text-right">Inquiries</TableHead>
                          <TableHead className="text-[11px] text-right">Approved</TableHead>
                          <TableHead className="text-[11px] text-right">Pending</TableHead>
                          <TableHead className="text-[11px] text-right">View</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {leadInquiryBreakdown.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-xs text-slate-500">
                              No leads match the current filters.
                            </TableCell>
                          </TableRow>
                        ) : (
                          leadInquiryBreakdown.map((row) => (
                            <TableRow key={row.lead_id} className="hover:bg-slate-50/60">
                              <TableCell className="text-sm font-medium">
                                {row.lead_name}
                                {row.lead_id_formatted ? (
                                  <div className="text-[10px] text-slate-500 font-mono">
                                    #{row.lead_id_formatted}
                                  </div>
                                ) : null}
                              </TableCell>
                              <TableCell>
                                <StatusPill status={row.lead_status} />
                              </TableCell>
                              <TableCell className="text-right text-sm font-semibold tabular-nums text-slate-800">
                                {row.inquiry_count}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    row.approved_count > 0
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : "bg-slate-50 text-slate-500 border border-slate-200"
                                  }`}
                                >
                                  {row.approved_count}
                                </span>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    row.pending_count > 0
                                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                                      : "bg-slate-50 text-slate-500 border border-slate-200"
                                  }`}
                                >
                                  {row.pending_count}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2.5 text-[11px]"
                                  onClick={() => setViewLeadId(row.lead_id)}
                                >
                                  <Eye className="h-3.5 w-3.5 mr-1" />
                                  View
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </section>
              <div className="pb-4" />
            </div>
          )}
        </div>
      </SheetContent>
      <LeadDetailsDialog
        lead={viewLead}
        leadId={viewLeadId}
        notes={viewLeadNotes}
        onClose={() => setViewLeadId(null)}
      />
    </Sheet>
  );
}
