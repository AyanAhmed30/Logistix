"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import Image from "next/image";
import { useMemo } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SALES_TOP_MENUS, type SalesMenuLink } from "@/lib/sales-navigation";
import type { DashboardAccessState } from "@/lib/dashboard-access";
import { hasDepartmentAccess, hasModulePermission } from "@/lib/module-permissions";
import { toast } from "sonner";

type Props = {
  access: DashboardAccessState;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
};

function linkAllowed(item: SalesMenuLink, access: DashboardAccessState) {
  if (access.isSuperAdmin) return true;
  if (item.placeholder) return hasDepartmentAccess(access.permissions, "sales");
  if (!item.permission) return hasDepartmentAccess(access.permissions, "sales");
  if (item.permission === "customers") {
    return (
      hasModulePermission(access.permissions, "customers") ||
      hasDepartmentAccess(access.permissions, "sales")
    );
  }
  return (
    hasModulePermission(access.permissions, item.permission) ||
    hasDepartmentAccess(access.permissions, "sales")
  );
}

function isItemActive(pathname: string, href: string) {
  const path = pathname.replace(/\/$/, "");
  const base = href.split("?")[0].replace(/\/$/, "");
  return path === base || path.startsWith(`${base}/`);
}

function menuHasActive(pathname: string, items: SalesMenuLink[]) {
  return items.some((item) => isItemActive(pathname, item.href));
}

export function SalesTopNav({ access, mobileOpen, onMobileOpenChange }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const menus = useMemo(
    () =>
      SALES_TOP_MENUS.map((menu) => ({
        ...menu,
        items: menu.items.filter((item) => linkAllowed(item, access)),
      })).filter((m) => m.items.length > 0),
    [access]
  );

  function handleNavigate(item: SalesMenuLink) {
    onMobileOpenChange(false);
    if (item.placeholder) {
      toast.info(`${item.label} will be available in a later Sales phase.`);
      router.push(item.href.split("?")[0]);
      return;
    }
    router.push(item.href);
  }

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
          <span className="text-base sm:text-lg font-semibold tracking-wide text-white">
            Sales
          </span>
        </Link>

        <nav
          className="hidden lg:flex items-stretch h-full gap-0.5"
          aria-label="Sales menus"
        >
          {menus.map((menu) => {
            const active = menuHasActive(pathname, menu.items);
            return (
              <DropdownMenu key={menu.id}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={`h-full px-3 inline-flex items-center gap-1 text-sm font-medium transition-colors outline-none ${
                      active
                        ? "bg-white/15 text-white"
                        : "text-white/85 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {menu.label}
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-56 mt-0 rounded-t-none border-t-0 shadow-lg"
                >
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-secondary-muted">
                    {menu.label}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {menu.items.map((item) => {
                    const itemActive = isItemActive(pathname, item.href);
                    return (
                      <DropdownMenuItem
                        key={item.id}
                        className={`cursor-pointer py-2 ${
                          itemActive ? "bg-[#017e84]/10 text-[#017e84]" : ""
                        }`}
                        onClick={() => handleNavigate(item)}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-sm">{item.label}</span>
                          {item.description ? (
                            <span className="text-[11px] text-secondary-muted font-normal">
                              {item.placeholder ? "Coming soon" : item.description}
                            </span>
                          ) : null}
                        </div>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
        </nav>
      </div>

      {mobileOpen ? (
        <div className="lg:hidden absolute top-full inset-x-0 z-50 bg-[#016970] border-t border-white/10 shadow-xl max-h-[70vh] overflow-y-auto">
          {menus.map((menu) => (
            <div key={menu.id} className="px-3 py-3 border-b border-white/10">
              <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-white/60 mb-1">
                {menu.label}
              </p>
              <ul>
                {menu.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleNavigate(item)}
                      className={`w-full text-left rounded-md px-3 py-2.5 text-sm ${
                        isItemActive(pathname, item.href)
                          ? "bg-white/15 text-white font-medium"
                          : "text-white/90 hover:bg-white/10"
                      }`}
                    >
                      {item.label}
                      {item.placeholder ? (
                        <span className="ml-2 text-[10px] uppercase opacity-60">
                          Soon
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="px-3 py-3">
            <Link
              href="/admin/dashboard"
              onClick={() => onMobileOpenChange(false)}
              className="block rounded-md px-3 py-2.5 text-sm text-white/80 hover:bg-white/10"
            >
              ← Dashboard
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}
