"use client";

import { CheckCircle2, Clock, XCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export type KpiTone = "neutral" | "brand" | "success" | "warning" | "danger";

export type Kpi = {
  label: string;
  value: string | number;
  /** Clarifies scope, e.g. "Right now" for values the period does not filter. */
  note?: string;
  tone?: KpiTone;
  onClick?: () => void;
};

// Icons use stroke-*: the global text colour rule also reaches SVG paths.
const KPI_TONES: Record<KpiTone, { border: string; icon?: LucideIcon; stroke?: string }> = {
  neutral: { border: "border-t-slate-300" },
  brand: { border: "border-t-[#017e84]" },
  success: { border: "border-t-emerald-500", icon: CheckCircle2, stroke: "stroke-emerald-600" },
  warning: { border: "border-t-amber-500", icon: Clock, stroke: "stroke-amber-600" },
  danger: { border: "border-t-red-400", icon: XCircle, stroke: "stroke-red-500" },
};

export function KpiCards({ items, label }: { items: Kpi[]; label: string }) {
  return (
    <section aria-label={label} className={`grid grid-cols-2 gap-3 md:grid-cols-3 ${items.length === 5 ? "xl:grid-cols-5" : "xl:grid-cols-6"}`}>
      {items.map((item) => {
        const tone = KPI_TONES[item.tone ?? "neutral"];
        const Icon = tone.icon;
        const className = `rounded-lg border border-slate-200 border-t-2 ${tone.border} bg-white p-3 text-left`;
        const body = (
          <>
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium uppercase tracking-wide text-slate-600">{item.label}</span>
              {Icon ? <Icon className={`h-4 w-4 shrink-0 ${tone.stroke}`} aria-hidden /> : null}
            </span>
            <span
              className={`mt-1.5 block font-semibold tabular-nums tracking-tight text-primary-dark ${
                typeof item.value === "number" ? "text-3xl" : "text-lg leading-9"
              }`}
            >
              {typeof item.value === "number" ? item.value.toLocaleString() : item.value}
            </span>
            <span className="block min-h-4 text-xs text-slate-600">{item.note}</span>
          </>
        );
        return item.onClick ? (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            className={`${className} hover:bg-[#e6f4f5] focus-visible:outline-2 focus-visible:outline-[#017e84]`}
          >
            {body}
          </button>
        ) : (
          <div key={item.label} className={className}>
            {body}
          </div>
        );
      })}
    </section>
  );
}

export function AnalyticsLoading({ label = "Loading analytics" }: { label?: string }) {
  return (
    <div className="space-y-3 animate-pulse" aria-busy="true" aria-label={label}>
      <div className="h-[74px] rounded-lg border border-slate-200 bg-white" />
      <div className="h-64 rounded-lg border border-slate-200 bg-white" />
    </div>
  );
}

export function AnalyticsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const denied = /access denied/i.test(message);
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center">
      <p className="text-sm font-medium text-primary-dark">
        {denied ? "You don't have access to this analytics view." : "Analytics couldn't be loaded."}
      </p>
      {denied ? null : (
        <>
          <p className="mt-1 text-xs text-slate-600">{message}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            Retry
          </Button>
        </>
      )}
    </div>
  );
}

export function AnalyticsEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm font-medium text-primary-dark">{title}</p>
      {description ? <p className="mt-1 text-xs text-slate-600">{description}</p> : null}
    </div>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
      <span className="tabular-nums">
        {total === 0
          ? "0 records"
          : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total.toLocaleString()}`}
      </span>
      <div className="flex gap-1">
        <Button variant="outline" size="xs" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="xs" disabled={page >= lastPage} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-300" },
  sent: { label: "Pending with Operations", className: "bg-sky-50 text-sky-800 border-sky-200" },
  sent_to_admin: { label: "Submitted to Admin", className: "bg-amber-50 text-amber-800 border-amber-200" },
  calculated_by_admin: { label: "Calculated by Admin", className: "bg-amber-50 text-amber-800 border-amber-200" },
  approved: { label: "Approved", className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  rejected: { label: "Rejected", className: "bg-red-50 text-red-700 border-red-200" },
  quotation: { label: "Quotation", className: "bg-slate-100 text-slate-700 border-slate-300" },
  quotation_sent: { label: "Sent", className: "bg-sky-50 text-sky-800 border-sky-200" },
  sales_order: { label: "Sales order", className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  cancelled: { label: "Cancelled", className: "bg-red-50 text-red-700 border-red-200" },
  scheduled: { label: "Scheduled", className: "bg-sky-50 text-sky-800 border-sky-200" },
  done: { label: "Completed", className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  overdue: { label: "Overdue", className: "bg-red-50 text-red-700 border-red-200" },
  submitted: { label: "Report submitted", className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  late: { label: "Report late", className: "bg-amber-50 text-amber-800 border-amber-200" },
  missing: { label: "Report missing", className: "bg-red-50 text-red-700 border-red-200" },
  not_started: { label: "Report not started", className: "bg-slate-100 text-slate-700 border-slate-300" },
};

export function StatusBadge({ status, label }: { status: string | null; label?: string }) {
  if (!status) return <span className="text-slate-600">—</span>;
  const style = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-xs font-medium ${
        style?.className ?? "bg-slate-100 text-slate-700 border-slate-300"
      }`}
    >
      {label ?? style?.label ?? status.replace(/_/g, " ")}
    </span>
  );
}

const dateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Karachi",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateOnly = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Karachi",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export const formatDateTime = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : "—");
export const formatDate = (iso: string | null) => (iso ? dateOnly.format(new Date(iso)) : "—");
