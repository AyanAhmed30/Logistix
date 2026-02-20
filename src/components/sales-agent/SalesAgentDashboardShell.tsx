"use client";

import { useState, useMemo, useEffect } from "react";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, Menu, X, UserPlus, Users, FileText, ShoppingCart, TrendingUp, Truck, Bell, Package, Container, Settings, ClipboardList, Receipt } from "lucide-react";
import Image from "next/image";
import { LeadPanel } from "@/components/sales-agent/LeadPanel";
import { PipelinePanel } from "@/components/sales-agent/PipelinePanel";
import { CustomerListPanel } from "@/components/sales-agent/CustomerListPanel";
import { OrderTrackingPanel } from "@/components/admin/OrderTrackingPanel";
import { AdminNotificationsPanel } from "@/components/admin/AdminNotificationsPanel";
import { OrderManagementPanel } from "@/components/admin/OrderManagementPanel";
import { ConsolePanel } from "@/components/admin/ConsolePanel";
import { LoadingInstructionPanel } from "@/components/admin/LoadingInstructionPanel";
import { OperationsPanel } from "@/components/admin/OperationsPanel";
import { ImportPackingListPanel } from "@/components/admin/ImportPackingListPanel";
import { ImportInvoicePanel } from "@/components/admin/ImportInvoicePanel";
import { AdminDashboardOverview } from "@/components/admin/AdminDashboardOverview";

type Props = {
  username: string;
  permissions: string[];
};

type TabKey = "lead" | "pipeline" | "customer-list" | "manage-request" | "dashboard" | "tracking" | "notifications" | "management" | "console" | "loading-instruction" | "operations" | "import-packing-list" | "import-invoice";

// All tabs are now permission-based - no default tabs
const permissionTabs: Record<string, { key: TabKey; label: string; icon: React.ReactNode }> = {
  "lead": { key: "lead", label: "Lead", icon: <UserPlus className="h-4 w-4" /> },
  "pipeline": { key: "pipeline", label: "Pipeline", icon: <FileText className="h-4 w-4" /> },
  "customer-list": { key: "customer-list", label: "Customer List", icon: <Users className="h-4 w-4" /> },
  "manage-request": { key: "manage-request", label: "Manage Request", icon: <ShoppingCart className="h-4 w-4" /> },
  "dashboard": { key: "dashboard", label: "Dashboard", icon: <TrendingUp className="h-4 w-4" /> },
  "tracking": { key: "tracking", label: "Order Tracking", icon: <Truck className="h-4 w-4" /> },
  "notifications": { key: "notifications", label: "Notifications", icon: <Bell className="h-4 w-4" /> },
  "management": { key: "management", label: "Order Management", icon: <Package className="h-4 w-4" /> },
  "console": { key: "console", label: "Console", icon: <Container className="h-4 w-4" /> },
  "loading-instruction": { key: "loading-instruction", label: "Loading Instruction", icon: <FileText className="h-4 w-4" /> },
  "operations": { key: "operations", label: "Operations", icon: <Settings className="h-4 w-4" /> },
  "import-packing-list": { key: "import-packing-list", label: "Import Packing List", icon: <ClipboardList className="h-4 w-4" /> },
  "import-invoice": { key: "import-invoice", label: "Import Invoice", icon: <Receipt className="h-4 w-4" /> },
};

export function SalesAgentDashboardShell({ username, permissions }: Props) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Set initial tab to first available permission, or empty string if none
  const initialTab = permissions.length > 0 ? (permissionTabs[permissions[0]]?.key || "") : "";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab as TabKey);

  // Build tabs list: only permission-based tabs (no default tabs)
  const tabs = useMemo(() => {
    const permissionTabsList = permissions
      .map((perm) => permissionTabs[perm])
      .filter((tab): tab is { key: TabKey; label: string; icon: React.ReactNode } => tab !== undefined);
    
    return permissionTabsList;
  }, [permissions]);

  // Update active tab when permissions change (if current tab is no longer available)
  useEffect(() => {
    if (permissions.length > 0 && !permissions.includes(activeTab as string)) {
      const firstAvailable = permissionTabs[permissions[0]]?.key;
      if (firstAvailable) {
        setActiveTab(firstAvailable);
      }
    } else if (permissions.length === 0 && activeTab) {
      setActiveTab("" as TabKey);
    }
  }, [permissions, activeTab]);

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
              variant={activeTab === tab.key ? "default" : "outline"}
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
        {activeTab === "lead" && <LeadPanel />}
        {activeTab === "pipeline" && <PipelinePanel />}
        {activeTab === "customer-list" && <CustomerListPanel />}
        {activeTab === "manage-request" && (
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
        {activeTab === "dashboard" && <AdminDashboardOverview />}
        {activeTab === "tracking" && <OrderTrackingPanel />}
        {activeTab === "notifications" && <AdminNotificationsPanel />}
        {activeTab === "management" && <OrderManagementPanel />}
        {activeTab === "console" && <ConsolePanel />}
        {activeTab === "loading-instruction" && <LoadingInstructionPanel />}
        {activeTab === "operations" && <OperationsPanel />}
        {activeTab === "import-packing-list" && <ImportPackingListPanel />}
        {activeTab === "import-invoice" && <ImportInvoicePanel />}
        
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
