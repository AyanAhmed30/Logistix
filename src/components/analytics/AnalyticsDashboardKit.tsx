"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import type { PagedResult, TimelineItem } from "@/app/actions/analytics/sales";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { AnalyticsDateFilter } from "@/components/analytics/AnalyticsDateFilter";
import {
  AnalyticsEmpty,
  AnalyticsError,
  AnalyticsLoading,
  Pager,
  formatDateTime,
} from "@/components/analytics/AnalyticsParts";

/** Loads when `key` changes and ignores any response older than the latest request. */
export function useLoad<T>(load: () => Promise<T | { error: string }>, key: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    load()
      .then((result) => {
        if (cancelled) return;
        if (result && typeof result === "object" && "error" in result) setError(String(result.error));
        else setData(result as T);
      })
      .catch(() => {
        if (!cancelled) setError("The request failed. Check your connection and try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `load` is rebuilt each render; `key` carries what it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);

  return { data, error, loading, onRetry: () => setRetry((n) => n + 1) };
}

/** Paged list that returns to page 1 whenever its filters change. */
export function usePaged<T>(load: (page: number) => Promise<PagedResult<T> | { error: string }>, filterKey: string) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [filterKey]);
  const state = useLoad<PagedResult<T>>(() => load(page), `${filterKey}|${page}`);
  return { ...state, setPage };
}

export function DashboardHeader({
  backHref,
  backLabel,
  name,
  title,
  search,
  onSearch,
  searchPlaceholder,
}: {
  backHref?: string;
  backLabel?: string;
  name: string;
  title: string;
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder: string;
}) {
  const { organizationName, isAdminContext } = useAdminOrganization();
  return (
    <div className="space-y-2">
      {backHref ? (
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-[#017e84]">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {backLabel}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-primary-dark truncate">{name}</h1>
          <p className="text-sm text-slate-600">
            {title} for {isAdminContext ? "all organizations" : organizationName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            className="h-9 w-full sm:w-64 bg-white"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
          <AnalyticsDateFilter />
        </div>
      </div>
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={`rounded-lg border border-slate-200 bg-white ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 px-3 pt-3">
        <div>
          <h2 className="text-base font-semibold text-primary-dark">{title}</h2>
          {description ? <p className="text-xs text-slate-600">{description}</p> : null}
        </div>
        {actions}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export type PipelineStage = {
  id: string;
  label: string;
  count: number;
  /** Fill and matching readable text colour. */
  fill: string;
  text: string;
};

/** Connected chevrons, one per stage. With onSelect, each stage opens its records. */
export function PipelineRow({
  stages,
  selected = null,
  onSelect,
}: {
  stages: PipelineStage[];
  selected?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);
  return (
    <ol className="flex flex-col gap-2 px-3 pb-3 sm:flex-row sm:gap-0">
      {stages.map((stage, index) => {
        const active = selected === stage.id;
        const share = total ? Math.round((stage.count / total) * 100) : 0;
        const chevron = (
          <span
            className={`${stage.fill} flex h-[76px] flex-col items-center justify-center px-5 text-center`}
            style={{
              clipPath:
                index === 0
                  ? "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)"
                  : "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)",
            }}
          >
            <span className={`max-w-full truncate text-xs font-semibold ${stage.text}`}>{stage.label}</span>
            <span className={`text-xl font-semibold tabular-nums ${stage.text}`}>{stage.count.toLocaleString()}</span>
          </span>
        );
        return (
          <li key={stage.id} className={`min-w-0 flex-1 ${index > 0 ? "sm:-ml-2.5" : ""}`}>
            {onSelect ? (
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(active ? null : stage.id)}
                className="block w-full hover:opacity-90 focus-visible:outline-2 focus-visible:outline-[#017e84]"
              >
                {chevron}
                <span className={`mt-1 block text-center text-xs tabular-nums ${active ? "font-semibold text-[#016970]" : "text-slate-600"}`}>
                  {active ? "Showing below" : `${share}%`}
                </span>
              </button>
            ) : (
              chevron
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function SectionTabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: Array<{ id: T; label: string }>;
  active: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-slate-200 px-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
            active === tab.id
              ? "border-[#017e84] text-[#016970]"
              : "border-transparent text-slate-600 hover:text-primary-dark"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function PagedTable<T>({
  state,
  headers,
  renderRow,
  emptyTitle,
  emptyDescription,
}: {
  state: ReturnType<typeof usePaged<T>>;
  headers: Array<{ label: string; right?: boolean }>;
  renderRow: (row: T) => ReactNode;
  emptyTitle: string;
  emptyDescription?: string;
}) {
  const { data, error, loading, setPage, onRetry } = state;
  if (error) return <AnalyticsError message={error} onRetry={onRetry} />;
  if (!data) {
    return (
      <div className="p-3">
        <AnalyticsLoading label="Loading records" />
      </div>
    );
  }
  return (
    <div className={`transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
      {data.rows.length === 0 ? (
        <AnalyticsEmpty title={emptyTitle} description={emptyDescription} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              {headers.map((h) => (
                <TableHead
                  key={h.label}
                  className={`font-semibold text-primary-dark whitespace-nowrap ${h.right ? "text-right" : ""}`}
                >
                  {h.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>{data.rows.map(renderRow)}</TableBody>
        </Table>
      )}
      <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
    </div>
  );
}

export function ActivityRail({
  title,
  state,
  emptyTitle,
}: {
  title: string;
  state: ReturnType<typeof useLoad<{ items: TimelineItem[]; truncated: boolean }>>;
  emptyTitle: string;
}) {
  const { data, error, onRetry } = state;
  return (
    <Panel title={title} description="Recorded events only">
      {error ? (
        <AnalyticsError message={error} onRetry={onRetry} />
      ) : !data ? (
        <div className="p-3">
          <AnalyticsLoading label="Loading activity" />
        </div>
      ) : data.items.length === 0 ? (
        <AnalyticsEmpty title={emptyTitle} />
      ) : (
        <>
          <ol className="max-h-[560px] overflow-y-auto px-3 pb-3">
            {data.items.map((item, index) => (
              <li key={`${item.at}-${index}`} className="border-l-2 border-slate-200 pl-3 pb-3 last:pb-0">
                <p className="text-sm font-medium text-primary-dark">{item.label}</p>
                {item.detail ? <p className="text-sm text-slate-600 truncate">{item.detail}</p> : null}
                <time dateTime={item.at} className="text-xs tabular-nums text-slate-600">
                  {formatDateTime(item.at)}
                </time>
              </li>
            ))}
          </ol>
          {data.truncated ? (
            <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
              Showing the latest 60. Choose a shorter period to see earlier events.
            </p>
          ) : null}
        </>
      )}
    </Panel>
  );
}
