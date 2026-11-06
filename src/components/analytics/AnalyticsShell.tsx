"use client";

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { OrganizationSwitcher } from "@/components/admin/OrganizationSwitcher";
import { CrmUserMenu } from "@/components/crm/CrmUserMenu";
import { AppNotificationBell } from "@/components/notifications/AppNotificationBell";
import { AnalyticsLoading } from "@/components/analytics/AnalyticsParts";
import {
  AdminOrganizationProvider,
  useAdminOrganization,
} from "@/contexts/AdminOrganizationContext";
import { DashboardAccessProvider } from "@/contexts/DashboardAccessContext";
import type { AdminOrganizationState } from "@/app/actions/organization-context";
import type { DashboardAccessState } from "@/lib/dashboard-access";

function ShellFrame({ access, children }: { access: DashboardAccessState; children: ReactNode }) {
  const { switchVersion } = useAdminOrganization();
  return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col">
      <header className="sticky top-0 z-50 bg-[#017e84]">
        <div className="h-12 px-2 sm:px-3 md:px-4 flex items-center justify-between gap-2">
          <Link
            href="/admin/dashboard"
            className="flex items-center gap-1.5 text-sm font-medium text-white hover:text-white/80"
          >
            <ArrowLeft className="h-4 w-4 text-white" aria-hidden />
            <span className="text-white">Dashboard</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <div className="crm-org-switcher [&_button]:h-8 [&_button]:border-white/25 [&_button]:bg-white/10 [&_button]:text-white [&_button]:hover:bg-white/20 [&_button]:max-w-[120px] sm:[&_button]:max-w-[200px] [&_svg]:text-white">
              <OrganizationSwitcher />
            </div>
            <AppNotificationBell tone="brand" />
            <CrmUserMenu access={access} />
          </div>
        </div>
      </header>
      <main key={switchVersion} className="flex-1 min-w-0 p-3 sm:p-4 md:p-5">
        <Suspense fallback={<AnalyticsLoading />}>{children}</Suspense>
      </main>
    </div>
  );
}

export function AnalyticsShell({
  access,
  initialOrganizationState,
  children,
}: {
  access: DashboardAccessState;
  initialOrganizationState: AdminOrganizationState;
  children: ReactNode;
}) {
  return (
    <AdminOrganizationProvider initial={initialOrganizationState}>
      <DashboardAccessProvider access={access}>
        <ShellFrame access={access}>{children}</ShellFrame>
      </DashboardAccessProvider>
    </AdminOrganizationProvider>
  );
}
