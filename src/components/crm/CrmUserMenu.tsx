"use client";

import { SignOutForm } from "@/components/auth/SignOutForm";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, LayoutDashboard, LogOut, User } from "lucide-react";
import Link from "next/link";
import type { DashboardAccessState } from "@/lib/dashboard-access";

type Props = {
  access: DashboardAccessState;
};

export function CrmUserMenu({ access }: Props) {
  const displayName = access.fullName?.trim() || access.username || "User";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 max-w-[160px] h-9 px-2 rounded-md text-white/90 hover:bg-white/10 transition-colors"
          aria-label="User menu"
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">
            {displayName.charAt(0).toUpperCase()}
          </span>
          <span className="hidden md:inline truncate text-sm font-medium">
            {displayName}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-70 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-secondary-muted" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-primary-dark truncate">
                {displayName}
              </p>
              <p className="text-[11px] text-secondary-muted truncate">
                @{access.username}
              </p>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/admin/dashboard" className="cursor-pointer gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <SignOutForm>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full cursor-pointer gap-2">
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </DropdownMenuItem>
        </SignOutForm>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
