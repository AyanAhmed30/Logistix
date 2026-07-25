"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { CRM_CONTROL_FILTERS } from "@/lib/crm-navigation";

export const CRM_FAVORITES_STORAGE_KEY = "crm_favorites_v1";

type CrmFavoriteEntry = {
  id: string;
  label: string;
  filterId: string;
};

function readFavorites(): CrmFavoriteEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CRM_FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CrmFavoriteEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFavorites(entries: CrmFavoriteEntry[]) {
  try {
    localStorage.setItem(CRM_FAVORITES_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore
  }
}

type Props = {
  activeFilterId: string;
  onSelectFilter?: (filterId: string) => void;
  allowSave?: boolean;
};

export function CrmFavorites({
  activeFilterId,
  onSelectFilter,
  allowSave = true,
}: Props) {
  const [favorites, setFavorites] = useState<CrmFavoriteEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setFavorites(readFavorites());
    setHydrated(true);
  }, []);

  function saveCurrent() {
    if (!allowSave) return;
    const known = CRM_CONTROL_FILTERS.find((f) => f.id === activeFilterId);
    const label = known?.label ?? `Filter: ${activeFilterId}`;
    const entry: CrmFavoriteEntry = {
      id: `${activeFilterId}-${Date.now()}`,
      label,
      filterId: activeFilterId,
    };
    const next = [
      entry,
      ...favorites.filter((f) => f.filterId !== activeFilterId),
    ].slice(0, 12);
    setFavorites(next);
    writeFavorites(next);
    toast.success("Saved to Favorites");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-slate-200 bg-white text-primary-dark rounded-sm px-2.5 font-normal"
          aria-label="Favorites"
        >
          <Star
            className={`h-3.5 w-3.5 ${
              favorites.length > 0 ? "fill-amber-400 text-amber-500" : "text-secondary-muted"
            }`}
          />
          <span className="hidden sm:inline text-sm">Favorites</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-secondary-muted">
          Favorites
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!hydrated ? (
          <DropdownMenuItem disabled className="text-xs text-secondary-muted">
            Loading…
          </DropdownMenuItem>
        ) : favorites.length === 0 ? (
          <DropdownMenuItem disabled className="text-xs text-secondary-muted">
            No favorites yet
          </DropdownMenuItem>
        ) : (
          favorites.map((entry) => (
            <DropdownMenuItem
              key={entry.id}
              className="cursor-pointer"
              onClick={() => onSelectFilter?.(entry.filterId)}
            >
              <Star className="h-3 w-3 mr-2 fill-amber-400 text-amber-500" />
              {entry.label}
            </DropdownMenuItem>
          ))
        )}
        {allowSave ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={saveCurrent} className="cursor-pointer">
              Save current search
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
