"use client";

import React, { useEffect, useState } from "react";
import { getAllOrdersForAdmin } from "@/app/actions/orders";
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

export function OrderManagementPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    let isMounted = true;
    
    const fetchOrders = async () => {
      setIsLoading(true);
      const result = await getAllOrdersForAdmin();
      
      if (!isMounted) return;
      
      if ("error" in result) {
        setError(result.error ?? "Unable to load orders");
        setOrders([]);
      } else {
        setError(null);
        setOrders(result.orders as Order[]);
      }
      setIsLoading(false);
    };

    fetchOrders();

    return () => {
      isMounted = false;
    };
  }, []);

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

  return (
    <Card className="bg-white border shadow-sm">
      <CardHeader>
        <CardTitle>Order Management</CardTitle>
        <CardDescription>Manage and view all orders in the system. Click to expand and see individual sub-orders.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
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
                    onClick={hasSubOrders ? () => toggleRow(row.shippingMark) : undefined}
                  >
                    <TableCell>
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
                      <TableCell colSpan={9} className="bg-slate-50 p-0">
                        <div className="p-4">
                          <div className="mb-3 text-sm font-semibold text-primary-dark">
                            Sub-Orders ({row.orderCount})
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow>
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
                                return (
                                  <TableRow key={`${subOrder.id}-${subIndex}`}>
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
