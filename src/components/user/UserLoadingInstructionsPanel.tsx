"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getLoadingInstructionDashboardForUser } from "@/app/actions/loading-instruction-progress";
import {
  reportConsoleFull,
  reportConsoleSpaceAvailable,
} from "@/app/actions/loading-workflow";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LOADING_PHASE_LABELS, type LoadingPhase } from "@/lib/loading-workflow-types";
import { filterAndSortOrderRows } from "@/lib/loading-instruction-progress";
import type {
  LoadingInstructionSortKey,
  LoadingInstructionStatusFilter,
  OrderLoadingProgressRow,
} from "@/lib/loading-instruction-progress";
import { LoadingInstructionFilters } from "@/components/loading-instructions/LoadingInstructionFilters";
import { LoadingInstructionOrdersTable } from "@/components/loading-instructions/LoadingInstructionOrdersTable";
import { toast } from "sonner";

type InstructionBundle = {
  console: {
    id: string;
    console_number: string;
    container_number: string | null;
    carrier?: string | null;
    loading_phase?: string | null;
  };
  orders: OrderLoadingProgressRow[];
  stats: {
    can_report_full?: boolean;
    can_report_space?: boolean;
    loaded_cartons?: number;
    pending_cartons?: number;
    returned_cartons?: number;
  } | null;
};

function phaseBadge(phase: LoadingPhase | null | undefined) {
  const p = (phase ?? "open") as LoadingPhase;
  const variant =
    p === "open"
      ? "default"
      : p === "full_reported"
        ? "destructive"
        : p === "space_available"
          ? "secondary"
          : "outline";
  return <Badge variant={variant}>{LOADING_PHASE_LABELS[p] ?? p}</Badge>;
}

type Props = {
  refreshKey?: number;
  isVisible?: boolean;
  onAfterContainerFull?: () => void;
};

export function UserLoadingInstructionsPanel({
  refreshKey = 0,
  isVisible = true,
  onAfterContainerFull,
}: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bundles, setBundles] = useState<InstructionBundle[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [busyConsoleId, setBusyConsoleId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LoadingInstructionStatusFilter>("all");
  const [sort, setSort] = useState<LoadingInstructionSortKey>("latest_activity");

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setIsLoading(true);
    const res = await getLoadingInstructionDashboardForUser();
    if ("error" in res) {
      setError(res.error ?? "Unable to load loading instructions");
      if (!options?.silent) setBundles([]);
    } else {
      setError(null);
      setBundles((res.instructions ?? []) as InstructionBundle[]);
      setHasLoadedOnce(true);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isVisible && hasLoadedOnce) return;
    queueMicrotask(() => {
      void load(hasLoadedOnce ? { silent: true } : undefined);
    });
  }, [load, refreshKey, isVisible, hasLoadedOnce]);

  const allOrders = useMemo(
    () => bundles.flatMap((b) => b.orders),
    [bundles]
  );

  const filteredOrders = useMemo(
    () => filterAndSortOrderRows(allOrders, { search, statusFilter, sort }),
    [allOrders, search, statusFilter, sort]
  );

  const ordersByConsole = useMemo(() => {
    const map = new Map<string, OrderLoadingProgressRow[]>();
    for (const row of filteredOrders) {
      const list = map.get(row.console_id) ?? [];
      list.push(row);
      map.set(row.console_id, list);
    }
    return map;
  }, [filteredOrders]);

  async function handleReportFull(consoleId: string) {
    setBusyConsoleId(consoleId);
    const res = await reportConsoleFull(consoleId);
    setBusyConsoleId(null);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(
      "Container full — open Scan Progress and scan returning cartons (3rd scan, same QR).",
      { duration: 6000 }
    );
    void load();
    onAfterContainerFull?.();
  }

  async function handleReportSpace(consoleId: string) {
    setBusyConsoleId(consoleId);
    const res = await reportConsoleSpaceAvailable(consoleId);
    setBusyConsoleId(null);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Space available reported. Admin can assign more orders.");
    void load();
  }

  if (isLoading && !hasLoadedOnce) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Loading Instructions</CardTitle>
          <CardDescription>Loading order and carton status…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 animate-pulse">
            <div className="h-10 bg-slate-100 rounded-md" />
            <div className="h-32 bg-slate-100 rounded-md" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Loading Instructions</CardTitle>
          <CardDescription className="text-destructive">{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!bundles.length) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Loading Instructions</CardTitle>
          <CardDescription>
            When admin marks your console ready, orders appear here. Scan outward (2nd scan) in Scan
            Progress; after container full, use Scan Progress for returning cartons (3rd scan).
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="bg-white border shadow-sm gap-0 py-0">
        <CardHeader className="px-4 py-2.5 pb-2">
          <CardTitle className="text-base">Search &amp; filter</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pt-0 pb-3">
          <LoadingInstructionFilters
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            sort={sort}
            onSortChange={setSort}
          />
        </CardContent>
      </Card>

      {bundles.map(({ console: cons, stats }) => {
        const phase = (cons.loading_phase ?? "open") as LoadingPhase;
        const isBusy = busyConsoleId === cons.id;
        const consoleOrders = ordersByConsole.get(cons.id) ?? [];

        if (!consoleOrders.length && (search || statusFilter !== "all")) {
          return null;
        }

        return (
          <Card key={cons.id} className="bg-white border shadow-sm gap-0 py-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/40">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <CardTitle className="text-base font-semibold leading-tight">
                  Console {cons.console_number}
                </CardTitle>
                {phaseBadge(phase)}
              </div>
              <div className="flex flex-wrap gap-1.5 shrink-0">
                {stats?.can_report_full ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-8"
                    disabled={isBusy}
                    onClick={() => void handleReportFull(cons.id)}
                  >
                    Report container full
                  </Button>
                ) : null}
                {stats?.can_report_space ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8"
                    disabled={isBusy}
                    onClick={() => void handleReportSpace(cons.id)}
                  >
                    Report space available
                  </Button>
                ) : null}
              </div>
            </div>
            <CardContent className="px-2 py-2 sm:px-3">
              <LoadingInstructionOrdersTable
                rows={consoleOrders}
                variant="user"
                compact
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
