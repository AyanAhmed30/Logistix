"use client";

import { useState, useMemo, useEffect, useSyncExternalStore } from "react";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LogOut,
  Menu,
  X,
  UserPlus,
  Users,
  FileText,
  ShoppingCart,
  Truck,
  Bell,
  Package,
  Container,
  Settings,
  ClipboardList,
  Receipt,
  PlusCircle,
  UsersRound,
  ClipboardCheck,
  Calculator,
  ArrowRightLeft,
  Search,
  ChevronDown,
  LayoutDashboard,
  Trophy,
} from "lucide-react";
import Image from "next/image";
import { LeadPanel } from "@/components/sales-agent/LeadPanel";
import { PipelinePanel } from "@/components/sales-agent/PipelinePanel";
import { CustomerListPanel } from "@/components/sales-agent/CustomerListPanel";
import { InquiryTrackingPanel } from "@/components/sales-agent/InquiryTrackingPanel";
import { OrderTrackingPanel } from "@/components/admin/OrderTrackingPanel";
import { AdminNotificationsPanel } from "@/components/admin/AdminNotificationsPanel";
import { OrderManagementPanel } from "@/components/admin/OrderManagementPanel";
import { ConsolePanel } from "@/components/admin/ConsolePanel";
import { LoadingInstructionPanel } from "@/components/admin/LoadingInstructionPanel";
import { OperationsPanel } from "@/components/admin/OperationsPanel";
import { ImportPackingListPanel } from "@/components/admin/ImportPackingListPanel";
import { ImportInvoicePanel } from "@/components/admin/ImportInvoicePanel";
import { SalesAgentAccountingPanel } from "@/components/sales-agent/SalesAgentAccountingPanel";
import { LeadTransferTrackingPanel } from "@/components/sales-agent/LeadTransferTrackingPanel";
import { SalesAgentDashboardOverview } from "@/components/sales-agent/SalesAgentDashboardOverview";
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
import { useRouter } from "next/navigation";

type Props = {
  username: string;
  permissions: string[];
};

type TabKey =
  | "lead"
  | "pipeline"
  | "customer-list"
  | "manage-request"
  | "create"
  | "profiles"
  | "dashboard"
  | "tracking"
  | "notifications"
  | "management"
  | "console"
  | "loading-instruction"
  | "operations"
  | "import-packing-list"
  | "import-invoice"
  | "inquiry-tracking"
  | "accounting"
  | "lead-transfer-tracking"
  | "leaderboard";

const permissionTabs: Record<string, { key: TabKey; label: string; icon: React.ReactNode }> = {
  lead: { key: "lead", label: "Lead", icon: <UserPlus className="h-4 w-4" /> },
  pipeline: { key: "pipeline", label: "Pipeline", icon: <FileText className="h-4 w-4" /> },
  "customer-list": { key: "customer-list", label: "Customer List", icon: <Users className="h-4 w-4" /> },
  "manage-request": { key: "manage-request", label: "Manage Request", icon: <ShoppingCart className="h-4 w-4" /> },
  create: { key: "create", label: "Create New User", icon: <PlusCircle className="h-4 w-4" /> },
  profiles: { key: "profiles", label: "User Profiles", icon: <UsersRound className="h-4 w-4" /> },
  dashboard: { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  tracking: { key: "tracking", label: "Order Tracking", icon: <Truck className="h-4 w-4" /> },
  notifications: { key: "notifications", label: "Notifications", icon: <Bell className="h-4 w-4" /> },
  management: { key: "management", label: "Order Management", icon: <Package className="h-4 w-4" /> },
  console: { key: "console", label: "Console", icon: <Container className="h-4 w-4" /> },
  "loading-instruction": {
    key: "loading-instruction",
    label: "Loading Instruction",
    icon: <FileText className="h-4 w-4" />,
  },
  operations: { key: "operations", label: "Operations", icon: <Settings className="h-4 w-4" /> },
  "import-packing-list": {
    key: "import-packing-list",
    label: "Import Packing List",
    icon: <ClipboardList className="h-4 w-4" />,
  },
  "import-invoice": { key: "import-invoice", label: "Import Invoice", icon: <Receipt className="h-4 w-4" /> },
  "inquiry-tracking": {
    key: "inquiry-tracking",
    label: "Inquiry Tracking",
    icon: <ClipboardCheck className="h-4 w-4" />,
  },
};

const DEFAULT_TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { key: "lead-transfer-tracking", label: "Lead Transfer Tracking", icon: <ArrowRightLeft className="h-4 w-4" /> },
  { key: "accounting", label: "Accounting", icon: <Calculator className="h-4 w-4" /> },
  { key: "inquiry-tracking", label: "Inquiry Tracking", icon: <ClipboardCheck className="h-4 w-4" /> },
];

