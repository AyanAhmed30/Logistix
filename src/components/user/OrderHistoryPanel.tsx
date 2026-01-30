"use client";

import { useEffect, useState } from "react";
import { getOrderHistory } from "@/app/actions/orders";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Carton = {
  id: string;
  carton_serial_number: string;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  carton_index: number;
  created_at: string;
};

type Order = {
  id: string;
  shipping_mark: string;
  destination_country: string;
  total_cartons: number;
  item_description: string | null;
  created_at: string;
  cartons: Carton[];
};

type Props = {
  refreshKey: number;
};

export function OrderHistoryPanel({ refreshKey }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    getOrderHistory()
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
  }, [refreshKey]);

  if (isLoading) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Order History</CardTitle>
          <CardDescription>Loading saved orders...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Order History</CardTitle>
          <CardDescription>Unable to load orders: {error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (orders.length === 0) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Order History</CardTitle>
          <CardDescription>No saved orders yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {orders.map((order) => (
        <Card key={order.id} className="bg-white border shadow-sm">
          <CardHeader>
            <CardTitle>Order #{order.id.slice(0, 8)}</CardTitle>
            <CardDescription>
              {order.item_description || "No description"} • {order.destination_country} •{" "}
              {new Date(order.created_at).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-secondary-muted">
              Shipping Mark: <span className="font-semibold text-primary-dark">{order.shipping_mark}</span> • Total Cartons:{" "}
              <span className="font-semibold text-primary-dark">{order.total_cartons}</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serial</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Dimensions</TableHead>
                  <TableHead>Carton</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.cartons?.map((carton) => (
                  <TableRow key={carton.id}>
                    <TableCell>{carton.carton_serial_number}</TableCell>
                    <TableCell>{carton.weight ?? "-"}</TableCell>
                    <TableCell>
                      {carton.length ?? "-"} x {carton.width ?? "-"} x {carton.height ?? "-"}
                    </TableCell>
                    <TableCell>
                      {order.total_cartons}-{carton.carton_index}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
