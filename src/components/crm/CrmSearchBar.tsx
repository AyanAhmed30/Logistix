"use client";

import type { RefObject } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CrmSearchScope } from "@/lib/crm-navigation";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  scope?: CrmSearchScope;
  disabled?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  shortcutTarget?: boolean;
  className?: string;
};

/** Odoo-style search: wide field with trailing filter caret affordance. */
export function CrmSearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = "Search…",
  disabled = false,
  inputRef,
  shortcutTarget = true,
  className,
}: Props) {
  return (
    <form
      className={cn("relative flex-1 min-w-[140px] max-w-xl", className)}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
      role="search"
    >
      <Search
        className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary-muted pointer-events-none"
        aria-hidden
      />
      <Input
        ref={inputRef}
        data-crm-search={shortcutTarget ? true : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="h-8 pl-8 pr-8 bg-white border-slate-200 rounded-sm text-sm focus-visible:ring-[#017e84]/25 focus-visible:border-[#017e84]"
        aria-label="Search"
        autoComplete="off"
      />
      <ChevronDown
        className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-secondary-muted pointer-events-none opacity-60"
        aria-hidden
      />
    </form>
  );
}
