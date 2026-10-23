"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  CONTACT_DATE_PRESET_OPTIONS,
  formatContactDateRangeLabel,
  formatMonthYearLabel,
  listRecentMonthPresets,
  resolveContactDatePreset,
  type ContactDatePresetId,
  type ContactDateRangeValue,
} from "@/lib/contact-date-range";

type Props = {
  value: ContactDateRangeValue | null;
  onChange: (next: ContactDateRangeValue | null) => void;
  className?: string;
};

export function ContactDateRangeFilter({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const monthOptions = useMemo(() => listRecentMonthPresets(18), []);

  const [draftPreset, setDraftPreset] = useState<ContactDatePresetId>(
    value?.preset || "this_month"
  );
  const [draftStart, setDraftStart] = useState(value?.startYmd || "");
  const [draftEnd, setDraftEnd] = useState(value?.endYmd || "");

  useEffect(() => {
    if (!open) return;
    if (value) {
      setDraftPreset(value.preset);
      setDraftStart(value.startYmd);
      setDraftEnd(value.endYmd);
    } else {
      const def = resolveContactDatePreset("this_month");
      setDraftPreset(def.preset);
      setDraftStart(def.startYmd);
      setDraftEnd(def.endYmd);
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function applyPreset(preset: ContactDatePresetId) {
    const next = resolveContactDatePreset(preset);
    setDraftPreset(next.preset);
    setDraftStart(next.startYmd);
    setDraftEnd(next.endYmd);
    if (preset !== "custom") {
      onChange(next);
      setOpen(false);
    }
  }

  function applyCustom() {
    if (!draftStart || !draftEnd) return;
    let start = draftStart;
    let end = draftEnd;
    if (start > end) {
      const tmp = start;
      start = end;
      end = tmp;
    }
    onChange({
      preset: "custom",
      startYmd: start,
      endYmd: end,
    });
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setOpen(false);
  }

  const label = value ? formatContactDateRangeLabel(value) : "Date range";

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "h-9 inline-flex items-center gap-1.5 rounded-md border px-3 text-sm",
            "bg-slate-50 border-slate-200 hover:bg-slate-100 text-primary-dark",
            value ? "border-violet-300 bg-violet-50 text-violet-900" : null
          )}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <CalendarRange className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
          <span className="max-w-[180px] truncate font-medium">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
        </button>
        {value ? (
          <button
            type="button"
            onClick={clear}
            className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white text-secondary-muted hover:bg-slate-50"
            aria-label="Clear date range"
            title="Clear date range"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {open ? (
        <div
          role="dialog"
          aria-label="Contact date range"
          className="absolute left-0 top-[calc(100%+6px)] z-40 w-[min(100vw-2rem,520px)] rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            <div className="p-2 max-h-[320px] overflow-y-auto">
              <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-secondary-muted">
                Presets
              </p>
              {CONTACT_DATE_PRESET_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => applyPreset(opt.id)}
                  className={cn(
                    "w-full text-left rounded-md px-2.5 py-1.5 text-sm hover:bg-slate-50",
                    draftPreset === opt.id
                      ? "bg-violet-50 text-violet-800 font-medium"
                      : "text-primary-dark"
                  )}
                >
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDraftPreset("custom")}
                className={cn(
                  "w-full text-left rounded-md px-2.5 py-1.5 text-sm hover:bg-slate-50",
                  draftPreset === "custom"
                    ? "bg-violet-50 text-violet-800 font-medium"
                    : "text-primary-dark"
                )}
              >
                Custom Range
              </button>

              <p className="px-2 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-secondary-muted">
                Months
              </p>
              {monthOptions.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => applyPreset(m.id)}
                  className={cn(
                    "w-full text-left rounded-md px-2.5 py-1.5 text-sm hover:bg-slate-50",
                    draftPreset === m.id
                      ? "bg-violet-50 text-violet-800 font-medium"
                      : "text-primary-dark"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="p-3 space-y-3">
              <div>
                <p className="text-sm font-semibold text-primary-dark">
                  {draftPreset.startsWith("month:")
                    ? formatMonthYearLabel(`${draftPreset.slice(6)}-01`)
                    : draftPreset === "custom"
                      ? "Custom date range"
                      : CONTACT_DATE_PRESET_OPTIONS.find((p) => p.id === draftPreset)
                          ?.label || "Date range"}
                </p>
                <p className="text-xs text-secondary-muted mt-0.5">
                  Filter by contact creation date (Pakistan time).
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-secondary-muted">
                    Start date
                  </span>
                  <Input
                    type="date"
                    value={draftStart}
                    onChange={(e) => {
                      setDraftPreset("custom");
                      setDraftStart(e.target.value);
                    }}
                    className="h-9 bg-slate-50 border-slate-200"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-secondary-muted">
                    End date
                  </span>
                  <Input
                    type="date"
                    value={draftEnd}
                    onChange={(e) => {
                      setDraftPreset("custom");
                      setDraftEnd(e.target.value);
                    }}
                    className="h-9 bg-slate-50 border-slate-200"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={clear}
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 bg-violet-600 hover:bg-violet-700 text-white"
                  onClick={applyCustom}
                  disabled={!draftStart || !draftEnd}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
