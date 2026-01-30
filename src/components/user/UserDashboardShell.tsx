"use client";

import { useState } from "react";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Menu, PackagePlus, History, MapPin, LogOut, Bell, X } from "lucide-react";
import Image from "next/image";
import { BookOrderModal } from "@/components/user/BookOrderModal";
import { OrderHistoryPanel } from "@/components/user/OrderHistoryPanel";

type Props = {
  username: string;
};

type TabKey = "book" | "history" | "tracking";

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "book", label: "Book a New Order", icon: <PackagePlus className="h-4 w-4" /> },
  { key: "history", label: "History", icon: <History className="h-4 w-4" /> },
  { key: "tracking", label: "Tracking", icon: <MapPin className="h-4 w-4" /> },
];

export function UserDashboardShell({ username }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("book");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  function selectTab(tab: TabKey) {
    setActiveTab(tab);
    setIsSidebarOpen(false);
    if (tab === "book") {
      setIsOrderModalOpen(true);
    }
  }

  const activeLabel = tabs.find((tab) => tab.key === activeTab)?.label ?? "Dashboard";

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
              User Portal
            </span>
          </div>

          <div className="flex items-center gap-4 md:gap-6">
            <div className="hidden md:flex flex-col items-end mr-2">
              <span className="text-xs font-bold text-secondary-muted uppercase tracking-tighter">Signed In</span>
              <span className="text-sm font-black text-primary-dark">{username}</span>
            </div>
            <button className="text-secondary-muted hover:text-primary-dark transition-colors relative">
              <Bell className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 bg-primary-accent h-3 w-3 rounded-full border-2 border-white" />
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
          <h2 className="text-lg font-black text-primary-dark">User Tools</h2>
          <p className="text-xs text-secondary-muted">Track and manage requests</p>
        </div>
        <div className="grid gap-2">
          {tabs.map((tab) => (
            <Button
              key={tab.key}
              variant={activeTab === tab.key ? "default" : "outline"}
              className="justify-start gap-2"
              onClick={() => selectTab(tab.key)}
            >
              {tab.icon}
              {tab.label}
            </Button>
          ))}
        </div>
        <div className="rounded-xl bg-slate-50 p-4 text-xs text-secondary-muted">
          Placeholder sections will be enhanced next.
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
        {activeTab === "book" ? (
          <Card className="bg-white border shadow-sm">
            <CardHeader>
              <CardTitle>Book a New Order</CardTitle>
              <CardDescription>
                Open the modal to create one order with multiple cartons.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setIsOrderModalOpen(true)}>
                Book a New Order
              </Button>
            </CardContent>
          </Card>
        ) : activeTab === "history" ? (
          <OrderHistoryPanel refreshKey={historyRefreshKey} />
        ) : (
          <Card className="bg-white border shadow-sm">
            <CardHeader>
              <CardTitle>{activeLabel}</CardTitle>
              <CardDescription>
                This section is a placeholder. Content will be added soon.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-secondary-muted text-sm">
                You are viewing the {activeLabel} page.
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <BookOrderModal
        open={isOrderModalOpen}
        onOpenChange={setIsOrderModalOpen}
        onOrderSaved={() => setHistoryRefreshKey((prev) => prev + 1)}
      />
    </div>
  );
}
