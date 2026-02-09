"use client";

import React, { useEffect, useState } from "react";
import { getAllOrdersForAdmin } from "@/app/actions/orders";
import { getAllConsoles, assignOrdersToConsole } from "@/app/actions/consoles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

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

export function OrderManagementPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [consoles, setConsoles] = useState<Console[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedConsole, setSelectedConsole] = useState<string>("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    const fetchData = async () => {
      setIsLoading(true);
      
      const [ordersResult, consolesResult] = await Promise.all([
        getAllOrdersForAdmin(),
        getAllConsoles(),
      ]);
      
      if (!isMounted) return;
      
      if ("error" in ordersResult) {
        setError(ordersResult.error ?? "Unable to load orders");
        setOrders([]);
      } else {
        setError(null);
        setOrders(ordersResult.orders as Order[]);
      }
      
      if ("consoles" in consolesResult) {
        setConsoles(consolesResult.consoles as Console[]);
      }
      
      setIsLoading(false);
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Reset selection when console changes
  useEffect(() => {
    // Use setTimeout to avoid synchronous setState in effect
    const timer = setTimeout(() => {
      setSelectedOrderIds(new Set());
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedConsole]);

  if (isLoading) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Order Management</CardTitle>
          <CardDescription>Loading orders...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Order Management</CardTitle>
          <CardDescription>Unable to load orders: {error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (orders.length === 0) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Order Management</CardTitle>
          <CardDescription>No orders available yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

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
      return sum + (length * width * height) / 1_000_000; // CBM in cubic meters
    }, 0);
    return { totalWeight, totalCbm };
  };

  // Group orders by shipping mark to calculate order count
  const groupedByShipping = orders.reduce<Record<string, Order[]>>((acc, order) => {
    acc[order.shipping_mark] = acc[order.shipping_mark] ?? [];
    acc[order.shipping_mark].push(order);
    return acc;
  }, {});

  // Flatten grouped orders for table display with full group data
  const tableData = Object.entries(groupedByShipping).map(([shippingMark, group]) => {
    const sortedGroup = [...group].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const totals = sortedGroup.reduce(
      (acc, order) => {
        const orderTotals = calcOrderTotals(order);
        acc.totalCartons += order.total_cartons;
        acc.totalWeight += orderTotals.totalWeight;
        acc.totalCbm += orderTotals.totalCbm;
        return acc;
      },
      { totalCartons: 0, totalWeight: 0, totalCbm: 0 }
    );
    const earliestDate = sortedGroup[0]?.created_at;
    const itemDescription = sortedGroup[0]?.item_description || "-";
    const groupUuid = sortedGroup[0]?.id ?? "-";

    return {
      shippingMark,
      itemDescription,
      uuid: groupUuid,
      orderCount: sortedGroup.length,
      totalCartons: totals.totalCartons,
      totalWeight: totals.totalWeight,
      totalCbm: totals.totalCbm,
      dateTime: earliestDate,
      subOrders: sortedGroup, // Store full sub-orders for expansion
    };
  });

  // Sort by date (latest first)
  tableData.sort((a, b) => {
    const dateA = a.dateTime ? new Date(a.dateTime).getTime() : 0;
    const dateB = b.dateTime ? new Date(b.dateTime).getTime() : 0;
    return dateB - dateA;
  });

  const toggleRow = (shippingMark: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(shippingMark)) {
        newSet.delete(shippingMark);
      } else {
        newSet.add(shippingMark);
      }
      return newSet;
    });
  };

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const handleAssignOrders = async () => {
    if (!selectedConsole) {
      toast.error("Please select a console");
      return;
    }

    if (selectedOrderIds.size === 0) {
      toast.error("Please select at least one order");
      return;
    }

    setIsAssigning(true);

    // CBM is calculated automatically from assigned orders - no limit check needed
    const result = await assignOrdersToConsole(selectedConsole, Array.from(selectedOrderIds));

    setIsAssigning(false);

    if ("error" in result) {
      toast.error(result.error ?? "Failed to assign orders");
      return;
    }

    toast.success(`Successfully assigned ${selectedOrderIds.size} order(s) to console`);
    setSelectedOrderIds(new Set());
    setSelectedConsole("");
    
    // Refresh orders to get updated console assignments
    const refreshResult = await getAllOrdersForAdmin();
    if ("orders" in refreshResult) {
      setOrders(refreshResult.orders as Order[]);
    }
  };

  // Calculate total CBM of selected orders for validation display
  const selectedOrders = orders.filter((order) => selectedOrderIds.has(order.id));
  const selectedTotalCbm = selectedOrders.reduce((sum, order) => {
    const totals = calcOrderTotals(order);
    return sum + totals.totalCbm;
  }, 0);
  const selectedConsoleObj = consoles.find((c) => c.id === selectedConsole);

  return (
    <Card className="bg-white border shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex-1">
            <CardTitle>Order Management</CardTitle>
            <CardDescription>
              Manage and view all orders in the system. Click to expand and see individual
              sub-orders.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-3 min-w-[280px] relative z-10">
            <div className="flex flex-col gap-2">
              <Label htmlFor="console-select" className="text-sm font-medium text-primary-dark">
                Console
              </Label>
              <Select value={selectedConsole} onValueChange={setSelectedConsole}>
                <SelectTrigger 
                  id="console-select" 
                  className="w-full bg-white"
                >
                  <SelectValue placeholder="Select Console" />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  {consoles.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-secondary-muted">
                      No consoles available
                    </div>
                  ) : (
                    consoles.map((console) => (
                      <SelectItem key={console.id} value={console.id}>
                        {console.console_number}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            {selectedConsole && selectedOrderIds.size > 0 && (
              <div className="flex flex-col gap-2 p-3 bg-slate-50 rounded-md border border-slate-200">
                <div className="text-xs text-secondary-muted space-y-1">
                  <div>
                    <span className="font-medium">Selected:</span> {selectedOrderIds.size} order(s)
                  </div>
                  <div>
                    <span className="font-medium">CBM:</span> {selectedTotalCbm.toFixed(3)}
                    {selectedConsoleObj && (
                      <span className="text-xs text-secondary-muted ml-1">
                        (Current console CBM: {selectedConsoleObj.total_cbm.toFixed(3)})
                      </span>
                    )}
                  </div>
                </div>
                <Button 
                  onClick={handleAssignOrders} 
                  disabled={isAssigning} 
                  size="sm"
                  className="w-full"
                >
                  {isAssigning ? "Assigning..." : "Done"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative z-0">
        <Table>
          <TableHeader>
            <TableRow>
              {selectedConsole && <TableHead className="w-12"></TableHead>}
              <TableHead className="w-10"></TableHead>
              <TableHead>Shipping Mark</TableHead>
              <TableHead>UUID</TableHead>
              <TableHead>Order Description</TableHead>
              <TableHead>Order Count</TableHead>
              <TableHead>Total Cartons</TableHead>
              <TableHead>Total Weight </TableHead>
              <TableHead>Total CBM </TableHead>
              <TableHead>Date & Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableData.map((row, index) => {
              const isExpanded = expandedRows.has(row.shippingMark);
              const hasSubOrders = row.orderCount > 1;

              return (
                <React.Fragment key={`${row.shippingMark}-${index}`}>
                  <TableRow
                    className={hasSubOrders ? "cursor-pointer hover:bg-slate-50" : ""}
                    onClick={
                      hasSubOrders && !selectedConsole
                        ? () => toggleRow(row.shippingMark)
                        : undefined
                    }
                  >
                    {selectedConsole && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={row.subOrders.every((order) =>
                            selectedOrderIds.has(order.id)
                          )}
                          onCheckedChange={(checked) => {
                            row.subOrders.forEach((order) => {
                              if (checked) {
                                setSelectedOrderIds((prev) => new Set(prev).add(order.id));
                              } else {
                                setSelectedOrderIds((prev) => {
                                  const newSet = new Set(prev);
                                  newSet.delete(order.id);
                                  return newSet;
                                });
                              }
                            });
                          }}
                        />
                      </TableCell>
                    )}
                    <TableCell onClick={hasSubOrders && !selectedConsole ? () => toggleRow(row.shippingMark) : undefined}>
                      {hasSubOrders ? (
                        isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-primary-dark" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-primary-dark" />
                        )
                      ) : null}
                    </TableCell>
                    <TableCell className="font-medium">{row.shippingMark}</TableCell>
                    <TableCell className="font-mono text-xs">{row.uuid}</TableCell>
                    <TableCell>{row.itemDescription}</TableCell>
                    <TableCell>{row.orderCount}</TableCell>
                    <TableCell>{row.totalCartons}</TableCell>
                    <TableCell>{row.totalWeight.toFixed(2)}</TableCell>
                    <TableCell>{row.totalCbm.toFixed(3)}</TableCell>
                    <TableCell>
                      {row.dateTime ? new Date(row.dateTime).toLocaleString() : "-"}
                    </TableCell>
                  </TableRow>
                  {isExpanded && hasSubOrders && (
                    <TableRow key={`${row.shippingMark}-expanded-${index}`}>
                      <TableCell
                        colSpan={selectedConsole ? 10 : 9}
                        className="bg-slate-50 p-0"
                      >
                        <div className="p-4">
                          <div className="mb-3 text-sm font-semibold text-primary-dark">
                            Sub-Orders ({row.orderCount})
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                {selectedConsole && <TableHead className="w-12"></TableHead>}
                                <TableHead>#</TableHead>
                                <TableHead>Item Description</TableHead>
                                <TableHead>Cartons</TableHead>
                                <TableHead>Weight (kg)</TableHead>
                                <TableHead>CBM (m³)</TableHead>
                                <TableHead>Date & Time</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {row.subOrders.map((subOrder, subIndex) => {
                                const subTotals = calcOrderTotals(subOrder);
                                const isSelected = selectedOrderIds.has(subOrder.id);
                                return (
                                  <TableRow
                                    key={`${subOrder.id}-${subIndex}`}
                                    className={isSelected ? "bg-blue-50" : ""}
                                  >
                                    {selectedConsole && (
                                      <TableCell>
                                        <Checkbox
                                          checked={isSelected}
                                          onCheckedChange={() =>
                                            toggleOrderSelection(subOrder.id)
                                          }
                                        />
                                      </TableCell>
                                    )}
                                    <TableCell className="font-medium">{subIndex + 1}</TableCell>
                                    <TableCell>{subOrder.item_description || "-"}</TableCell>
                                    <TableCell>{subOrder.total_cartons}</TableCell>
                                    <TableCell>{subTotals.totalWeight.toFixed(2)}</TableCell>
                                    <TableCell>{subTotals.totalCbm.toFixed(3)}</TableCell>
                                    <TableCell>
                                      {subOrder.created_at
                                        ? new Date(subOrder.created_at).toLocaleString()
                                        : "-"}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
