"use client";

import { Fragment, useEffect, useState } from "react";
import { createConsole, getAllConsoles, getConsoleWithOrders, markConsoleReadyForLoading } from "@/app/actions/consoles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Truck } from "lucide-react";

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
  status?: string;
  created_at: string;
  updated_at: string;
};

export function ConsolePanel() {
  const [consoles, setConsoles] = useState<Console[]>([]);
  const [consoleOrderCounts, setConsoleOrderCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedConsoles, setExpandedConsoles] = useState<Set<string>>(new Set());
  const [consoleOrders, setConsoleOrders] = useState<Record<string, Order[]>>({});
  const [readyForLoadingOpen, setReadyForLoadingOpen] = useState(false);
  const [selectedConsoleForLoading, setSelectedConsoleForLoading] = useState<Console | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    console_number: "",
    container_number: "",
    date: "",
    bl_number: "",
    carrier: "",
    so: "",
  });

  useEffect(() => {
    let isMounted = true;

    const fetchConsoles = async () => {
      setIsLoading(true);
      const result = await getAllConsoles();

      if (!isMounted) return;

      if ("error" in result) {
        setError(result.error ?? "Unable to load consoles");
        setConsoles([]);
      } else {
        setError(null);
        const fetchedConsoles = result.consoles as Console[];
        setConsoles(fetchedConsoles);

        // Preload order counts so "Orders" column is accurate even before expanding a row.
        const countPairs = await Promise.all(
          fetchedConsoles.map(async (c) => {
            const details = await getConsoleWithOrders(c.id);
            if ("error" in details) return [c.id, 0] as const;
            const count = Array.isArray(details.orders) ? details.orders.length : 0;
            return [c.id, count] as const;
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
  }, []);

  const fetchConsoleOrders = async (consoleId: string) => {
    if (consoleOrders[consoleId]) return; // Already loaded

    const result = await getConsoleWithOrders(consoleId);
    if ("error" in result) {
      toast.error(result.error ?? "Failed to load console orders");
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
      if (isCurrentlyExpanded) {
        newSet.delete(consoleId);
      } else {
        newSet.add(consoleId);
      }
      return newSet;
    });
    
    // Fetch orders after state update, outside the setter
    if (willBeExpanded && !consoleOrders[consoleId]) {
      fetchConsoleOrders(consoleId);
    }
  };

  const handleCreateConsole = async () => {
    if (!formData.console_number.trim()) {
      toast.error("Console number is required");
      return;
    }
    if (!formData.container_number.trim()) {
      toast.error("Container number is required");
      return;
    }
    if (!formData.date) {
      toast.error("Date is required");
      return;
    }
    if (!formData.bl_number.trim()) {
      toast.error("BL number is required");
      return;
    }
    if (!formData.carrier.trim()) {
      toast.error("Carrier is required");
      return;
    }
    if (!formData.so.trim()) {
      toast.error("SO is required");
      return;
    }

    const result = await createConsole({
      console_number: formData.console_number.trim(),
      container_number: formData.container_number.trim(),
      date: formData.date,
      bl_number: formData.bl_number.trim(),
      carrier: formData.carrier.trim(),
      so: formData.so.trim(),
      total_cartons: 0, // Will be auto-calculated when orders are assigned
      total_cbm: 0, // Starts at 0, accumulates as orders are assigned
    });

    if ("error" in result) {
      toast.error(result.error ?? "Failed to create console");
      return;
    }

    toast.success("Console created successfully");
    setCreateOpen(false);
    setFormData({
      console_number: "",
      container_number: "",
      date: "",
      bl_number: "",
      carrier: "",
      so: "",
    });

    // Refresh consoles list
    const refreshResult = await getAllConsoles();
    if ("consoles" in refreshResult) {
      const refreshed = refreshResult.consoles as Console[];
      setConsoles(refreshed);
    }
  };

  const handleMarkReadyForLoading = async () => {
    if (!selectedConsoleForLoading) return;

    const result = await markConsoleReadyForLoading(selectedConsoleForLoading.id);

    if ("error" in result) {
      toast.error(result.error ?? "Failed to mark console as ready for loading");
      return;
    }

    toast.success("Console is ready for loading and remains available in Console tab.");
    setReadyForLoadingOpen(false);
    setSelectedConsoleForLoading(null);

    // Refresh console list to reflect updated status.
    const refreshResult = await getAllConsoles();
    if ("consoles" in refreshResult) {
      const refreshed = refreshResult.consoles as Console[];
      setConsoles(refreshed);
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
      const current = grouped.get(key);
      const totals = calcOrderTotals(order);
      if (!current) {
        grouped.set(key, {
          shippingMark: order.shipping_mark || "-",
          orderDescription: order.item_description || "-",
          orderCount: 1,
          totalCartons: order.total_cartons || 0,
          totalWeight: totals.totalWeight,
          totalCbm: totals.totalCbm,
        });
      } else {
        current.orderCount += 1;
        current.totalCartons += order.total_cartons || 0;
        current.totalWeight += totals.totalWeight;
        current.totalCbm += totals.totalCbm;
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
          <CardTitle>Console Management</CardTitle>
          <CardDescription>Loading consoles...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Console Management</CardTitle>
          <CardDescription>Unable to load consoles: {error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Console Management</CardTitle>
              <CardDescription className="text-sm">Create and manage consoles for order assignment</CardDescription>
            </div>
            <Button onClick={() => setCreateOpen(true)} className="create-console-btn bg-primary-dark hover:bg-primary-accent text-white w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Create Console
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {consoles.length === 0 ? (
            <div className="text-center py-8 text-secondary-muted">
              No consoles created yet. Click &quot;Create Console&quot; to get started.
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
                    <TableHead>Orders</TableHead>
                    <TableHead>Total Cartons</TableHead>
                    <TableHead>Total CBM</TableHead>
                    <TableHead className="text-right">Action</TableHead>
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
                          <TableCell>{orderCount}</TableCell>
                          <TableCell>{console.total_cartons}</TableCell>
                          <TableCell>{console.total_cbm.toFixed(3)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              onClick={() => {
                                setSelectedConsoleForLoading(console);
                                setReadyForLoadingOpen(true);
                              }}
                              className="ready-for-loading-btn bg-primary-dark hover:bg-primary-accent text-white"
                              size="sm"
                            >
                              <Truck className="h-4 w-4 mr-2" />
                              Ready
                            </Button>
                          </TableCell>
                        </TableRow>

                        {isExpanded ? (
                          <TableRow>
                            <TableCell colSpan={11} className="bg-slate-50">
                              {orders.length > 0 ? (
                                <div className="py-3">
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
                                <div className="py-3 text-center text-secondary-muted text-sm">
                                  No orders assigned to this console yet.
                                </div>
                              )}
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Console</DialogTitle>
            <DialogDescription>
              Fill in the console details. All fields are required.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="console_number">Console Number *</Label>
                <Input
                  id="console_number"
                  value={formData.console_number}
                  onChange={(e) =>
                    setFormData({ ...formData, console_number: e.target.value })
                  }
                  placeholder="CON-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="container_number">Container Number *</Label>
                <Input
                  id="container_number"
                  value={formData.container_number}
                  onChange={(e) =>
                    setFormData({ ...formData, container_number: e.target.value })
                  }
                  placeholder="CONT-12345"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bl_number">BL Number *</Label>
                <Input
                  id="bl_number"
                  value={formData.bl_number}
                  onChange={(e) => setFormData({ ...formData, bl_number: e.target.value })}
                  placeholder="BL-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="carrier">Carrier *</Label>
                <Input
                  id="carrier"
                  value={formData.carrier}
                  onChange={(e) => setFormData({ ...formData, carrier: e.target.value })}
                  placeholder="Carrier Name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="so">SO *</Label>
              <Input
                id="so"
                value={formData.so}
                onChange={(e) => setFormData({ ...formData, so: e.target.value })}
                placeholder="SO-001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="total_cartons">
                Total Number of Cartons
                <span className="text-xs text-secondary-muted ml-1">(Auto-calculated)</span>
              </Label>
              <Input
                id="total_cartons"
                type="number"
                min="0"
                value=""
                disabled
                placeholder="Auto-calculated after order assignment"
                className="bg-slate-50 cursor-not-allowed"
              />
              <p className="text-xs text-secondary-muted mt-1">
                This value will be automatically calculated and updated when you assign orders to this console from the Order Management page.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="total_cbm_info">
                Total CBM
                <span className="text-xs text-secondary-muted ml-1">(Auto-calculated)</span>
              </Label>
              <Input
                id="total_cbm_info"
                type="text"
                value="Auto-calculated from assigned orders"
                disabled
                className="bg-slate-50 cursor-not-allowed"
              />
              <p className="text-xs text-secondary-muted mt-1">
                CBM will be automatically calculated and updated based on the total CBM of orders assigned to this console.
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={handleCreateConsole} className="create-console-btn bg-primary-dark hover:bg-primary-accent text-white w-full sm:w-auto">Create Console</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ready for Loading Modal */}
      <Dialog open={readyForLoadingOpen} onOpenChange={setReadyForLoadingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ready for Loading</DialogTitle>
            <DialogDescription>
              {selectedConsoleForLoading && (
                <>
                  This console contains {selectedConsoleForLoading.total_cbm.toFixed(3)} CBM calculated from assigned orders.
                  <br />
                  <br />
                  Do you want to move this console to Loading?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setReadyForLoadingOpen(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={handleMarkReadyForLoading} className="w-full sm:w-auto">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
