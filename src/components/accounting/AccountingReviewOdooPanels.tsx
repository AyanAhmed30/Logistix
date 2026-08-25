"use client";

/**
 * Odoo-style Review UI chrome — Logistix theme (#017e84).
 */

import type { ReactNode } from "react";
import {
  BarChart3,
  Calendar,
  ChevronDown,
  LayoutGrid,
  List,
  PieChart,
  Printer,
  Search,
  Settings2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const REVIEW_TEAL = "#017e84";

export function formatReviewMoney(n: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

export function formatReviewDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatReviewDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Odoo list view toolbar: title + search + view toggles */
export function ReviewListToolbar({
  title,
  search,
  onSearchChange,
  filterPills,
  onRemoveFilter,
  extraFilters,
  pagination,
  onPrint,
}: {
  title: string;
  search: string;
  onSearchChange: (v: string) => void;
  filterPills?: { id: string; label: string }[];
  onRemoveFilter?: (id: string) => void;
  extraFilters?: ReactNode;
  pagination?: ReactNode;
  onPrint?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-1 py-2 border-b border-slate-200 bg-white sticky top-0 z-10">
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <h1 className="text-base sm:text-lg font-semibold text-slate-800">{title}</h1>
        <button
          type="button"
          className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          title="Settings"
          aria-label="Settings"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 flex items-center min-w-[200px] max-w-xl mx-auto">
        <div className="flex items-center w-full h-9 rounded-md border border-slate-200 bg-white overflow-hidden">
          <Search className="h-4 w-4 text-slate-400 ml-2.5 shrink-0" />
          {filterPills?.map((pill) => (
            <span
              key={pill.id}
              className="inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded text-xs font-medium text-white shrink-0"
              style={{ backgroundColor: REVIEW_TEAL }}
            >
              {pill.label}
              {onRemoveFilter ? (
                <button
                  type="button"
                  onClick={() => onRemoveFilter(pill.id)}
                  className="hover:bg-white/20 rounded p-0.5"
                  aria-label={`Remove ${pill.label} filter`}
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </span>
          ))}
          {extraFilters}
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search…"
            className="flex-1 min-w-0 h-full px-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none bg-transparent"
          />
          <ChevronDown className="h-4 w-4 text-slate-400 mr-2 shrink-0" />
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {pagination}
        <div className="flex items-center border border-slate-200 rounded-md overflow-hidden ml-1">
          <button
            type="button"
            className="h-8 w-8 flex items-center justify-center text-white"
            style={{ backgroundColor: REVIEW_TEAL }}
            title="List view"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="h-8 w-8 flex items-center justify-center text-slate-400 hover:bg-slate-50"
            title="Pivot"
            disabled
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="h-8 w-8 flex items-center justify-center text-slate-400 hover:bg-slate-50"
            title="Graph"
            disabled
          >
            <BarChart3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="h-8 w-8 flex items-center justify-center text-slate-400 hover:bg-slate-50"
            title="Kanban"
            disabled
          >
            <PieChart className="h-4 w-4" />
          </button>
        </div>
        {onPrint ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 ml-1"
            onClick={onPrint}
          >
            <Printer className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Odoo report toolbar: Print + title + filter chips */
export function ReviewReportToolbar({
  title,
  filters,
  onPrint,
}: {
  title: string;
  filters: ReactNode;
  onPrint?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-2 border-b border-slate-200 bg-white sticky top-0 z-10">
      <div className="flex items-center gap-2 min-w-0">
        {onPrint ? (
          <Button
            type="button"
            size="sm"
            onClick={onPrint}
            className="h-8 rounded-md px-3 font-medium text-white shrink-0"
            style={{ backgroundColor: REVIEW_TEAL }}
          >
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Print
          </Button>
        ) : null}
        <h1 className="text-base sm:text-lg font-semibold text-slate-800">{title}</h1>
        <button
          type="button"
          className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          title="Settings"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{filters}</div>
    </div>
  );
}

export function ReviewFilterChip({
  icon,
  children,
  onClick,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-slate-200 bg-white text-xs sm:text-sm text-slate-700 hover:bg-slate-50 whitespace-nowrap"
    >
      {icon}
      {children}
    </button>
  );
}

export function ReviewReportCard({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-4xl mt-4 mb-8">
      <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden print:shadow-none">
        {children}
      </div>
    </div>
  );
}

export function ReviewPagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex items-center gap-2 text-sm text-slate-600 shrink-0">
      <span className="whitespace-nowrap tabular-nums">
        {from}–{to} / {total}
      </span>
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="h-7 w-7 rounded border border-slate-200 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50"
        aria-label="Previous page"
      >
        ‹
      </button>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="h-7 w-7 rounded border border-slate-200 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50"
        aria-label="Next page"
      >
        ›
      </button>
    </div>
  );
}

export function ReviewAuthorCell({ name }: { name: string | null }) {
  const label = name || "System";
  const initial = label.charAt(0).toUpperCase();
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold text-white shrink-0"
        style={{ backgroundColor: REVIEW_TEAL }}
      >
        {initial}
      </span>
      <span className="text-sm text-slate-700">{label}</span>
    </span>
  );
}

export function ReviewChangeDescription({
  previous,
  next,
  fieldLabel,
}: {
  previous: unknown;
  next: unknown;
  fieldLabel?: string;
}) {
  const prevStr =
    previous == null || previous === ""
      ? "None"
      : typeof previous === "string"
        ? previous
        : JSON.stringify(previous);
  const nextStr =
    next == null || next === ""
      ? "None"
      : typeof next === "string"
        ? next
        : JSON.stringify(next);

  if (prevStr === nextStr && !fieldLabel) {
    return <span className="text-sm text-slate-600">{nextStr}</span>;
  }

  return (
    <span className="text-sm text-slate-600">
      <span className="text-slate-500">{prevStr}</span>
      <span className="mx-1.5 text-slate-400">→</span>
      <span style={{ color: REVIEW_TEAL }} className="font-medium">
        {nextStr}
      </span>
      {fieldLabel ? (
        <span className="text-slate-400 ml-1">({fieldLabel})</span>
      ) : null}
    </span>
  );
}

export function ReviewCalendarIcon() {
  return <Calendar className="h-3.5 w-3.5 text-slate-500" />;
}

export function ReviewSlidersIcon() {
  return <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />;
}

export function ReviewEmptyState({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div
        className="inline-flex h-16 w-16 items-center justify-center rounded-full mb-4"
        style={{ backgroundColor: `${REVIEW_TEAL}18`, color: REVIEW_TEAL }}
      >
        {icon ?? (
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM8 13h8v2H8v-2zm0 4h5v2H8v-2z" />
          </svg>
        )}
      </div>
      <p className="text-base font-medium text-slate-700">{title}</p>
      {subtitle ? (
        <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
      ) : null}
    </div>
  );
}

export function ReviewUnsupportedBanner({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="mx-auto max-w-5xl mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm font-semibold text-amber-950">{title}</p>
      <p className="text-sm text-amber-900/80 mt-1 leading-relaxed">{body}</p>
    </div>
  );
}

export function ReviewMeasuresBar({
  measures,
}: {
  measures: { label: string; value: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 px-3 py-2 border-b border-slate-100 bg-slate-50/80 text-xs">
      {measures.map((m) => (
        <div key={m.label} className="flex items-center gap-1.5">
          <span className="text-slate-500 uppercase tracking-wide font-medium">
            {m.label}
          </span>
          <span className="font-semibold tabular-nums text-slate-800">{m.value}</span>
        </div>
      ))}
    </div>
  );
}