const DASHBOARD_TAB = DEFAULT_TABS.find((tab) => tab.key === "dashboard");
const NON_DASHBOARD_DEFAULT_TABS = DEFAULT_TABS.filter((tab) => tab.key !== "dashboard");

function useIsHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

export function SalesAgentDashboardShell({ username, permissions }: Props) {
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const mounted = useIsHydrated();
  const [notifications, setNotifications] = useState<LeadChatNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");

  const tabs = useMemo(() => {
    const defaultKeys = DEFAULT_TABS.map((t) => t.key);
    const permissionTabsList = permissions
      .filter((perm) => !defaultKeys.includes(perm as TabKey))
      .map((perm) => permissionTabs[perm])
      .filter((tab): tab is { key: TabKey; label: string; icon: React.ReactNode } => tab !== undefined);

    return [...(DASHBOARD_TAB ? [DASHBOARD_TAB] : []), ...permissionTabsList, ...NON_DASHBOARD_DEFAULT_TABS];
  }, [permissions]);

  const resolvedActiveTab = useMemo<TabKey>(() => {
    const availableTabKeys = new Set(tabs.map((t) => t.key));
    if (availableTabKeys.has(activeTab)) return activeTab;
    if (availableTabKeys.has("dashboard")) return "dashboard";
    return tabs[0]?.key ?? "dashboard";
  }, [tabs, activeTab]);

  useEffect(() => {
    async function fetchNotifications() {
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
    }
    fetchNotifications();
    const timer = setInterval(fetchNotifications, 5000);
    return () => clearInterval(timer);
  }, []);

  async function handleNotificationClick(notification: LeadChatNotification) {
    if (!notification.is_read) {
      await markLeadChatNotificationRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    router.push(`/sales-agent/leads/${notification.lead_id}`);
  }

  const initials = useMemo(() => {
    const cleaned = (username || "").trim();
    if (!cleaned) return "U";
    const parts = cleaned.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return cleaned.slice(0, 2).toUpperCase();
  }, [username]);

  return (
    <div className="min-h-screen bg-[#0B1E2D]">
      {/* Thin top breadcrumb strip */}
      <div className="h-8 bg-[#0B1E2D] flex items-center px-6 md:px-10">
        <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400/80">Dashboard</span>
      </div>

      {/* Sidebar (fixed, slides in/out on every breakpoint) */}
      <aside
        className={`fixed left-0 top-8 bottom-0 z-40 w-72 bg-[#0F2E3F] transform transition-transform duration-200 flex flex-col ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo block */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-white p-1.5 shadow-sm">
              <Image src="/logo.jpg" alt="Logistix" width={150} height={44} className="h-9 w-auto" />
            </div>
          </div>
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white hover:bg-white/10"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <X className="h-4 w-4 text-white" />
          </button>
        </div>
        <div className="px-5 pb-3 -mt-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#7FB0BD]">
            Sales Agent Portal
          </p>
        </div>

        <div className="px-5 pt-4">
          <h2 className="text-base font-semibold text-white">Sales Agent Tools</h2>
          <p className="text-xs text-slate-400 mt-0.5">Manage your sales activities</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pt-4 pb-6 space-y-1">
          {tabs.map((tab) => {
            const active = resolvedActiveTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                }}
                className={`group w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? "bg-[#2DA79F] shadow-[0_8px_24px_-10px_rgba(45,167,159,0.8)]"
                    : "hover:bg-white/5"
                }`}
              >
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${
                    active
                      ? "bg-white/15 text-white [&_svg]:text-white"
                      : "bg-white/5 text-slate-300 [&_svg]:text-slate-300 group-hover:text-white group-hover:[&_svg]:text-white"
                  }`}
                >
                  {tab.icon}
                </span>
                <span
                  className={`truncate ${
                    active ? "text-white" : "text-slate-200 group-hover:text-white"
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
          {/* Leaderboard placeholder (visual parity with image) */}
          <button
            onClick={() => setActiveTab("dashboard")}
            className="group w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-white/5 transition-all"
            type="button"
            title="Leaderboard"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/5 text-slate-300 [&_svg]:text-slate-300 group-hover:text-white group-hover:[&_svg]:text-white">
              <Trophy className="h-4 w-4 text-slate-300" />
            </span>
            <span className="truncate text-slate-200 group-hover:text-white">Leaderboard</span>
          </button>
        </nav>

        <div className="px-4 pb-5">
          <form action={logout}>
            <Button
              type="submit"
              variant="ghost"
              className="w-full justify-start gap-2 rounded-lg bg-white/5 text-white hover:bg-white/10 hover:text-white border border-white/10"
            >
              <LogOut className="h-4 w-4 text-white" />
              <span className="text-white">Sign Out</span>
            </Button>
          </form>
        </div>
      </aside>

      {isSidebarOpen && (
        <button
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      {/* Right side: shifts with sidebar on desktop, overlays on mobile */}
      <div
        className={`flex flex-col min-h-[calc(100vh-2rem)] transition-[margin] duration-200 ${
          isSidebarOpen ? "md:ml-72" : "ml-0"
        }`}
      >
          {/* Top header with search, notifications, profile */}
          <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200/80 flex items-center gap-3 px-4 md:px-8">
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              onClick={() => setIsSidebarOpen((v) => !v)}
              aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="relative flex-1 max-w-2xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search here..."
                className="w-full h-10 pl-9 pr-3 rounded-lg bg-slate-100/80 border border-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-slate-200 focus:ring-2 focus:ring-[#2DA79F]/20"
              />
            </div>

            <div className="flex items-center gap-3">
              {mounted ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild suppressHydrationWarning>
                    <button
                      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100/80 hover:bg-slate-200/80 text-slate-700"
                      aria-label="Notifications"
                    >
                      <Bell className="h-4 w-4" />
                      {unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center">
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                      )}
                    </button>
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
                          className={`items-start whitespace-normal cursor-pointer ${
                            !n.is_read ? "bg-blue-50" : ""
                          }`}
                          onClick={() => handleNotificationClick(n)}
                        >
                          <div className="text-sm leading-snug">
                            <div>
                              {n.notification_type === "lifecycle" ? (
                                <>
                                  <span className="font-semibold">{n.sender_username}</span>{" "}
                                  (
                                  {n.sender_role === "sales_agent"
                                    ? "Sales Agent"
                                    : n.sender_role === "operations"
                                      ? "Operations"
                                      : "Admin"}
                                  ) {n.message || "updated an inquiry status."}
                                </>
                              ) : (
                                <>
                                  <span className="font-semibold">{n.sender_username}</span>{" "}
                                  (
                                  {n.sender_role === "sales_agent"
                                    ? "Sales Agent"
                                    : n.sender_role === "operations"
                                      ? "Operations"
                                      : "Admin"}
                                  ) sent you a message regarding Lead #
                                  {n.leads?.lead_id_formatted || "N/A"}
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
                <button
                  className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100/80 text-slate-700"
                  aria-label="Notifications"
                  type="button"
                >
                  <Bell className="h-4 w-4" />
                </button>
              )}

              {mounted ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild suppressHydrationWarning>
                  <button className="inline-flex items-center gap-2 rounded-full pl-0.5 pr-2 py-0.5 bg-slate-100/60 hover:bg-slate-200/70">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#2DA79F] to-[#1d6e7a] text-white text-xs font-semibold">
                      {initials}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 z-[90]">
                  <DropdownMenuLabel>
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">
                      Signed in as
                    </div>
                    <div className="text-sm font-semibold text-slate-800">{username}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <form action={logout}>
                    <button
                      type="submit"
                      className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 rounded flex items-center gap-2"
                    >
                      <LogOut className="h-4 w-4" /> Sign Out
                    </button>
                  </form>
                </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="h-9 w-20 bg-gray-200 rounded-full animate-pulse"></div>
              )}
            </div>
          </header>

          {/* Main content */}
          <main className="flex-1 bg-[#F4F6F9] px-4 md:px-8 py-6 space-y-6 overflow-x-hidden">
            {resolvedActiveTab === "lead" && <LeadPanel />}
            {resolvedActiveTab === "pipeline" && <PipelinePanel />}
            {resolvedActiveTab === "customer-list" && <CustomerListPanel />}
            {resolvedActiveTab === "manage-request" && (
              <Card className="bg-white border shadow-sm">
                <CardHeader>
                  <CardTitle>Manage Request</CardTitle>
                  <CardDescription>This section is empty for now.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="py-16 text-center text-secondary-muted">
                    Manage Request functionality coming soon...
                  </div>
                </CardContent>
              </Card>
            )}
            {resolvedActiveTab === "dashboard" && <SalesAgentDashboardOverview />}
            {resolvedActiveTab === "tracking" && <OrderTrackingPanel />}
            {resolvedActiveTab === "notifications" && <AdminNotificationsPanel />}
            {resolvedActiveTab === "management" && <OrderManagementPanel />}
            {resolvedActiveTab === "console" && <ConsolePanel />}
            {resolvedActiveTab === "loading-instruction" && <LoadingInstructionPanel />}
            {resolvedActiveTab === "operations" && <OperationsPanel />}
            {resolvedActiveTab === "import-packing-list" && <ImportPackingListPanel />}
            {resolvedActiveTab === "import-invoice" && <ImportInvoicePanel />}
            {resolvedActiveTab === "accounting" && <SalesAgentAccountingPanel />}
            {resolvedActiveTab === "inquiry-tracking" && <InquiryTrackingPanel />}
            {resolvedActiveTab === "lead-transfer-tracking" && <LeadTransferTrackingPanel />}
            {resolvedActiveTab === "create" && (
              <Card className="bg-white border shadow-sm">
                <CardHeader>
                  <CardTitle>Create New User</CardTitle>
                  <CardDescription>
                    Create new user accounts. This feature requires administrator privileges.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="py-16 text-center text-secondary-muted">
                    User creation functionality is only available to administrators.
                  </div>
                </CardContent>
              </Card>
            )}
            {resolvedActiveTab === "profiles" && (
              <Card className="bg-white border shadow-sm">
                <CardHeader>
                  <CardTitle>User Profiles</CardTitle>
                  <CardDescription>
                    View and manage user profiles. This feature requires administrator privileges.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="py-16 text-center text-secondary-muted">
                    User profile management is only available to administrators.
                  </div>
                </CardContent>
              </Card>
            )}

            {tabs.length === 0 && (
              <Card className="bg-white border shadow-sm">
                <CardHeader>
                  <CardTitle>No Access</CardTitle>
                  <CardDescription>
                    You don&apos;t have access to any modules. Please contact your administrator.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="py-16 text-center text-secondary-muted">
                    No modules assigned. Contact administrator for access.
                  </div>
                </CardContent>
              </Card>
            )}
          </main>
        </div>
    </div>
  );
}
