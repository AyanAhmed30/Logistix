"use client";

import { useState } from "react";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { LogOut, Menu, X, Settings, ClipboardList } from "lucide-react";
import Image from "next/image";
import { OperationsPanel } from "@/components/admin/OperationsPanel";
import { OperationsLeadsInquiryPanel } from "@/components/admin/OperationsLeadsInquiryPanel";

type Props = {
  username: string;
};

type SubTab = "operations" | "leads-inquiry";

export function OperationsDashboardShell({ username }: Props) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("operations");

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
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
            <span className="hidden md:block text-sm text-secondary-muted">
              Logged in as <span className="font-semibold text-primary-dark">{username}</span>
            </span>
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

      {/* Sidebar */}
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
            <p className="text-xs text-secondary-muted">Manage operations & inquiries</p>
          </div>
          <div className="grid gap-2">
            <Button
              variant={activeSubTab === "operations" ? "default" : "outline"}
              className="justify-start gap-2"
              onClick={() => {
                setActiveSubTab("operations");
                setIsSidebarOpen(false);
              }}
            >
              <Settings className="h-4 w-4 shrink-0" />
              <span>Operations</span>
            </Button>
            <Button
              variant={activeSubTab === "leads-inquiry" ? "default" : "outline"}
              className="justify-start gap-2"
              onClick={() => {
                setActiveSubTab("leads-inquiry");
                setIsSidebarOpen(false);
              }}
            >
              <ClipboardList className="h-4 w-4 shrink-0" />
              <span>Leads Inquiry</span>
            </Button>
          </div>
        </div>
      </aside>

      {/* Sidebar overlay for mobile */}
      {isSidebarOpen && (
        <button
          className="fixed inset-0 z-40 bg-black/20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      {/* Main Content */}
      <main className="pt-20 md:pl-64">
        <section className="px-6 pb-10 md:px-10">
          {activeSubTab === "operations" && <OperationsPanel />}
          {activeSubTab === "leads-inquiry" && <OperationsLeadsInquiryPanel />}
        </section>
      </main>
    </div>
  );
}
