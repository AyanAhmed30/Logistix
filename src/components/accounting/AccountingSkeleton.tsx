"use client";

import { cn } from "@/lib/utils";

export function AccountingSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-sm bg-slate-200/80",
        className
      )}
      aria-hidden
    />
  );
}

export function AccountingTableSkeleton({
  rows = 8,
  cols = 6,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-sm overflow-hidden" role="status" aria-label="Loading">
      <div className="border-b border-slate-100 bg-slate-50/80 px-3 py-3 flex gap-3">
        {Array.from({ length: cols }).map((_, i) => (
          <AccountingSkeleton key={`h-${i}`} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={`r-${r}`} className="px-3 py-3 flex gap-3">
            {Array.from({ length: cols }).map((_, c) => (
              <AccountingSkeleton
                key={`c-${r}-${c}`}
                className={cn("h-3.5 flex-1", c === 0 && "max-w-[120px]")}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AccountingKpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-sm border border-slate-200 bg-white p-3 space-y-2">
          <AccountingSkeleton className="h-3 w-20" />
          <AccountingSkeleton className="h-6 w-28" />
        </div>
      ))}
    </div>
  );
}

export function AccountingFormSkeleton() {
  return (
    <div className="bg-white border border-slate-200 rounded-sm p-4 space-y-4" role="status" aria-label="Loading">
      <div className="flex gap-2">
        <AccountingSkeleton className="h-8 w-20" />
        <AccountingSkeleton className="h-8 w-20" />
        <AccountingSkeleton className="h-8 w-24" />
      </div>
      <AccountingSkeleton className="h-6 w-48" />
      <div className="grid gap-3 sm:grid-cols-2">
        <AccountingSkeleton className="h-8 w-full" />
        <AccountingSkeleton className="h-8 w-full" />
        <AccountingSkeleton className="h-8 w-full" />
        <AccountingSkeleton className="h-8 w-full" />
      </div>
      <AccountingTableSkeleton rows={4} cols={5} />
    </div>
  );
}

export function AccountingChartSkeleton() {
  return (
    <div className="bg-white border border-slate-200 rounded-sm p-3 h-72 space-y-3" role="status" aria-label="Loading">
      <AccountingSkeleton className="h-4 w-32" />
      <AccountingSkeleton className="h-full w-full min-h-[220px]" />
    </div>
  );
}
