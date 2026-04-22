"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, StickyNote, CalendarPlus } from "lucide-react";
import {
  logContactActivity,
  type ContactActivityLog,
} from "@/app/actions/contacts";

type ChatterMode = "message" | "note" | "activity";

type Props = {
  contactId: string | null;
  activity: ContactActivityLog[];
  onAppend: (log: ContactActivityLog) => void;
};

export function ContactChatter({ contactId, activity, onAppend }: Props) {
  const [mode, setMode] = useState<ChatterMode | null>(null);
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!contactId || !mode) return;
    const text = body.trim();
    if (!text) {
      toast.error("Please write a message first");
      return;
    }

    startTransition(async () => {
      const action_type = mode === "message" ? "message" : mode === "note" ? "note" : "activity";
      const res = await logContactActivity(contactId, action_type, text);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("activity" in res && res.activity) {
        onAppend(res.activity);
        toast.success(mode === "message" ? "Message sent" : mode === "note" ? "Note logged" : "Activity added");
      }
      setBody("");
      setMode(null);
    });
  }

  return (
    <div className="bg-white border rounded-lg h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-3 border-b">
        <Button
          size="sm"
          variant={mode === "message" ? "default" : "outline"}
          className="gap-1.5 h-8"
          onClick={() => setMode("message")}
          disabled={!contactId}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Send message
        </Button>
        <Button
          size="sm"
          variant={mode === "note" ? "default" : "outline"}
          className="gap-1.5 h-8"
          onClick={() => setMode("note")}
          disabled={!contactId}
        >
          <StickyNote className="h-3.5 w-3.5" />
          Log note
        </Button>
        <Button
          size="sm"
          variant={mode === "activity" ? "default" : "outline"}
          className="gap-1.5 h-8"
          onClick={() => setMode("activity")}
          disabled={!contactId}
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          Activity
        </Button>
      </div>

      {/* Composer */}
      {mode && contactId && (
        <div className="p-3 border-b bg-slate-50/50 space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              mode === "message"
                ? "Write a message…"
                : mode === "note"
                ? "Log an internal note…"
                : "Describe the activity…"
            }
            rows={3}
            className="bg-white"
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setBody("");
                setMode(null);
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={isPending || !body.trim()}
            >
              {isPending ? "Saving…" : mode === "message" ? "Send" : mode === "note" ? "Log" : "Schedule"}
            </Button>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!contactId ? (
          <div className="text-center text-xs text-secondary-muted py-8">
            Save the contact to start a conversation.
          </div>
        ) : activity.length === 0 ? (
          <div className="text-center text-xs text-secondary-muted py-8">
            No activity yet.
          </div>
        ) : (
          <>
            <ActivityDaySeparator label="Today" />
            {activity.map((log) => (
              <ActivityRow key={log.id} log={log} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function ActivityDaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-secondary-muted py-1">
      <div className="h-px flex-1 bg-slate-200" />
      <span>{label}</span>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

// Matches lines like "OLD → NEW (Field Label)"
const DIFF_LINE_RE = /^(.+?)\s+→\s+(.+?)\s+\(([^()]+)\)\s*$/;

function DiffLine({ raw }: { raw: string }) {
  const m = raw.match(DIFF_LINE_RE);
  if (!m) {
    return <div className="text-slate-700">{raw}</div>;
  }
  const [, oldVal, newVal, label] = m;
  return (
    <div className="leading-relaxed">
      <span className="text-slate-500">{oldVal}</span>
      <span className="mx-1.5 text-slate-400">→</span>
      <span className="font-medium text-violet-700">{newVal}</span>
      <span className="ml-1.5 text-slate-500">({label})</span>
    </div>
  );
}

function ActivityRow({ log }: { log: ContactActivityLog }) {
  const initials = (log.performed_by || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const time = new Date(log.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  const isSystem = log.action_type === "created" || log.action_type === "updated";

  const bubbleTone = isSystem
    ? "bg-white border-slate-200 text-slate-700"
    : log.action_type === "note"
    ? "bg-amber-50 border-amber-200 text-amber-900"
    : log.action_type === "message"
    ? "bg-violet-50 border-violet-200 text-violet-900"
    : log.action_type === "activity"
    ? "bg-sky-50 border-sky-200 text-sky-900"
    : "bg-slate-50 border-slate-200 text-slate-700";

  const lines = (log.body || "").split("\n").filter((l) => l.length > 0);

  return (
    <div className="flex items-start gap-2.5">
      <div className="h-7 w-7 rounded-md bg-violet-600 text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
        {initials || "?"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-primary-dark truncate">
            {log.performed_by}
          </span>
          <span className="text-secondary-muted">{time}</span>
        </div>
        {lines.length > 0 &&
          (isSystem ? (
            <div className="mt-1 space-y-0.5 text-xs">
              {lines.map((line, i) => (
                <DiffLine key={i} raw={line} />
              ))}
            </div>
          ) : (
            <div
              className={`mt-1 rounded-md border px-2.5 py-1.5 text-xs leading-relaxed whitespace-pre-line ${bubbleTone}`}
            >
              {log.body}
            </div>
          ))}
      </div>
    </div>
  );
}
