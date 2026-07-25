"use client";

import { useMemo } from "react";
import { Clock, History } from "lucide-react";
import type { PortalUserActivityLog } from "@/app/actions/user";

type Props = {
  logs: PortalUserActivityLog[];
  isLoading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
};

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderModuleAccessMeta(log: PortalUserActivityLog) {
  const added = Array.isArray(log.metadata?.added)
    ? (log.metadata?.added as string[])
    : [];
  const removed = Array.isArray(log.metadata?.removed)
    ? (log.metadata?.removed as string[])
    : [];

  if (added.length === 0 && removed.length === 0) return null;

  return (
    <div className="mt-2 space-y-1 text-xs text-slate-600">
      {added.length > 0 ? (
        <p>
          <span className="font-medium text-emerald-700">Added:</span> {added.join(", ")}
        </p>
      ) : null}
      {removed.length > 0 ? (
        <p>
          <span className="font-medium text-red-700">Removed:</span> {removed.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

export function PortalUserActivityPanel({
  logs,
  isLoading = false,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
}: Props) {
  const grouped = useMemo(() => logs, [logs]);

  return (
    <aside className="rounded-lg border border-slate-200 bg-white flex flex-col min-h-[420px] lg:min-h-[calc(100vh-14rem)] lg:sticky lg:top-24">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 bg-slate-50/80">
        <History className="h-4 w-4 text-[#714B67]" />
        <h3 className="text-sm font-semibold text-slate-900">Activity</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <p className="text-sm text-slate-500 py-8 text-center">Loading activity…</p>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">No activity recorded yet.</p>
        ) : (
          grouped.map((log) => {
            const title =
              log.action_type === "created"
                ? `${log.performed_by} created the user`
                : `${log.performed_by} changed ${log.field_name || "a field"}`;

            return (
              <div key={log.id} className="rounded-md border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex items-start gap-2">
                  <Clock className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-900">{title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {formatTimestamp(log.created_at)}
                    </p>

                    {log.action_type !== "created" && (log.previous_value || log.new_value) ? (
                      <div className="mt-2 rounded border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 space-y-1">
                        {log.previous_value ? (
                          <p>
                            <span className="font-medium text-slate-500">Old:</span>{" "}
                            {log.previous_value}
                          </p>
                        ) : null}
                        {log.new_value ? (
                          <p>
                            <span className="font-medium text-slate-500">New:</span>{" "}
                            {log.new_value}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {renderModuleAccessMeta(log)}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {hasMore ? (
          <button
            type="button"
            className="w-full text-sm text-[#714B67] hover:underline disabled:opacity-50"
            onClick={onLoadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? "Loading…" : "Load more"}
          </button>
        ) : null}
      </div>
    </aside>
  );
}
