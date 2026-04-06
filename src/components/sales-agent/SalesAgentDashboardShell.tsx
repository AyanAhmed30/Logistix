"use client";

import { useState, useMemo, useEffect, useSyncExternalStore } from "react";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, Menu, X, UserPlus, Users, FileText, ShoppingCart, TrendingUp, Truck, Bell, Package, Container, Settings, ClipboardList, Receipt, PlusCircle, UsersRound, ClipboardCheck, Calculator, ArrowRightLeft } from "lucide-react";
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

type Props = {
  username: string;
  permissions: string[];
};

type TabKey = "lead" | "pipeline" | "customer-list" | "manage-request" | "create" | "profiles" | "dashboard" | "tracking" | "notifications" | "management" | "console" | "loading-instruction" | "operations" | "import-packing-list" | "import-invoice" | "inquiry-tracking" | "accounting" | "lead-transfer-tracking";

// All tabs are now permission-based - no default tabs
const permissionTabs: Record<string, { key: TabKey; label: string; icon: React.ReactNode }> = {
  "lead": { key: "lead", label: "Lead", icon: <UserPlus className="h-4 w-4" /> },
  "pipeline": { key: "pipeline", label: "Pipeline", icon: <FileText className="h-4 w-4" /> },
  "customer-list": { key: "customer-list", label: "Customer List", icon: <Users className="h-4 w-4" /> },
  "manage-request": { key: "manage-request", label: "Manage Request", icon: <ShoppingCart className="h-4 w-4" /> },
  "create": { key: "create", label: "Create New User", icon: <PlusCircle className="h-4 w-4" /> },
  "profiles": { key: "profiles", label: "User Profiles", icon: <UsersRound className="h-4 w-4" /> },
  "dashboard": { key: "dashboard", label: "Dashboard", icon: <TrendingUp className="h-4 w-4" /> },
  "tracking": { key: "tracking", label: "Order Tracking", icon: <Truck className="h-4 w-4" /> },
  "notifications": { key: "notifications", label: "Notifications", icon: <Bell className="h-4 w-4" /> },
  "management": { key: "management", label: "Order Management", icon: <Package className="h-4 w-4" /> },
  "console": { key: "console", label: "Console", icon: <Container className="h-4 w-4" /> },
  "loading-instruction": { key: "loading-instruction", label: "Loading Instruction", icon: <FileText className="h-4 w-4" /> },
  "operations": { key: "operations", label: "Operations", icon: <Settings className="h-4 w-4" /> },
  "import-packing-list": { key: "import-packing-list", label: "Import Packing List", icon: <ClipboardList className="h-4 w-4" /> },
  "import-invoice": { key: "import-invoice", label: "Import Invoice", icon: <Receipt className="h-4 w-4" /> },
  "inquiry-tracking": { key: "inquiry-tracking", label: "Inquiry Tracking", icon: <ClipboardCheck className="h-4 w-4" /> },
};

// These tabs are always available to all sales agents (not permission-gated)
const DEFAULT_TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  {
    key: "lead-transfer-tracking",
    label: "Lead Transfer Tracking",
    icon: <ArrowRightLeft className="h-4 w-4" />,
  },
  {
    key: "accounting",
    label: "Accounting",
    icon: <Calculator className="h-4 w-4" />,
  },
  {
    key: "inquiry-tracking",
    label: "Inquiry Tracking",
    icon: <ClipboardCheck className="h-4 w-4" />,
  },
];

function useIsHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

export function SalesAgentDashboardShell({ username, permissions }: Props) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const mounted = useIsHydrated();
  const [notifications, setNotifications] = useState<LeadChatNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [focusLeadId, setFocusLeadId] = useState<string | null>(null);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  
  // Default landing is always dashboard for sales agents.
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");

  // Build tabs list: permission-based tabs + always-on default tabs
  const tabs = useMemo(() => {
    const defaultKeys = DEFAULT_TABS.map((t) => t.key);
    const permissionTabsList = permissions
      .filter((perm) => !defaultKeys.includes(perm as TabKey)) // Don't duplicate default tabs
      .map((perm) => permissionTabs[perm])
      .filter((tab): tab is { key: TabKey; label: string; icon: React.ReactNode } => tab !== undefined);
    
    // Always add default tabs at the end
    return [...permissionTabsList, ...DEFAULT_TABS];
  }, [permissions]);

  const resolvedActiveTab = useMemo<TabKey>(() => {
    const availableTabKeys = new Set(tabs.map((t) => t.key));
    if (availableTabKeys.has(activeTab)) {
      return activeTab;
    }
    if (availableTabKeys.has("dashboard")) {
      return "dashboard";
    }
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
    setActiveTab("pipeline");
    setFocusLeadId(notification.lead_id);
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="fixed top-0 inset-x-0 h-16 bg-white border-b z-50">
        <div className="h-full px-6 md:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-md border border-slate-200 text-primary-dark hover:bg-slate-50"
              onClick={() => setIsSidebarOpen((open) => !open)}
              aria-label="Toggle sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="bg-white p-1 rounded-md">
              <Image src="/logo.jpg" alt="Logo" width={130} height={40} className="h-9 w-auto" />
            </div>
            <span className="hidden md:block font-semibold text-sm uppercase tracking-widest text-secondary-muted">
              Sales Agent Portal
            </span>
          </div>

          <div className="flex items-center gap-4 md:gap-6">
            {mounted ? (
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
            <div className="hidden md:flex flex-col items-end mr-2">
              <span className="text-xs font-bold text-secondary-muted uppercase tracking-tighter">Signed In</span>
              <span className="text-sm font-black text-primary-dark">{username}</span>
            </div>
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
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-white border-r shadow-lg p-5 space-y-4 transform transition-transform duration-200 md:translate-x-0 md:top-16 md:h-[calc(100vh-4rem)] md:shadow-none ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
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
          <h2 className="text-lg font-black text-primary-dark">Sales Agent Tools</h2>
          <p className="text-xs text-secondary-muted">Manage your sales activities</p>
        </div>
        <div className="grid gap-2">
          {tabs.map((tab) => (
            <Button
              key={tab.key}
              variant={resolvedActiveTab === tab.key ? "default" : "outline"}
              className="justify-start gap-2"
              onClick={() => {
                setActiveTab(tab.key);
                setIsSidebarOpen(false);
              }}
            >
              {tab.icon}
              {tab.label}
            </Button>
          ))}
        </div>
      </aside>

      {isSidebarOpen && (
        <button
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      <main className="pt-20 md:pl-72 px-6 md:px-10 pb-10 space-y-6">
        {/* All tabs are permission-based */}
        {resolvedActiveTab === "lead" && <LeadPanel />}
        {resolvedActiveTab === "pipeline" && (
          <PipelinePanel
            focusLeadId={focusLeadId}
            onFocusHandled={() => setFocusLeadId(null)}
          />
        )}
        {resolvedActiveTab === "customer-list" && <CustomerListPanel />}
        {resolvedActiveTab === "manage-request" && (
          <Card className="bg-white border shadow-sm">
            <CardHeader>
              <CardTitle>Manage Request</CardTitle>
              <CardDescription>
                This section is empty for now.
              </CardDescription>
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
        
        {/* Show message if no permissions assigned */}
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
  );
}
