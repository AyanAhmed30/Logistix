"use client";

export function SalesPageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div
      className="space-y-3 animate-pulse motion-safe:transition-opacity"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="flex justify-between gap-3">
        <div className="h-8 w-40 rounded-sm bg-slate-200" />
        <div className="h-8 w-24 rounded-sm bg-slate-100" />
      </div>
      <div className="rounded-sm border border-slate-200 bg-white overflow-hidden">
        <div className="h-10 bg-slate-50 border-b border-slate-200" />
        <div className="space-y-0">
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="h-11 border-b border-slate-100 px-4 flex items-center"
            >
              <div className="h-3 w-full max-w-xl rounded-sm bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SalesReportSkeleton() {
  return (
    <div
      className="space-y-3 animate-pulse"
      aria-busy="true"
      aria-label="Loading reports"
    >
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-white border border-slate-200 rounded-sm px-3 py-3 shadow-sm"
          >
            <div className="h-2.5 w-16 rounded-sm bg-slate-100" />
            <div className="h-5 w-20 rounded-sm bg-slate-200 mt-2" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white border border-slate-200 rounded-sm p-4 h-48 shadow-sm"
          >
            <div className="h-3 w-32 rounded-sm bg-slate-200 mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-2.5 rounded-sm bg-slate-100" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SalesKanbanSkeleton() {
  return (
    <div
      className="flex gap-3 overflow-x-auto pb-4 animate-pulse"
      aria-busy="true"
      aria-label="Loading kanban"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="w-[280px] shrink-0 rounded-sm border border-slate-200 bg-slate-50"
        >
          <div className="h-12 border-b border-slate-200 px-3 py-3">
            <div className="h-4 w-24 rounded-sm bg-slate-200" />
          </div>
          <div className="p-2 space-y-2">
            {Array.from({ length: 3 }).map((_, j) => (
              <div
                key={j}
                className="h-28 rounded-sm bg-white border border-slate-200"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SalesEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-in fade-in duration-300">
      <p className="text-base font-semibold text-primary-dark">{title}</p>
      {description ? (
        <p className="mt-1 text-sm text-secondary-muted max-w-md">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
