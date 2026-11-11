"use client";

import { CalendarDays, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CrmPipelineStage } from "@/app/actions/crm/types";
import {
  DATE_PRESET_LABELS,
  type DatePreset,
  type PipelineFilterState,
} from "@/lib/crm-pipeline-filter";

type Option = { id: string; name: string };

const QUICK_PRESETS: DatePreset[] = ["all", "today", "yesterday", "this_week", "last_7_days", "this_month", "last_month", "this_year"];
const PICKER_PRESETS: DatePreset[] = ["day", "month", "year", "range"];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => String(currentYear - i));

const fieldClass = "h-8 rounded-sm text-sm";

/**
 * Super Admin's filter bar for the pipeline. Search text comes from the page's
 * main search box; everything here and that search feed one filter state.
 */
export function CrmPipelineFilterBar({
  value,
  onChange,
  onReset,
  activeCount,
  stages,
  assignees,
  tags,
  resultCount,
}: {
  value: PipelineFilterState;
  onChange: (next: Partial<PipelineFilterState>) => void;
  onReset: () => void;
  activeCount: number;
  stages: CrmPipelineStage[];
  assignees: Option[];
  tags: string[];
  resultCount: number;
}) {
  const preset = value.datePreset;

  return (
    <section aria-label="Pipeline filters" className="rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 shrink-0 stroke-slate-500" aria-hidden />
          <Select
            value={preset}
            onValueChange={(next) => onChange({ datePreset: next as DatePreset, dateValue: "", rangeFrom: "", rangeTo: "" })}
          >
            <SelectTrigger className={`${fieldClass} w-[150px]`} aria-label="Date">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUICK_PRESETS.map((p) => (
                <SelectItem key={p} value={p}>
                  {DATE_PRESET_LABELS[p]}
                </SelectItem>
              ))}
              {PICKER_PRESETS.map((p) => (
                <SelectItem key={p} value={p}>
                  {DATE_PRESET_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {preset === "day" ? (
          <Input
            type="date"
            aria-label="Day"
            className={`${fieldClass} w-[150px]`}
            value={value.dateValue}
            onChange={(e) => onChange({ dateValue: e.target.value })}
          />
        ) : null}
        {preset === "month" ? (
          <Input
            type="month"
            aria-label="Month"
            className={`${fieldClass} w-[150px]`}
            value={value.dateValue}
            onChange={(e) => onChange({ dateValue: e.target.value })}
          />
        ) : null}
        {preset === "year" ? (
          <Select value={value.dateValue || undefined} onValueChange={(year) => onChange({ dateValue: year })}>
            <SelectTrigger className={`${fieldClass} w-[100px]`} aria-label="Year">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {preset === "range" ? (
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              aria-label="From"
              className={`${fieldClass} w-[150px]`}
              value={value.rangeFrom}
              max={value.rangeTo || undefined}
              onChange={(e) => onChange({ rangeFrom: e.target.value })}
            />
            <span className="text-sm text-slate-500">to</span>
            <Input
              type="date"
              aria-label="To"
              className={`${fieldClass} w-[150px]`}
              value={value.rangeTo}
              min={value.rangeFrom || undefined}
              onChange={(e) => onChange({ rangeTo: e.target.value })}
            />
          </div>
        ) : null}

        <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" aria-hidden />

        <Select value={value.stage} onValueChange={(stage) => onChange({ stage })}>
          <SelectTrigger className={`${fieldClass} w-[140px]`} aria-label="Stage">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value.assignee} onValueChange={(assignee) => onChange({ assignee })}>
          <SelectTrigger className={`${fieldClass} w-[160px]`} aria-label="Assignee">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {assignees.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value.tag} onValueChange={(tag) => onChange({ tag })} disabled={tags.length === 0}>
          <SelectTrigger className={`${fieldClass} w-[130px]`} aria-label="Tag">
            <SelectValue placeholder="Tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tags.length ? "All tags" : "No tags"}</SelectItem>
            {tags.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-slate-600 tabular-nums" aria-live="polite">
            {resultCount.toLocaleString()} {resultCount === 1 ? "deal" : "deals"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-sm"
            disabled={activeCount === 0}
            onClick={onReset}
            data-view-only-allow
          >
            <RotateCcw className="h-3.5 w-3.5 stroke-current" aria-hidden />
            Clear filters{activeCount ? ` (${activeCount})` : ""}
          </Button>
        </div>
      </div>
    </section>
  );
}
