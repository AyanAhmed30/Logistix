"use client";

import { Suspense, type ReactNode } from "react";
import { AdminOrganizationProvider } from "@/contexts/AdminOrganizationContext";
import { DashboardAccessProvider } from "@/contexts/DashboardAccessContext";
import { CrmShell } from "@/components/crm/CrmShell";
import { CrmPageSkeleton } from "@/components/crm/CrmSkeleton";
import type { DashboardAccessState } from "@/lib/dashboard-access";
import type { AdminOrganizationState } from "@/app/actions/organization-context";

type Props = {
  access: DashboardAccessState;
  initialOrganizationState: AdminOrganizationState;
  children: ReactNode;
};

export function CrmLayoutClient({
  access,
  initialOrganizationState,
  children,
}: Props) {
  return (
    <AdminOrganizationProvider initial={initialOrganizationState}>
      <DashboardAccessProvider access={access}>
        <Suspense fallback={<CrmPageSkeleton />}>
          <CrmShell access={access}>{children}</CrmShell>
        </Suspense>
      </DashboardAccessProvider>
    </AdminOrganizationProvider>
  );
}
