"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  ANALYTICS_DATE_PRESETS,
  resolveAnalyticsDateRange,
  type AnalyticsDatePreset,
  type AnalyticsDateRange,
} from "@/lib/analytics/date-range";

const DEFAULT_PRESET: AnalyticsDatePreset = "last_30_days";

/**
 * The selected period lives in the URL, so every widget on a page reads one
 * value and the period carries over when drilling down.
 */
export function useAnalyticsRange() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const preset = (params.get("range") as AnalyticsDatePreset | null) ?? DEFAULT_PRESET;
  const startYmd = params.get("start") ?? "";
  const endYmd = params.get("end") ?? "";
  const startTime = params.get("startTime") ?? "";
  const endTime = params.get("endTime") ?? "";

  const resolved = useMemo(() => {
    const known = ANALYTICS_DATE_PRESETS.some((p) => p.id === preset) ? preset : DEFAULT_PRESET;
    return resolveAnalyticsDateRange(known, {
      startYmd,
      endYmd,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
    });
  }, [preset, startYmd, endYmd, startTime, endTime]);

  const update = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  const range: AnalyticsDateRange | null = "error" in resolved ? null : resolved;
  const rangeError = "error" in resolved ? resolved.error : null;
  const query = params.toString();

  return { preset, startYmd, endYmd, startTime, endTime, range, rangeError, update, query };
}

export function AnalyticsDateFilter() {
  const { preset, startYmd, endYmd, startTime, endTime, rangeError, update } = useAnalyticsRange();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="analytics-period" className="text-sm font-medium text-primary-dark">
        Period
      </label>
      <select
        id="analytics-period"
        value={preset}
        onChange={(e) => update({ range: e.target.value })}
        className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-primary-dark"
      >
        {ANALYTICS_DATE_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      {preset === "custom" ? (
        <>
          <Input
            type="date"
            aria-label="Start date"
            className="h-9 w-[150px] bg-white"
            value={startYmd}
            onChange={(e) => update({ start: e.target.value })}
          />
          <Input
            type="time"
            aria-label="Start time"
            className="h-9 w-[110px] bg-white"
            value={startTime}
            onChange={(e) => update({ startTime: e.target.value })}
          />
          <span className="text-sm text-slate-600">to</span>
          <Input
            type="date"
            aria-label="End date"
            className="h-9 w-[150px] bg-white"
            value={endYmd}
            onChange={(e) => update({ end: e.target.value })}
          />
          <Input
            type="time"
            aria-label="End time"
            className="h-9 w-[110px] bg-white"
            value={endTime}
            onChange={(e) => update({ endTime: e.target.value })}
          />
          {rangeError ? (
            <span role="alert" className="text-xs text-red-700">
              {rangeError}
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
