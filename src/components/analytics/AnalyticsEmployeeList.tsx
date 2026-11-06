"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSalesEmployees, type AnalyticsEmployee } from "@/app/actions/analytics/sales";
import { getOperationsEmployees } from "@/app/actions/analytics/operations";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useLoad } from "@/components/analytics/AnalyticsDashboardKit";
import { AnalyticsEmpty, AnalyticsError } from "@/components/analytics/AnalyticsParts";

const DEPARTMENTS = {
  sales: { title: "Sales", load: getSalesEmployees, empty: "No sales agents found" },
  operations: { title: "Operations", load: getOperationsEmployees, empty: "No Operations employees found" },
};

export function AnalyticsEmployeeList({
  department,
  embedded = false,
}: {
  department: keyof typeof DEPARTMENTS;
  embedded?: boolean;
}) {
  const { switchVersion } = useAdminOrganization();
  const config = DEPARTMENTS[department];
  const { data, error, onRetry } = useLoad<{ employees: AnalyticsEmployee[] }>(
    () => config.load(),
    `${department}|${switchVersion}`
  );

  return (
    <div className="space-y-4">
      {embedded ? (
        <h2 className="text-base font-semibold text-primary-dark">{config.title} team</h2>
      ) : (
        <div className="space-y-2">
          <Link href="/analytics" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-[#017e84]">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Analytics
          </Link>
          <h1 className="text-xl font-semibold text-primary-dark">{config.title}</h1>
        </div>
      )}

      {error ? (
        <AnalyticsError message={error} onRetry={onRetry} />
      ) : !data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 animate-pulse" aria-busy="true" aria-label="Loading employees">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-20 rounded-lg border border-slate-200 bg-white" />
          ))}
        </div>
      ) : data.employees.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white">
          <AnalyticsEmpty title={config.empty} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.employees.map((employee) => (
            <Link
              key={employee.id}
              href={`/analytics/${department}/${encodeURIComponent(employee.id)}`}
              className="flex h-20 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-center text-sm font-semibold text-primary-dark hover:border-[#017e84] hover:text-[#017e84] focus-visible:outline-2 focus-visible:outline-[#017e84]"
            >
              <span className="truncate">{employee.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
