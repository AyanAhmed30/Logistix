"use client";

import { Fragment, useEffect, useState } from "react";
import { getReadyForLoadingConsoles, getConsoleWithOrders } from "@/app/actions/consoles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ConsoleLoadingManageCard } from "@/components/admin/ConsoleLoadingManageCard";
import { LOADING_PHASE_LABELS, type LoadingPhase } from "@/lib/loading-workflow-types";

type Carton = {
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  carton_index: number;
};

type Order = {
  id: string;
  username: string;
  shipping_mark: string;
  destination_country: string;
  total_cartons: number;
  item_description: string | null;
  created_at: string;
  cartons: Carton[];
};

type Console = {
  id: string;
  console_number: string;
  container_number: string;
  date: string;
  bl_number: string;
  carrier: string;
  so: string;
  total_cartons: number;
  total_cbm: number;
  max_cbm: number;
  status: string;
  loading_phase?: string | null;
  created_at: string;
  updated_at: string;
};

export function LoadingInstructionPanel() {
  const [consoles, setConsoles] = useState<Console[]>([]);
  const [consoleOrderCounts, setConsoleOrderCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedConsoles, setExpandedConsoles] = useState<Set<string>>(new Set());
  const [consoleOrders, setConsoleOrders] = useState<Record<string, Order[]>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const fetchConsoles = async () => {
      setIsLoading(true);
      const result = await getReadyForLoadingConsoles();

      if (!isMounted) return;

      if ("error" in result) {
        setError(result.error ?? "Unable to load consoles");
        setConsoles([]);
      } else {
        setError(null);
        const fetched = result.consoles as Console[];
        setConsoles(fetched);

        const countPairs = await Promise.all(
          fetched.map(async (c) => {
            const details = await getConsoleWithOrders(c.id, { onlyLatestSentToLoading: true });
            if ("error" in details) return [c.id, 0] as const;
            return [c.id, Array.isArray(details.orders) ? details.orders.length : 0] as const;
          })
        );
        if (!isMounted) return;
        setConsoleOrderCounts(Object.fromEntries(countPairs));
      }
      setIsLoading(false);
    };

    fetchConsoles();

    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  const fetchConsoleOrders = async (consoleId: string) => {
    if (consoleOrders[consoleId]) return; // Already loaded

    const result = await getConsoleWithOrders(consoleId, { onlyLatestSentToLoading: true });
    if ("error" in result) {
      return;
    }

    setConsoleOrders((prev) => ({
      ...prev,
      [consoleId]: result.orders as Order[],
    }));
    setConsoleOrderCounts((prev) => ({
      ...prev,
      [consoleId]: Array.isArray(result.orders) ? result.orders.length : 0,
    }));
  };

  const toggleConsole = (consoleId: string) => {
    const isCurrentlyExpanded = expandedConsoles.has(consoleId);
    const willBeExpanded = !isCurrentlyExpanded;

    setExpandedConsoles((prev) => {
      const newSet = new Set(prev);
      if (willBeExpanded) {
        newSet.add(consoleId);
      } else {
        newSet.delete(consoleId);
      }
      return newSet;
    });

    // Fetch orders after state update, outside the setter
    if (willBeExpanded && !consoleOrders[consoleId]) {
      fetchConsoleOrders(consoleId);
    }
  };

  const calcOrderTotals = (order: Order) => {
    const totalWeight = (order.cartons || []).reduce(
      (sum, carton) => sum + (carton.weight ?? 0),
      0
    );
    const totalCbm = (order.cartons || []).reduce((sum, carton) => {
      const length = carton.length ?? 0;
      const width = carton.width ?? 0;
      const height = carton.height ?? 0;
      if (!length || !width || !height) return sum;
      return sum + (length * width * height) / 1_000_000;
    }, 0);
    return { totalWeight, totalCbm };
  };

  const buildConsoleOrderSummary = (orders: Order[]) => {
    const grouped = new Map<
      string,
      {
        shippingMark: string;
        orderDescription: string;
        orderCount: number;
        totalCartons: number;
        totalWeight: number;
        totalCbm: number;
      }
    >();

    for (const order of orders) {
      const key = order.shipping_mark || "NO_MARK";
      const totals = calcOrderTotals(order);
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          shippingMark: order.shipping_mark || "-",
          orderDescription: order.item_description || "-",
          orderCount: 1,
          totalCartons: order.total_cartons || 0,
          totalWeight: totals.totalWeight,
          totalCbm: totals.totalCbm,
        });
      } else {
        existing.orderCount += 1;
        existing.totalCartons += order.total_cartons || 0;
        existing.totalWeight += totals.totalWeight;
        existing.totalCbm += totals.totalCbm;
      }
    }

    return Array.from(grouped.values()).sort((a, b) =>
      a.shippingMark.localeCompare(b.shippingMark)
    );
  };

  if (isLoading) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Loading Instructions</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-secondary-muted">Loading consoles...</div>
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
          Simple view: each console with complete order details for loading accountability.
        </p>
      </div>

      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Ready for Loading Consoles</CardTitle>
          <CardDescription>
            Consoles that have been marked as ready for loading
          </CardDescription>
        </CardHeader>
        <CardContent>
          {consoles.length === 0 ? (
            <div className="text-center py-8 text-secondary-muted">
              No consoles ready for loading yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Console #</TableHead>
                    <TableHead>Container</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead>BL Number</TableHead>
                    <TableHead>Carrier</TableHead>
                    <TableHead>SO</TableHead>
                    <TableHead>Phase</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Total Cartons</TableHead>
                    <TableHead>Total CBM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consoles.map((console) => {
                    const isExpanded = expandedConsoles.has(console.id);
                    const orders = consoleOrders[console.id] || [];
                    const orderCount = consoleOrderCounts[console.id] ?? 0;
                    const summaryRows = buildConsoleOrderSummary(orders);

                    return (
                      <Fragment key={console.id}>
                        <TableRow>
                          <TableCell>
                            <button
                              onClick={() => toggleConsole(console.id)}
                              className="text-primary-dark hover:text-primary-accent"
                              title={isExpanded ? "Collapse console details" : "Expand console details"}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          </TableCell>
                          <TableCell className="font-medium">{console.console_number}</TableCell>
                          <TableCell>{console.container_number}</TableCell>
                          <TableCell>{new Date(console.date).toLocaleDateString()}</TableCell>
                          <TableCell>{new Date(console.created_at).toLocaleString()}</TableCell>
                          <TableCell>{console.bl_number}</TableCell>
                          <TableCell>{console.carrier}</TableCell>
                          <TableCell>{console.so}</TableCell>
                          <TableCell>
                            {LOADING_PHASE_LABELS[(console.loading_phase ?? "open") as LoadingPhase] ??
                              "Ready for Loading"}
                          </TableCell>
                          <TableCell>{orderCount}</TableCell>
                          <TableCell>{console.total_cartons}</TableCell>
                          <TableCell>{console.total_cbm.toFixed(3)}</TableCell>
                        </TableRow>

                        {isExpanded ? (
                          <TableRow>
                            <TableCell colSpan={12} className="bg-slate-50">
                              <div className="py-3 space-y-4">
                                <ConsoleLoadingManageCard
                                  consoleId={console.id}
                                  consoleNumber={console.console_number}
                                  loadingPhase={console.loading_phase}
                                  orders={orders}
                                  onUpdated={() => {
                                    setConsoleOrders((prev) => {
                                      const next = { ...prev };
                                      delete next[console.id];
                                      return next;
                                    });
                                    setRefreshKey((k) => k + 1);
                                    if (expandedConsoles.has(console.id)) {
                                      void fetchConsoleOrders(console.id);
                                    }
                                  }}
                                />

                                {orders.length > 0 ? (
                                  <div>
                                    <h4 className="font-semibold mb-3 text-primary-dark">
                                      Console Order Summary ({summaryRows.length} shipping mark groups)
                                    </h4>
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Shipping Mark</TableHead>
                                          <TableHead>Order Description</TableHead>
                                          <TableHead>Order Count</TableHead>
                                          <TableHead>Total Cartons</TableHead>
                                          <TableHead>Weight (kg)</TableHead>
                                          <TableHead>CBM (m³)</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {summaryRows.map((row) => (
                                          <TableRow key={row.shippingMark}>
                                            <TableCell className="font-medium">{row.shippingMark}</TableCell>
                                            <TableCell>{row.orderDescription}</TableCell>
                                            <TableCell>{row.orderCount}</TableCell>
                                            <TableCell>{row.totalCartons}</TableCell>
                                            <TableCell>{row.totalWeight.toFixed(2)}</TableCell>
                                            <TableCell>{row.totalCbm.toFixed(3)}</TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                ) : (
                                  <div className="text-center text-secondary-muted text-sm">
                                    No orders assigned to this console yet.
                                  </div>
                                )}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
