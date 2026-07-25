"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { CRM_TOP_MENUS, type CrmMenuLink } from "@/lib/crm-navigation";
import {
  visibleCrmModuleTabs,
  type DashboardAccessState,
} from "@/lib/dashboard-access";
import { toast } from "sonner";

type Props = {
  access: DashboardAccessState;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
};

function linkAllowed(
  item: CrmMenuLink,
  visibleTabs: string[],
  isSuperAdmin: boolean
) {
  if (item.placeholder) return true;
  if (isSuperAdmin) return true;
  if (!item.permission) return true;
  return visibleTabs.includes(item.permission);
}

function isItemActive(
  pathname: string,
  href: string,
  reportView: string | null
) {
  const path = pathname.replace(/\/$/, "");
  const [base, query = ""] = href.split("?");
  const basePath = base.replace(/\/$/, "");

  if (basePath === "/crm/pipeline") {
    return path === basePath || path.startsWith("/crm/opportunities");
  }
  if (basePath === "/crm/reports") {
    if (!path.startsWith("/crm/reports")) return false;
    const wantsActivities = query.includes("view=activities");
    const isActivities = reportView === "activities";
    return wantsActivities ? isActivities : !isActivities;
  }
  return path === basePath || path.startsWith(`${basePath}/`);
}

function menuHasActive(
  pathname: string,
  items: CrmMenuLink[],
  reportView: string | null
) {
  return items.some((item) => isItemActive(pathname, item.href, reportView));
}

export function CrmTopNav({ access, mobileOpen, onMobileOpenChange }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reportView = searchParams.get("view");
  const router = useRouter();
  const visibleTabs = useMemo(
    () =>
      access.isSuperAdmin
        ? (["crm-pipeline", "crm-customers", "crm-activities", "crm-reports"] as const)
        : visibleCrmModuleTabs(access.permissions),
    [access.isSuperAdmin, access.permissions]
  );

  function handleNavigate(item: CrmMenuLink) {
    onMobileOpenChange(false);
    if (item.placeholder) {
      toast.info("This CRM screen will be available soon.");
      router.push(item.href);
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
            CRM
          </span>
        </Link>

        <nav
          className="hidden lg:flex items-stretch h-full gap-0.5"
          aria-label="CRM menus"
        >
          {CRM_TOP_MENUS.map((menu) => {
            const items = menu.items.filter((item) =>
              linkAllowed(item, [...visibleTabs], access.isSuperAdmin)
            );
            if (items.length === 0) return null;
            const active = menuHasActive(pathname, items, reportView);
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
                  {items.map((item) => {
                    const itemActive = isItemActive(
                      pathname,
                      item.href,
                      reportView
                    );
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
                              {item.placeholder
                                ? "Coming soon"
                                : item.description}
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
          {CRM_TOP_MENUS.map((menu) => {
            const items = menu.items.filter((item) =>
              linkAllowed(item, [...visibleTabs], access.isSuperAdmin)
            );
            if (items.length === 0) return null;
            return (
              <div key={menu.id} className="px-3 py-3 border-b border-white/10">
                <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-white/60 mb-1">
                  {menu.label}
                </p>
                <ul>
                  {items.map((item) => {
                    const itemActive = isItemActive(
                      pathname,
                      item.href,
                      reportView
                    );
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => handleNavigate(item)}
                          className={`w-full text-left rounded-md px-3 py-2.5 text-sm ${
                            itemActive
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
                    );
                  })}
                </ul>
              </div>
            );
          })}
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
