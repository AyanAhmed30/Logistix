"use client";

import { useEffect, useState } from "react";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { LogOut, Bell } from "lucide-react";
import Image from "next/image";
import { AdminUserManager } from "@/components/admin/AdminUserManager";
import { getAdminNotifications } from "@/app/actions/orders";
import {
  type AdminModule,
  type AdminTab,
  getDefaultTabForModule,
  getModuleForTab,
} from "@/lib/admin-navigation";

type AppUser = {
  id: string;
  username: string;
  password: string;
  created_at: string;
};

type Props = {
  users: AppUser[];
  dbError?: string | null;
};

export function AdminDashboardShell({ users, dbError }: Props) {
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [activeModule, setActiveModule] = useState<AdminModule | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const [quotationPayload, setQuotationPayload] = useState<{
    contactId?: string | null;
    quotationId?: string | null;
    token: number;
  } | null>(null);
  const [contactPayload, setContactPayload] = useState<{
    contactId?: string | null;
    token: number;
  } | null>(null);
  const [invoicePayload, setInvoicePayload] = useState<{
    invoiceId?: string | null;
    token: number;
  } | null>(null);

  function handleTabChange(tab: AdminTab) {
    setActiveTab(tab);
    if (tab === "dashboard") return;
    const resolvedModule = getModuleForTab(tab);
    if (resolvedModule) setActiveModule(resolvedModule);
  }

  function handleModuleSelect(nextModule: AdminModule) {
    setActiveModule(nextModule);
    setActiveTab(getDefaultTabForModule(nextModule));
  }

  function handleBackToModules() {
    setActiveModule(null);
    setActiveTab("dashboard");
  }

  useEffect(() => {
    function onOpenQuotation(e: Event) {
      const detail = (e as CustomEvent).detail || {};
      setQuotationPayload({
        contactId: detail.contactId ?? null,
        quotationId: detail.quotationId ?? null,
        token: Date.now(),
      });
      setActiveModule("operations");
      setActiveTab("accounting");
    }
    function onOpenContact(e: Event) {
      const detail = (e as CustomEvent).detail || {};
      if (!detail.contactId) return;
      setContactPayload({
        contactId: String(detail.contactId),
        token: Date.now(),
      });
      setActiveModule("sales");
      setActiveTab("contacts");
    }
    function onOpenInvoice(e: Event) {
      const detail = (e as CustomEvent).detail || {};
      setInvoicePayload({
        invoiceId: detail.invoiceId ? String(detail.invoiceId) : null,
        token: Date.now(),
      });
      setActiveModule("operations");
      setActiveTab("accounting");
    }
    window.addEventListener("admin:open-quotation", onOpenQuotation);
    window.addEventListener("admin:open-contact", onOpenContact);
    window.addEventListener("admin:open-invoice", onOpenInvoice);
    return () => {
      window.removeEventListener("admin:open-quotation", onOpenQuotation);
      window.removeEventListener("admin:open-contact", onOpenContact);
      window.removeEventListener("admin:open-invoice", onOpenInvoice);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const lastSeenRaw = localStorage.getItem("admin_notifications_seen_at");
    const lastSeen = lastSeenRaw ? new Date(lastSeenRaw).getTime() : 0;

    getAdminNotifications().then((result) => {
      if (!isMounted) return;
      if ("notifications" in result && Array.isArray(result.notifications)) {
        const unread = result.notifications.filter((item) => {
          const createdAt = new Date(item.created_at).getTime();
          return createdAt > lastSeen;
        }).length;
        setUnreadCount(unread);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "notifications") return;
    getAdminNotifications().then((result) => {
      if ("notifications" in result && Array.isArray(result.notifications) && result.notifications.length > 0) {
        localStorage.setItem(
          "admin_notifications_seen_at",
          result.notifications[0].created_at
        );
      } else {
        localStorage.setItem("admin_notifications_seen_at", new Date().toISOString());
      }
      setUnreadCount(0);
    });
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-white">
      {dbError && (
        <div className="bg-red-600 text-white p-2 text-center text-sm font-medium animate-pulse z-50 fixed top-16 inset-x-0">
          Database Error: {dbError} (Ensure &apos;app_users&apos; exists in Supabase)
        </div>
      )}

      <header className="fixed top-0 inset-x-0 h-16 bg-white border-b z-50">
        <div className="h-full px-6 md:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white p-1 rounded-md">
              <Image src="/logo.jpg" alt="Logo" width={130} height={40} className="h-9 w-auto" />
            </div>
            <span className="hidden md:block font-semibold text-sm uppercase tracking-widest text-secondary-muted">
              Administrator Portal
            </span>
          </div>

          <div className="flex items-center gap-4 md:gap-6">
            <button
              className="text-secondary-muted hover:text-primary-dark transition-colors relative"
              onClick={() => {
                setActiveModule(null);
                setActiveTab("notifications");
              }}
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 bg-primary-accent h-3 w-3 rounded-full border-2 border-white" />
              {unreadCount > 0 && (
                <span className="absolute -top-2 -right-2 min-w-[18px] rounded-full bg-red-600 px-1 py-0.5 text-[10px] font-bold text-white text-center">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
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

      <AdminUserManager
        users={users}
        userCount={users.length}
        activeTab={activeTab}
        activeModule={activeModule}
        onTabChange={handleTabChange}
        onModuleSelect={handleModuleSelect}
        onBackToModules={handleBackToModules}
        quotationPayload={quotationPayload}
        contactPayload={contactPayload}
        invoicePayload={invoicePayload}
      />
    </div>
  );
}
