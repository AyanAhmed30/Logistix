import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Users,
  Calendar,
  FileText,
  DollarSign,
  BarChart3,
} from "lucide-react";
import { HR_NAV_ITEMS } from "@/lib/hr-navigation";
import { requireHrModuleAccess } from "@/lib/hr-page-access";
import {
  defaultHrRouteForAccess,
  type HrModuleTab,
} from "@/lib/dashboard-access";
import { hasModulePermission } from "@/lib/module-permissions";

const DASHBOARD_CARDS: Array<{
  href: string;
  icon: typeof Users;
  title: string;
  description: string;
  permission: HrModuleTab;
}> = [
  {
    href: "/hr/employees",
    icon: Users,
    title: "Employee Profiles",
    description: "Manage employee information and records",
    permission: "employee_profile_management",
  },
  {
    href: "/hr/attendance",
    icon: Calendar,
    title: "Attendance & Leave",
    description: "Track attendance and manage leave requests",
    permission: "attendance_leave_tracking",
  },
  {
    href: "/hr/documents",
    icon: FileText,
    title: "Documents",
    description: "Manage contracts, certificates and policies",
    permission: "document_management",
  },
  {
    href: "/hr/payroll",
    icon: DollarSign,
    title: "Payroll",
    description: "Handle salary and payment processing",
    permission: "payroll_management",
  },
  {
    href: "/hr/reports",
    icon: BarChart3,
    title: "Reports",
    description: "Generate HR reports and analytics",
    permission: "report_generation",
  },
];

export default async function HrDashboardPage() {
  const access = await requireHrModuleAccess();

  if (!access.isSuperAdmin) {
    const defaultRoute = defaultHrRouteForAccess(access);
    if (defaultRoute !== "/hr") {
      redirect(defaultRoute);
    }
  }

  const visibleCards = DASHBOARD_CARDS.filter(
    (card) =>
      access.isSuperAdmin ||
      hasModulePermission(access.permissions, card.permission)
  );

  const dashboardLabel =
    HR_NAV_ITEMS.find((item) => item.id === "dashboard")?.label ?? "Dashboard";

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-3xl font-semibold text-slate-900">
          {dashboardLabel}
        </h2>
        <p className="mt-2 text-lg text-slate-600">
          Manage employees, attendance, documents, payroll and reports from one
          place.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
            >
              <Icon className="h-8 w-8 text-slate-900" />
              <h3 className="mt-3 text-lg font-semibold text-slate-900">
                {card.title}
              </h3>
              <p className="mt-2 text-sm text-slate-600">{card.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
