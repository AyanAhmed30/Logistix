"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  closeConsoleLoading,
  getConsoleLoadingDetailForAdmin,
  releaseOrdersFromConsole,
  releaseUnloadedOrdersOnConsole,
  resumeConsoleLoading,
} from "@/app/actions/loading-workflow";
import { LOADING_PHASE_LABELS, type LoadingPhase } from "@/lib/loading-workflow-types";
import { toast } from "sonner";

type Order = {
  id: string;
  shipping_mark: string;
  username: string;
  total_cartons: number;
};

type Props = {
  consoleId: string;
  consoleNumber: string;
  loadingPhase?: string | null;
  orders: Order[];
  onUpdated?: () => void;
};

export function ConsoleLoadingManageCard({
  consoleId,
  consoleNumber,
  loadingPhase,
  orders,
  onUpdated,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const phase = (loadingPhase ?? "open") as LoadingPhase;

  function toggleOrder(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(action: () => Promise<{ error?: string; success?: boolean; released?: number }>) {
    setBusy(true);
    const res = await action();
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    onUpdated?.();
  }

  return (
    <div className="rounded-lg border bg-slate-50 p-3 space-y-3 mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase text-secondary-muted">Loading workflow</span>
        <Badge variant="outline">{LOADING_PHASE_LABELS[phase] ?? phase}</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {(phase === "full_reported" || phase === "space_available") && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void run(() => resumeConsoleLoading(consoleId))}
          >
            Resume loading
          </Button>
        )}
        {phase === "full_reported" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const r = await releaseUnloadedOrdersOnConsole(consoleId);
                if ("error" in r && r.error) return r;
                if ("released" in r && r.released) {
                  toast.success(`Released ${r.released} unloaded order(s)`);
                }
                return { success: true };
              })
            }
          >
            Release all unloaded orders
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => void run(() => closeConsoleLoading(consoleId))}
        >
          Close loading
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await getConsoleLoadingDetailForAdmin(consoleId);
              toast.message(`Console ${consoleNumber} — check server logs / refresh for events`);
              return { success: true };
            })
          }
        >
          Refresh status
        </Button>
      </div>

      {orders.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-secondary-muted">Release selected orders from this console:</p>
          <ul className="max-h-32 overflow-y-auto space-y-1 text-sm">
            {orders.map((o) => (
              <li key={o.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(o.id)}
                  onChange={() => toggleOrder(o.id)}
                  className="rounded border-slate-300"
                />
                <span>
                  {o.shipping_mark} ({o.username}) · {o.total_cartons} ctns
                </span>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={busy || selected.size === 0}
            onClick={() =>
              void run(() =>
                releaseOrdersFromConsole(consoleId, Array.from(selected), "admin_manual_release")
              )
            }
          >
            Release selected ({selected.size})
          </Button>
        </div>
      ) : null}
    </div>
  );
}
