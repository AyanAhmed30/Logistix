"use client";

import { useEffect, useMemo, useState } from "react";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import {
  LogOut,
  Menu,
  X,
  Bell,
  ClipboardList,
  Package,
  Container,
  FileText,
  Receipt,
  ClipboardCheck,
  Calculator,
} from "lucide-react";
import Image from "next/image";
import { OperationsLeadsInquiryPanel } from "@/components/admin/OperationsLeadsInquiryPanel";
import { OrderManagementPanel } from "@/components/admin/OrderManagementPanel";
import { ConsolePanel } from "@/components/admin/ConsolePanel";
import { LoadingInstructionPanel } from "@/components/admin/LoadingInstructionPanel";
import { ImportPackingListPanel } from "@/components/admin/ImportPackingListPanel";
import { ImportInvoicePanel } from "@/components/admin/ImportInvoicePanel";
import { InquiryConfirmationPanel } from "@/components/admin/InquiryConfirmationPanel";
import { AdminCalculatorPanel } from "@/components/admin/AdminCalculatorPanel";
import { prefetchOperationsInquiries } from "@/lib/operations-inquiries-cache";
import { OPERATIONS_MODULE_PERMISSIONS } from "@/lib/module-permissions";
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
  permissions?: string[];
};

type OpsTabKey =
  | "leads-inquiry"
  | "management"
  | "console"
  | "loading-instruction"
  | "import-packing-list"
  | "import-invoice"
  | "inquiry-confirmation"
  | "calculator-config";

const OPS_TAB_META: Record<
  OpsTabKey,
  { label: string; icon: React.ReactNode }
> = {
  "leads-inquiry": { label: "Lead Inquiry", icon: <ClipboardList className="h-4 w-4 shrink-0" /> },
  management: { label: "Order Management", icon: <Package className="h-4 w-4 shrink-0" /> },
  console: { label: "Console", icon: <Container className="h-4 w-4 shrink-0" /> },
  "loading-instruction": {
    label: "Loading Instruction",
    icon: <FileText className="h-4 w-4 shrink-0" />,
  },
  "import-packing-list": {
    label: "Import Packing List",
    icon: <ClipboardList className="h-4 w-4 shrink-0" />,
  },
  "import-invoice": { label: "Import Invoice", icon: <Receipt className="h-4 w-4 shrink-0" /> },
  "inquiry-confirmation": {
    label: "Inquiry Confirmation",
    icon: <ClipboardCheck className="h-4 w-4 shrink-0" />,
  },
  "calculator-config": {
    label: "Calculator Configuration",
    icon: <Calculator className="h-4 w-4 shrink-0" />,
  },
};

const OPS_SIDEBAR_ORDER = OPERATIONS_MODULE_PERMISSIONS.map((m) => m.key as OpsTabKey);

export function OperationsDashboardShell({
  username,
  permissions: initialPermissions = [],
}: Props) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isClientMounted, setIsClientMounted] = useState(false);
  const [notifications, setNotifications] = useState<LeadChatNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [focusLeadId, setFocusLeadId] = useState<string | null>(null);
  const [focusInquiryId, setFocusInquiryId] = useState<string | null>(null);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  const allowedTabs = useMemo(() => {
    const allowed = new Set(initialPermissions);
    // Legacy operations users with no permissions keep full access.
    if (allowed.size === 0) return OPS_SIDEBAR_ORDER;
    return OPS_SIDEBAR_ORDER.filter((key) => allowed.has(key));
  }, [initialPermissions]);

  const [activeSubTab, setActiveSubTab] = useState<OpsTabKey>(
    () => allowedTabs[0] || "leads-inquiry"
  );

  useEffect(() => {
    if (!allowedTabs.includes(activeSubTab)) {
      setActiveSubTab(allowedTabs[0] || "leads-inquiry");
    }
  }, [allowedTabs, activeSubTab]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setIsClientMounted(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!allowedTabs.includes("leads-inquiry")) return;
    void prefetchOperationsInquiries("").catch(() => {
      // Prefetch is best-effort
    });
  }, [allowedTabs]);

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
    if (allowedTabs.includes("leads-inquiry")) {
      setActiveSubTab("leads-inquiry");
      setFocusLeadId(notification.lead_id);
      setFocusInquiryId(notification.inquiry_id || null);
    }
  }

  return (
    <div className="min-h-screen bg-white">
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
                            <span className="font-semibold">{n.sender_username}</span>{" "}
                            {n.notification_type === "lifecycle"
                              ? n.message || "updated an inquiry status."
                              : `sent you a message regarding Lead #${n.leads?.lead_id_formatted || "N/A"}`}
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
            <p className="text-xs text-secondary-muted">Modules you can access</p>
          </div>
          <div className="grid gap-2">
            {allowedTabs.length === 0 ? (
              <p className="text-xs text-secondary-muted px-1">
                No modules assigned. Contact an administrator.
              </p>
            ) : (
              allowedTabs.map((key) => {
                const meta = OPS_TAB_META[key];
                if (!meta) return null;
                return (
                  <Button
                    key={key}
                    variant={activeSubTab === key ? "default" : "outline"}
                    className="justify-start gap-2"
                    onMouseEnter={
                      key === "leads-inquiry"
                        ? () => {
                            void prefetchOperationsInquiries("").catch(() => undefined);
                          }
                        : undefined
                    }
                    onClick={() => {
                      setActiveSubTab(key);
                      setIsSidebarOpen(false);
                    }}
                  >
                    {meta.icon}
                    <span>{meta.label}</span>
                  </Button>
                );
              })
            )}
          </div>
        </div>
      </aside>

      {isSidebarOpen && (
        <button
          className="fixed inset-0 z-40 bg-black/20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      <main className="pt-20 md:pl-64">
        <section className="px-6 pb-10 md:px-10">
          <ClientErrorBoundary
            resetKey={activeSubTab}
            title="This section is temporarily unavailable"
            description="Something went wrong in this module. Try again or switch to another tab."
            compact
          >
            {allowedTabs.includes("leads-inquiry") && (
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
            )}
            {allowedTabs.includes("management") && activeSubTab === "management" && (
              <OrderManagementPanel />
            )}
            {allowedTabs.includes("console") && activeSubTab === "console" && <ConsolePanel />}
            {allowedTabs.includes("loading-instruction") &&
              activeSubTab === "loading-instruction" && <LoadingInstructionPanel />}
            {allowedTabs.includes("import-packing-list") &&
              activeSubTab === "import-packing-list" && <ImportPackingListPanel />}
            {allowedTabs.includes("import-invoice") && activeSubTab === "import-invoice" && (
              <ImportInvoicePanel />
            )}
            {allowedTabs.includes("inquiry-confirmation") &&
              activeSubTab === "inquiry-confirmation" && <InquiryConfirmationPanel />}
            {allowedTabs.includes("calculator-config") &&
              activeSubTab === "calculator-config" && <AdminCalculatorPanel />}
          </ClientErrorBoundary>
        </section>
      </main>
    </div>
  );
}
