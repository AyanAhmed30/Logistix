"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquare, Search, StickyNote } from "lucide-react";
import {
  getAccountingInvoiceActivity,
  postAccountingInvoiceNote,
  type AccountingInvoiceLog,
} from "@/app/actions/accounting/invoice-workflow";

type Props = {
  invoiceId: string;
  refreshKey?: number;
};

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

function actionLabel(log: AccountingInvoiceLog): string[] {
  const details = log.details || {};
  const from = log.previous_status;
  const to = log.new_status;

  switch (log.action) {
    case "created":
      return ["Invoice created"];
    case "updated": {
      const lines = ["Invoice updated"];
      if (details.previous_total != null && details.total_amount != null) {
        lines.push(
          `${Number(details.previous_total).toFixed(2)} → ${Number(details.total_amount).toFixed(2)} (Total)`
        );
      }
      return lines;
    }
    case "posted":
      return [`Posted${from && to ? ` (${from} → ${to})` : ""}`];
    case "cancelled":
      return [`Cancelled${from && to ? ` (${from} → ${to})` : ""}`];
    case "reset_to_draft":
      return [`Reset to Draft${from && to ? ` (${from} → ${to})` : ""}`];
    case "payment_registered": {
      const amount = details.amount != null ? Number(details.amount) : null;
      const outstanding =
        details.outstanding != null ? Number(details.outstanding) : null;
      const lines = [
        amount != null
          ? `Registered Payment ${amount.toFixed(2)} PKR`
          : "Payment registered",
      ];
      if (details.payment_method_label) {
        lines.push(`Method: ${String(details.payment_method_label)}`);
      }
      if (outstanding != null) {
        lines.push(`Outstanding ${outstanding.toFixed(2)} PKR`);
      }
      return lines;
    }
    case "sent":
      return ["Invoice sent (email preview)"];
    case "printed":
      return ["Invoice printed"];
    case "previewed":
      return ["PDF preview opened"];
    case "duplicated":
      return [
        details.new_invoice_number
          ? `Duplicated → ${String(details.new_invoice_number)}`
          : "Invoice duplicated",
      ];
    case "log_note":
      return [String(details.note || "Note added")];
    default:
      return [log.action.replace(/_/g, " ")];
  }
}

export function AccountingInvoiceChatter({ invoiceId, refreshKey = 0 }: Props) {
  const [logs, setLogs] = useState<AccountingInvoiceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"note" | "message" | null>(null);
  const [body, setBody] = useState("");
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    void getAccountingInvoiceActivity(invoiceId).then((res) => {
      if ("error" in res && res.error) {
        toast.error(res.error);
        setLogs([]);
      } else {
        setLogs(res.logs ?? []);
      }
      setLoading(false);
    });
  }, [invoiceId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? logs.filter((l) => {
          const hay = [
            l.action,
            l.performed_by,
            l.previous_status,
            l.new_status,
            ...actionLabel(l),
          ]
            .join(" ")
            .toLowerCase();
          return hay.includes(needle);
        })
      : logs;

    const map = new Map<string, AccountingInvoiceLog[]>();
    for (const log of filtered) {
      const key = dayKey(log.performed_at);
      const list = map.get(key) || [];
      list.push(log);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [logs, query]);

  function submitNote() {
    const text = body.trim();
    if (!text) return;
    startTransition(async () => {
      const res = await postAccountingInvoiceNote(
        invoiceId,
        text,
        mode === "message" ? "message" : "note"
      );
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("logs" in res) setLogs(res.logs ?? []);
      setBody("");
      setMode(null);
      toast.success("Note added");
    });
  }

  return (
    <div className="h-full flex flex-col border border-slate-200 rounded-sm bg-white min-h-[320px]">
      <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-primary-dark">Activity Log</p>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="h-7 w-28 pl-7 text-xs rounded-sm"
          />
        </div>
      </div>

      <div className="px-3 py-2 border-b border-slate-100 flex gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs rounded-sm gap-1"
          onClick={() => setMode(mode === "message" ? null : "message")}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Message
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs rounded-sm gap-1"
          onClick={() => setMode(mode === "note" ? null : "note")}
        >
          <StickyNote className="h-3.5 w-3.5" />
          Note
        </Button>
      </div>

      {mode ? (
        <div className="px-3 py-2 border-b border-slate-100 space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={mode === "message" ? "Write a message…" : "Log an internal note…"}
            className="min-h-[72px] text-sm rounded-sm"
          />
          <div className="flex justify-end gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs rounded-sm"
              onClick={() => {
                setMode(null);
                setBody("");
              }}
            >
              Discard
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs rounded-sm bg-[#017e84] hover:bg-[#016970]"
              disabled={isPending || !body.trim()}
              onClick={submitNote}
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Log"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-auto p-3 space-y-4">
        {loading ? (
          <p className="text-xs text-secondary-muted">Loading activity…</p>
        ) : grouped.length === 0 ? (
          <p className="text-xs text-secondary-muted">No activity yet.</p>
        ) : (
          grouped.map(([day, dayLogs]) => (
            <div key={day}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary-muted mb-2">
                {day}
              </p>
              <ul className="space-y-2">
                {dayLogs.map((log) => {
                  const lines = actionLabel(log);
                  const when = new Date(log.performed_at);
                  const time = Number.isNaN(when.getTime())
                    ? ""
                    : when.toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                  return (
                    <li
                      key={log.id}
                      className="rounded-sm border border-slate-100 bg-slate-50/60 px-2.5 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {lines.map((line, i) => (
                            <p
                              key={`${log.id}-${i}`}
                              className={`text-sm ${
                                i === 0
                                  ? "font-medium text-primary-dark"
                                  : "text-secondary-muted text-xs mt-0.5"
                              }`}
                            >
                              {line}
                            </p>
                          ))}
                          {(log.previous_status || log.new_status) &&
                          log.action !== "updated" ? (
                            <p className="text-[11px] text-secondary-muted mt-1">
                              {log.previous_status || "—"} → {log.new_status || "—"}
                            </p>
                          ) : null}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[11px] text-secondary-muted">{time}</p>
                          <p className="text-[11px] font-medium text-slate-600">
                            {log.performed_by || "System"}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
