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
  SCAN_PROGRESS_DOM_EVENT,
  type ScanProgressBroadcastMessage,
} from "@/lib/scan-progress-broadcast";
import { mergeScanProgressOrders } from "@/lib/scan-progress-merge";
import { patchScanProgressOrders } from "@/lib/scan-progress-patch";
import { usbScannerLog } from "@/lib/usb-scanner-debug";

type Props = {
  refreshKey: number;
  username: string;
};

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
  const fetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProgress = useCallback(async (options?: { background?: boolean }) => {
    const result = await getOrderScanProgressForUser();
    if ("error" in result) {
      setError(result.error ?? "Unable to load scan progress");
      if (!options?.background) {
        setOrders([]);
      }
      return;
    }
    setError(null);
    setOrders((prev) => mergeScanProgressOrders(result.orders ?? [], prev));
  }, []);

  const patchFromScan = useCallback(
    (
      orderId: string,
      cartonId: string,
      scannedAt: string,
      meta?: { scan_type?: string | null; console_id?: string | null }
    ) => {
      let needsFetch = false;
      let logDetail: Record<string, unknown> | null = null;
      setOrders((prev) => {
        const { next, patched } = patchScanProgressOrders(prev, orderId, cartonId, scannedAt, meta);
        if (!patched) needsFetch = true;
        logDetail = {
          orderId,
          cartonId,
          patched,
          scan_type: meta?.scan_type,
          console_id: meta?.console_id,
          orderCount: next.length,
        };
        return next;
      });
      if (logDetail) {
        usbScannerLog("scan progress state update", logDetail);
      }
      if (needsFetch) {
        usbScannerLog("scan progress patch missed — fetching from server");
        void fetchProgress({ background: true });
      }
    },
    [fetchProgress]
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
        void fetchProgress({ background: true });
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
            scan_type?: string | null;
            console_id?: string | null;
          };
          usbScannerLog("supabase realtime carton_scans INSERT", { row });
          if (!row?.order_id || !row?.carton_id || !row?.scanned_at) {
            usbScannerLog("supabase realtime insert missing required fields — fetching progress");
            void fetchProgress({ background: true });
            return;
          }
          if (row.username && row.username !== username) return;
          patchFromScan(row.order_id, row.carton_id, row.scanned_at, {
            scan_type: row.scan_type,
            console_id: row.console_id,
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "carton_scans", filter: filterUser },
        () => {
          usbScannerLog("supabase realtime carton_scans DELETE — refreshing progress");
          void fetchProgress({ background: true });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: filterUser },
        () => {
          usbScannerLog("supabase realtime orders INSERT — refreshing progress");
          void fetchProgress({ background: true });
        }
      )
      .subscribe();

    const onScanMessage = (data: ScanProgressBroadcastMessage | undefined) => {
      if (!data || data.type !== "carton_scanned") return;
      usbScannerLog("scan progress listener received scan", {
        order_id: data.order_id,
        carton_id: data.carton_id,
        scan_type: data.scan_type,
      });
      patchFromScan(data.order_id, data.carton_id, data.scanned_at, {
        scan_type: data.scan_type,
        console_id: data.console_id,
      });
    };

    const onDomScan = (event: Event) => {
      onScanMessage((event as CustomEvent<ScanProgressBroadcastMessage>).detail);
    };
    window.addEventListener(SCAN_PROGRESS_DOM_EVENT, onDomScan);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(SCAN_PROGRESS_CHANNEL);
      bc.onmessage = (event: MessageEvent<ScanProgressBroadcastMessage>) => {
        onScanMessage(event.data);
      };
    } catch {
      bc = null;
    }

    const pollMs = 15000;
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      void fetchProgress({ background: true });
    };
    const pollId = window.setInterval(poll, pollMs);

    return () => {
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener(SCAN_PROGRESS_DOM_EVENT, onDomScan);
      void supabase.removeChannel(channel);
      if (fetchDebounceRef.current) {
        clearTimeout(fetchDebounceRef.current);
        fetchDebounceRef.current = null;
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
          Live view of inward receipt scans and, when a console is ready for loading, outward loading progress per
          order. Updates automatically when scans are recorded.
        </CardDescription>
        </CardHeader>
      </Card>

      {orders.map((order) => {
        const pct =
          order.total_cartons > 0 ? Math.round((order.scanned_count / order.total_cartons) * 100) : 0;
        const out = order.outward;
        const outPct =
          out && order.total_cartons > 0 ? Math.round((out.scanned_count / order.total_cartons) * 100) : 0;
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

              {out ? (
                <div className="mt-5 border-t border-slate-200 pt-4 space-y-2">
                  <p className="text-xs font-semibold text-primary-dark uppercase tracking-wide">
                    Outward (loading) — Console {out.console_number}
                    {out.container_number ? ` · ${out.container_number}` : ""}
                  </p>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-sm">
                    <span className="text-secondary-muted">Loading scan progress</span>
                    <span className="font-semibold text-primary-dark sm:text-right">
                      {out.scanned_count}/{order.total_cartons} · Remaining {out.pending_count}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-sky-500 transition-all duration-200 ease-out"
                      style={{ width: `${outPct}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {out.cartons.length === 0 ? (
                      <p className="text-sm text-secondary-muted">No carton rows for outward tracking.</p>
                    ) : (
                      out.cartons.map((c) => <CartonSlot key={`out-${c.id}`} carton={c} />)
                    )}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
