"use client";

import { useEffect, useState } from "react";
import type { Employee } from "@/app/actions/employees";
import { GoalsManagementTab } from "@/components/hr/kpi/GoalsManagementTab";
import { KpiScoreTab } from "@/components/hr/kpi/KpiScoreTab";
import { AttendanceSummaryTab } from "@/components/hr/kpi/AttendanceSummaryTab";
import { PayrollSummaryTab } from "@/components/hr/kpi/PayrollSummaryTab";
import { AnalyticsTab } from "@/components/hr/kpi/AnalyticsTab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Target,
  BarChart3,
  Calendar,
  DollarSign,
  LineChart,
} from "lucide-react";

export type KpiDashboardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
  isLoading?: boolean;
};

type KpiTabId =
  | "goals"
  | "score"
  | "attendance"
  | "payroll"
  | "analytics";

const KPI_TABS: Array<{
  id: KpiTabId;
  label: string;
  icon: typeof Target;
}> = [
  { id: "goals", label: "Goals & Management", icon: Target },
  { id: "score", label: "KPI Score", icon: BarChart3 },
  { id: "attendance", label: "Attendance Summary", icon: Calendar },
  { id: "payroll", label: "Payroll Summary", icon: DollarSign },
  { id: "analytics", label: "Analytics", icon: LineChart },
];

function formatLabel(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function statusBadgeClass(status: Employee["status"]) {
  switch (status) {
    case "active":
      return "border-transparent bg-emerald-100 text-emerald-700";
    case "on_leave":
      return "border-transparent bg-sky-100 text-sky-700";
    case "inactive":
      return "border-transparent bg-slate-100 text-slate-700";
    case "suspended":
      return "border-transparent bg-amber-100 text-amber-800";
    case "resigned":
    case "terminated":
      return "border-transparent bg-red-100 text-red-700";
    default:
      return "border-transparent bg-slate-100 text-slate-700";
  }
}

function InfoField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

function renderActiveTab(tab: KpiTabId, employee: Employee) {
  switch (tab) {
    case "goals":
      return <GoalsManagementTab employee={employee} />;
    case "score":
      return <KpiScoreTab employee={employee} />;
    case "attendance":
      return <AttendanceSummaryTab employee={employee} />;
    case "payroll":
      return <PayrollSummaryTab employee={employee} />;
    case "analytics":
      return <AnalyticsTab employee={employee} />;
    default:
      return null;
  }
}

/**
 * Employee KPI Dashboard shell.
 * Tab bodies are intentionally placeholders so each section can be filled in later.
 */
export function KpiDashboard({
  open,
  onOpenChange,
  employee,
  isLoading = false,
}: KpiDashboardProps) {
  const [activeTab, setActiveTab] = useState<KpiTabId>("goals");

  useEffect(() => {
    if (open) {
      setActiveTab("goals");
    }
  }, [open, employee?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="text-2xl text-slate-900">
            {employee?.full_name
              ? `${employee.full_name} — KPI Dashboard`
              : "KPI Dashboard"}
          </DialogTitle>
          <DialogDescription>
            Review goals, scores, attendance, payroll, and analytics for this
            employee.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-slate-500">
            Loading employee KPI dashboard...
          </div>
        ) : !employee ? (
          <div className="py-16 text-center text-sm text-slate-500">
            No employee selected.
          </div>
        ) : (
          <div className="space-y-5">
            <Card className="border bg-white shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-[#0f766e]">
                  Employee Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <InfoField label="Employee Name" value={employee.full_name} />
                  <InfoField
                    label="Employee ID"
                    value={employee.employee_id || "—"}
                  />
                  <InfoField
                    label="Department"
                    value={employee.department || "—"}
                  />
                  <InfoField
                    label="Designation"
                    value={employee.designation || "—"}
                  />
                  <InfoField
                    label="Employment Status"
                    value={
                      <Badge className={statusBadgeClass(employee.status)}>
                        {formatLabel(employee.status)}
                      </Badge>
                    }
                  />
                  <InfoField
                    label="Date of Joining"
                    value={formatDate(employee.joining_date)}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
              {KPI_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <Button
                    key={tab.id}
                    type="button"
                    size="sm"
                    variant={isActive ? "default" : "outline"}
                    className={
                      isActive
                        ? "bg-slate-900 text-white hover:bg-slate-800"
                        : "text-slate-700"
                    }
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <Icon className="mr-1.5 h-4 w-4" />
                    {tab.label}
                  </Button>
                );
              })}
            </div>

            <div key={`${employee.id}:${activeTab}`}>
              {renderActiveTab(activeTab, employee)}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
