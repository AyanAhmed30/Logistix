"use client";

import { Building2, Check, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePortalOrganization } from "@/contexts/PortalOrganizationContext";

export function PortalOrganizationSwitcher() {
  const {
    organizationId,
    organizationName,
    organizations,
    canSwitch,
    isSwitching,
    switchOrganization,
  } = usePortalOrganization();

  const label = organizationName?.trim() || "—";

  if (organizations.length === 0) {
    return (
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-slate-400">
          Current Organization
        </p>
        <p className="text-sm font-semibold text-slate-900 truncate">{label}</p>
      </div>
    );
  }

  if (!canSwitch) {
    return (
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-slate-400">
          Current Organization
        </p>
        <p className="text-sm font-semibold text-slate-900 truncate">{label}</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1">
      <p className="text-[11px] uppercase tracking-wider text-slate-400">
        Current Organization
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-auto px-0 py-0 hover:bg-transparent text-sm font-semibold text-slate-900 gap-1.5 max-w-full justify-start"
            disabled={isSwitching}
          >
            {isSwitching ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-500" />
            ) : (
              <Building2 className="h-4 w-4 shrink-0 text-slate-500" />
            )}
            <span className="truncate">{label}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Switch organization</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {organizations.map((org) => {
            const active = org.id === organizationId;
            return (
              <DropdownMenuItem
                key={org.id}
                className="flex items-center justify-between gap-2 cursor-pointer"
                onClick={() => void switchOrganization(org.id)}
              >
                <span className="truncate">{org.organization_name}</span>
                {active ? <Check className="h-4 w-4 shrink-0 text-primary-accent" /> : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
