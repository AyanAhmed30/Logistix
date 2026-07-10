"use client";

import { useState } from "react";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, Menu, X, UsersRound, FileText } from "lucide-react";
import type { Organization } from "@/app/actions/organizations";
import { OrganizationLogo } from "@/components/organization/OrganizationLogo";
import { OrganizationCustomersPanel } from "@/components/organization/OrganizationCustomersPanel";
import { OrganizationQuotationsPanel } from "@/components/organization/OrganizationQuotationsPanel";

type Props = {
  organization: Organization;
  username: string;
};

type ActiveTab = "customers" | "quotations";

export function OrganizationDashboardShell({ organization, username }: Props) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("customers");

  const sidebarWidth = isSidebarCollapsed ? "md:w-20" : "md:w-72";
  const mainContentMargin = isSidebarCollapsed ? "md:pl-20" : "md:pl-72";

  return (
    <div className="min-h-screen bg-white">
      <header className="fixed top-0 inset-x-0 h-16 bg-white border-b z-50">
        <div className="h-full px-6 md:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-slate-200 text-primary-dark hover:bg-slate-50"
              onClick={() => {
                if (typeof window !== "undefined" && window.innerWidth < 768) {
                  setIsSidebarOpen((open) => !open);
                } else {
                  setIsSidebarCollapsed((collapsed) => !collapsed);
                }
              }}
              aria-label="Toggle sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="bg-white p-1 rounded-md">
              <OrganizationLogo
                logoUrl={organization.logo_url}
                alt={`${organization.organization_name} logo`}
              />
            </div>
            <span className="hidden md:block font-semibold text-sm uppercase tracking-widest text-secondary-muted">
              Organization Portal
            </span>
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
      </header>

      <div className={`pt-20 ${mainContentMargin}`}>
        <aside
          className={`fixed inset-y-0 left-0 z-40 ${sidebarWidth} bg-white border-r shadow-lg transform transition-all duration-200 md:translate-x-0 md:top-16 md:h-[calc(100vh-4rem)] md:shadow-none overflow-y-auto ${
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
            <div className={`space-y-3 ${isSidebarCollapsed ? "hidden md:flex md:flex-col md:items-center" : ""}`}>
              <OrganizationLogo
                logoUrl={organization.logo_url}
                alt={`${organization.organization_name} logo`}
                width={isSidebarCollapsed ? 48 : 80}
                height={isSidebarCollapsed ? 48 : 80}
                className={
                  isSidebarCollapsed
                    ? "h-12 w-12 rounded-lg object-cover border border-slate-200"
                    : "h-16 w-16 rounded-lg object-cover border border-slate-200"
                }
              />
              <div className={`space-y-1 ${isSidebarCollapsed ? "hidden" : ""}`}>
                <h2 className="text-lg font-black text-primary-dark">{organization.organization_name}</h2>
                <p className="text-xs text-secondary-muted">Signed in as {username}</p>
              </div>
            </div>
            <div className="grid gap-2 sidebar-buttons">
              <Button
                variant={activeTab === "customers" ? "default" : "outline"}
                className="justify-start gap-2 sidebar-button"
                onClick={() => {
                  setActiveTab("customers");
                  setIsSidebarOpen(false);
                }}
                title="Customers"
              >
                <UsersRound className="h-4 w-4 shrink-0 sidebar-icon" />
                {!isSidebarCollapsed && <span className="sidebar-text">Customers</span>}
              </Button>
              <Button
                variant={activeTab === "quotations" ? "default" : "outline"}
                className="justify-start gap-2 sidebar-button"
                onClick={() => {
                  setActiveTab("quotations");
                  setIsSidebarOpen(false);
                }}
                title="Quotations"
              >
                <FileText className="h-4 w-4 shrink-0 sidebar-icon" />
                {!isSidebarCollapsed && <span className="sidebar-text">Quotations</span>}
              </Button>
            </div>
          </div>
        </aside>

        {isSidebarOpen ? (
          <button
            className="fixed inset-0 z-30 bg-black/20 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Close sidebar overlay"
          />
        ) : null}

        <section className="px-6 pb-10 md:px-10">
          <div className="mb-6">
            <Card className="bg-white border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-4">
                  <OrganizationLogo
                    logoUrl={organization.logo_url}
                    alt={`${organization.organization_name} logo`}
                    width={64}
                    height={64}
                    className="h-16 w-16 rounded-lg object-cover border border-slate-200"
                  />
                  <CardTitle className="text-2xl text-primary-dark">
                    Welcome, {organization.organization_name}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-secondary-muted">
                Manage your customers and quotations from the sidebar.
              </CardContent>
            </Card>
          </div>

          {activeTab === "customers" ? (
            <OrganizationCustomersPanel />
          ) : (
            <OrganizationQuotationsPanel organization={organization} />
          )}
        </section>
      </div>
    </div>
  );
}
