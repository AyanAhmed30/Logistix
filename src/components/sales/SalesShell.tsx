"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { OrganizationSwitcher } from "@/components/admin/OrganizationSwitcher";
import { SalesTopNav } from "@/components/sales/SalesTopNav";
import { SalesControlPanel } from "@/components/sales/SalesControlPanel";
import { SalesUserMenu } from "@/components/sales/SalesUserMenu";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { getSalesPageMeta } from "@/lib/sales-navigation";
import type { DashboardAccessState } from "@/lib/dashboard-access";
import { toast } from "sonner";
import { useSalesKeyboardShortcuts } from "@/hooks/useSalesKeyboardShortcuts";

type SalesShellContextValue = {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  activeFilterId: string;
  setActiveFilterId: (value: string) => void;
  groupBy: string;
  setGroupBy: (value: string) => void;
};

const SalesShellContext = createContext<SalesShellContextValue | null>(null);

export function useSalesShell() {
  const ctx = useContext(SalesShellContext);
  if (!ctx) throw new Error("useSalesShell must be used within SalesShell");
  return ctx;
}

type Props = {
  access: DashboardAccessState;
  children: ReactNode;
};

export function SalesShell({ access, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilterId, setActiveFilterId] = useState("all");
  const [groupBy, setGroupBy] = useState("none");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const pageMeta = useMemo(() => getSalesPageMeta(pathname), [pathname]);
  const [documentTitle, setDocumentTitle] = useState<string | null>(null);

  const isFormLike =
    pathname.startsWith("/sales/quotations/new") ||
    (pathname.startsWith("/sales/quotations/") &&
      pathname !== "/sales/quotations") ||
    (pathname.startsWith("/sales/orders/") && pathname !== "/sales/orders") ||
    (pathname.startsWith("/sales/to-invoice/") &&
      pathname !== "/sales/to-invoice" &&
      !pathname.startsWith("/sales/to-invoice/upsell")) ||
    pathname.startsWith("/sales/invoices/") ||
    pathname.startsWith("/sales/products/new") ||
    (pathname.startsWith("/sales/products/") &&
      pathname !== "/sales/products");

  useEffect(() => {
    setDocumentTitle(null);
  }, [pathname]);

  useEffect(() => {
    const onTitle = (event: Event) => {
      const detail = (event as CustomEvent<{ title?: string }>).detail;
      if (typeof detail?.title === "string" && detail.title.trim()) {
        setDocumentTitle(detail.title.trim());
      }
    };
    window.addEventListener("sales:document-title", onTitle);
    return () => window.removeEventListener("sales:document-title", onTitle);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    setSearchQuery("");
    if (pathname.startsWith("/sales/products")) {
      setActiveFilterId("active");
    } else if (pathname.includes("/sales/to-invoice/upsell")) {
      setActiveFilterId("all");
    } else if (pathname.includes("/sales/to-invoice")) {
      setActiveFilterId("to_invoice");
    } else {
      setActiveFilterId("all");
    }
    setGroupBy("none");
  }, [switchVersion, pathname]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("sales:control-search", {
        detail: { query: searchQuery },
      })
    );
  }, [searchQuery]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("sales:control-filter", {
        detail: { filterId: activeFilterId },
      })
    );
  }, [activeFilterId]);

  const shellContext = useMemo(
    () => ({
      searchQuery,
      setSearchQuery,
      activeFilterId,
      setActiveFilterId,
      groupBy,
      setGroupBy,
    }),
    [searchQuery, activeFilterId, groupBy]
  );

  const handleSearchSubmit = useCallback(() => {
    if (!searchQuery.trim()) return;
    if (pageMeta.searchMode === "customers") {
      router.push(
        `/sales/customers?q=${encodeURIComponent(searchQuery.trim())}`
      );
    }
  }, [searchQuery, pageMeta.searchMode, router]);

  const handleCreate = useCallback(() => {
    if (isAdminContext) {
      toast.info(
        "Select a specific organization from the company switcher to create records."
      );
      return;
    }
    if (pathname.startsWith("/sales/quotations")) {
      router.push("/sales/quotations/new");
      return;
    }
    if (pathname.startsWith("/sales/customers")) {
      router.push("/sales/customers/new");
      return;
    }
    if (pathname.startsWith("/sales/products")) {
      router.push("/sales/products/new");
      return;
    }
    if (pathname.startsWith("/sales/orders") || pathname === "/sales") {
      router.push("/sales/quotations/new");
    }
  }, [isAdminContext, pathname, router]);

  useSalesKeyboardShortcuts({
    onFocusSearch: () => searchInputRef.current?.focus(),
    onCreate: handleCreate,
    enabled: !isFormLike,
  });

  const controlMeta = useMemo(() => {
    const base = isFormLike
      ? {
          ...pageMeta,
          showCreate: false,
          showFilters: false,
          showFavorites: false,
          searchMode: "none" as const,
        }
      : pageMeta;

    if (
      documentTitle &&
      pathname.startsWith("/sales/to-invoice/") &&
      !pathname.startsWith("/sales/to-invoice/upsell")
    ) {
      const crumbs = [...base.breadcrumbs];
      if (crumbs.length > 0) {
        crumbs[crumbs.length - 1] = { label: documentTitle };
      }
      return { ...base, breadcrumbs: crumbs, title: documentTitle };
    }
    return base;
  }, [documentTitle, isFormLike, pageMeta, pathname]);

  return (
    <SalesShellContext.Provider value={shellContext}>
      <div className="min-h-screen bg-[#f8f9fa] flex flex-col">
        <header className="sticky top-0 z-50 bg-[#017e84] relative">
          <div className="h-12 px-2 sm:px-3 md:px-4 flex items-center justify-between gap-2">
            <SalesTopNav
              access={access}
              mobileOpen={mobileNavOpen}
              onMobileOpenChange={setMobileNavOpen}
            />
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <div className="sales-org-switcher [&_button]:h-8 [&_button]:border-white/25 [&_button]:bg-white/10 [&_button]:text-white [&_button]:hover:bg-white/20 [&_button]:max-w-[120px] sm:[&_button]:max-w-[200px] [&_svg]:text-white">
                <OrganizationSwitcher />
              </div>
              <SalesUserMenu access={access} />
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col min-w-0" key={switchVersion}>
          <SalesControlPanel
            meta={controlMeta}
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            onSearchSubmit={handleSearchSubmit}
            searchInputRef={searchInputRef}
            activeFilterId={activeFilterId}
            onFilterChange={setActiveFilterId}
            onCreate={handleCreate}
          />

          <main
            className={`flex-1 overflow-auto motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 ${
              isFormLike ? "p-0 sm:p-2 md:p-3" : "p-3 sm:p-4 md:p-5"
            }`}
          >
            {children}
          </main>
        </div>
      </div>
    </SalesShellContext.Provider>
  );
}
