"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CalendarPlus,
  Loader2,
  MessageSquare,
  Search,
  StickyNote,
} from "lucide-react";
import {
  getSalesQuotationActivity,
  postSalesQuotationActivity,
  postSalesQuotationMessage,
  postSalesQuotationNote,
  type SalesQuotationLog,
} from "@/app/actions/sales/quotation-form";
import {
  mapQuotationDbStatusToUi,
  salesQuotationStatusLabel,
} from "@/lib/sales-navigation";

type ChatterMode = "message" | "note" | "activity" | null;

type Props = {
  quotationId: string | null;
};

function statusLabel(dbStatus: string | null | undefined) {
  if (!dbStatus) return "—";
  return salesQuotationStatusLabel(mapQuotationDbStatusToUi(dbStatus));
}

function formatMoney(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function dayKey(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function logBody(log: SalesQuotationLog): string[] {
  const details = log.details || {};
  const kind = String(details.kind || "");

  if (log.action === "log_note") {
    const note = String(details.note || details.message || "");
    return note ? [note] : ["Note added"];
  }

  if (log.action === "activity") {
    const summary = String(details.summary || "");
    const due = details.due_date ? String(details.due_date) : null;
    const lines = [summary || "Activity scheduled"];
    if (due) lines.push(`Due: ${due}`);
    return lines;
  }

  if (
    log.action === "status_changed" ||
    log.action === "emailed" ||
    log.action === "locked" ||
    log.action === "unlocked"
  ) {
    const from = statusLabel(log.previous_status);
    const to = statusLabel(log.new_status);
    if (log.previous_status && log.new_status && log.previous_status !== log.new_status) {
      return [`${from} → ${to} (Status)`];
    }
    if (log.action === "emailed") return ["Quotation marked as sent (email preview)"];
    if (log.action === "locked") return ["Sales Order locked"];
    if (log.action === "unlocked") return ["Sales Order unlocked"];
    return ["Status updated"];
  }

  if (log.action === "created") {
    return ["Quotation created"];
  }

  if (log.action === "updated") {
    const lines: string[] = ["Quotation updated"];
    if (details.revision != null) {
      lines.push(`Revision ${String(details.revision)}`);
    }
    if (details.total != null || details.total_amount != null) {
      lines.push(
        `${formatMoney(0)} → ${formatMoney(details.total ?? details.total_amount)} (Total)`
      );
    }
    return lines;
  }

  if (log.action === "duplicated") {
    return ["Quotation duplicated"];
  }

  if (log.action === "printed" || log.action === "previewed") {
    const kindPreview = String(details.kind || "pdf");
    return [`${kindPreview === "print" ? "Print" : "Preview"} opened`];
  }

  if (kind === "message") {
    return [String(details.note || "")];
  }

  return [log.action.replace(/_/g, " ")];
}

function isMessageLog(log: SalesQuotationLog) {
  return (
    log.action === "log_note" &&
    String(log.details?.kind || "") === "message"
  );
}

function isNoteLog(log: SalesQuotationLog) {
  return (
    log.action === "log_note" &&
    String(log.details?.kind || "note") !== "message"
  );
}

export function SalesQuotationChatter({ quotationId }: Props) {
  const [logs, setLogs] = useState<SalesQuotationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<ChatterMode>(null);
  const [body, setBody] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    if (!quotationId) {
      setLogs([]);
      return;
    }
    setLoading(true);
    const res = await getSalesQuotationActivity(quotationId);
    setLoading(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      setLogs([]);
      return;
    }
    if ("logs" in res) setLogs(res.logs || []);
  }, [quotationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return logs;
    return logs.filter((log) => {
      const hay = [
        log.performed_by,
        log.action,
        ...logBody(log),
        log.previous_status || "",
        log.new_status || "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [logs, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, SalesQuotationLog[]>();
    for (const log of filtered) {
      const key = dayKey(log.performed_at);
      const list = map.get(key) || [];
      list.push(log);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered]);

  function resetComposer() {
    setBody("");
    setDueDate("");
    setMode(null);
  }

  function handleSubmit() {
    if (!quotationId || !mode) return;
    const text = body.trim();
    if (!text) {
      toast.error("Please write something first");
      return;
    }

    startTransition(async () => {
      const res =
        mode === "message"
          ? await postSalesQuotationMessage(quotationId, text)
          : mode === "note"
            ? await postSalesQuotationNote(quotationId, text)
            : await postSalesQuotationActivity(
                quotationId,
                text,
                dueDate || null
              );

      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("log" in res && res.log) {
        setLogs((prev) => [res.log!, ...prev]);
        toast.success(
          mode === "message"
            ? "Message posted"
            : mode === "note"
              ? "Note logged"
              : "Activity scheduled"
        );
      }
      resetComposer();
    });
  }

  return (
    <div className="bg-white h-full flex flex-col min-h-[520px] xl:min-h-full border-0 rounded-none">
      <div className="flex flex-wrap items-center gap-1 p-3 border-b border-slate-200">
        <Button
          size="sm"
          variant={mode === "message" ? "default" : "outline"}
          className={`gap-1.5 h-8 ${
            mode === "message"
              ? "bg-[#017e84] hover:bg-[#016970] text-white"
              : ""
          }`}
          onClick={() => setMode("message")}
          disabled={!quotationId}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Send message
        </Button>
        <Button
          size="sm"
          variant={mode === "note" ? "default" : "outline"}
          className={`gap-1.5 h-8 ${
            mode === "note"
              ? "bg-[#017e84] hover:bg-[#016970] text-white"
              : ""
          }`}
          onClick={() => setMode("note")}
          disabled={!quotationId}
        >
          <StickyNote className="h-3.5 w-3.5" />
          Log note
        </Button>
        <Button
          size="sm"
          variant={mode === "activity" ? "default" : "outline"}
          className={`gap-1.5 h-8 ${
            mode === "activity"
              ? "bg-[#017e84] hover:bg-[#016970] text-white"
              : ""
          }`}
          onClick={() => setMode("activity")}
          disabled={!quotationId}
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          Activity
        </Button>

        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => setSearchOpen((v) => !v)}
            disabled={!quotationId}
            title="Search logs"
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {searchOpen ? (
        <div className="px-3 py-2 border-b border-slate-200">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chatter…"
            className="h-8 rounded-sm"
          />
        </div>
      ) : null}

      {mode && quotationId ? (
        <div className="p-3 border-b bg-slate-50/50 space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              mode === "message"
                ? "Write a message…"
                : mode === "note"
                  ? "Log an internal note…"
                  : "e.g. Call the customer tomorrow"
            }
            rows={3}
            className="bg-white rounded-sm"
          />
          {mode === "activity" ? (
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-8 rounded-sm bg-white"
            />
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetComposer}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-[#017e84] hover:bg-[#016970] text-white"
              onClick={handleSubmit}
              disabled={isPending || !body.trim()}
            >
              {isPending
                ? "Saving…"
                : mode === "message"
                  ? "Send"
                  : mode === "note"
                    ? "Log note"
                    : "Schedule"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {!quotationId ? (
          <div className="text-center text-xs text-secondary-muted py-8">
            Save the quotation to open the chatter.
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-12 text-secondary-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-xs text-secondary-muted py-8">
            No messages yet. Post a message or log a note to start.
          </div>
        ) : (
          grouped.map(([day, dayLogs]) => (
            <div key={day} className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-secondary-muted">
                  {day}
                </span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              {dayLogs.map((log) => (
                <LogRow key={log.id} log={log} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LogRow({ log }: { log: SalesQuotationLog }) {
  const initials = (log.performed_by || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const time = new Date(log.performed_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const lines = logBody(log);
  const message = isMessageLog(log);
  const note = isNoteLog(log);
  const activity = log.action === "activity";

  const bubbleTone = message
    ? "bg-violet-50 border-violet-200 text-violet-900"
    : note
      ? "bg-amber-50 border-amber-200 text-amber-900"
      : activity
        ? "bg-sky-50 border-sky-200 text-sky-900"
        : "bg-white border-slate-200 text-slate-700";

  return (
    <div className="flex gap-2.5">
      <div
        className={`h-8 w-8 rounded-sm flex items-center justify-center text-[11px] font-semibold shrink-0 ${
          message
            ? "bg-violet-100 text-violet-800"
            : note
              ? "bg-amber-100 text-amber-800"
              : activity
                ? "bg-sky-100 text-sky-800"
                : "bg-slate-100 text-slate-700"
        }`}
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap mb-1">
          <span className="text-sm font-semibold text-primary-dark">
            {log.performed_by}
          </span>
          <span className="text-[11px] text-secondary-muted">{time}</span>
        </div>
        <div
          className={`rounded-sm border px-2.5 py-2 text-sm space-y-0.5 ${bubbleTone}`}
        >
          {lines.map((line, idx) => (
            <DiffLine key={`${log.id}-${idx}`} raw={line} />
          ))}
        </div>
      </div>
    </div>
  );
}

const DIFF_LINE_RE = /^(.+?)\s+→\s+(.+?)\s+\(([^()]+)\)\s*$/;

function DiffLine({ raw }: { raw: string }) {
  const m = raw.match(DIFF_LINE_RE);
  if (!m) return <div className="leading-relaxed">{raw}</div>;
  const [, oldVal, newVal, label] = m;
  return (
    <div className="leading-relaxed">
      <span className="text-slate-500">{oldVal}</span>
      <span className="mx-1.5 text-slate-400">→</span>
      <span className="font-medium text-[#017e84]">{newVal}</span>
      <span className="ml-1.5 text-slate-500">({label})</span>
    </div>
  );
}
