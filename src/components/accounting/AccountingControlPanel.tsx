"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { AccountingPageMeta } from "@/lib/accounting-navigation";

type Props = {
  meta: AccountingPageMeta;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit?: () => void;
  activeFilterId: string;
  onFilterChange: (filterId: string) => void;
};

export function AccountingControlPanel({
  meta,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  activeFilterId,
  onFilterChange,
}: Props) {
  const showSearch = meta.searchMode !== "none";
  const showFilters = meta.showFilters !== false && Boolean(meta.filters?.length);

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
      </div>

      {showSearch ? (
        <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 md:px-6 pb-3">
          <Input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearchSubmit?.();
            }}
            placeholder={
              meta.searchMode === "customers"
                ? "Search customers…"
                : meta.searchMode === "credit-notes"
                  ? "Search credit notes…"
                  : meta.searchMode === "refunds"
                    ? "Search refunds…"
                    : "Search invoices…"
            }
            className="h-8 max-w-sm rounded-sm text-sm"
          />
          {showFilters && meta.filters ? (
            <div className="flex flex-wrap items-center gap-1">
              {meta.filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onFilterChange(f.id)}
                  className={`h-7 px-2.5 rounded-sm text-xs font-medium border transition-colors ${
                    activeFilterId === f.id
                      ? "border-[#017e84] bg-[#017e84]/10 text-[#017e84]"
                      : "border-slate-200 bg-white text-secondary-muted hover:bg-slate-50"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
