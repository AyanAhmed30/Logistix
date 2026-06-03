"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { getLoadingInstructionDashboardForAdmin } from "@/app/actions/loading-instruction-progress";
import { getConsoleWithOrders } from "@/app/actions/consoles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ConsoleLoadingManageCard } from "@/components/admin/ConsoleLoadingManageCard";
import { LOADING_PHASE_LABELS, type LoadingPhase } from "@/lib/loading-workflow-types";
import {
  filterAndSortOrderRows,
  type LoadingInstructionDashboardSummary,
  type LoadingInstructionSortKey,
  type LoadingInstructionStatusFilter,
  type OrderLoadingProgressRow,
} from "@/lib/loading-instruction-progress";
import { LoadingInstructionSummaryCards } from "@/components/loading-instructions/LoadingInstructionSummaryCards";
import { LoadingInstructionFilters } from "@/components/loading-instructions/LoadingInstructionFilters";
import { LoadingInstructionOrdersTable } from "@/components/loading-instructions/LoadingInstructionOrdersTable";

type ConsoleMeta = {
  id: string;
  console_number: string;
  container_number: string;
  loading_phase: string | null;
  date: string;
  bl_number: string;
  carrier: string;
  so: string;
  total_cartons: number;
  total_cbm: number;
  created_at: string;
  updated_at: string;
  order_count: number;
};

type ManageOrder = {
  id: string;
  username: string;
  shipping_mark: string;
  total_cartons: number;
};

export function LoadingInstructionPanel() {
  const [consoles, setConsoles] = useState<ConsoleMeta[]>([]);
  const [orders, setOrders] = useState<OrderLoadingProgressRow[]>([]);
  const [summary, setSummary] = useState<LoadingInstructionDashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedConsoles, setExpandedConsoles] = useState<Set<string>>(new Set());
  const [manageOrders, setManageOrders] = useState<Record<string, ManageOrder[]>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LoadingInstructionStatusFilter>("all");
  const [sort, setSort] = useState<LoadingInstructionSortKey>("latest_activity");

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    const result = await getLoadingInstructionDashboardForAdmin();
    if ("error" in result) {
      setError(result.error ?? "Unable to load consoles");
      setConsoles([]);
      setOrders([]);
      setSummary(null);
    } else {
      setError(null);
      setConsoles((result.consoles ?? []) as ConsoleMeta[]);
      setOrders((result.orders ?? []) as OrderLoadingProgressRow[]);
      setSummary(result.summary ?? null);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadDashboard();
    });
  }, [loadDashboard, refreshKey]);

  const filteredOrders = useMemo(
    () => filterAndSortOrderRows(orders, { search, statusFilter, sort }),
    [orders, search, statusFilter, sort]
  );

  const fetchManageOrders = async (consoleId: string) => {
    if (manageOrders[consoleId]) return;
    const result = await getConsoleWithOrders(consoleId, { onlyLatestSentToLoading: true });
    if ("error" in result) return;
    const list = (result.orders ?? []) as Array<{
      id: string;
      username: string;
      shipping_mark: string;
      total_cartons: number;
    }>;
    setManageOrders((prev) => ({
      ...prev,
      [consoleId]: list.map((o) => ({
        id: o.id,
        username: o.username,
        shipping_mark: o.shipping_mark,
        total_cartons: o.total_cartons,
      })),
    }));
  };

  const toggleConsole = (consoleId: string) => {
    const willExpand = !expandedConsoles.has(consoleId);
    setExpandedConsoles((prev) => {
      const next = new Set(prev);
      if (willExpand) next.add(consoleId);
      else next.delete(consoleId);
      return next;
    });
    if (willExpand) void fetchManageOrders(consoleId);
  };

  if (isLoading) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Loading Instructions</CardTitle>
          <CardDescription>Loading operational dashboard…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-secondary-muted">Loading consoles and scan data…</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Loading Instructions</CardTitle>
          <CardDescription>Error loading consoles</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-red-600">{error}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-primary-dark">Loading Instructions</h1>
        <p className="text-secondary-muted mt-1">
          Operational view of every order in active loading — carton counts, progress, scan history,
          and console controls. Business rules are unchanged; only visibility is improved.
        </p>
      </div>

      {summary ? <LoadingInstructionSummaryCards summary={summary} variant="admin" /> : null}

      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Orders in loading</CardTitle>
          <CardDescription>
            Latest batch per console · expand any row for carton table and movement timeline
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <LoadingInstructionFilters
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            sort={sort}
            onSortChange={setSort}
          />

          {filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-secondary-muted">
              {consoles.length === 0
                ? "No consoles ready for loading yet."
                : "No orders match your search or filters."}
            </div>
          ) : (
            <LoadingInstructionOrdersTable
              rows={filteredOrders}
              variant="admin"
              showConsoleColumn
            />
          )}
        </CardContent>
      </Card>

      {consoles.length > 0 ? (
        <Card className="bg-white border shadow-sm">
          <CardHeader>
            <CardTitle>Console controls</CardTitle>
            <CardDescription>
              Pause, finish, or remove orders from the active loading round (same actions as before)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Console #</TableHead>
                    <TableHead>Container</TableHead>
                    <TableHead>Phase</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Cartons</TableHead>
                    <TableHead>Last updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consoles.map((c) => {
                    const isExpanded = expandedConsoles.has(c.id);
                    const mo = manageOrders[c.id] ?? [];

                    return (
                      <Fragment key={c.id}>
                        <TableRow>
                          <TableCell>
                            <button
                              type="button"
                              onClick={() => toggleConsole(c.id)}
                              className="text-primary-dark hover:text-primary-accent"
                              title={isExpanded ? "Collapse" : "Expand controls"}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          </TableCell>
                          <TableCell className="font-medium">{c.console_number}</TableCell>
                          <TableCell>{c.container_number}</TableCell>
                          <TableCell>
                            {LOADING_PHASE_LABELS[(c.loading_phase ?? "open") as LoadingPhase] ??
                              "Ready for Loading"}
                          </TableCell>
                          <TableCell>{c.order_count}</TableCell>
                          <TableCell>{c.total_cartons}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {new Date(c.updated_at).toLocaleString()}
                          </TableCell>
                        </TableRow>
                        {isExpanded ? (
                          <TableRow>
                            <TableCell colSpan={7} className="bg-slate-50">
                              <ConsoleLoadingManageCard
                                consoleId={c.id}
                                consoleNumber={c.console_number}
                                loadingPhase={c.loading_phase}
                                orders={mo}
                                onUpdated={() => {
                                  setManageOrders((prev) => {
                                    const next = { ...prev };
                                    delete next[c.id];
                                    return next;
                                  });
                                  setRefreshKey((k) => k + 1);
                                  if (expandedConsoles.has(c.id)) {
                                    void fetchManageOrders(c.id);
                                  }
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
