"use client";

import { Suspense, type ReactNode } from "react";
import { AdminOrganizationProvider } from "@/contexts/AdminOrganizationContext";
import { DashboardAccessProvider } from "@/contexts/DashboardAccessContext";
import { AccountingShell } from "@/components/accounting/AccountingShell";
import type { DashboardAccessState } from "@/lib/dashboard-access";
import type { AdminOrganizationState } from "@/app/actions/organization-context";

type Props = {
  access: DashboardAccessState;
  initialOrganizationState: AdminOrganizationState;
  children: ReactNode;
};

function AccountingPageSkeleton() {
  return (
    <div className="space-y-3 p-1 animate-pulse">
      <div className="h-8 w-48 bg-slate-200 rounded-sm" />
      <div className="h-40 bg-slate-100 border border-slate-200 rounded-sm" />
    </div>
  );
}

export function AccountingLayoutClient({
  access,
  initialOrganizationState,
  children,
}: Props) {
  return (
    <AdminOrganizationProvider initial={initialOrganizationState}>
      <DashboardAccessProvider access={access}>
        <Suspense fallback={<AccountingPageSkeleton />}>
          <AccountingShell access={access}>{children}</AccountingShell>
        </Suspense>
      </DashboardAccessProvider>
    </AdminOrganizationProvider>
  );
}
