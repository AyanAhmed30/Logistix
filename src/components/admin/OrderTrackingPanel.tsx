"use client";

import { useEffect, useState } from "react";
import { getAllOrdersForAdmin } from "@/app/actions/orders";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";

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
  const [query, setQuery] = useState("");

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

  const groupedByUser = orders.reduce<Record<string, Order[]>>((acc, order) => {
    acc[order.username] = acc[order.username] ?? [];
    acc[order.username].push(order);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Search Orders</CardTitle>
          <CardDescription>Search by Shipping Mark or UUID.</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Search by shipping mark or UUID..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </CardContent>
      </Card>

      {Object.entries(groupedByUser).map(([username, userOrders]) => {
        const groupedByShipping = userOrders.reduce<Record<string, Order[]>>((acc, order) => {
          acc[order.shipping_mark] = acc[order.shipping_mark] ?? [];
          acc[order.shipping_mark].push(order);
          return acc;
        }, {});

        const normalizedQuery = query.trim().toLowerCase();
        const filteredByShipping = Object.entries(groupedByShipping).filter(
          ([shippingMark, group]) => {
            if (!normalizedQuery) return true;
            const uuid = group[0]?.id ?? "";
            return (
              shippingMark.toLowerCase().includes(normalizedQuery) ||
              uuid.toLowerCase().includes(normalizedQuery)
            );
          }
        );

        if (filteredByShipping.length === 0) {
          return null;
        }

        const userTotalCbm = Object.values(groupedByShipping).reduce((sum, group) => {
          const groupTotal = group.reduce((groupSum, order) => {
            const totals = calcOrderTotals(order);
            return groupSum + totals.totalCbm;
          }, 0);
          return sum + groupTotal;
        }, 0);

        return (
          <Card key={username} className="bg-white border shadow-sm">
            <CardHeader>
              <CardTitle>Username: {username}</CardTitle>
              <CardDescription>Final total CBM: {userTotalCbm.toFixed(3)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {filteredByShipping.map(([shippingMark, group]) => {
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
                const groupUuid = sortedGroup[0]?.id ?? "-";

                return (
                  <div key={shippingMark} className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-primary-dark">
                          Shipping Mark: {shippingMark}
                        </div>
                        <div className="text-xs text-secondary-muted">
                          UUID: <span className="font-mono">{groupUuid}</span>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-5">
                      <div className="rounded-lg bg-white p-3 text-center shadow-sm">
                        <div className="text-xs text-secondary-muted">Order Count</div>
                        <div className="text-lg font-semibold text-primary-dark">
                          {sortedGroup.length}
                        </div>
                      </div>
                      <div className="rounded-lg bg-white p-3 text-center shadow-sm">
                        <div className="text-xs text-secondary-muted">Total Cartons</div>
                        <div className="text-lg font-semibold text-primary-dark">
                          {totals.totalCartons}
                        </div>
                      </div>
                      <div className="rounded-lg bg-white p-3 text-center shadow-sm">
                        <div className="text-xs text-secondary-muted">Total Weight (kg)</div>
                        <div className="text-lg font-semibold text-primary-dark">
                          {totals.totalWeight.toFixed(2)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-white p-3 text-center shadow-sm">
                        <div className="text-xs text-secondary-muted">Total CBM</div>
                        <div className="text-lg font-semibold text-primary-dark">
                          {totals.totalCbm.toFixed(3)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-white p-3 text-center shadow-sm">
                        <div className="text-xs text-secondary-muted">Date &amp; Time</div>
                        <div className="text-sm font-semibold text-primary-dark">
                          {earliestDate ? new Date(earliestDate).toLocaleString() : "-"}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
