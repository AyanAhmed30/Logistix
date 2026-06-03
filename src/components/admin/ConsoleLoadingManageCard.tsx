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

  async function run(
    action: () => Promise<{ error?: string; success?: boolean; released?: number }>,
    successMessage?: string
  ): Promise<boolean> {
    setBusy(true);
    const res = await action();
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return false;
    }
    if (successMessage) toast.success(successMessage);
    onUpdated?.();
    return true;
  }

  return (
    <div className="rounded-lg border bg-slate-50 p-3 space-y-4 mt-3">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase text-secondary-muted">
            Loading controls
          </span>
          <Badge variant="outline">{LOADING_PHASE_LABELS[phase] ?? phase}</Badge>
        </div>
        <p className="text-xs text-secondary-muted leading-relaxed">
          Warehouse users load cartons for this container while status is open. Use the buttons below
          to pause, finish, or adjust this loading round.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(phase === "full_reported" || phase === "space_available") && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            title="Reopen loading after the container was marked full or space was reported"
            onClick={() =>
              void run(
                () => resumeConsoleLoading(consoleId),
                "Loading resumed — warehouse can scan again"
              )
            }
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
            title="Orders with zero outward scans are removed from this loading round only"
            onClick={() =>
              void run(async () => {
                const r = await releaseUnloadedOrdersOnConsole(consoleId);
                if ("error" in r && r.error) return r;
                const count = "released" in r ? r.released : 0;
                if (count) {
                  toast.success(
                    `Removed ${count} order(s) from loading (no cartons were loaded out)`
                  );
                } else {
                  toast.message("No unloaded orders to remove");
                }
                return { success: true };
              })
            }
          >
            Remove orders not loaded out
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          title="End this loading round — no more outward scans for this console"
          onClick={() =>
            void run(
              () => closeConsoleLoading(consoleId),
              "Loading closed for this console"
            )
          }
        >
          Finish loading round
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          title="Reload order list and loading status"
          onClick={() =>
            void run(async () => {
              await getConsoleLoadingDetailForAdmin(consoleId);
              return { success: true };
            }, `Refreshed ${consoleNumber}`)
          }
        >
          Refresh
        </Button>
      </div>

      {orders.length > 0 ? (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-primary-dark">
              Remove orders from this loading round
            </p>
            <p className="text-xs text-secondary-muted leading-relaxed">
              Tick orders that will <strong>not</strong> go on this container (e.g. container full).
              They stay on the console record in the Console tab, but warehouse users cannot load
              them on this shipment anymore.
            </p>
          </div>
          <ul className="max-h-32 overflow-y-auto space-y-1 text-sm" role="list">
            {orders.map((o) => (
              <li key={o.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`loading-order-${consoleId}-${o.id}`}
                  checked={selected.has(o.id)}
                  onChange={() => toggleOrder(o.id)}
                  className="rounded border-slate-300"
                  aria-label={`Select ${o.shipping_mark} (${o.username})`}
                />
                <label
                  htmlFor={`loading-order-${consoleId}-${o.id}`}
                  className="cursor-pointer select-none"
                >
                  {o.shipping_mark} ({o.username}) · {o.total_cartons} ctns
                </label>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={busy || selected.size === 0}
            title={
              selected.size === 0
                ? "Select at least one order above"
                : "Stop warehouse from loading the selected orders on this console"
            }
            onClick={() => {
              const count = selected.size;
              void (async () => {
                const ok = await run(
                  () =>
                    releaseOrdersFromConsole(
                      consoleId,
                      Array.from(selected),
                      "admin_manual_release"
                    ),
                  count === 1
                    ? "1 order removed from active loading on this console"
                    : `${count} orders removed from active loading on this console`
                );
                if (ok) setSelected(new Set());
              })();
            }}
          >
            Remove from loading round ({selected.size})
          </Button>
        </div>
      ) : (
        <p className="text-xs text-secondary-muted border-t border-slate-200 pt-3">
          No orders in the latest batch sent to loading. Mark new orders as Ready for Loading from
          the Console tab.
        </p>
      )}
    </div>
  );
}
