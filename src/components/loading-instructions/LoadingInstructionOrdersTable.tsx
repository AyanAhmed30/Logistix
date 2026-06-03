"use client";

import { Fragment, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  CARTON_STATUS_META,
  formatLoadingDateTime,
  type OrderLoadingProgressRow,
} from "@/lib/loading-instruction-progress";
import { LoadingProgressBar } from "@/components/loading-instructions/LoadingProgressBar";
import { OrderLoadingStatusBadge } from "@/components/loading-instructions/OrderLoadingStatusBadge";
import { CartonMovementTimeline } from "@/components/loading-instructions/CartonMovementTimeline";
import { cn } from "@/lib/utils";

type Props = {
  rows: OrderLoadingProgressRow[];
  variant: "user" | "admin";
  showConsoleColumn?: boolean;
  /** Tighter padding for nested console cards */
  compact?: boolean;
};

export function LoadingInstructionOrdersTable({
  rows,
  variant,
  showConsoleColumn = false,
  compact = false,
}: Props) {
  const headClass = compact ? "h-8 px-2 py-1 text-xs" : undefined;
  const cellClass = compact ? "px-2 py-1.5 text-sm" : undefined;
  const expandCellClass = compact ? "w-8 px-1 py-1.5" : "w-10";
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!rows.length) {
    return (
      <p className={`text-center text-sm text-secondary-muted ${compact ? "py-3" : "py-6"}`}>
        No orders match your search or filters.
      </p>
    );
  }

  const colSpan = (() => {
    if (variant === "admin") {
      let n = 1 + 1 + 4 + 1 + 1 + 1; // expand, console, shipping mark, counts×4, progress, status, last
      if (showConsoleColumn) n += 1; // user
      return n;
    }
    let n = 1 + 1 + 4 + 1 + 1; // expand, shipping mark, counts×4, status, actions
    if (showConsoleColumn) n += 1;
    return n;
  })();

  return (
    <div
      className={`overflow-x-auto bg-white ${compact ? "rounded-md border border-slate-200" : "rounded-lg border"}`}
    >
      <Table className={compact ? "table-auto w-full" : undefined}>
        <TableHeader>
          <TableRow className={compact ? "hover:bg-transparent" : undefined}>
            <TableHead className={expandCellClass} />
            {variant === "admin" ? (
              <>
                <TableHead className={headClass}>Console #</TableHead>
                <TableHead className={headClass}>Shipping Mark</TableHead>
                {showConsoleColumn ? <TableHead className={headClass}>User</TableHead> : null}
              </>
            ) : (
              <>
                <TableHead className={headClass}>Shipping Mark</TableHead>
                {showConsoleColumn ? <TableHead className={headClass}>Console</TableHead> : null}
              </>
            )}
            <TableHead className={cn("text-right", headClass)}>
              {variant === "user" ? "Total Carton" : "Total"}
            </TableHead>
            <TableHead className={cn("text-right", headClass)}>Inward</TableHead>
            <TableHead className={cn("text-right", headClass)}>Outward</TableHead>
            <TableHead className={cn("text-right", headClass)}>Re-In</TableHead>
            {variant === "admin" ? <TableHead className={headClass}>Progress</TableHead> : null}
            <TableHead className={headClass}>Status</TableHead>
            {variant === "admin" ? <TableHead className={headClass}>Last Activity</TableHead> : null}
            {variant === "user" ? (
              <TableHead className={cn("text-right w-16", headClass)}>Actions</TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const key = `${row.console_id}:${row.order_id}`;
            const isOpen = expanded.has(key);
            const cartonMeta = (s: typeof row.cartons[0]["current_status"]) =>
              CARTON_STATUS_META[s];

            return (
              <Fragment key={key}>
                <TableRow className={compact ? "hover:bg-slate-50/80" : "hover:bg-slate-50/80"}>
                  <TableCell className={expandCellClass}>
                    <button
                      type="button"
                      onClick={() => toggle(key)}
                      className="text-primary-dark hover:text-primary-accent p-0.5"
                      aria-expanded={isOpen}
                      title={isOpen ? "Hide carton details" : "Show carton details"}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  </TableCell>
                  {variant === "admin" ? (
                    <>
                      <TableCell className={cn(cellClass, "font-medium")}>{row.console_number}</TableCell>
                      <TableCell className={cellClass}>{row.shipping_mark}</TableCell>
                      {showConsoleColumn ? (
                        <TableCell className={cn(cellClass, "text-sm")}>{row.username ?? "—"}</TableCell>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <TableCell className={cn(cellClass, "font-medium")}>{row.shipping_mark}</TableCell>
                      {showConsoleColumn ? (
                        <TableCell className={cn(cellClass, "text-sm")}>{row.console_number}</TableCell>
                      ) : null}
                    </>
                  )}
                  <TableCell className={cn(cellClass, "text-right tabular-nums")}>{row.counts.total}</TableCell>
                  <TableCell className={cn(cellClass, "text-right tabular-nums text-emerald-700")}>
                    {row.counts.total - row.counts.pending_inward}
                  </TableCell>
                  <TableCell className={cn(cellClass, "text-right tabular-nums text-sky-700")}>
                    {row.counts.outward}
                  </TableCell>
                  <TableCell className={cn(cellClass, "text-right tabular-nums text-amber-700")}>
                    {row.counts.re_inward}
                  </TableCell>
                  {variant === "admin" ? (
                    <TableCell className={cellClass}>
                      <LoadingProgressBar loaded={row.counts.outward} total={row.counts.total} />
                    </TableCell>
                  ) : null}
                  <TableCell className={cellClass}>
                    <OrderLoadingStatusBadge
                      status={row.status}
                      counts={row.counts}
                      variant={variant}
                    />
                  </TableCell>
                  {variant === "admin" ? (
                    <TableCell className={cn(cellClass, "text-xs text-secondary-muted whitespace-nowrap")}>
                      {formatLoadingDateTime(row.last_activity_at)}
                    </TableCell>
                  ) : null}
                  {variant === "user" ? (
                    <TableCell className={cn(cellClass, "text-right")}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={compact ? "h-7 px-2 text-xs" : "h-8 text-xs"}
                        onClick={() => toggle(key)}
                      >
                        {isOpen ? "Hide" : "Details"}
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>

                {isOpen ? (
                  <TableRow>
                    <TableCell colSpan={colSpan} className={compact ? "bg-slate-50 p-3" : "bg-slate-50 p-4"}>
                      <div className={compact ? "grid lg:grid-cols-2 gap-4" : "grid lg:grid-cols-2 gap-6"}>
                        <div>
                          <h4 className="text-sm font-semibold text-primary-dark mb-2">
                            Carton status
                          </h4>
                          <div className="overflow-x-auto rounded-md border bg-white">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Carton No</TableHead>
                                  <TableHead>Shipping Mark</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead>Date &amp; Time</TableHead>
                                  <TableHead>Remarks</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {row.cartons.map((c) => {
                                  const meta = cartonMeta(c.current_status);
                                  return (
                                    <TableRow key={c.carton_id}>
                                      <TableCell className="font-mono text-xs">
                                        {c.carton_no}
                                      </TableCell>
                                      <TableCell className="text-sm">{c.shipping_mark}</TableCell>
                                      <TableCell>
                                        <span
                                          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${meta.className}`}
                                        >
                                          {meta.label}
                                        </span>
                                      </TableCell>
                                      <TableCell className="text-xs whitespace-nowrap">
                                        {formatLoadingDateTime(c.last_activity_at)}
                                      </TableCell>
                                      <TableCell className="text-xs text-secondary-muted max-w-[200px]">
                                        {c.remarks}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-primary-dark mb-3">
                            Carton movement history
                          </h4>
                          <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
                            {row.cartons.map((c) => (
                              <CartonMovementTimeline
                                key={c.carton_id}
                                cartonNo={c.carton_no}
                                timeline={c.timeline}
                                compact
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
