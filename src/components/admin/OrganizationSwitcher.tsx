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
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { ADMIN_CONTEXT_LABEL } from "@/lib/auth/super-admin";

export function OrganizationSwitcher() {
  const {
    organizationId,
    organizationName,
    organizations,
    isSuperAdmin,
    isAdminContext,
    isSwitching,
    switchOrganization,
    switchToAdmin,
  } = useAdminOrganization();

  if (!isSuperAdmin && organizations.length === 0) {
    return (
      <div className="hidden md:flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-secondary-muted">
        <Building2 className="h-4 w-4 shrink-0" />
        <span>No organizations</span>
      </div>
    );
  }

  const label = isAdminContext
    ? ADMIN_CONTEXT_LABEL
    : organizationName || "Select organization";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 border-slate-200 bg-white hover:bg-slate-50 text-primary-dark max-w-[240px]"
          disabled={isSwitching}
        >
          {isSwitching ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <Building2 className="h-4 w-4 shrink-0" />
          )}
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Switch organization</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isSuperAdmin ? (
          <>
            <DropdownMenuItem
              className="flex items-center justify-between gap-2 cursor-pointer"
              onClick={() => void switchToAdmin()}
            >
              <span className="truncate">{ADMIN_CONTEXT_LABEL}</span>
              {isAdminContext ? (
                <Check className="h-4 w-4 shrink-0 text-primary-accent" />
              ) : null}
            </DropdownMenuItem>
            {organizations.length > 0 ? <DropdownMenuSeparator /> : null}
          </>
        ) : null}
        {organizations.map((org) => {
          const active = !isAdminContext && org.id === organizationId;
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
  );
}
