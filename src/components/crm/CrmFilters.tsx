"use client";

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
import { CRM_CONTROL_FILTERS } from "@/lib/crm-navigation";

type Props = {
  activeFilterId: string;
  onFilterChange: (filterId: string) => void;
  disabled?: boolean;
};

export function CrmFilters({
  activeFilterId,
  onFilterChange,
  disabled = false,
}: Props) {
  const active = CRM_CONTROL_FILTERS.find((f) => f.id === activeFilterId);

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
          value={activeFilterId}
          onValueChange={onFilterChange}
        >
          {CRM_CONTROL_FILTERS.map((filter) => (
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
