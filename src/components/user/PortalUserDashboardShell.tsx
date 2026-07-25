"use client";

import { useEffect, useMemo, useState } from "react";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import {
  LogOut,
  Menu,
  X,
  Bell,
  Package,
  Truck,
  UserPlus,
  Users,
  FileText,
  ClipboardCheck,
  Calculator,
  ArrowRightLeft,
  ClipboardList,
  Container,
  Receipt,
  UsersRound,
} from "lucide-react";
import Image from "next/image";
import { ClientErrorBoundary } from "@/components/error/ClientErrorBoundary";
import { useRouter } from "next/navigation";
import { prefetchOperationsInquiries } from "@/lib/operations-inquiries-cache";
import { PortalOrganizationSwitcher } from "@/components/user/PortalOrganizationSwitcher";
import { usePortalOrganization } from "@/contexts/PortalOrganizationContext";

import { LeadPanel } from "@/components/sales-agent/LeadPanel";
import { PipelinePanel } from "@/components/sales-agent/PipelinePanel";
import { CustomerListPanel } from "@/components/sales-agent/CustomerListPanel";
import { InquiryTrackingPanel } from "@/components/sales-agent/InquiryTrackingPanel";
import { SalesAgentAccountingPanel } from "@/components/sales-agent/SalesAgentAccountingPanel";
import { LeadTransferTrackingPanel } from "@/components/sales-agent/LeadTransferTrackingPanel";
import { OperationsLeadsInquiryPanel } from "@/components/admin/OperationsLeadsInquiryPanel";
import { OrderManagementPanel } from "@/components/admin/OrderManagementPanel";
import { ConsolePanel } from "@/components/admin/ConsolePanel";
import { LoadingInstructionPanel } from "@/components/admin/LoadingInstructionPanel";
import { ImportPackingListPanel } from "@/components/admin/ImportPackingListPanel";
import { ImportInvoicePanel } from "@/components/admin/ImportInvoicePanel";
import { InquiryConfirmationPanel } from "@/components/admin/InquiryConfirmationPanel";
import { AdminCalculatorPanel } from "@/components/admin/AdminCalculatorPanel";
import { OrganizationCustomersPanel } from "@/components/organization/OrganizationCustomersPanel";
import { OrganizationQuotationsPanel } from "@/components/organization/OrganizationQuotationsPanel";
import {
  hasDepartmentAccess,
  hasModulePermission,
  type ModuleDepartment,
} from "@/lib/module-permissions";
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

type SalesTab =
  | "lead"
  | "pipeline"
  | "customer-list"
  | "lead-transfer-tracking"
  | "accounting"
  | "inquiry-tracking"
  | "customers"
  | "quotations";

type OpsTab =
  | "leads-inquiry"
  | "management"
  | "console"
  | "loading-instruction"
  | "import-packing-list"
  | "import-invoice"
  | "inquiry-confirmation"
  | "calculator-config";

const SALES_TABS: Array<{ key: SalesTab; label: string; icon: React.ReactNode }> = [
  { key: "lead", label: "Lead", icon: <UserPlus className="h-4 w-4" /> },
  { key: "pipeline", label: "Pipeline", icon: <FileText className="h-4 w-4" /> },
  { key: "customer-list", label: "Customer List", icon: <Users className="h-4 w-4" /> },
  {
    key: "lead-transfer-tracking",
    label: "Lead Transfer Tracking",
    icon: <ArrowRightLeft className="h-4 w-4" />,
  },
  { key: "accounting", label: "Accounting", icon: <Calculator className="h-4 w-4" /> },
  {
    key: "inquiry-tracking",
    label: "Inquiry Tracking",
    icon: <ClipboardCheck className="h-4 w-4" />,
  },
  { key: "customers", label: "Customers", icon: <UsersRound className="h-4 w-4" /> },
  { key: "quotations", label: "Quotations", icon: <FileText className="h-4 w-4" /> },
];

const OPS_TABS: Array<{ key: OpsTab; label: string; icon: React.ReactNode }> = [
  { key: "leads-inquiry", label: "Lead Inquiry", icon: <ClipboardList className="h-4 w-4" /> },
  { key: "management", label: "Order Management", icon: <Package className="h-4 w-4" /> },
  { key: "console", label: "Console", icon: <Container className="h-4 w-4" /> },
  {
    key: "loading-instruction",
    label: "Loading Instruction",
    icon: <FileText className="h-4 w-4" />,
  },
  {
    key: "import-packing-list",
    label: "Import Packing List",
    icon: <ClipboardList className="h-4 w-4" />,
  },
  { key: "import-invoice", label: "Import Invoice", icon: <Receipt className="h-4 w-4" /> },
  {
    key: "inquiry-confirmation",
    label: "Inquiry Confirmation",
    icon: <ClipboardCheck className="h-4 w-4" />,
  },
  {
    key: "calculator-config",
    label: "Calculator Configuration",
    icon: <Calculator className="h-4 w-4" />,
  },
];

