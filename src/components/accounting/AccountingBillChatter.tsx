"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquare, Search, StickyNote } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  getAccountingBillActivity,
  postAccountingBillNote,
  type AccountingBillLog,
} from "@/app/actions/accounting/bill-workflow";

type Props = { billId: string; refreshKey?: number };

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

function actionLabel(log: AccountingBillLog): string[] {
  const details = log.details || {};
  switch (log.action) {
    case "created":
      return ["Bill created"];
    case "updated":
      return ["Bill updated"];
    case "posted":
      return ["Bill posted"];
    case "cancelled":
      return ["Bill cancelled"];
    case "reset_to_draft":
      return ["Reset to Draft"];
    case "payment_registered": {
      const amount = details.amount != null ? Number(details.amount) : null;
      return [
        amount != null
          ? `Registered Payment ${amount.toFixed(2)}`
          : "Payment registered",
      ];
    }
    case "refund_created":
      return ["Vendor refund created"];
    case "refund_posted":
      return ["Vendor refund posted"];
    case "log_note":
      return [String(details.note || "Note added")];
    case "previewed":
      return ["PDF preview opened"];
    case "printed":
      return ["Bill printed"];
    case "duplicated":
      return ["Bill duplicated"];
    default:
      return [log.action.replace(/_/g, " ")];
  }
}

export function AccountingBillChatter({ billId, refreshKey = 0 }: Props) {
  const [logs, setLogs] = useState<AccountingBillLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"note" | null>(null);
  const [body, setBody] = useState("");
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    void getAccountingBillActivity(billId).then((res) => {
      if ("error" in res && res.error) {
        toast.error(res.error);
        setLogs([]);
      } else {
        setLogs(res.logs ?? []);
      }
      setLoading(false);
    });
  }, [billId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const filtered = logs.filter((l) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      l.action.toLowerCase().includes(needle) ||
      (l.performed_by || "").toLowerCase().includes(needle) ||
      JSON.stringify(l.details).toLowerCase().includes(needle)
    );
  });

  const grouped = filtered.reduce<Record<string, AccountingBillLog[]>>((acc, log) => {
    const key = dayKey(log.performed_at);
    (acc[key] ||= []).push(log);
    return acc;
  }, {});

  function submitNote() {
    const text = body.trim();
    if (!text) return;
    startTransition(async () => {
      const res = await postAccountingBillNote(billId, text);
      if ("error" in res && res.error) toast.error(res.error);
      else {
        setBody("");
        setMode(null);
        setLogs(res.logs ?? []);
      }
    });
  }

  return (
    <div className="border border-slate-200 rounded-sm bg-white overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 rounded-sm gap-1"
          onClick={() => setMode(mode === "note" ? null : "note")}
        >
          <StickyNote className="h-3.5 w-3.5" />
          Log note
        </Button>
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-7 w-40 pl-7 text-xs rounded-sm"
          />
        </div>
      </div>

      {mode === "note" ? (
        <div className="p-3 border-b border-slate-200 space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a note…"
            className="min-h-[72px] rounded-sm text-sm"
          />
          <Button
            size="sm"
            className="h-7 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
            disabled={isPending}
            onClick={submitNote}
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Post"}
          </Button>
        </div>
      ) : null}

      <div className="max-h-[360px] overflow-y-auto p-3 space-y-4">
        {loading ? (
          <p className="text-sm text-secondary-muted">Loading activity…</p>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-secondary-muted py-4">
            <MessageSquare className="h-4 w-4" />
            No activity yet.
          </div>
        ) : (
          Object.entries(grouped).map(([day, dayLogs]) => (
            <div key={day}>
              <p className="text-[11px] uppercase tracking-wide text-secondary-muted mb-2">
                {day}
              </p>
              <ul className="space-y-2">
                {dayLogs.map((log) => (
                  <li
                    key={log.id}
                    className="text-sm border-l-2 border-[#017e84]/40 pl-3"
                  >
                    {actionLabel(log).map((line, i) => (
                      <p
                        key={i}
                        className={
                          i === 0 ? "text-primary-dark" : "text-secondary-muted text-xs"
                        }
                      >
                        {line}
                      </p>
                    ))}
                    <p className="text-[11px] text-secondary-muted mt-0.5">
                      {log.performed_by || "System"} ·{" "}
                      {new Date(log.performed_at).toLocaleTimeString()}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
