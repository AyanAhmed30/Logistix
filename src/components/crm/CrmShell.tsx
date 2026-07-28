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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { OrganizationSwitcher } from "@/components/admin/OrganizationSwitcher";
import { CrmTopNav } from "@/components/crm/CrmTopNav";
import { CrmControlPanel } from "@/components/crm/CrmControlPanel";
import { CrmUserMenu } from "@/components/crm/CrmUserMenu";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useCrmKeyboardShortcuts } from "@/hooks/useCrmKeyboardShortcuts";
import { invalidateCrmClientCache } from "@/lib/crm-client-cache";
import { invalidateContactsClientCache } from "@/lib/contacts-client-cache";
import { invalidateContactPickerCache } from "@/lib/contact-picker-cache";
import { getCrmPageMeta } from "@/lib/crm-navigation";
import type { DashboardAccessState } from "@/lib/dashboard-access";
import { toast } from "sonner";
import { ModuleLoadingOverlay } from "@/components/ui/ModuleLoadingOverlay";

type CrmShellContextValue = {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  activeFilterId: string;
  setActiveFilterId: (value: string) => void;
};

const CrmShellContext = createContext<CrmShellContextValue | null>(null);

export function useCrmShell() {
  const ctx = useContext(CrmShellContext);
  if (!ctx) throw new Error("useCrmShell must be used within CrmShell");
  return ctx;
}

type Props = {
  access: DashboardAccessState;
  children: ReactNode;
};

export function CrmShell({ access, children }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilterId, setActiveFilterId] = useState("all");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const pageMeta = useMemo(
    () => getCrmPageMeta(pathname, searchParams.get("view")),
    [pathname, searchParams]
  );
  const isOpportunityForm =
    pathname.startsWith("/crm/opportunities/") ||
    pathname === "/crm/opportunities/new";

  useEffect(() => {
    invalidateCrmClientCache();
    invalidateContactsClientCache();
    invalidateContactPickerCache();
  }, [switchVersion]);

  useEffect(() => {
    setNavigating(true);
    const id = window.setTimeout(() => setNavigating(false), 400);
    return () => window.clearTimeout(id);
  }, [pathname]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Push control-panel search into pipeline (single Odoo-style search bar)
  useEffect(() => {
    if (pageMeta.searchMode !== "pipeline") return;
    window.dispatchEvent(
      new CustomEvent("crm:control-search", { detail: { query: searchQuery } })
    );
  }, [searchQuery, pageMeta.searchMode]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("crm:control-filter", {
        detail: { filterId: activeFilterId },
      })
    );
  }, [activeFilterId]);

  const shellContext = useMemo(
    () => ({ searchQuery, setSearchQuery, activeFilterId, setActiveFilterId }),
    [searchQuery, activeFilterId]
  );

  const handleSearchSubmit = useCallback(() => {
    if (!searchQuery.trim()) return;
    if (pageMeta.searchMode === "customers") {
      router.push(`/crm/customers?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  }, [searchQuery, pageMeta.searchMode, router]);

  const handleCreate = useCallback(() => {
    if (isAdminContext) {
      toast.info(
        "Select a specific organization from the company switcher to create records."
      );
      return;
    }
    if (
      pathname.startsWith("/crm/pipeline") ||
      pathname.startsWith("/crm/opportunities")
    ) {
      window.dispatchEvent(
        new CustomEvent("crm:pipeline-quick-create", { detail: {} })
      );
      return;
    }
    if (pathname.startsWith("/crm/customers")) {
      router.push("/crm/customers/new");
      return;
    }
    if (pathname.startsWith("/crm/activities")) {
      toast.info("Schedule activities from an opportunity.");
      return;
    }
    router.push("/crm/opportunities/new");
  }, [isAdminContext, pathname, router]);

  useCrmKeyboardShortcuts({
    onFocusSearch: () => {
      const el =
        document.querySelector<HTMLInputElement>("[data-crm-search]") ||
        searchInputRef.current;
      el?.focus();
    },
    onCreate: handleCreate,
  });

  const controlMeta = isOpportunityForm
    ? {
        ...pageMeta,
        showCreate: false,
        showFilters: false,
        showFavorites: false,
        searchMode: "none" as const,
      }
    : pageMeta;

  return (
    <CrmShellContext.Provider value={shellContext}>
      <div className="min-h-screen bg-[#f8f9fa] flex flex-col">
        {navigating ? <ModuleLoadingOverlay label={pageMeta.title || "CRM"} /> : null}
        <header className="sticky top-0 z-50 bg-[#017e84] relative">
          <div className="h-12 px-2 sm:px-3 md:px-4 flex items-center justify-between gap-2">
            <CrmTopNav
              access={access}
              mobileOpen={mobileNavOpen}
              onMobileOpenChange={setMobileNavOpen}
            />
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <div className="crm-org-switcher [&_button]:h-8 [&_button]:border-white/25 [&_button]:bg-white/10 [&_button]:text-white [&_button]:hover:bg-white/20 [&_button]:max-w-[120px] sm:[&_button]:max-w-[200px] [&_svg]:text-white">
                <OrganizationSwitcher />
              </div>
              <CrmUserMenu access={access} />
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col min-w-0" key={switchVersion}>
          <CrmControlPanel
            meta={controlMeta}
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            onSearchSubmit={handleSearchSubmit}
            searchInputRef={searchInputRef}
            activeFilterId={activeFilterId}
            onFilterChange={setActiveFilterId}
          />

          <main
            className={`flex-1 overflow-auto ${
              isOpportunityForm ? "p-0 sm:p-2 md:p-3" : "p-3 sm:p-4 md:p-5"
            }`}
          >
            {children}
          </main>
        </div>
      </div>
    </CrmShellContext.Provider>
  );
}
