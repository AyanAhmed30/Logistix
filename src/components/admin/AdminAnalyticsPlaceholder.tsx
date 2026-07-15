"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export function AdminAnalyticsPlaceholder() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-primary-dark">Analytics</h1>
        <p className="text-secondary-muted mt-1">Business intelligence and reporting workspace</p>
      </div>

      <Card className="bg-white border shadow-sm">
        <CardHeader className="text-center py-10">
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <BarChart3 className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl text-primary-dark">Coming Soon</CardTitle>
          <CardDescription className="max-w-lg mx-auto text-base mt-2">
            Analytics dashboards, KPI reports, and trend insights will be available in this module.
            The module card is active so you can navigate here — content will be added in a future
            release.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-10 text-center text-sm text-secondary-muted">
          Use <span className="font-semibold text-primary-dark">Back to Modules</span> to return to
          the application home.
        </CardContent>
      </Card>
    </div>
  );
}
