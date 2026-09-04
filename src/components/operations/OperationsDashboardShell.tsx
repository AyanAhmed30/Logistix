"use client";

import { useEffect, useMemo, useState } from "react";
import { SignOutForm } from "@/components/auth/SignOutForm";
import { Button } from "@/components/ui/button";
import {
  LogOut,
  Menu,
  X,
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
import { ClientErrorBoundary } from "@/components/error/ClientErrorBoundary";
import { AppNotificationBell } from "@/components/notifications/AppNotificationBell";
import { useNotificationDeepLink } from "@/hooks/useNotificationDeepLink";

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
  const deepLink = useNotificationDeepLink();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isClientMounted, setIsClientMounted] = useState(false);
  const [focusLeadId, setFocusLeadId] = useState<string | null>(deepLink.leadId);
  const [focusInquiryId, setFocusInquiryId] = useState<string | null>(deepLink.inquiryId);
  const [focusConfirmationId, setFocusConfirmationId] = useState<string | null>(
    deepLink.confirmationId
  );

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
    const tab = deepLink.tab as OpsTabKey | null;
    if (tab && allowedTabs.includes(tab)) {
      setActiveSubTab(tab);
    }
    if (deepLink.leadId) setFocusLeadId(deepLink.leadId);
    if (deepLink.inquiryId) setFocusInquiryId(deepLink.inquiryId);
    if (deepLink.confirmationId) {
      setFocusConfirmationId(deepLink.confirmationId);
      if (allowedTabs.includes("inquiry-confirmation")) {
        setActiveSubTab("inquiry-confirmation");
      }
    }
  }, [
    allowedTabs,
    deepLink.tab,
    deepLink.leadId,
    deepLink.inquiryId,
    deepLink.confirmationId,
  ]);

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
              <AppNotificationBell tone="light" />
            ) : (
              <Button
                variant="outline"
                className="relative h-9 w-9 p-0 border-slate-200 bg-white hover:bg-slate-50"
                aria-label="Notifications"
                type="button"
              />
            )}
            <span className="hidden md:block text-sm text-secondary-muted">
              Logged in as <span className="font-semibold text-primary-dark">{username}</span>
            </span>
            <SignOutForm>
              <Button
                variant="outline"
                className="gap-2 border-slate-200 bg-white hover:bg-slate-50 text-primary-dark hover:text-primary-dark"
                type="submit"
              >
                <LogOut className="h-4 w-4" /> Sign Out
              </Button>
            </SignOutForm>
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
              activeSubTab === "inquiry-confirmation" && (
                <InquiryConfirmationPanel
                  focusConfirmationId={focusConfirmationId}
                  onFocusHandled={() => setFocusConfirmationId(null)}
                />
              )}
            {allowedTabs.includes("calculator-config") &&
              activeSubTab === "calculator-config" && <AdminCalculatorPanel />}
          </ClientErrorBoundary>
        </section>
      </main>
    </div>
  );
}
