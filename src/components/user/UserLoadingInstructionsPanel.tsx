"use client";

import { useCallback, useEffect, useState } from "react";
import { getLoadingInstructionsForUser } from "@/app/actions/orders";
import {
  reportConsoleFull,
  reportConsoleSpaceAvailable,
} from "@/app/actions/loading-workflow";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { LoadingInstructionPdfConsole, LoadingInstructionPdfOrder } from "@/lib/loading-instruction-pdf";
import type { ConsoleLoadingStats } from "@/app/actions/loading-workflow";
import { LOADING_PHASE_LABELS, type LoadingPhase } from "@/lib/loading-workflow-types";
import { toast } from "sonner";

type InstructionRow = {
  console: LoadingInstructionPdfConsole & { loading_phase?: string | null };
  orders: LoadingInstructionPdfOrder[];
  stats: ConsoleLoadingStats | null;
};

function phaseBadge(phase: LoadingPhase | null | undefined) {
  const p = (phase ?? "open") as LoadingPhase;
  const variant =
    p === "open"
      ? "default"
      : p === "full_reported"
        ? "destructive"
        : p === "space_available"
          ? "secondary"
          : "outline";
  return <Badge variant={variant}>{LOADING_PHASE_LABELS[p] ?? p}</Badge>;
}

type Props = {
  onOpenReInwardTab?: () => void;
};

export function UserLoadingInstructionsPanel({ onOpenReInwardTab }: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<InstructionRow[]>([]);
  const [busyConsoleId, setBusyConsoleId] = useState<string | null>(null);

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
  }, [load]);

  async function handleReportFull(consoleId: string) {
    setBusyConsoleId(consoleId);
    const res = await reportConsoleFull(consoleId);
    setBusyConsoleId(null);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Container full — open Re-inward tab and scan cartons returning to the warehouse (3rd scan).", {
      duration: 6000,
    });
    void load();
    onOpenReInwardTab?.();
  }

  async function handleReportSpace(consoleId: string) {
    setBusyConsoleId(consoleId);
    const res = await reportConsoleSpaceAvailable(consoleId);
    setBusyConsoleId(null);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Space available reported. Admin can assign more orders.");
    void load();
  }

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
            When admin marks your console ready, scan each carton here for outward (2nd scan). After container full,
            use the <strong>Re-inward</strong> tab for the 3rd scan.
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
            1st scan = inward · 2nd scan = outward (here) · 3rd scan = re-inward (same QR, fills amber row in Scan Progress)
          </CardDescription>
        </CardHeader>
      </Card>

      {rows.map(({ console: cons, orders, stats }) => {
        const phase = (cons.loading_phase ?? "open") as LoadingPhase;
        const s = stats;
        const isBusy = busyConsoleId === cons.id;

        return (
          <Card key={cons.id} className="bg-white border shadow-sm">
            <CardHeader className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <CardTitle className="text-lg">Console {cons.console_number}</CardTitle>
                {phaseBadge(phase)}
              </div>
              <p className="text-sm text-secondary-muted">
                Container: {cons.container_number ?? "—"}
                {cons.carrier ? ` · ${cons.carrier}` : ""}
              </p>
              {s ? (
                <p className="text-xs text-secondary-muted">
                  Loaded {s.loaded_cartons} · Pending load {s.pending_cartons} · Re-inwarded {s.returned_cartons}
                </p>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {s?.can_report_full ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => void handleReportFull(cons.id)}
                  >
                    Report container full
                  </Button>
                ) : null}
                {s?.can_report_space ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => void handleReportSpace(cons.id)}
                  >
                    Report space available
                  </Button>
                ) : null}
                {phase === "full_reported" && onOpenReInwardTab ? (
                  <Button type="button" size="sm" onClick={onOpenReInwardTab}>
                    Open Re-inward tab
                  </Button>
                ) : null}
              </div>

              {phase === "full_reported" ? (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  Container is full. Scan cartons again with the same QR for <strong>re-inward</strong> (3rd scan) when
                  they return to the warehouse. Original inward receipt is unchanged.
                </p>
              ) : null}

              <ul className="space-y-2 text-sm">
                {orders.map((o) => (
                  <li key={o.id} className="rounded-lg border bg-slate-50 px-3 py-2">
                    <span className="font-semibold text-primary-dark">{o.shipping_mark || o.id.slice(0, 8)}</span>
                    <span className="text-secondary-muted"> · {o.total_cartons} cartons</span>
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
