"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getOrderScanProgressForUser,
  type OrderScanProgressCarton,
  type OrderScanProgressRow,
} from "@/app/actions/orders";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/utils/supabase/client";
import {
  SCAN_PROGRESS_CHANNEL,
  type ScanProgressBroadcastMessage,
} from "@/lib/scan-progress-broadcast";

type Props = {
  refreshKey: number;
  username: string;
};

const LATE_HOURS = 24;

function applyCartonScanned(
  orders: OrderScanProgressRow[],
  orderId: string,
  cartonId: string,
  scannedAt: string
): OrderScanProgressRow[] {
  return orders.map((order) => {
    if (order.id !== orderId) return order;

    const hoursSinceOrder =
      (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60);

    const cartons = order.cartons.map((c) => {
      if (c.id !== cartonId) return c;
      return {
        ...c,
        scanned: true,
        scanned_at: scannedAt,
        state: "scanned" as const,
      };
    });

    const scanned_count = cartons.filter((c) => c.scanned).length;
    const pending_count = Math.max(0, order.total_cartons - scanned_count);

    const cartonsWithState = cartons.map((c) => {
      if (c.scanned) return c;
      const isLate = hoursSinceOrder >= LATE_HOURS;
      return {
        ...c,
        state: (isLate ? "missing" : "pending") as OrderScanProgressCarton["state"],
      };
    });

    return {
      ...order,
      cartons: cartonsWithState,
      scanned_count,
      pending_count,
    };
  });
}

function CartonSlot({ carton }: { carton: OrderScanProgressCarton }) {
  const base =
    "inline-flex min-w-[4.5rem] flex-col items-center justify-center rounded-lg border px-2 py-2 text-xs font-semibold transition-colors duration-300 sm:min-w-[5.25rem] sm:px-3 sm:text-sm";

  if (carton.state === "scanned") {
    return (
      <div
        className={`${base} border-emerald-500 bg-emerald-50 text-emerald-900`}
        title={carton.scanned_at ? `Scanned ${new Date(carton.scanned_at).toLocaleString()}` : "Scanned"}
      >
        <span className="text-base leading-none sm:text-lg">✓</span>
        <span className="mt-1">{carton.sticker_label}</span>
      </div>
    );
  }

  if (carton.state === "missing") {
    return (
      <div
        className={`${base} border-amber-600 bg-amber-50 text-amber-900`}
        title="Pending — older than 24h (follow up)"
      >
        <span className="text-xs font-bold">!</span>
        <span className="mt-1">{carton.sticker_label}</span>
      </div>
    );
  }

  return (
    <div className={`${base} border-slate-200 bg-slate-50 text-slate-600`} title="Not scanned yet">
      <span className="text-[10px] text-slate-400 sm:text-xs">○</span>
      <span className="mt-1">{carton.sticker_label}</span>
    </div>
  );
}

export function UserScanProgressPanel({ refreshKey, username }: Props) {
  const [orders, setOrders] = useState<OrderScanProgressRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);
  const resyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProgress = useCallback(async () => {
    const result = await getOrderScanProgressForUser();
    if ("error" in result) {
      setError(result.error ?? "Unable to load scan progress");
      setOrders([]);
    } else {
      setError(null);
      setOrders(result.orders ?? []);
    }
  }, []);

  const scheduleServerResync = useCallback(() => {
    if (resyncTimerRef.current) clearTimeout(resyncTimerRef.current);
    resyncTimerRef.current = setTimeout(() => {
      resyncTimerRef.current = null;
      void fetchProgress();
    }, 400);
  }, [fetchProgress]);

  const patchFromScan = useCallback(
    (orderId: string, cartonId: string, scannedAt: string) => {
      setOrders((prev) => applyCartonScanned(prev, orderId, cartonId, scannedAt));
      scheduleServerResync();
    },
    [scheduleServerResync]
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
      await fetchProgress();
      if (!cancelled) setIsLoading(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [fetchProgress, refreshKey]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchProgress();
      }
    };
    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);

    const filterUser = `username=eq.${username}`;
    const channel = supabase
      .channel(`scan-progress-${username}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "carton_scans", filter: filterUser },
        (payload) => {
          const row = payload.new as {
            order_id?: string;
            carton_id?: string;
            scanned_at?: string;
            username?: string;
          };
          if (!row?.order_id || !row?.carton_id || !row?.scanned_at) {
            void fetchProgress();
            return;
          }
          if (row.username && row.username !== username) return;
          patchFromScan(row.order_id, row.carton_id, row.scanned_at);
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "carton_scans", filter: filterUser },
        () => {
          void fetchProgress();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: filterUser },
        () => {
          void fetchProgress();
        }
      )
      .subscribe();

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(SCAN_PROGRESS_CHANNEL);
      bc.onmessage = (event: MessageEvent<ScanProgressBroadcastMessage>) => {
        const data = event.data;
        if (!data || data.type !== "carton_scanned") return;
        patchFromScan(data.order_id, data.carton_id, data.scanned_at);
      };
    } catch {
      bc = null;
    }

    const pollMs = 2500;
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      void fetchProgress();
    };
    const pollId = window.setInterval(poll, pollMs);

    return () => {
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
      void supabase.removeChannel(channel);
      if (resyncTimerRef.current) {
        clearTimeout(resyncTimerRef.current);
        resyncTimerRef.current = null;
      }
      if (bc) bc.close();
      window.clearInterval(pollId);
    };
  }, [fetchProgress, patchFromScan, supabase, username]);

  if (isLoading) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Scan Progress</CardTitle>
          <CardDescription>Loading live scan tracking…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Scan Progress</CardTitle>
          <CardDescription className="text-destructive">Unable to load: {error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!orders.length) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Scan Progress</CardTitle>
          <CardDescription>
            No orders yet. Book an order and generate print — each order appears here with per-carton scan status.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Scan Progress</CardTitle>
          <CardDescription>
            Live view of which carton stickers are scanned (✓) vs pending (○). Orders update automatically when scans
            are recorded.
          </CardDescription>
        </CardHeader>
      </Card>

      {orders.map((order) => {
        const pct =
          order.total_cartons > 0 ? Math.round((order.scanned_count / order.total_cartons) * 100) : 0;
        const orderLabel = `Order ${String(order.id).slice(0, 8).toUpperCase()}`;
        const created = new Date(order.created_at).toLocaleString();

        return (
          <Card key={order.id} className="bg-white border shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-lg">{orderLabel}</CardTitle>
                  <p className="text-sm text-secondary-muted mt-1">
                    <span className="font-semibold text-primary-dark">Customer / Shipping mark:</span>{" "}
                    {order.shipping_mark || "—"}
                  </p>
                  <p className="text-xs text-secondary-muted mt-0.5">{created}</p>
                </div>
                <div className="text-right text-sm shrink-0">
                  <p className="font-semibold text-primary-dark">
                    Scanned {order.scanned_count}/{order.total_cartons}
                  </p>
                  <p className="text-xs text-secondary-muted">Remaining: {order.pending_count}</p>
                </div>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-200 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-secondary-muted mb-3">
                {order.item_description ? `Items: ${order.item_description}` : null}
                {order.destination_country ? ` · ${order.destination_country}` : null}
              </p>
              <div className="flex flex-wrap gap-2">
                {order.cartons.length === 0 ? (
                  <p className="text-sm text-secondary-muted">No carton rows loaded for this order.</p>
                ) : (
                  order.cartons.map((c) => <CartonSlot key={c.id} carton={c} />)
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
