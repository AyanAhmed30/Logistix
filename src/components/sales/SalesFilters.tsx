"use client";

import { usePathname } from "next/navigation";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getSalesFiltersForPath } from "@/lib/sales-navigation";

type Props = {
  activeFilterId: string;
  onFilterChange: (filterId: string) => void;
  disabled?: boolean;
};

export function SalesFilters({
  activeFilterId,
  onFilterChange,
  disabled = false,
}: Props) {
  const pathname = usePathname();
  const filters = getSalesFiltersForPath(pathname);
  const active = filters.find((f) => f.id === activeFilterId) || filters[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-8 gap-1.5 border-slate-200 bg-white text-primary-dark rounded-sm px-2.5 font-normal"
        >
          <Filter className="h-3.5 w-3.5 text-secondary-muted" />
          <span className="text-sm">{active?.label ?? "Filters"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-secondary-muted">
          Filters
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={active?.id || activeFilterId}
          onValueChange={onFilterChange}
        >
          {filters.map((filter) => (
            <DropdownMenuRadioItem
              key={filter.id}
              value={filter.id}
              className="cursor-pointer"
            >
              {filter.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
