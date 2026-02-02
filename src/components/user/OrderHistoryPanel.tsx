"use client";

import { useEffect, useState } from "react";
import { getOrderHistory } from "@/app/actions/orders";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Carton = {
  id: string;
  carton_serial_number: string;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  dimension_unit: "cm" | "m" | "mm" | null;
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
  const [query, setQuery] = useState("");

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

  const grouped = orders.reduce<Record<string, Order[]>>((acc, order) => {
    const key = order.shipping_mark;
    acc[key] = acc[key] ?? [];
    acc[key].push(order);
    return acc;
  }, {});

  const groupedOrders = Object.entries(grouped).map(([shippingMark, group]) => {
    const sorted = [...group].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return {
      id: sorted[0]?.id ?? shippingMark,
      shippingMark,
      orders: sorted,
      latest: sorted[0]?.created_at ?? new Date().toISOString(),
    };
  });
  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = groupedOrders.filter((group) => {
    if (!normalizedQuery) return true;
    const haystack = [
      group.id,
      group.shippingMark,
      ...group.orders.map((order) => order.item_description || ""),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
  const sortedGroups = [...filteredGroups].sort(
    (a, b) => new Date(b.latest).getTime() - new Date(a.latest).getTime()
  );

  return (
    <div className="space-y-6">
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Search Orders</CardTitle>
          <CardDescription>
            Search by Shipping Mark, Order #, or description.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Search orders..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </CardContent>
      </Card>

      {sortedGroups.map((group) => (
        <Card key={group.id} className="bg-white border shadow-sm">
          <CardHeader>
            <CardTitle>Order #{group.id}</CardTitle>
            <CardDescription>Shipping Mark: {group.shippingMark}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {group.orders.map((order, index) => (
              <div key={order.id} className="space-y-3">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-primary-dark">
                    Order {index + 1} ({order.item_description || "No description"})
                  </div>
                  <div className="text-sm text-secondary-muted">
                    Shipping Mark:{" "}
                    <span className="font-semibold text-primary-dark">
                      {order.shipping_mark}
                    </span>{" "}
                    • Total Cartons:{" "}
                    <span className="font-semibold text-primary-dark">
                      {order.total_cartons}
                    </span>
                  </div>
                </div>
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serial</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead>Dimensions</TableHead>
                    <TableHead>CBM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupCartons(order.cartons ?? []).map((group) => (
                    <TableRow key={group.key}>
                      <TableCell>{group.serialRange}</TableCell>
                      <TableCell>{group.weight ?? "-"}</TableCell>
                      <TableCell>
                        {group.length ?? "-"} x {group.width ?? "-"} x {group.height ?? "-"}{" "}
                        {group.unit ?? "cm"}
                      </TableCell>
                      <TableCell>{group.cbm}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                </Table>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function groupCartons(cartons: Carton[]) {
  const groups: Record<string, Carton[]> = {};
  cartons.forEach((carton) => {
    const key = [
      carton.weight ?? "",
      carton.length ?? "",
      carton.width ?? "",
      carton.height ?? "",
      carton.dimension_unit ?? "cm",
    ].join("|");
    groups[key] = groups[key] ?? [];
    groups[key].push(carton);
  });

  return Object.entries(groups).map(([key, group]) => {
    const sorted = [...group].sort((a, b) =>
      a.carton_serial_number.localeCompare(b.carton_serial_number)
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const serialRange =
      first.carton_serial_number === last.carton_serial_number
        ? first.carton_serial_number
        : `${first.carton_serial_number}-${last.carton_serial_number}`;

    const unit = first.dimension_unit ?? "cm";
    const cbmValue = calcCbm(
      first.length,
      first.width,
      first.height,
      unit,
      sorted.length
    );

    return {
      key,
      serialRange,
      weight: first.weight,
      length: first.length,
      width: first.width,
      height: first.height,
      unit,
      cbm: cbmValue !== null ? cbmValue.toFixed(3) : "-",
    };
  });
}

function calcCbm(
  length: number | null,
  width: number | null,
  height: number | null,
  unit: "cm" | "m" | "mm",
  count: number
) {
  if (!length || !width || !height || !count) return null;
  if (unit === "m") {
    return length * width * height * count;
  }
  if (unit === "mm") {
    return (length * width * height * count) / 1_000_000_000;
  }
  return (length * width * height * count) / 1_000_000;
}
