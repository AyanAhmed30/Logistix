"use client";

import Link from "next/link";
import type { RefObject, ReactNode } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SalesSearchBar } from "@/components/sales/SalesSearchBar";
import { SalesFilters } from "@/components/sales/SalesFilters";
import { SalesFavorites } from "@/components/sales/SalesFavorites";
import type { SalesPageMeta } from "@/lib/sales-navigation";

type Props = {
  meta: SalesPageMeta;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit?: () => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  activeFilterId: string;
  onFilterChange: (filterId: string) => void;
  onCreate?: () => void;
  actions?: ReactNode;
};

export function SalesControlPanel({
  meta,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  searchInputRef,
  activeFilterId,
  onFilterChange,
  onCreate,
  actions,
}: Props) {
  const showSearch = meta.searchMode !== "none";
  const showFilters = meta.showFilters !== false && showSearch;
  const showFavorites = meta.showFavorites !== false && showSearch;
  const showCreate = meta.showCreate === true;

  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 md:px-6 pt-3 pb-2">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1 min-w-0 flex-1"
        >
          {meta.breadcrumbs.map((crumb, index) => {
            const last = index === meta.breadcrumbs.length - 1;
            return (
              <span
                key={`${crumb.label}-${index}`}
                className="flex items-center gap-1 min-w-0"
              >
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
          {showCreate ? (
            <Button
              size="sm"
              className="h-8 gap-1.5 bg-[#017e84] hover:bg-[#016970] text-white rounded-sm"
              onClick={onCreate}
            >
              <Plus className="h-4 w-4" />
              {meta.createLabel || "New"}
            </Button>
          ) : null}
        </div>
      </div>

      {showSearch || showFilters || showFavorites ? (
        <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 md:px-6 pb-3">
          {showSearch ? (
            <SalesSearchBar
              value={searchValue}
              onChange={onSearchChange}
              onSubmit={onSearchSubmit}
              inputRef={searchInputRef}
              placeholder={meta.searchPlaceholder || "Search…"}
              className="flex-1 min-w-[180px] max-w-2xl"
            />
          ) : null}

          {showFilters ? (
            <SalesFilters
              activeFilterId={activeFilterId}
              onFilterChange={onFilterChange}
            />
          ) : null}

          {showFavorites ? (
            <SalesFavorites
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
