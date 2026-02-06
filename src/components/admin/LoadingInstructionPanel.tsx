"use client";

import { useEffect, useState } from "react";
import { getReadyForLoadingConsoles, getConsoleWithOrders } from "@/app/actions/consoles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "lucide-react";

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
  created_at: string;
  updated_at: string;
};

export function LoadingInstructionPanel() {
  const [consoles, setConsoles] = useState<Console[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedConsoles, setExpandedConsoles] = useState<Set<string>>(new Set());
  const [consoleOrders, setConsoleOrders] = useState<Record<string, Order[]>>({});

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
        setConsoles(result.consoles as Console[]);
      }
      setIsLoading(false);
    };

    fetchConsoles();

    return () => {
      isMounted = false;
    };
  }, []);

  const fetchConsoleOrders = async (consoleId: string) => {
    if (consoleOrders[consoleId]) return; // Already loaded

    const result = await getConsoleWithOrders(consoleId);
    if ("error" in result) {
      return;
    }

    setConsoleOrders((prev) => ({
      ...prev,
      [consoleId]: result.orders as Order[],
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
          Consoles ready for loading instructions
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
            <div className="space-y-4">
              {consoles.map((console) => {
                const isExpanded = expandedConsoles.has(console.id);
                const orders = consoleOrders[console.id] || [];

                return (
                  <Card key={console.id} className="border">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleConsole(console.id)}
                            className="text-primary-dark hover:text-primary-accent"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5" />
                            ) : (
                              <ChevronRight className="h-5 w-5" />
                            )}
                          </button>
                          <div>
                            <CardTitle className="text-lg">
                              Console #{console.console_number}
                            </CardTitle>
                            <CardDescription className="text-xs">
                              Container: {console.container_number} | BL: {console.bl_number}
                            </CardDescription>
                          </div>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                          Ready for Loading
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-secondary-muted">Date:</span>
                          <div className="font-medium">
                            {new Date(console.date).toLocaleDateString()}
                          </div>
                        </div>
                        <div>
                          <span className="text-secondary-muted">Carrier:</span>
                          <div className="font-medium">{console.carrier}</div>
                        </div>
                        <div>
                          <span className="text-secondary-muted">SO:</span>
                          <div className="font-medium">{console.so}</div>
                        </div>
                        <div>
                          <span className="text-secondary-muted">Total Cartons:</span>
                          <div className="font-medium">{console.total_cartons}</div>
                        </div>
                        <div>
                          <span className="text-secondary-muted">Total CBM:</span>
                          <div className="font-medium">
                            {console.total_cbm.toFixed(3)}
                            <span className="text-xs text-secondary-muted ml-1">(from assigned orders)</span>
                          </div>
                        </div>
                      </div>

                      {isExpanded && orders.length > 0 && (
                        <div className="mt-6 pt-6 border-t">
                          <h4 className="font-semibold mb-4 text-primary-dark">
                            Assigned Orders ({orders.length})
                          </h4>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Shipping Mark</TableHead>
                                <TableHead>UUID</TableHead>
                                <TableHead>Username</TableHead>
                                <TableHead>Item Description</TableHead>
                                <TableHead>Cartons</TableHead>
                                <TableHead>Weight (kg)</TableHead>
                                <TableHead>CBM (m³)</TableHead>
                                <TableHead>Date & Time</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {orders.map((order) => {
                                const totals = calcOrderTotals(order);
                                return (
                                  <TableRow key={order.id}>
                                    <TableCell className="font-medium">
                                      {order.shipping_mark}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                      {order.id.slice(0, 8)}...
                                    </TableCell>
                                    <TableCell>{order.username}</TableCell>
                                    <TableCell>{order.item_description || "N/A"}</TableCell>
                                    <TableCell>{order.total_cartons}</TableCell>
                                    <TableCell>{totals.totalWeight.toFixed(2)}</TableCell>
                                    <TableCell>{totals.totalCbm.toFixed(3)}</TableCell>
                                    <TableCell>
                                      {new Date(order.created_at).toLocaleString()}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
