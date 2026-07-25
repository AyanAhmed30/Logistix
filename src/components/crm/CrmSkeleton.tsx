"use client";

/** Shared CRM loading skeletons — matches light ERP theme. */

export function CrmPageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-48 rounded bg-slate-200" />
      <div className="h-4 w-72 rounded bg-slate-100" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-lg border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg border border-slate-200 bg-white" />
        ))}
      </div>
    </div>
  );
}

export function CrmKanbanSkeleton() {
  return (
    <div
      className="flex gap-4 overflow-x-auto pb-4 animate-pulse"
      aria-busy="true"
      aria-label="Loading pipeline"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="w-[300px] shrink-0 rounded-xl border border-slate-200 bg-slate-100/60"
        >
          <div className="h-14 border-b border-slate-200 bg-slate-50 rounded-t-xl px-3 py-3">
            <div className="h-4 w-24 rounded bg-slate-200" />
            <div className="h-3 w-16 rounded bg-slate-100 mt-2" />
          </div>
          <div className="p-2 space-y-2">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="h-24 rounded-lg bg-white border border-slate-200" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CrmFormSkeleton() {
  return (
    <div
      className="rounded-lg border border-slate-200 bg-white overflow-hidden animate-pulse min-h-[480px]"
      aria-busy="true"
      aria-label="Loading opportunity"
    >
      <div className="h-12 border-b border-slate-200 bg-slate-50" />
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px]">
        <div className="p-6 space-y-4">
          <div className="h-8 w-2/3 rounded bg-slate-200" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-16 rounded bg-slate-100" />
            <div className="h-16 rounded bg-slate-100" />
          </div>
          <div className="h-40 rounded bg-slate-50" />
        </div>
        <div className="border-t xl:border-t-0 xl:border-l border-slate-200 bg-slate-50/50 min-h-[320px]" />
      </div>
    </div>
  );
}

export function CrmEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[280px] rounded-sm border border-dashed border-slate-200 bg-white px-6 text-center"
      role="status"
    >
      <h2 className="text-base font-semibold text-primary-dark">{title}</h2>
      {description ? (
        <p className="text-sm text-secondary-muted mt-1.5 max-w-md">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
