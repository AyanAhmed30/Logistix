"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { ADMIN_CONTEXT_LABEL } from "@/lib/auth/super-admin";

export function AdminAnalyticsPlaceholder() {
  const { organizationName, isAdminContext } = useAdminOrganization();
  const contextLabel = isAdminContext ? ADMIN_CONTEXT_LABEL : organizationName;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-primary-dark">Analytics</h1>
        <p className="text-secondary-muted mt-1">
          Business intelligence and reporting
          {contextLabel ? (
            <>
              {" "}
              for <span className="font-semibold text-primary-dark">{contextLabel}</span>
            </>
          ) : null}
        </p>
      </div>

      <Card className="bg-white border shadow-sm">
        <CardHeader className="text-center py-10">
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <BarChart3 className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl text-primary-dark">Coming Soon</CardTitle>
          <CardDescription className="max-w-lg mx-auto text-base mt-2">
            Analytics dashboards, KPI reports, and trend insights will be scoped to the
            organization selected in the header. When this module launches, switching
            organizations will refresh analytics instantly without leaving the page.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-10 text-center text-sm text-secondary-muted">
          {contextLabel ? (
            <p>
              Currently viewing: <span className="font-semibold text-primary-dark">{contextLabel}</span>
            </p>
          ) : (
            <p>Select an organization from the header to scope future analytics.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
