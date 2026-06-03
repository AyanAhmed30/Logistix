"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Menu, PackagePlus, History, MapPin, LogOut, Bell, X, ClipboardList } from "lucide-react";
import Image from "next/image";
import { BookOrderModal } from "@/components/user/BookOrderModal";
import { OrderHistoryPanel } from "@/components/user/OrderHistoryPanel";
import { UserScanProgressPanel } from "@/components/user/UserScanProgressPanel";
import { UserLoadingInstructionsPanel } from "@/components/user/UserLoadingInstructionsPanel";
import { UsbQrScannerInput } from "@/components/scan/UsbQrScannerInput";
import { UsbScannerDebugPanel } from "@/components/scan/UsbScannerDebugPanel";
import {
  parseUserDashboardTab,
  type UserDashboardTab,
} from "@/lib/user-dashboard-tab";

type Props = {
  username: string;
};

const tabs: { key: UserDashboardTab; label: string; icon: React.ReactNode }[] = [
  { key: "book", label: "Book a New Order", icon: <PackagePlus className="h-4 w-4" /> },
  { key: "history", label: "History", icon: <History className="h-4 w-4" /> },
  { key: "tracking", label: "Scan Progress", icon: <MapPin className="h-4 w-4" /> },
  { key: "loading", label: "Loading Instructions", icon: <ClipboardList className="h-4 w-4" /> },
];

function UserDashboardShellInner({ username }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<UserDashboardTab>(() =>
    parseUserDashboardTab(searchParams.get("tab"))
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [scanProgressRefreshKey, setScanProgressRefreshKey] = useState(0);
  const [loadingRefreshKey, setLoadingRefreshKey] = useState(0);

  useEffect(() => {
    const parsed = parseUserDashboardTab(searchParams.get("tab"));
    setActiveTab(parsed);
    const raw = searchParams.get("tab");
    if (raw === "reinward" || raw === "scanned") {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "tracking");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [searchParams, pathname, router]);

  const syncTabToUrl = useCallback(
    (tab: UserDashboardTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "book") {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  function selectTab(tab: UserDashboardTab) {
    setActiveTab(tab);
    syncTabToUrl(tab);
    setIsSidebarOpen(false);
    if (tab === "book") {
      setIsOrderModalOpen(true);
    } else {
      setIsOrderModalOpen(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <UsbScannerDebugPanel />
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
          Book orders, track scan progress, and manage loading when your console is ready.
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
        <UsbQrScannerInput
          enabled={!isOrderModalOpen}
          showCaptureField={activeTab === "tracking" || activeTab === "loading"}
        />
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
        ) : null}

        <div className={activeTab === "loading" ? undefined : "hidden"} aria-hidden={activeTab !== "loading"}>
          <UserLoadingInstructionsPanel
            refreshKey={loadingRefreshKey}
            isVisible={activeTab === "loading"}
            onAfterContainerFull={() => {
              setScanProgressRefreshKey((k) => k + 1);
              selectTab("tracking");
            }}
          />
        </div>

        <div className={activeTab === "tracking" ? undefined : "hidden"} aria-hidden={activeTab !== "tracking"}>
          <UserScanProgressPanel refreshKey={scanProgressRefreshKey} username={username} />
        </div>
      </main>

      <BookOrderModal
        open={isOrderModalOpen}
        onOpenChange={setIsOrderModalOpen}
        onOrderSaved={() => {
          setHistoryRefreshKey((prev) => prev + 1);
          setScanProgressRefreshKey((prev) => prev + 1);
          setLoadingRefreshKey((prev) => prev + 1);
        }}
      />
    </div>
  );
}

export function UserDashboardShell(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center text-secondary-muted">
          Loading dashboard…
        </div>
      }
    >
      <UserDashboardShellInner {...props} />
    </Suspense>
  );
}
