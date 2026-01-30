"use client";

import { useEffect, useState } from "react";
import { getAllOrdersForAdmin } from "@/app/actions/orders";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

export function OrderTrackingPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    getAllOrdersForAdmin()
      .then((result) => {
        if (!isMounted) return;
        if ("error" in result) {
          setError(result.error ?? "Unable to load orders");
          setOrders([]);
        } else {
          setError(null);
          setOrders(result.orders as Order[]);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (isLoading) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Order Tracking</CardTitle>
          <CardDescription>Loading orders...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Order Tracking</CardTitle>
          <CardDescription>Unable to load orders: {error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (orders.length === 0) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Order Tracking</CardTitle>
          <CardDescription>No orders available yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const getFirstCarton = (order: Order) => order.cartons?.[0];

  return (
    <Card className="bg-white border shadow-sm">
      <CardHeader>
        <CardTitle>Order Tracking</CardTitle>
        <CardDescription>All orders across the system.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Shipping Mark</TableHead>
              <TableHead>Total Cartons</TableHead>
              <TableHead>Weight</TableHead>
              <TableHead>Dimensions</TableHead>
              <TableHead>Date &amp; Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => {
              const firstCarton = getFirstCarton(order);
              return (
                <TableRow key={order.id}>
                  <TableCell className="font-semibold">{order.username}</TableCell>
                  <TableCell>{order.shipping_mark}</TableCell>
                  <TableCell>{order.total_cartons}</TableCell>
                  <TableCell>{firstCarton?.weight ?? "-"}</TableCell>
                  <TableCell>
                    {firstCarton?.length ?? "-"} x {firstCarton?.width ?? "-"} x{" "}
                    {firstCarton?.height ?? "-"}
                  </TableCell>
                  <TableCell>{new Date(order.created_at).toLocaleString()}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
