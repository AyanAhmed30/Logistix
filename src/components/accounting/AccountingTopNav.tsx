"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { getAccountingNavItemsForLevel } from "@/lib/accounting-nav-access";
import { getAccountingAccessLevel } from "@/lib/accounting-roles";
import { useDashboardAccess } from "@/contexts/DashboardAccessContext";

type Props = {
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
};

function isActive(pathname: string, href: string) {
  const path = pathname.replace(/\/$/, "") || "/";
  const base = href.replace(/\/$/, "") || "/";
  if (base === "/accounting") return path === "/accounting";
  return path === base || path.startsWith(`${base}/`);
}

export function AccountingTopNav({ mobileOpen, onMobileOpenChange }: Props) {
  const pathname = usePathname();
  const access = useDashboardAccess();
  const navItems = useMemo(() => {
    const level = access.isSuperAdmin
      ? "admin"
      : getAccountingAccessLevel(access.permissions || []);
    return getAccountingNavItemsForLevel(level);
  }, [access.isSuperAdmin, access.permissions]);

  return (
    <>
      <div className="h-full flex items-center gap-1 sm:gap-2 min-w-0">
        <button
          type="button"
          className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-md text-white/90 hover:bg-white/10"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => onMobileOpenChange(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <Link
          href="/admin/dashboard"
          className="flex items-center gap-2 shrink-0 mr-1 sm:mr-3 hover:opacity-90 transition-opacity"
          title="Back to Dashboard"
        >
          <Image
            src="/logo.jpg"
            alt="Logistix"
            width={100}
            height={30}
            className="h-7 w-auto rounded-sm hidden sm:block"
            priority
          />
          <span className="text-white font-semibold text-sm sm:text-base tracking-tight">
            Accounting
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-0.5 min-w-0 overflow-x-auto">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`inline-flex items-center gap-1.5 h-9 px-2.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? "bg-white/20 text-white"
                    : "text-white/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="h-3.5 w-3.5 opacity-90" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {mobileOpen ? (
        <div className="lg:hidden absolute left-0 right-0 top-12 z-50 border-b border-white/10 bg-[#017e84] shadow-lg">
          <nav className="flex flex-col p-2 gap-0.5">
            {navItems.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => onMobileOpenChange(false)}
                  className={`inline-flex items-center gap-2 h-10 px-3 rounded-md text-sm font-medium ${
                    active
                      ? "bg-white/20 text-white"
                      : "text-white/90 hover:bg-white/10"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      ) : null}
    </>
  );
}
