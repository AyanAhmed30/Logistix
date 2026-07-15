"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ArrowLeft, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type AdminTab,
  getSidebarItemsForModule,
} from "@/lib/admin-navigation";

type Props = {
  activeTab: AdminTab;
  onTabSelect: (tab: AdminTab) => void;
  onBackToModules: () => void;
  children: ReactNode;
};

const SETTINGS_TABS: AdminTab[] = ["create", "organization", "profiles"];
const ORG_CREATE_HASH = "#organization-create";
const ORG_CREATE_EVENT = "logistix:organization-create";

export function AdminSettingsLayout({
  activeTab,
  onTabSelect,
  onBackToModules,
  children,
}: Props) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isOrgCreatePage, setIsOrgCreatePage] = useState(false);
  const navItems = getSidebarItemsForModule("settings").filter((item) =>
    SETTINGS_TABS.includes(item.tab)
  );
  const activeItem = navItems.find((item) => item.tab === activeTab);

  useEffect(() => {
    function syncCreateMode() {
      setIsOrgCreatePage(
        activeTab === "organization" && window.location.hash === ORG_CREATE_HASH
      );
    }
    function onCreateEvent(event: Event) {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      if (activeTab !== "organization") {
        setIsOrgCreatePage(false);
        return;
      }
      if (typeof detail?.open === "boolean") {
        setIsOrgCreatePage(detail.open);
        return;
      }
      syncCreateMode();
    }
    syncCreateMode();
    window.addEventListener("hashchange", syncCreateMode);
    window.addEventListener("popstate", syncCreateMode);
    window.addEventListener(ORG_CREATE_EVENT, onCreateEvent);
    return () => {
      window.removeEventListener("hashchange", syncCreateMode);
      window.removeEventListener("popstate", syncCreateMode);
      window.removeEventListener(ORG_CREATE_EVENT, onCreateEvent);
    };
  }, [activeTab]);

  function handleNavClick(tab: AdminTab) {
    if (window.location.hash === ORG_CREATE_HASH) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    onTabSelect(tab);
    setMobileNavOpen(false);
  }

  if (isOrgCreatePage) {
    return <div className="min-h-[70vh]">{children}</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-dashed"
              onClick={onBackToModules}
              title="Back to Modules"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              <span>Back to Modules</span>
            </Button>
          </div>
          <h1 className="text-2xl font-bold text-primary-dark tracking-tight md:text-3xl">
            Settings
          </h1>
          <p className="text-sm text-secondary-muted max-w-2xl">
            Manage users, organization details, and account profiles for your Logistix portal.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 lg:hidden"
          onClick={() => setMobileNavOpen((open) => !open)}
          aria-expanded={mobileNavOpen}
          aria-controls="settings-nav"
        >
          <Menu className="h-4 w-4" />
          <span>{activeItem?.label ?? "Menu"}</span>
        </Button>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-0">
        <aside
          id="settings-nav"
          className={`w-full shrink-0 lg:w-56 xl:w-64 lg:sticky lg:top-24 lg:pr-5 lg:border-r lg:border-slate-200 ${
            mobileNavOpen ? "block" : "hidden lg:block"
          }`}
        >
          <nav className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
            <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-secondary-muted">
              Configuration
            </p>
            <ul className="space-y-0.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.tab;
                return (
                  <li key={item.tab}>
                    <button
                      type="button"
                      title={item.title}
                      onClick={() => handleNavClick(item.tab)}
                      className={`group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
                        isActive
                          ? "bg-primary-accent/10 font-semibold text-primary-dark border-l-[3px] border-primary-accent pl-[9px]"
                          : "text-secondary-muted hover:bg-slate-50 hover:text-primary-dark border-l-[3px] border-transparent pl-[9px]"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          isActive
                            ? "text-primary-accent"
                            : "text-secondary-muted group-hover:text-primary-dark"
                        }`}
                      />
                      <span className="leading-snug">{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        <main className="min-w-0 flex-1 lg:pl-6 xl:pl-8">
          <div className="w-full max-w-6xl">
            <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3 md:px-6">
                <h2 className="text-base font-semibold text-primary-dark">
                  {activeItem?.label ?? "Settings"}
                </h2>
                {activeItem?.title && activeItem.title !== activeItem.label ? (
                  <p className="mt-0.5 text-xs text-secondary-muted">{activeItem.title}</p>
                ) : null}
              </div>
              <div className="p-4 md:p-6">{children}</div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
