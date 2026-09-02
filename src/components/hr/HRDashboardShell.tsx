"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/actions/auth";
import {
  HR_NAV_ITEMS,
  filterHrNavItems,
  getHrNavItemByPath,
} from "@/lib/hr-navigation";
import {
  visibleHrModuleTabs,
  type DashboardAccessState,
} from "@/lib/dashboard-access";

interface HRDashboardShellProps {
  username: string;
  roleLabel?: string;
  showAdminBackLink?: boolean;
  access: DashboardAccessState;
  children: React.ReactNode;
}

export function HRDashboardShell({
  username,
  roleLabel = "HR",
  showAdminBackLink = true,
  access,
  children,
}: HRDashboardShellProps) {
  const pathname = usePathname();
  const activeItem = getHrNavItemByPath(pathname);
  const visibleTabs = access.isSuperAdmin
    ? visibleHrModuleTabs([
        "employee_profile_management",
        "attendance_leave_tracking",
        "document_management",
        "payroll_management",
        "report_generation",
        "hr",
      ])
    : visibleHrModuleTabs(access.permissions);

  const navItems = filterHrNavItems(HR_NAV_ITEMS, {
    isSuperAdmin: access.isSuperAdmin,
    permissions: access.permissions,
    visibleTabs,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex">
        <aside className="w-64 min-h-screen bg-white border-r border-slate-200 flex flex-col">
          <div className="p-6 border-b border-slate-200">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              HR Module
            </p>
            <h1 className="text-xl font-semibold text-slate-900 mt-2">
              {username}
            </h1>
            <p className="text-sm text-slate-600 mt-1">Role: {roleLabel}</p>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeItem?.id === item.id;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-200 space-y-2">
            {showAdminBackLink ? (
              <Button asChild variant="outline" className="w-full gap-2">
                <Link href="/admin/dashboard">
                  <ArrowLeft className="h-4 w-4" /> Back to Admin
                </Link>
              </Button>
            ) : null}
            <form action={logout}>
              <Button type="submit" variant="outline" className="w-full gap-2">
                <LogOut className="h-4 w-4" /> Sign Out
              </Button>
            </form>
          </div>
        </aside>

        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
