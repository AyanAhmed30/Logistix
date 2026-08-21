"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createAccountingWorkingFile } from "@/app/actions/accounting/review";
import {
  AUDIT_CYCLES,
  AUDIT_RETURN_TYPE,
  defaultAuditYearBounds,
  formatAuditPeriodLabel,
  type AuditCycle,
} from "@/lib/accounting-working-files";
import { REVIEW_TEAL } from "@/components/accounting/AccountingReviewOdooPanels";

const CYCLE_CHIP =
  "inline-flex items-center gap-1 h-7 px-2 rounded text-xs font-medium text-white";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (fileId: string) => void;
};

export function AccountingStartAuditDialog({
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const defaults = useMemo(() => defaultAuditYearBounds(), []);
  const [returnType] = useState(AUDIT_RETURN_TYPE);
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [cycles, setCycles] = useState<AuditCycle[]>([...AUDIT_CYCLES]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const bounds = defaultAuditYearBounds();
    setDateFrom(bounds.dateFrom);
    setDateTo(bounds.dateTo);
    setCycles([...AUDIT_CYCLES]);
  }, [open]);

  function toggleCycle(cycle: AuditCycle) {
    setCycles((prev) =>
      prev.includes(cycle) ? prev.filter((c) => c !== cycle) : [...prev, cycle]
    );
  }

  function removeCycle(cycle: AuditCycle) {
    setCycles((prev) => prev.filter((c) => c !== cycle));
  }

  async function handleGenerate() {
    if (!cycles.length) {
      toast.error("Select at least one audit cycle.");
      return;
    }
    if (dateFrom > dateTo) {
      toast.error("End date must be on or after start date.");
      return;
    }

    setSubmitting(true);
    const res = await createAccountingWorkingFile({
      returnType,
      dateFrom,
      dateTo,
      cycles,
    });
    setSubmitting(false);

    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }

    if ("fileId" in res && res.fileId) {
      toast.success("Audit working file created");
      onOpenChange(false);
      onCreated?.(res.fileId);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
          <DialogTitle className="text-xl font-semibold text-slate-800">
            Start an Audit
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              Return Type
            </label>
            <div>
              <span
                className="inline-flex h-9 items-center px-3 rounded-md border-2 text-sm font-medium capitalize"
                style={{ borderColor: REVIEW_TEAL, color: REVIEW_TEAL }}
              >
                {returnType}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Dates</label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 rounded-md border border-slate-200 px-3 text-sm text-slate-700 bg-white"
              />
              <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 rounded-md border border-slate-200 px-3 text-sm text-slate-700 bg-white"
              />
            </div>
            <p className="text-xs text-slate-400">
              {formatAuditPeriodLabel(dateFrom, dateTo)}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Cycles</label>
            <div className="rounded-md border border-slate-200 bg-white min-h-[42px] p-2 flex flex-wrap items-center gap-1.5">
              {cycles.map((cycle) => (
                <span
                  key={cycle}
                  className={CYCLE_CHIP}
                  style={{ backgroundColor: REVIEW_TEAL }}
                >
                  {cycle}
                  <button
                    type="button"
                    onClick={() => removeCycle(cycle)}
                    className="hover:bg-white/20 rounded p-0.5"
                    aria-label={`Remove ${cycle}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 shrink-0"
                    aria-label="Add or remove cycles"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 max-h-72 overflow-y-auto">
                  {AUDIT_CYCLES.map((cycle) => (
                    <DropdownMenuCheckboxItem
                      key={cycle}
                      checked={cycles.includes(cycle)}
                      onCheckedChange={() => toggleCycle(cycle)}
                    >
                      {cycle}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 sm:justify-start gap-2">
          <Button
            type="button"
            disabled={submitting}
            onClick={() => void handleGenerate()}
            className="h-9 px-4 font-medium text-white"
            style={{ backgroundColor: REVIEW_TEAL }}
          >
            {submitting ? "Generating…" : "Generate Return"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
            className="h-9 px-4"
          >
            Discard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
