"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  StickyNote,
  Paperclip,
  Bell,
  BellOff,
  Loader2,
  Reply,
  CalendarPlus,
} from "lucide-react";
import {
  getOpportunityChatter,
  getOpportunityFollowers,
  postOpportunityMessage,
  postOpportunityNote,
  toggleOpportunityFollower,
  uploadOpportunityAttachment,
} from "@/app/actions/crm/chatter";
import type { CrmChatterEntry } from "@/app/actions/crm/types";

type ChatterMode = "message" | "note" | null;

type Props = {
  opportunityId: string | null;
  onScheduleActivity?: () => void;
};

export function OpportunityChatter({ opportunityId, onScheduleActivity }: Props) {
  const [entries, setEntries] = useState<CrmChatterEntry[]>([]);
  const [mode, setMode] = useState<ChatterMode>(null);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<CrmChatterEntry | null>(null);
  const [followers, setFollowers] = useState<string[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadChatter = useCallback(
    async (before?: string) => {
      if (!opportunityId) return;
      if (before) setLoadingMore(true);
      else setLoading(true);

      const res = await getOpportunityChatter(opportunityId, { before });
      if (before) setLoadingMore(false);
      else setLoading(false);

      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }

      const newEntries = res.entries || [];
      setHasMore(Boolean(res.hasMore));
      setEntries((prev) => (before ? [...prev, ...newEntries] : newEntries));
    },
    [opportunityId]
  );

  const loadFollowers = useCallback(async () => {
    if (!opportunityId) return;
    const res = await getOpportunityFollowers(opportunityId);
    if ("followers" in res && res.followers) {
      setFollowers(res.followers.map((f) => f.username));
      setIsFollowing(Boolean(res.isFollowing));
    }
  }, [opportunityId]);

  useEffect(() => {
    void loadChatter();
    void loadFollowers();
  }, [loadChatter, loadFollowers]);

  function handleSubmit() {
    if (!opportunityId || !mode) return;
    const text = body.trim();
    if (!text) {
      toast.error("Please write something first");
      return;
    }

    startTransition(async () => {
      const res =
        mode === "message"
          ? await postOpportunityMessage(opportunityId, text, replyTo?.id)
          : await postOpportunityNote(opportunityId, text);

      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("entry" in res && res.entry) {
        setEntries((prev) => [res.entry!, ...prev]);
        toast.success(mode === "message" ? "Message posted" : "Note logged");
      }
      setBody("");
      setMode(null);
      setReplyTo(null);
    });
  }

  function handleToggleFollow() {
    if (!opportunityId) return;
    startTransition(async () => {
      const res = await toggleOpportunityFollower(opportunityId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("following" in res && typeof res.following === "boolean") {
        setIsFollowing(res.following);
        toast.success(res.following ? "Following opportunity" : "Unfollowed");
        void loadFollowers();
      }
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !opportunityId) return;
    const formData = new FormData();
    formData.set("file", file);

    startTransition(async () => {
      const res = await uploadOpportunityAttachment(opportunityId, formData);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("entry" in res && res.entry) {
        setEntries((prev) => [res.entry!, ...prev]);
        toast.success("Attachment uploaded");
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  const oldestCreatedAt = entries.length ? entries[entries.length - 1]?.created_at : undefined;

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
          onClick={() => {
            setMode("message");
            setReplyTo(null);
          }}
          disabled={!opportunityId}
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
          onClick={() => {
            setMode("note");
            setReplyTo(null);
          }}
          disabled={!opportunityId}
        >
          <StickyNote className="h-3.5 w-3.5" />
          Log note
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-8"
          onClick={() => {
            if (onScheduleActivity) onScheduleActivity();
            else toast.message("Save the opportunity first to schedule an activity");
          }}
          disabled={!opportunityId}
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          Activity
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 ml-1"
          onClick={() => fileInputRef.current?.click()}
          disabled={!opportunityId || isPending}
          title="Attach file"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="ml-auto flex items-center gap-2">
          {followers.length > 0 ? (
            <Badge variant="secondary" className="text-[10px]">
              {followers.length}
            </Badge>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 relative"
            onClick={handleToggleFollow}
            disabled={!opportunityId || isPending}
            title={isFollowing ? "Unfollow" : "Follow"}
          >
            {isFollowing ? (
              <BellOff className="h-4 w-4" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
            {isFollowing ? (
              <span className="absolute -top-0.5 -right-0.5 h-3.5 min-w-3.5 px-0.5 rounded-full bg-[#017e84] text-white text-[9px] flex items-center justify-center">
                1
              </span>
            ) : null}
          </Button>
        </div>
      </div>

      {mode && opportunityId && (
        <div className="p-3 border-b bg-slate-50/50 space-y-2">
          {replyTo ? (
            <div className="text-[11px] text-secondary-muted flex items-center gap-1">
              <Reply className="h-3 w-3" />
              Replying to {replyTo.performed_by}
              <button
                type="button"
                className="text-violet-600 hover:underline ml-1"
                onClick={() => setReplyTo(null)}
              >
                Cancel
              </button>
            </div>
          ) : null}
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              mode === "message"
                ? "Write a message… Use @username to mention someone"
                : "Log an internal note…"
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
                setReplyTo(null);
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
              {isPending ? "Saving…" : mode === "message" ? "Send" : "Log note"}
            </Button>
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {!opportunityId ? (
          <div className="text-center text-xs text-secondary-muted py-8">
            Save the opportunity to open the chatter.
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-12 text-secondary-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center text-xs text-secondary-muted py-8">
            No messages yet. Post a message or log a note to start.
          </div>
        ) : (
          <>
            {entries.map((entry) => (
              <ChatterRow
                key={entry.id}
                entry={entry}
                onReply={
                  entry.entry_type === "message" || entry.entry_type === "reply"
                    ? () => {
                        setMode("message");
                        setReplyTo(entry);
                      }
                    : undefined
                }
              />
            ))}
            {hasMore ? (
              <div className="text-center pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => void loadChatter(oldestCreatedAt)}
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      Loading…
                    </>
                  ) : (
                    "Load older messages"
                  )}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

const DIFF_LINE_RE = /^(.+?)\s+→\s+(.+?)\s+\(([^()]+)\)\s*$/;

function DiffLine({ raw }: { raw: string }) {
  const m = raw.match(DIFF_LINE_RE);
  if (!m) return <div className="text-slate-700">{raw}</div>;
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

function ChatterRow({
  entry,
  onReply,
}: {
  entry: CrmChatterEntry;
  onReply?: () => void;
}) {
  const initials = (entry.performed_by || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const time = new Date(entry.created_at).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const isAudit = entry.entry_type === "audit";
  const isNote = entry.entry_type === "note";
  const isAttachment = entry.entry_type === "attachment";
  const isMessage = entry.entry_type === "message" || entry.entry_type === "reply";

  const bubbleTone = isAudit
    ? "bg-white border-slate-200 text-slate-700"
    : isNote
    ? "bg-amber-50 border-amber-200 text-amber-900"
    : isMessage
    ? "bg-violet-50 border-violet-200 text-violet-900"
    : isAttachment
    ? "bg-sky-50 border-sky-200 text-sky-900"
    : "bg-slate-50 border-slate-200 text-slate-700";

  const lines = (entry.body || "").split("\n").filter((l) => l.length > 0);
  const url = typeof entry.metadata?.url === "string" ? entry.metadata.url : null;
  const mentions = Array.isArray(entry.metadata?.mentions)
    ? (entry.metadata.mentions as string[])
    : [];

  return (
    <div className="flex items-start gap-2.5">
      <div className="h-7 w-7 rounded-md bg-violet-600 text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
        {initials || "?"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="font-semibold text-primary-dark truncate">{entry.performed_by}</span>
          {isNote ? (
            <Badge variant="outline" className="text-[10px] py-0 border-amber-300 text-amber-700">
              Internal
            </Badge>
          ) : null}
          {entry.entry_type === "reply" ? (
            <Badge variant="outline" className="text-[10px] py-0">
              Reply
            </Badge>
          ) : null}
          {isAudit ? (
            <Badge variant="outline" className="text-[10px] py-0 text-slate-500">
              System
            </Badge>
          ) : null}
          <span className="text-secondary-muted">{time}</span>
          {onReply ? (
            <button
              type="button"
              className="text-violet-600 hover:underline text-[11px]"
              onClick={onReply}
            >
              Reply
            </button>
          ) : null}
        </div>

        {isAttachment && url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-1 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${bubbleTone}`}
          >
            <Paperclip className="h-3 w-3" />
            {entry.body}
          </a>
        ) : lines.length > 0 ? (
          isAudit ? (
            <div className="mt-1 space-y-0.5 text-xs">
              {lines.map((line, i) => (
                <DiffLine key={i} raw={line} />
              ))}
            </div>
          ) : (
            <div
              className={`mt-1 rounded-md border px-2.5 py-1.5 text-xs leading-relaxed whitespace-pre-line ${bubbleTone}`}
            >
              {entry.body}
            </div>
          )
        ) : null}

        {mentions.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {mentions.map((m) => (
              <Badge key={m} variant="secondary" className="text-[10px]">
                @{m}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
