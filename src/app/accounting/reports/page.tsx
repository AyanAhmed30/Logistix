"use client";

import dynamic from "next/dynamic";
import { AccountingKpiSkeleton, AccountingChartSkeleton } from "@/components/accounting/AccountingSkeleton";

const AccountingReportsView = dynamic(
  () =>
    import("@/components/accounting/AccountingReportsView").then(
      (m) => m.AccountingReportsView
    ),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <AccountingKpiSkeleton count={4} />
        <div className="grid gap-3 lg:grid-cols-2">
          <AccountingChartSkeleton />
          <AccountingChartSkeleton />
        </div>
      </div>
    ),
  }
);

export default function AccountingReportsPage() {
  return <AccountingReportsView />;
}
