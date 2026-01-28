"use client";

import { useState } from "react";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LogOut, Menu, Bell } from "lucide-react";
import Image from "next/image";
import { AdminUserManager } from "@/components/admin/AdminUserManager";

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      {dbError && (
        <div className="bg-red-600 text-white p-2 text-center text-sm font-medium animate-pulse z-50 fixed top-16 inset-x-0">
          Database Error: {dbError} (Ensure 'app_users' exists in Supabase)
        </div>
      )}

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
              Administrator Portal
            </span>
          </div>

          <div className="flex items-center gap-4 md:gap-6">
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

      <AdminUserManager
        users={users}
        userCount={users.length}
        isSidebarOpen={isSidebarOpen}
        onSidebarClose={() => setIsSidebarOpen(false)}
      />
    </div>
  );
}
