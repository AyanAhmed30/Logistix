"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getReInwardProgressForUser,
  type ReInwardProgressCarton,
  type ReInwardProgressRow,
} from "@/app/actions/orders";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/utils/supabase/client";
import {
  SCAN_PROGRESS_CHANNEL,
  SCAN_PROGRESS_DOM_EVENT,
  type ScanProgressBroadcastMessage,
} from "@/lib/scan-progress-broadcast";

type Props = {
  refreshKey: number;
};

function ReInwardCartonSlot({ carton }: { carton: ReInwardProgressCarton }) {
  const base =
    "inline-flex min-w-[4.5rem] flex-col items-center justify-center rounded-lg border-2 px-2 py-2 text-xs font-semibold transition-all sm:min-w-[5.25rem] sm:px-3 sm:text-sm";

  if (carton.state === "pending") {
    return (
      <div
        className={`${base} border-amber-500 bg-amber-50 text-amber-950 shadow-md ring-2 ring-amber-300 animate-pulse`}
        title="3rd scan — only if this carton is returning to the warehouse"
      >
        <span className="text-lg leading-none">◎</span>
        <span className="mt-1">{carton.sticker_label}</span>
        <span className="text-[10px] font-bold uppercase mt-0.5">Scan now</span>
      </div>
    );
  }

  if (carton.state === "done") {
    return (
      <div
        className={`${base} border-slate-200 bg-slate-100/80 text-slate-400 opacity-60`}
        title={
          carton.scanned_at
            ? `Re-inward ${new Date(carton.scanned_at).toLocaleString()}`
            : "Re-inward complete"
        }
      >
        <span className="text-base leading-none">✓</span>
        <span className="mt-1 line-through">{carton.sticker_label}</span>
      </div>
    );
  }

  return (
    <div
      className={`${base} border-sky-200 bg-sky-50/60 text-sky-700/70 opacity-50`}
      title="Outward not recorded yet — complete 2nd scan in Loading Instructions first"
    >
      <span className="text-xs font-bold">🚢</span>
      <span className="mt-1">{carton.sticker_label}</span>
      <span className="text-[9px] mt-0.5">Need outward</span>
    </div>
  );
}

export function UserReInwardPanel({ refreshKey }: Props) {
  const [rows, setRows] = useState<ReInwardProgressRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const fetchRows = useCallback(async () => {
    const res = await getReInwardProgressForUser();
    if ("error" in res) {
      setError(res.error ?? "Unable to load re-inward list");
      setRows([]);
    } else {
      setError(null);
      setRows(res.rows ?? []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchRows();
    });
  }, [refreshKey, fetchRows]);

  useEffect(() => {
    const onScan = (event: Event) => {
      const data = (event as CustomEvent<ScanProgressBroadcastMessage>).detail;
      if (data?.scan_type === "re_inward" || data?.scan_type === "return") {
        void fetchRows();
      }
    };
    window.addEventListener(SCAN_PROGRESS_DOM_EVENT, onScan);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(SCAN_PROGRESS_CHANNEL) : null;
    channel?.addEventListener("message", (ev: MessageEvent<ScanProgressBroadcastMessage>) => {
      if (ev.data?.scan_type === "re_inward" || ev.data?.scan_type === "return") {
        void fetchRows();
      }
    });

    const sub = supabase
      .channel("re-inward-carton-scans")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "carton_scans" },
        () => void fetchRows()
      )
      .subscribe();

    return () => {
      window.removeEventListener(SCAN_PROGRESS_DOM_EVENT, onScan);
      channel?.close();
      void supabase.removeChannel(sub);
    };
  }, [fetchRows, supabase]);

  const totalPending = rows.reduce((s, r) => s + r.pending_count, 0);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Re-inward</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Re-inward</CardTitle>
          <CardDescription className="text-destructive">{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!rows.length) {
    return (
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle>Re-inward</CardTitle>
          <CardDescription>
            After outward (2nd scan), scan again any carton coming back to the warehouse (3rd scan, same QR). Cartons
            staying on the container do not need another scan.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-secondary-muted">Nothing waiting for re-inward right now.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-2 border-amber-400 bg-amber-50/50 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-xl text-amber-950">Re-inward (3rd scan)</CardTitle>
            {totalPending > 0 ? (
              <Badge className="bg-amber-600">{totalPending} to scan</Badge>
            ) : (
              <Badge variant="secondary">All remaining done</Badge>
            )}
          </div>
          <CardDescription className="text-amber-900/90 text-sm leading-relaxed space-y-2">
            <span className="block">
              <strong>1st</strong> inward (all cartons) → <strong>2nd</strong> outward (all assigned cartons) →{" "}
              <strong>3rd</strong> re-inward here for cartons returning to the warehouse (same QR).
            </span>
            <span className="block">
              <span className="font-semibold text-amber-800">Pulsing</span> = outward done, re-inward pending — scan
              only if returning. <span className="text-sky-700">Blue</span> = outward not done yet.{" "}
              <span className="text-slate-500">Grey ✓</span> = re-inward done.
            </span>
          </CardDescription>
        </CardHeader>
      </Card>

      {rows.map((row) => (
        <Card key={`${row.console_id}-${row.order_id}`} className="bg-white border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{row.shipping_mark || row.order_id.slice(0, 8)}</CardTitle>
            <p className="text-sm text-secondary-muted">
              Console {row.console_number}
              {row.container_number ? ` · ${row.container_number}` : ""}
            </p>
            <p className="text-xs font-medium text-amber-800 mt-1">
              Re-inward pending: {row.pending_count} · Done: {row.done_count} · Need outward first:{" "}
              {row.on_container_count}
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {row.cartons.map((c) => (
                <ReInwardCartonSlot key={c.id} carton={c} />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
