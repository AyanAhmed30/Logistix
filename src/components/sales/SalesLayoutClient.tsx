"use client";

import { Suspense, type ReactNode } from "react";
import { AdminOrganizationProvider } from "@/contexts/AdminOrganizationContext";
import { DashboardAccessProvider } from "@/contexts/DashboardAccessContext";
import { SalesShell } from "@/components/sales/SalesShell";
import { SalesPageSkeleton } from "@/components/sales/SalesSkeleton";
import type { DashboardAccessState } from "@/lib/dashboard-access";
import type { AdminOrganizationState } from "@/app/actions/organization-context";

type Props = {
  access: DashboardAccessState;
  initialOrganizationState: AdminOrganizationState;
  children: ReactNode;
};

export function SalesLayoutClient({
  access,
  initialOrganizationState,
  children,
}: Props) {
  return (
    <AdminOrganizationProvider initial={initialOrganizationState}>
      <DashboardAccessProvider access={access}>
        <Suspense fallback={<SalesPageSkeleton />}>
          <SalesShell access={access}>{children}</SalesShell>
        </Suspense>
      </DashboardAccessProvider>
    </AdminOrganizationProvider>
  );
}
