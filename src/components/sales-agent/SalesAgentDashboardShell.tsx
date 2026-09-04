"use client";

import { useState, useMemo, useEffect, useSyncExternalStore } from "react";
import { SignOutForm } from "@/components/auth/SignOutForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LogOut,
  Menu,
  X,
  UserPlus,
  Users,
  FileText,
  ClipboardCheck,
  Calculator,
  ArrowRightLeft,
  Search,
  ChevronDown,
  UsersRound,
} from "lucide-react";
import Image from "next/image";
import { LeadPanel } from "@/components/sales-agent/LeadPanel";
import { PipelinePanel } from "@/components/sales-agent/PipelinePanel";
import { CustomerListPanel } from "@/components/sales-agent/CustomerListPanel";
import { InquiryTrackingPanel } from "@/components/sales-agent/InquiryTrackingPanel";
import { SalesAgentAccountingPanel } from "@/components/sales-agent/SalesAgentAccountingPanel";
import { LeadTransferTrackingPanel } from "@/components/sales-agent/LeadTransferTrackingPanel";
import { OrganizationCustomersPanel } from "@/components/organization/OrganizationCustomersPanel";
import { OrganizationQuotationsPanel } from "@/components/organization/OrganizationQuotationsPanel";
import type { Organization } from "@/app/actions/organizations";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClientErrorBoundary } from "@/components/error/ClientErrorBoundary";
import { AppNotificationBell } from "@/components/notifications/AppNotificationBell";

type Props = {
  username: string;
  permissions: string[];
  organization?: Organization | null;
};

type TabKey =
  | "lead"
  | "pipeline"
  | "customer-list"
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
  | "leaderboard"
  | "customers"
  | "quotations";

const permissionTabs: Record<string, { key: TabKey; label: string; icon: React.ReactNode }> = {
  lead: { key: "lead", label: "Lead", icon: <UserPlus className="h-4 w-4" /> },
  pipeline: { key: "pipeline", label: "Pipeline", icon: <FileText className="h-4 w-4" /> },
  "customer-list": { key: "customer-list", label: "Customer List", icon: <Users className="h-4 w-4" /> },
  "lead-transfer-tracking": {
    key: "lead-transfer-tracking",
    label: "Lead Transfer Tracking",
    icon: <ArrowRightLeft className="h-4 w-4" />,
  },
  accounting: { key: "accounting", label: "Accounting", icon: <Calculator className="h-4 w-4" /> },
  "inquiry-tracking": {
    key: "inquiry-tracking",
    label: "Inquiry Tracking",
    icon: <ClipboardCheck className="h-4 w-4" />,
  },
  customers: { key: "customers", label: "Customers", icon: <UsersRound className="h-4 w-4" /> },
  quotations: { key: "quotations", label: "Quotations", icon: <FileText className="h-4 w-4" /> },
};

/** Sidebar order for Sales Agent Dashboard (must stay in sync with module-permissions SALES list). */
const SALES_SIDEBAR_ORDER: TabKey[] = [
  "lead",
  "pipeline",
  "customer-list",
  "lead-transfer-tracking",
  "accounting",
  "inquiry-tracking",
  "customers",
  "quotations",
];

function useIsHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

export function SalesAgentDashboardShell({
  username,
  permissions: initialPermissions,
  organization,
}: Props) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const mounted = useIsHydrated();
  const [permissions, setPermissions] = useState(initialPermissions);

  const [activeTab, setActiveTab] = useState<TabKey>("lead");

  useEffect(() => {
    setPermissions(initialPermissions);
  }, [initialPermissions]);

  // Refresh permissions in the background without blocking first paint.
  useEffect(() => {
    let cancelled = false;
    void import("@/app/actions/sales_agents").then(({ getSalesAgentByUsername }) =>
      getSalesAgentByUsername(username).then((result) => {
        if (cancelled || !result || !("salesAgent" in result) || !result.salesAgent) return;
        const next = Array.isArray(result.salesAgent.permissions)
          ? result.salesAgent.permissions
          : [];
        setPermissions(next);
      })
    );
    return () => {
      cancelled = true;
    };
  }, [username]);

  const tabs = useMemo(() => {
    const allowed = new Set(permissions);
    // Legacy sales agents with empty permissions get the full simplified Sales menu.
    const keys =
      allowed.size === 0
        ? SALES_SIDEBAR_ORDER
        : SALES_SIDEBAR_ORDER.filter((key) => allowed.has(key));
    return keys
      .map((key) => permissionTabs[key])
      .filter(Boolean) as Array<{ key: TabKey; label: string; icon: React.ReactNode }>;
  }, [permissions]);

  const resolvedActiveTab = useMemo<TabKey>(() => {
    const availableTabKeys = new Set(tabs.map((t) => t.key));
    if (availableTabKeys.has(activeTab)) return activeTab;
    return tabs[0]?.key ?? "lead";
  }, [tabs, activeTab]);

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
        </nav>

        <div className="px-4 pb-5">
          <SignOutForm>
            <Button
              type="submit"
              variant="ghost"
              className="w-full justify-start gap-2 rounded-lg bg-white/5 text-white hover:bg-white/10 hover:text-white border border-white/10"
            >
              <LogOut className="h-4 w-4 text-white" />
              <span className="text-white">Sign Out</span>
            </Button>
          </SignOutForm>
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
                <AppNotificationBell tone="dark" />
              ) : (
                <button
                  className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100/80 text-slate-700"
                  aria-label="Notifications"
                  type="button"
                >
                  <span className="h-4 w-4 rounded-full bg-slate-300" />
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
                  <SignOutForm>
                    <button
                      type="submit"
                      className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 rounded flex items-center gap-2"
                    >
                      <LogOut className="h-4 w-4" /> Sign Out
                    </button>
                  </SignOutForm>
                </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="h-9 w-20 bg-gray-200 rounded-full animate-pulse"></div>
              )}
            </div>
          </header>

          {/* Main content */}
          <main className="flex-1 bg-[#F4F6F9] px-4 md:px-8 py-6 space-y-6 overflow-x-hidden">
            <ClientErrorBoundary
              resetKey={resolvedActiveTab}
              title="This section is temporarily unavailable"
              description="Something went wrong in this module. Try again or switch to another tab."
              compact
            >
            {resolvedActiveTab === "lead" && <LeadPanel />}
            {resolvedActiveTab === "pipeline" && <PipelinePanel />}
            {resolvedActiveTab === "customer-list" && <CustomerListPanel />}
            {resolvedActiveTab === "lead-transfer-tracking" && <LeadTransferTrackingPanel />}
            {resolvedActiveTab === "accounting" && <SalesAgentAccountingPanel />}
            {resolvedActiveTab === "inquiry-tracking" && <InquiryTrackingPanel />}
            {resolvedActiveTab === "customers" && <OrganizationCustomersPanel />}
            {resolvedActiveTab === "quotations" &&
              (organization ? (
                <OrganizationQuotationsPanel organization={organization} />
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
                  Company details are not available. Contact your administrator.
                </div>
              ))}

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
            </ClientErrorBoundary>
          </main>
        </div>
    </div>
  );
}