export function PortalUserDashboardShell({
  username,
  permissions,
}: Props) {
  const router = useRouter();
  const { organization, switchVersion, organizationId } = usePortalOrganization();
  const canSales = hasDepartmentAccess(permissions, "sales");
  const canOps = hasDepartmentAccess(permissions, "operations");

  const departments = useMemo(() => {
    const list: ModuleDepartment[] = [];
    if (canSales) list.push("sales");
    if (canOps) list.push("operations");
    return list;
  }, [canSales, canOps]);

  const [activeDepartment, setActiveDepartment] = useState<ModuleDepartment | null>(
    () => departments[0] || null
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [salesTab, setSalesTab] = useState<SalesTab>("lead");
  const [opsTab, setOpsTab] = useState<OpsTab>("leads-inquiry");
  const [notifications, setNotifications] = useState<LeadChatNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [focusLeadId, setFocusLeadId] = useState<string | null>(null);
  const [focusInquiryId, setFocusInquiryId] = useState<string | null>(null);

  const visibleSalesTabs = useMemo(
    () => SALES_TABS.filter((t) => hasModulePermission(permissions, t.key)),
    [permissions]
  );

  const visibleOpsTabs = useMemo(
    () => OPS_TABS.filter((t) => hasModulePermission(permissions, t.key)),
    [permissions]
  );

  useEffect(() => {
    if (!activeDepartment || !departments.includes(activeDepartment)) {
      setActiveDepartment(departments[0] || null);
    }
  }, [departments, activeDepartment]);

  useEffect(() => {
    if (!visibleSalesTabs.some((t) => t.key === salesTab)) {
      setSalesTab(visibleSalesTabs[0]?.key || "lead");
    }
  }, [visibleSalesTabs, salesTab]);

  useEffect(() => {
    if (!visibleOpsTabs.some((t) => t.key === opsTab)) {
      setOpsTab(visibleOpsTabs[0]?.key || "leads-inquiry");
    }
  }, [visibleOpsTabs, opsTab]);

  useEffect(() => {
    if (canOps) {
      void prefetchOperationsInquiries("", organizationId).catch(() => {
        // Prefetch is best-effort
      });
    }
  }, [canOps, switchVersion, organizationId]);

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
    const timer = setInterval(fetchNotifications, 8000);
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
    if (canSales) {
      const inquiryQuery = notification.inquiry_id ? `&inquiryId=${notification.inquiry_id}` : "";
      router.push(`/sales-agent/leads/${notification.lead_id}?tab=view${inquiryQuery}`);
      return;
    }
    if (canOps) {
      setActiveDepartment("operations");
      setOpsTab("leads-inquiry");
      setFocusLeadId(notification.lead_id);
      setFocusInquiryId(notification.inquiry_id || null);
    }
  }

  const initials = useMemo(() => {
    const cleaned = (username || "").trim();
    if (!cleaned) return "U";
    const parts = cleaned.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return cleaned.slice(0, 2).toUpperCase();
  }, [username]);

  function renderSalesContent() {
    if (!hasModulePermission(permissions, salesTab)) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
          You do not have access to this Sales module.
        </div>
      );
    }
    switch (salesTab) {
      case "lead":
        return <LeadPanel />;
      case "pipeline":
        return <PipelinePanel />;
      case "customer-list":
        return <CustomerListPanel />;
      case "lead-transfer-tracking":
        return <LeadTransferTrackingPanel />;
      case "accounting":
        return <SalesAgentAccountingPanel />;
      case "inquiry-tracking":
        return <InquiryTrackingPanel />;
      case "customers":
        return <OrganizationCustomersPanel />;
      case "quotations":
        if (!organization) {
          return (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
              Company details are not available. Contact your administrator.
            </div>
          );
        }
        return <OrganizationQuotationsPanel organization={organization} />;
      default:
        return null;
    }
  }

  function renderOpsContent() {
    if (!hasModulePermission(permissions, opsTab)) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
          You do not have access to this Operations module.
        </div>
      );
    }
    switch (opsTab) {
      case "leads-inquiry":
        return (
          <OperationsLeadsInquiryPanel
            focusLeadId={focusLeadId}
            focusInquiryId={focusInquiryId}
            onFocusHandled={() => {
              setFocusLeadId(null);
              setFocusInquiryId(null);
            }}
          />
        );
      case "management":
        return <OrderManagementPanel />;
      case "console":
        return <ConsolePanel />;
      case "loading-instruction":
        return <LoadingInstructionPanel />;
      case "import-packing-list":
        return <ImportPackingListPanel />;
      case "import-invoice":
        return <ImportInvoicePanel />;
      case "inquiry-confirmation":
        return <InquiryConfirmationPanel />;
      case "calculator-config":
        return <AdminCalculatorPanel />;
      default:
        return null;
    }
  }

  return (
    <div className="min-h-screen bg-[#0B1E2D]">
      <div className="h-8 bg-[#0B1E2D] flex items-center px-6 md:px-10">
        <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400/80">Workspace</span>
      </div>

      <div className="flex min-h-[calc(100vh-2rem)]">
        <aside
          className={`${
            isSidebarOpen ? "w-64" : "w-0"
          } shrink-0 overflow-hidden transition-all duration-200 bg-[#0F2740] border-r border-white/5`}
        >
          <div className="flex h-full w-64 flex-col">
            <div className="flex items-center gap-3 px-5 py-5 border-b border-white/5">
              <Image src="/logo.jpg" alt="Logistix" width={150} height={44} className="h-9 w-auto" />
              <div>
                <p className="text-sm font-semibold text-white tracking-wide">Logistix</p>
                <p className="text-[11px] text-slate-400">User Portal</p>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
              {departments.length === 0 && (
                <p className="px-3 py-2 text-xs text-slate-400">
                  No modules assigned. Contact your administrator.
                </p>
              )}

              {canSales && (
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setActiveDepartment("sales")}
                    className={`w-full flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                      activeDepartment === "sales"
                        ? "bg-sky-500/20 text-sky-100"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Package className="h-4 w-4" />
                    Sales
                  </button>
                  {activeDepartment === "sales" &&
                    visibleSalesTabs.map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setSalesTab(tab.key)}
                        className={`w-full flex items-center gap-2.5 rounded-md pl-8 pr-3 py-2 text-sm transition-colors ${
                          salesTab === tab.key
                            ? "bg-white/10 text-white"
                            : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                        }`}
                      >
                        {tab.icon}
                        {tab.label}
                      </button>
                    ))}
                </div>
              )}

              {canOps && (
                <div className="space-y-1 pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveDepartment("operations")}
                    className={`w-full flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                      activeDepartment === "operations"
                        ? "bg-sky-500/20 text-sky-100"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Truck className="h-4 w-4" />
                    Operations
                  </button>
                  {activeDepartment === "operations" &&
                    visibleOpsTabs.map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setOpsTab(tab.key)}
                        className={`w-full flex items-center gap-2.5 rounded-md pl-8 pr-3 py-2 text-sm transition-colors ${
                          opsTab === tab.key
                            ? "bg-white/10 text-white"
                            : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                        }`}
                      >
                        {tab.icon}
                        {tab.label}
                      </button>
                    ))}
                </div>
              )}
            </nav>

            <div className="border-t border-white/5 p-3">
              <form action={logout}>
                <Button
                  type="submit"
                  variant="ghost"
                  className="w-full justify-start gap-2 text-slate-300 hover:text-white hover:bg-white/5"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </form>
            </div>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
          <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200/80 flex items-center gap-3 px-4 md:px-8">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => setIsSidebarOpen((o) => !o)}
              aria-label="Toggle sidebar"
            >
              {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>

            <PortalOrganizationSwitcher />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="relative">
                  <Bell className="h-5 w-5 text-slate-600" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notificationsError && (
                  <DropdownMenuItem disabled className="text-rose-600 text-xs">
                    {notificationsError}
                  </DropdownMenuItem>
                )}
                {!notificationsError && notifications.length === 0 && (
                  <DropdownMenuItem disabled className="text-slate-500 text-xs">
                    No notifications
                  </DropdownMenuItem>
                )}
                {notifications.slice(0, 8).map((n) => (
                  <DropdownMenuItem
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className="flex flex-col items-start gap-0.5 whitespace-normal"
                  >
                    <span className="text-sm font-medium">
                      {n.leads?.lead_id_formatted || n.event_type || "Update"}
                    </span>
                    <span className="text-xs text-slate-500 line-clamp-2">
                      {n.message || "New notification"}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="h-9 w-9 rounded-full bg-[#0B1E2D] text-white text-xs font-semibold flex items-center justify-center">
                {initials}
              </div>
              <div className="hidden sm:block min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate max-w-[140px]">
                  {username}
                </p>
                <p className="text-[11px] text-slate-500">User</p>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-4 md:p-6" key={switchVersion}>
            <ClientErrorBoundary>
              {departments.length === 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
                  You do not have any modules assigned. Ask an administrator to grant Sales and/or
                  Operations access.
                </div>
              )}
              {activeDepartment === "sales" && renderSalesContent()}
              {activeDepartment === "operations" && renderOpsContent()}
            </ClientErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  );
}
