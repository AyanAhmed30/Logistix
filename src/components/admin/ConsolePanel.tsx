"use client";

import { useEffect, useState } from "react";
import { createConsole, getAllConsoles, getConsoleWithOrders } from "@/app/actions/consoles";
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
import { ChevronDown, ChevronRight, Plus } from "lucide-react";

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
  created_at: string;
  updated_at: string;
};

export function ConsolePanel() {
  const [consoles, setConsoles] = useState<Console[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedConsoles, setExpandedConsoles] = useState<Set<string>>(new Set());
  const [consoleOrders, setConsoleOrders] = useState<Record<string, Order[]>>({});

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
      toast.error(result.error ?? "Failed to load console orders");
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
      setConsoles(refreshResult.consoles as Console[]);
    }
  };

  const getConsoleStatus = (console: Console): "Empty" | "Partially Filled" | "Full" => {
    if (console.total_cbm === 0) return "Empty";
    if (console.total_cbm >= console.max_cbm) return "Full";
    return "Partially Filled";
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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Console Management</CardTitle>
              <CardDescription>Create and manage consoles for order assignment</CardDescription>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Console
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {consoles.length === 0 ? (
            <div className="text-center py-8 text-secondary-muted">
              No consoles created yet. Click "Create Console" to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {consoles.map((console) => {
                const isExpanded = expandedConsoles.has(console.id);
                const orders = consoleOrders[console.id] || [];
                const status = getConsoleStatus(console);
                const statusColors = {
                  Empty: "bg-gray-100 text-gray-700",
                  "Partially Filled": "bg-yellow-100 text-yellow-700",
                  Full: "bg-green-100 text-green-700",
                };

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
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColors[status]}`}
                        >
                          {status}
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
                            {console.total_cbm.toFixed(3)} / {console.max_cbm} (Accumulated / Max Capacity)
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
                                    <TableCell className="font-mono text-xs">{order.id}</TableCell>
                                    <TableCell>{order.username}</TableCell>
                                    <TableCell>{order.item_description || "-"}</TableCell>
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

                      {isExpanded && orders.length === 0 && (
                        <div className="mt-6 pt-6 border-t text-center text-secondary-muted text-sm">
                          No orders assigned to this console yet.
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Console</DialogTitle>
            <DialogDescription>
              Fill in the console details. All fields are required.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-2 gap-4">
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
                  placeholder="Will be populated automatically after assigning orders from Order Management page"
                  className="bg-slate-50 cursor-not-allowed"
                />
                <p className="text-xs text-secondary-muted mt-1">
                  This value will be automatically calculated and updated when you assign orders to this console from the Order Management page.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="total_cbm">
                  Total CBM (Fixed)
                  <span className="text-xs text-secondary-muted ml-1">(Auto-set)</span>
                </Label>
                <Input
                  id="total_cbm"
                  type="number"
                  value="68"
                  disabled
                  className="bg-slate-50 cursor-not-allowed"
                />
                <p className="text-xs text-secondary-muted mt-1">
                  Maximum CBM capacity is fixed at 68. Accumulated CBM starts at 0 and increases as orders are assigned.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateConsole}>Create Console</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
