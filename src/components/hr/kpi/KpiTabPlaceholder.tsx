"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type KpiTabPlaceholderProps = {
  title: string;
  description: string;
};

/** Shared placeholder card used by KPI dashboard tabs until feature logic lands. */
export function KpiTabPlaceholder({
  title,
  description,
}: KpiTabPlaceholderProps) {
  return (
    <Card className="border bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-[#0f766e]">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-600">{description}</p>
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">Coming Soon</p>
          <p className="mt-1 text-xs text-slate-500">
            This section will be available in a future update.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
