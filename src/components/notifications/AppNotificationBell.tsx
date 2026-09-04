"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Inbox,
  Loader2,
  MessageSquare,
  Send,
  XCircle,
  ArrowRightLeft,
  AlertCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatNotificationTimestamp,
  notificationMetaLine,
  type AppInboxItem,
} from "@/lib/app-notifications";
import {
  getMyAppNotifications,
  markAllAppNotificationsRead,
  markAppNotificationRead,
} from "@/app/actions/app-notifications";

type Tone = "light" | "dark" | "brand";

type Props = {
  tone?: Tone;
  pollMs?: number;
  className?: string;
  onNavigate?: (item: AppInboxItem) => boolean | void;
  footerAction?: {
    label: string;
    onClick: () => void;
  };
};

function iconForEvent(eventType: string) {
  switch (eventType) {
    case "inquiry_received":
      return Inbox;
    case "inquiry_sent":
      return Send;
    case "sent_for_admin_approval":
      return ClipboardCheck;
    case "approved":
      return CheckCircle2;
    case "rejected":
      return XCircle;
    case "lead_transferred":
      return ArrowRightLeft;
    case "quotation_sent_to_customer":
    case "quotation_counter_offer":
      return FileText;
    case "chat":
      return MessageSquare;
    default:
      return Bell;
  }
}

function iconToneForEvent(eventType: string) {
  switch (eventType) {
    case "approved":
      return "bg-emerald-50 text-emerald-700 ring-emerald-100";
    case "rejected":
      return "bg-rose-50 text-rose-700 ring-rose-100";
    case "sent_for_admin_approval":
      return "bg-amber-50 text-amber-700 ring-amber-100";
    case "inquiry_received":
      return "bg-sky-50 text-sky-700 ring-sky-100";
    case "inquiry_sent":
      return "bg-teal-50 text-[#017e84] ring-teal-100";
    default:
      return "bg-slate-100 text-slate-600 ring-slate-200";
  }
}

export function AppNotificationBell({
  tone = "light",
  pollMs = 8000,
  className,
  onNavigate,
  footerAction,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AppInboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchInbox = useCallback(async (mode: "initial" | "poll" | "open" = "poll") => {
    if (mode === "open") setRefreshing(true);
    try {
      const result = await getMyAppNotifications(40);
      if ("error" in result) {
        setError(result.error || "Failed to load notifications");
        if (mode === "initial") {
          setItems([]);
          setUnreadCount(0);
        }
        return;
      }
      setError(null);
      setItems(result.notifications || []);
      setUnreadCount(result.unreadCount || 0);
    } catch {
      setError("Failed to load notifications");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchInbox("initial");
    const timer = window.setInterval(() => {
      void fetchInbox("poll");
    }, pollMs);
    return () => window.clearInterval(timer);
  }, [fetchInbox, pollMs]);

  useEffect(() => {
    if (open) void fetchInbox("open");
  }, [open, fetchInbox]);

  const unreadLabel = useMemo(() => {
    if (unreadCount <= 0) return null;
    return unreadCount > 99 ? "99+" : String(unreadCount);
  }, [unreadCount]);

  async function handleItemClick(item: AppInboxItem) {
    if (!item.isRead) {
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, isRead: true } : row)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      void markAppNotificationRead(item.id, item.source);
    }

    setOpen(false);

    const handled = onNavigate?.(item);
    if (handled) return;
    if (item.href) router.push(item.href);
  }

  async function handleMarkAllRead() {
    if (unreadCount === 0 || markingAll) return;
    setMarkingAll(true);
    setItems((prev) => prev.map((row) => ({ ...row, isRead: true })));
    setUnreadCount(0);
    try {
      await markAllAppNotificationsRead();
    } finally {
      setMarkingAll(false);
    }
  }

  const triggerClass =
    tone === "brand"
      ? "relative h-9 w-9 rounded-md text-white/90 hover:bg-white/10 hover:text-white"
      : tone === "dark"
        ? "relative h-10 w-10 rounded-full bg-slate-100/80 text-slate-700 hover:bg-slate-200/80"
        : "relative h-9 w-9 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(triggerClass, className)}
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        >
          <Bell className="h-4.5 w-4.5 h-[18px] w-[18px]" />
          {unreadLabel ? (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#017e84] text-white text-[10px] font-bold leading-[18px] text-center shadow-sm ring-2 ring-white">
              {unreadLabel}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[min(100vw-1.5rem,420px)] p-0 overflow-hidden rounded-xl border border-slate-200/80 shadow-xl bg-white z-[90]"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-white to-slate-50">
          <div>
            <p className="text-sm font-semibold text-slate-900 tracking-tight">Notifications</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {unreadCount > 0
                ? `${unreadCount} unread ${unreadCount === 1 ? "item" : "items"}`
                : "You are all caught up"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleMarkAllRead()}
            disabled={unreadCount === 0 || markingAll}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#017e84] hover:text-[#01656a] disabled:text-slate-300 disabled:cursor-default transition-colors"
          >
            {markingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Mark all read
          </button>
        </div>

        <div className="max-h-[min(28rem,70vh)] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-[#017e84]" />
              <p className="text-xs">Loading notifications…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <AlertCircle className="h-5 w-5 text-rose-500" />
              <p className="text-sm font-medium text-slate-800">Could not load notifications</p>
              <p className="text-xs text-slate-500">{error}</p>
              <button
                type="button"
                onClick={() => void fetchInbox("open")}
                className="mt-1 text-xs font-medium text-[#017e84] hover:underline"
              >
                Try again
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
              <div className="h-11 w-11 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
                <BellOff className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-slate-800">No notifications yet</p>
              <p className="text-xs text-slate-500 max-w-[240px]">
                Inquiry updates and messages that need your action will appear here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((item) => {
                const Icon = iconForEvent(item.eventType);
                const meta = notificationMetaLine(item);
                const rate =
                  item.payload.rate != null && String(item.payload.rate).trim() !== ""
                    ? String(item.payload.rate)
                    : null;
                return (
                  <li key={`${item.source}-${item.id}`}>
                    <button
                      type="button"
                      onClick={() => void handleItemClick(item)}
                      className={cn(
                        "w-full text-left px-4 py-3.5 flex gap-3 transition-colors",
                        "hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none",
                        !item.isRead && "bg-[#017e84]/[0.04]"
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 h-9 w-9 shrink-0 rounded-full ring-1 flex items-center justify-center",
                          iconToneForEvent(item.eventType)
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              "text-sm leading-snug text-slate-900",
                              !item.isRead ? "font-semibold" : "font-medium"
                            )}
                          >
                            {item.title}
                          </p>
                          {!item.isRead ? (
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#017e84]" />
                          ) : null}
                        </div>
                        {meta ? (
                          <p className="mt-0.5 text-[12px] font-medium text-slate-600 truncate">
                            {meta}
                            {rate ? ` · Rate ${rate}` : ""}
                          </p>
                        ) : null}
                        <p className="mt-0.5 text-[12px] text-slate-500 line-clamp-2 leading-relaxed">
                          {item.message}
                        </p>
                        <p className="mt-1.5 text-[11px] text-slate-400">
                          {formatNotificationTimestamp(item.createdAt)}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {(refreshing || footerAction) && (
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-slate-100 bg-slate-50/80">
            <span className="text-[10px] text-slate-400">
              {refreshing ? "Refreshing…" : "Live inbox"}
            </span>
            {footerAction ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  footerAction.onClick();
                }}
                className="text-[11px] font-medium text-slate-600 hover:text-[#017e84] transition-colors"
              >
                {footerAction.label}
              </button>
            ) : null}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
