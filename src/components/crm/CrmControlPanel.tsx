"use client";

import Link from "next/link";
import type { RefObject, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { CrmSearchBar } from "@/components/crm/CrmSearchBar";
import { CrmFilters } from "@/components/crm/CrmFilters";
import { CrmFavorites } from "@/components/crm/CrmFavorites";
import type { CrmPageMeta } from "@/lib/crm-navigation";

type Props = {
  meta: CrmPageMeta;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit?: () => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  activeFilterId: string;
  onFilterChange: (filterId: string) => void;
  /** Extra actions on the right (e.g. Manage Stages) */
  actions?: ReactNode;
};

export function CrmControlPanel({
  meta,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  searchInputRef,
  activeFilterId,
  onFilterChange,
  actions,
}: Props) {
  const showSearch = meta.searchMode !== "none";
  const showFilters = meta.showFilters !== false && showSearch;
  const showFavorites = meta.showFavorites !== false;

  return (
    <div className="border-b border-slate-200 bg-white">
      {/* Breadcrumb + title row (Odoo control panel top) */}
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 md:px-6 pt-3 pb-2">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 min-w-0 flex-1">
          {meta.breadcrumbs.map((crumb, index) => {
            const last = index === meta.breadcrumbs.length - 1;
            return (
              <span key={`${crumb.label}-${index}`} className="flex items-center gap-1 min-w-0">
                {index > 0 ? (
                  <ChevronRight
                    className="h-3.5 w-3.5 text-slate-300 shrink-0"
                    aria-hidden
                  />
                ) : null}
                {crumb.href && !last ? (
                  <Link
                    href={crumb.href}
                    className="text-xs sm:text-sm text-secondary-muted hover:text-[#017e84] truncate"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={`truncate ${
                      last
                        ? "text-base sm:text-lg font-semibold text-primary-dark"
                        : "text-xs sm:text-sm text-secondary-muted"
                    }`}
                    aria-current={last ? "page" : undefined}
                  >
                    {crumb.label}
                  </span>
                )}
              </span>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {actions}
        </div>
      </div>

      {/* Search / Filters / Favorites row */}
      {showSearch || showFilters || showFavorites ? (
        <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 md:px-6 pb-3">
          {showSearch ? (
            <CrmSearchBar
              value={searchValue}
              onChange={onSearchChange}
              onSubmit={onSearchSubmit}
              inputRef={searchInputRef}
              shortcutTarget
              placeholder={meta.searchPlaceholder || "Search…"}
              className="flex-1 min-w-[180px] max-w-2xl"
            />
          ) : null}

          {showFilters ? (
            <CrmFilters
              activeFilterId={activeFilterId}
              onFilterChange={onFilterChange}
            />
          ) : null}

          {showFavorites ? (
            <CrmFavorites
              activeFilterId={activeFilterId}
              onSelectFilter={onFilterChange}
              allowSave
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
