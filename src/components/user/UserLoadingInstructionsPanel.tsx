"use client";

import { useCallback, useEffect, useState } from "react";
import { getLoadingInstructionsForUser } from "@/app/actions/orders";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LoadingInstructionPdfConsole, LoadingInstructionPdfOrder } from "@/lib/loading-instruction-pdf";

type InstructionRow = {
  console: LoadingInstructionPdfConsole;
  orders: LoadingInstructionPdfOrder[];
};

type Props = {
  refreshKey: number;
};

export function UserLoadingInstructionsPanel({ refreshKey }: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<InstructionRow[]>([]);

  const load = useCallback(async () => {
    setIsLoading(true);
    const res = await getLoadingInstructionsForUser();
    if ("error" in res) {
      setError(res.error ?? "Unable to load loading instructions");
      setRows([]);
    } else {
      setError(null);
      setRows((res.instructions ?? []) as InstructionRow[]);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (isLoading) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Loading Instructions</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Loading Instructions</CardTitle>
          <CardDescription className="text-destructive">{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!rows.length) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Loading Instructions</CardTitle>
          <CardDescription>
            When an admin marks your console as ready for loading, it appears here. Use the same carton stickers from
            when you booked the order: scan each QR again to record loading (outward) — no new labels required.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Loading Instructions</CardTitle>
          <CardDescription>
            Consoles open for loading that include your orders. Scan the original book-order stickers on each carton
            again to record outward when you are ready — the QR does not change.
          </CardDescription>
        </CardHeader>
      </Card>

      {rows.map(({ console: cons, orders }) => {
        const cid = cons.id;
        return (
          <Card key={cid} className="bg-white border shadow-sm">
            <CardHeader>
              <div>
                <CardTitle className="text-lg">Console {cons.console_number}</CardTitle>
                <p className="text-sm text-secondary-muted mt-1">
                  Container: {cons.container_number ?? "—"}
                  {cons.carrier ? ` · Carrier: ${cons.carrier}` : ""}
                  {cons.bl_number ? ` · BL: ${cons.bl_number}` : ""}
                </p>
                <p className="text-xs text-secondary-muted mt-0.5">Status: ready for loading</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs font-semibold text-primary-dark uppercase tracking-wide">Your orders on this console</p>
              <ul className="space-y-2 text-sm">
                {orders.map((o) => (
                  <li key={o.id} className="rounded-lg border bg-slate-50 px-3 py-2">
                    <span className="font-semibold text-primary-dark">{o.shipping_mark || o.id.slice(0, 8)}</span>
                    <span className="text-secondary-muted"> · {o.destination_country}</span>
                    <span className="text-secondary-muted"> · {o.total_cartons} cartons</span>
                    {o.item_description ? (
                      <p className="text-xs text-secondary-muted mt-1 line-clamp-2">{o.item_description}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
