import type { LucideIcon } from "lucide-react";
import {
  Home,
  Users,
  Calendar,
  FileText,
  DollarSign,
  BarChart3,
} from "lucide-react";
import type { HrModuleTab } from "@/lib/dashboard-access";

export type HrNavId =
  | "dashboard"
  | "employees"
  | "attendance"
  | "documents"
  | "payroll"
  | "reports";

export type HrNavItem = {
  id: HrNavId;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Child permission key; omit for dashboard (shown when user has full HR access). */
  permission?: HrModuleTab;
};

/** Sidebar items for the HR workspace (route-based, CRM-style). */
export const HR_NAV_ITEMS: HrNavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/hr",
    icon: Home,
  },
  {
    id: "employees",
    label: "Employee Profile Management",
    href: "/hr/employees",
    icon: Users,
    permission: "employee_profile_management",
  },
  {
    id: "attendance",
    label: "Attendance & Leave Tracking",
    href: "/hr/attendance",
    icon: Calendar,
    permission: "attendance_leave_tracking",
  },
  {
    id: "documents",
    label: "Document Management",
    href: "/hr/documents",
    icon: FileText,
    permission: "document_management",
  },
  {
    id: "payroll",
    label: "Payroll Management",
    href: "/hr/payroll",
    icon: DollarSign,
    permission: "payroll_management",
  },
  {
    id: "reports",
    label: "Report Generation",
    href: "/hr/reports",
    icon: BarChart3,
    permission: "report_generation",
  },
];

export function getHrNavItemByPath(pathname: string): HrNavItem | undefined {
  if (pathname === "/hr" || pathname === "/hr/") {
    return HR_NAV_ITEMS.find((item) => item.id === "dashboard");
  }
  return HR_NAV_ITEMS.find(
    (item) => item.id !== "dashboard" && pathname.startsWith(item.href)
  );
}

export function defaultHrRoute(): string {
  return "/hr";
}

export function filterHrNavItems(
  items: HrNavItem[],
  options: {
    isSuperAdmin: boolean;
    permissions: string[];
    visibleTabs: HrModuleTab[];
  }
): HrNavItem[] {
  if (options.isSuperAdmin) {
    return items;
  }

  const allowed = new Set(options.visibleTabs);
  return items.filter((item) => {
    if (!item.permission) {
      // Dashboard only when user has full HR access (all child tabs)
      return allowed.size === 5;
    }
    return allowed.has(item.permission);
  });
}
