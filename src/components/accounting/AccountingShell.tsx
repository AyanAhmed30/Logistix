"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { OrganizationSwitcher } from "@/components/admin/OrganizationSwitcher";
import { AccountingTopNav } from "@/components/accounting/AccountingTopNav";
import { AccountingControlPanel } from "@/components/accounting/AccountingControlPanel";
import { AccountingUserMenu } from "@/components/accounting/AccountingUserMenu";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { getAccountingPageMeta } from "@/lib/accounting-navigation";
import { useAccountingShortcuts } from "@/hooks/useAccountingShortcuts";
import type { DashboardAccessState } from "@/lib/dashboard-access";

type AccountingShellContextValue = {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  activeFilterId: string;
  setActiveFilterId: (value: string) => void;
};

const AccountingShellContext = createContext<AccountingShellContextValue | null>(
  null
);

export function useAccountingShell() {
  const ctx = useContext(AccountingShellContext);
  if (!ctx) {
    throw new Error("useAccountingShell must be used within AccountingShell");
  }
  return ctx;
}

type Props = {
  access: DashboardAccessState;
  children: ReactNode;
};

export function AccountingShell({ access, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { switchVersion } = useAdminOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilterId, setActiveFilterId] = useState("all");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const pageMeta = useMemo(() => getAccountingPageMeta(pathname), [pathname]);

  const isFormLike = (() => {
    if (pathname === "/accounting/customers/products") return false;
    if (pathname === "/accounting/vendors/products") return false;
    if (pathname.startsWith("/accounting/customers/products/")) return true;
    if (pathname.startsWith("/accounting/vendors/products/")) return true;
    if (pathname === "/accounting/customers/new") return true;
    if (pathname === "/accounting/vendors/new") return true;
    if (
      pathname.startsWith("/accounting/journal-entries/") &&
      pathname !== "/accounting/journal-entries"
    ) {
      return true;
    }
    if (
      pathname.startsWith("/accounting/assets/") &&
      pathname !== "/accounting/assets" &&
      !pathname.startsWith("/accounting/assets/categories")
    ) {
      return true;
    }
    if (
      pathname.startsWith("/accounting/loans/") &&
      pathname !== "/accounting/loans"
    ) {
      return true;
    }
    if (
      pathname.startsWith("/accounting/tax-returns/") &&
      pathname !== "/accounting/tax-returns"
    ) {
      return true;
    }
    if (
      pathname.startsWith("/accounting/invoices/") &&
      pathname !== "/accounting/invoices"
    ) {
      return true;
    }
    if (
      pathname.startsWith("/accounting/bills/") &&
      pathname !== "/accounting/bills"
    ) {
      return true;
    }
    if (
      pathname.startsWith("/accounting/credit-notes/") &&
      pathname !== "/accounting/credit-notes" &&
      pathname !== "/accounting/credit-notes/new"
    ) {
      return true;
    }
    if (
      pathname.startsWith("/accounting/vendor-refunds/") &&
      pathname !== "/accounting/vendor-refunds"
    ) {
      return true;
    }
    if (
      pathname.startsWith("/accounting/payments/") &&
      pathname !== "/accounting/payments"
    ) {
      return true;
    }
    if (
      pathname.startsWith("/accounting/vendor-payments/") &&
      pathname !== "/accounting/vendor-payments"
    ) {
      return true;
    }
    if (
      pathname.startsWith("/accounting/configuration/chart-of-accounts/") &&
      pathname !== "/accounting/configuration/chart-of-accounts"
    ) {
      return true;
    }
    if (
      pathname.startsWith("/accounting/configuration/journals/") &&
      pathname !== "/accounting/configuration/journals"
    ) {
      return true;
    }
    if (
      pathname.startsWith("/accounting/configuration/taxes/") &&
      pathname !== "/accounting/configuration/taxes"
    ) {
      return true;
    }
    if (
      pathname.startsWith("/accounting/configuration/payment-terms/") &&
      pathname !== "/accounting/configuration/payment-terms"
    ) {
      return true;
    }
    if (
      pathname.startsWith("/accounting/configuration/currencies/") &&
      pathname !== "/accounting/configuration/currencies"
    ) {
      return true;
    }
    if (
      pathname.startsWith("/accounting/customers/") &&
      pathname !== "/accounting/customers"
    ) {
      return true;
    }
    if (
      pathname.startsWith("/accounting/vendors/") &&
      pathname !== "/accounting/vendors"
    ) {
      return true;
    }
    return false;
  })();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    setSearchQuery("");
    if (pathname.startsWith("/accounting/reconcile")) {
      setActiveFilterId("with_residual");
    } else if (
      pathname.startsWith("/accounting/configuration/chart-of-accounts") ||
      pathname.startsWith("/accounting/configuration/journals") ||
      pathname.startsWith("/accounting/configuration/taxes") ||
      pathname.startsWith("/accounting/configuration/payment-terms") ||
      pathname.startsWith("/accounting/configuration/currencies")
    ) {
      setActiveFilterId("active");
    } else {
      setActiveFilterId("all");
    }
  }, [switchVersion, pathname]);

  const shellContext = useMemo(
    () => ({
      searchQuery,
      setSearchQuery,
      activeFilterId,
      setActiveFilterId,
    }),
    [searchQuery, activeFilterId]
  );

  const handleSearchSubmit = useCallback(() => {
    if (!searchQuery.trim()) return;
    if (pageMeta.searchMode === "customers") {
      router.push(
        `/accounting/customers?q=${encodeURIComponent(searchQuery.trim())}`
      );
    }
    if (pageMeta.searchMode === "vendors") {
      router.push(
        `/accounting/vendors?q=${encodeURIComponent(searchQuery.trim())}`
      );
    }
  }, [searchQuery, pageMeta.searchMode, router]);

  useAccountingShortcuts({
    enabled: !isFormLike && pageMeta.searchMode !== "none",
    onSearchFocus: () => {
      const el = document.querySelector<HTMLInputElement>(
        "header + div input, .border-b input"
      );
      // Prefer control panel search input
      const searchInput = document.querySelector<HTMLInputElement>(
        'input[placeholder^="Search"]'
      );
      (searchInput || el)?.focus();
      (searchInput || el)?.select();
    },
  });

  const controlMeta = useMemo(() => {
    if (!isFormLike) return pageMeta;
    return {
      ...pageMeta,
      searchMode: "none" as const,
      showFilters: false,
      showFavorites: false,
    };
  }, [isFormLike, pageMeta]);

  return (
    <AccountingShellContext.Provider value={shellContext}>
      <div className="min-h-screen bg-[#f8f9fa] flex flex-col">
        <header className="sticky top-0 z-50 bg-[#017e84] relative">
          <div className="h-12 px-2 sm:px-3 md:px-4 flex items-center justify-between gap-2">
            <Suspense fallback={<div className="h-9 flex-1" />}>
              <AccountingTopNav
                mobileOpen={mobileNavOpen}
                onMobileOpenChange={setMobileNavOpen}
              />
            </Suspense>
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <div className="[&_button]:h-8 [&_button]:border-white/25 [&_button]:bg-white/10 [&_button]:text-white [&_button]:hover:bg-white/20 [&_button]:max-w-[120px] sm:[&_button]:max-w-[200px] [&_svg]:text-white">
                <OrganizationSwitcher />
              </div>
              <AccountingUserMenu access={access} />
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col min-w-0" key={switchVersion}>
          <AccountingControlPanel
            meta={controlMeta}
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            onSearchSubmit={handleSearchSubmit}
            activeFilterId={activeFilterId}
            onFilterChange={setActiveFilterId}
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
    </AccountingShellContext.Provider>
  );
}
