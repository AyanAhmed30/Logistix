"use client";

import { useState, useEffect } from "react";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { LogOut, Menu, X, Settings, ClipboardList, Bell } from "lucide-react";
import Image from "next/image";
import { OperationsPanel } from "@/components/admin/OperationsPanel";
import { OperationsLeadsInquiryPanel } from "@/components/admin/OperationsLeadsInquiryPanel";
import { prefetchOperationsInquiries } from "@/lib/operations-inquiries-cache";
import {
  getMyLeadChatNotifications,
  markLeadChatNotificationRead,
  type LeadChatNotification,
} from "@/app/actions/inquiries";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClientErrorBoundary } from "@/components/error/ClientErrorBoundary";

type Props = {
  username: string;
};

type SubTab = "operations" | "leads-inquiry";

export function OperationsDashboardShell({ username }: Props) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("operations");
  const [isClientMounted, setIsClientMounted] = useState(false);
  const [notifications, setNotifications] = useState<LeadChatNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [focusLeadId, setFocusLeadId] = useState<string | null>(null);
  const [focusInquiryId, setFocusInquiryId] = useState<string | null>(null);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setIsClientMounted(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    void prefetchOperationsInquiries("").catch(() => {
      // Prefetch is best-effort; the panel will fetch on its own if this fails.
    });
  }, []);

  useEffect(() => {
    async function fetchNotifications() {
      try {
        const result = await getMyLeadChatNotifications(30);
        if ("error" in result) {
          setNotificationsError(result.error || "Failed to load notifications");
          setNotifications([]);
          setUnreadCount(0);
        } else {
          setNotificationsError(null);
          setNotifications(result.notifications || []);
          setUnreadCount(result.unreadCount || 0);
        }
      } catch {
        setNotificationsError("Failed to load notifications");
      }
    }
    fetchNotifications();
    const timer = setInterval(fetchNotifications, 5000);
    return () => clearInterval(timer);
  }, []);

  async function handleNotificationClick(notification: LeadChatNotification) {
    if (!notification.is_read) {
      try {
        await markLeadChatNotificationRead(notification.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // Keep navigation flow even if read-status update fails transiently.
      }
    }
    setActiveSubTab("leads-inquiry");
    setFocusLeadId(notification.lead_id);
    setFocusInquiryId(notification.inquiry_id || null);
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-0 inset-x-0 h-16 bg-white border-b z-50">
        <div className="h-full px-6 md:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-slate-200 text-primary-dark hover:bg-slate-50 md:hidden"
              onClick={() => setIsSidebarOpen((open) => !open)}
              aria-label="Toggle sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="bg-white p-1 rounded-md">
              <Image src="/logo.jpg" alt="Logo" width={130} height={40} className="h-9 w-auto" />
            </div>
            <span className="hidden md:block font-semibold text-sm uppercase tracking-widest text-secondary-muted">
              Operations Portal
            </span>
          </div>

          <div className="flex items-center gap-4 md:gap-6">
            {isClientMounted ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="relative h-9 w-9 p-0 border-slate-200 bg-white hover:bg-slate-50"
                    aria-label="Notifications"
                  >
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[360px] z-[90]">
                  <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {notificationsError ? (
                    <DropdownMenuItem disabled className="text-xs text-red-600">
                      {notificationsError}
                    </DropdownMenuItem>
                  ) : notifications.length === 0 ? (
                    <DropdownMenuItem disabled className="text-sm text-slate-500">
                      No notifications
                    </DropdownMenuItem>
                  ) : (
                    notifications.map((n) => (
                      <DropdownMenuItem
                        key={n.id}
                        className={`items-start whitespace-normal cursor-pointer ${!n.is_read ? "bg-blue-50" : ""}`}
                        onClick={() => handleNotificationClick(n)}
                      >
                        <div className="text-sm leading-snug">
                          <div>
                            {n.notification_type === "lifecycle" ? (
                              <>
                                <span className="font-semibold">{n.sender_username}</span>{" "}
                                ({n.sender_role === "sales_agent" ? "Sales Agent" : n.sender_role === "operations" ? "Operations" : "Admin"}){" "}
                                {n.message || "updated an inquiry status."}
                              </>
                            ) : (
                              <>
                                <span className="font-semibold">{n.sender_username}</span>{" "}
                                ({n.sender_role === "sales_agent" ? "Sales Agent" : n.sender_role === "operations" ? "Operations" : "Admin"}) sent you a message regarding{" "}
                                Lead #{n.leads?.lead_id_formatted || "N/A"}
                              </>
                            )}{" "}
                            at{" "}
                            {new Date(n.created_at).toLocaleString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </div>
                        </div>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="outline"
                className="relative h-9 w-9 p-0 border-slate-200 bg-white hover:bg-slate-50"
                aria-label="Notifications"
                type="button"
              >
                <Bell className="h-4 w-4" />
              </Button>
            )}
            <span className="hidden md:block text-sm text-secondary-muted">
              Logged in as <span className="font-semibold text-primary-dark">{username}</span>
            </span>
            <form action={logout}>
              <Button
                variant="outline"
                className="gap-2 border-slate-200 bg-white hover:bg-slate-50 text-primary-dark hover:text-primary-dark"
                type="submit"
              >
                <LogOut className="h-4 w-4" /> Sign Out
              </Button>
            </form>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r shadow-lg transform transition-all duration-200 md:translate-x-0 md:top-16 md:h-[calc(100vh-4rem)] md:shadow-none overflow-y-auto ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between md:hidden">
            <h2 className="text-sm font-semibold text-secondary-muted uppercase tracking-widest">
              Menu
            </h2>
            <button
              className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-slate-200 text-primary-dark hover:bg-slate-50"
              onClick={() => setIsSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-black text-primary-dark">Operations</h2>
            <p className="text-xs text-secondary-muted">Manage operations & inquiries</p>
          </div>
          <div className="grid gap-2">
            <Button
              variant={activeSubTab === "operations" ? "default" : "outline"}
              className="justify-start gap-2"
              onClick={() => {
                setActiveSubTab("operations");
                setIsSidebarOpen(false);
              }}
            >
              <Settings className="h-4 w-4 shrink-0" />
              <span>Operations</span>
            </Button>
            <Button
              variant={activeSubTab === "leads-inquiry" ? "default" : "outline"}
              className="justify-start gap-2"
              onMouseEnter={() => {
                void prefetchOperationsInquiries("").catch(() => undefined);
              }}
              onFocus={() => {
                void prefetchOperationsInquiries("").catch(() => undefined);
              }}
              onClick={() => {
                setActiveSubTab("leads-inquiry");
                setIsSidebarOpen(false);
              }}
            >
              <ClipboardList className="h-4 w-4 shrink-0" />
              <span>Leads Inquiry</span>
            </Button>
          </div>
        </div>
      </aside>

      {/* Sidebar overlay for mobile */}
      {isSidebarOpen && (
        <button
          className="fixed inset-0 z-40 bg-black/20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      {/* Main Content */}
      <main className="pt-20 md:pl-64">
        <section className="px-6 pb-10 md:px-10">
          <ClientErrorBoundary
            resetKey={activeSubTab}
            title="This section is temporarily unavailable"
            description="Something went wrong in this module. Try again or switch to another tab."
            compact
          >
          <div className={activeSubTab === "operations" ? undefined : "hidden"}>
            <OperationsPanel />
          </div>
          <div className={activeSubTab === "leads-inquiry" ? undefined : "hidden"}>
            <OperationsLeadsInquiryPanel
              focusLeadId={focusLeadId}
              focusInquiryId={focusInquiryId}
              onFocusHandled={() => {
                setFocusLeadId(null);
                setFocusInquiryId(null);
              }}
            />
          </div>
          </ClientErrorBoundary>
        </section>
      </main>
    </div>
  );
}
