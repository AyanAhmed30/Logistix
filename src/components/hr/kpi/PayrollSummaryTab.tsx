"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Employee } from "@/app/actions/employees";
import { getPayroll, type PayrollRecord } from "@/app/actions/payroll";
import {
  calculateNetSalary,
  calculatePayrollStatistics,
  formatCurrency,
} from "@/lib/payroll-utils";
import { formatGoalMonthLabel } from "@/lib/kpi-goal-month";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PayrollSummaryTabProps = {
  employee: Employee;
};

function OverviewCard({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <Card className="border bg-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function sortByPayrollMonthDesc(records: PayrollRecord[]) {
  return [...records].sort((a, b) => {
    const aDate = String(a.payment_date || a.created_at || "").slice(0, 10);
    const bDate = String(b.payment_date || b.created_at || "").slice(0, 10);
    if (aDate && bDate && aDate !== bDate) {
      return bDate.localeCompare(aDate);
    }
    return String(b.created_at).localeCompare(String(a.created_at));
  });
}

export function PayrollSummaryTab({ employee }: PayrollSummaryTabProps) {
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadPayrollData = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getPayroll(employee.id);
      if ("error" in result) {
        toast.error(result.error);
        setRecords([]);
        return;
      }
      setRecords(result.payrollRecords || []);
    } catch (err) {
      toast.error(String(err || "Failed to load payroll summary"));
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, [employee.id]);

  useEffect(() => {
    void loadPayrollData();
  }, [loadPayrollData]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") {
        void loadPayrollData();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadPayrollData]);

  const sortedRecords = useMemo(
    () => sortByPayrollMonthDesc(records),
    [records],
  );

  const latestRecord = sortedRecords[0] || null;

  const overview = useMemo(() => {
    if (!latestRecord) {
      return {
        basicSalary: 0,
        hardshipAllowance: 0,
        deductions: 0,
        netSalary: 0,
      };
    }

    return {
      basicSalary: latestRecord.salary || 0,
      hardshipAllowance: latestRecord.hardship_allowance || 0,
      deductions: latestRecord.deductions || 0,
      netSalary: calculateNetSalary(latestRecord),
    };
  }, [latestRecord]);

  const statistics = useMemo(
    () => calculatePayrollStatistics(records),
    [records],
  );

  if (isLoading) {
    return (
      <div className="py-16 text-center text-sm text-slate-500">
        Loading payroll summary...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Payroll Summary</h3>
        <p className="mt-1 text-sm text-slate-600">
          Read-only payroll overview and history for this employee.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <OverviewCard
          title="Basic Salary"
          value={formatCurrency(overview.basicSalary)}
        />
        <OverviewCard
          title="Hardship Allowance"
          value={formatCurrency(overview.hardshipAllowance)}
        />
        <OverviewCard
          title="Deductions"
          value={formatCurrency(overview.deductions)}
        />
        <OverviewCard
          title="Net Salary"
          value={formatCurrency(overview.netSalary)}
        />
      </div>

      <Card className="border bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">
            Payroll History
          </CardTitle>
          <CardDescription>
            Newest payroll month first. Values are taken from each payroll
            record.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedRecords.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center text-sm text-slate-500">
              No payroll records available.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payroll Month</TableHead>
                    <TableHead>Basic Salary</TableHead>
                    <TableHead>Hardship Allowance</TableHead>
                    <TableHead>Deductions</TableHead>
                    <TableHead>Net Salary</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {formatGoalMonthLabel(record.payment_date)}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(record.salary || 0)}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(record.hardship_allowance || 0)}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(record.deductions || 0)}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(calculateNetSalary(record))}
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        <p className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-700">
                          {record.notes?.trim() ? record.notes : "—"}
                        </p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">
            Payroll Statistics
          </CardTitle>
          <CardDescription>
            Aggregated from all payroll records for this employee.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              title="Average Net Salary"
              value={formatCurrency(statistics.averageNetSalary)}
            />
            <StatCard
              title="Highest Net Salary"
              value={formatCurrency(statistics.highestNetSalary)}
            />
            <StatCard
              title="Lowest Net Salary"
              value={formatCurrency(
                statistics.totalRecords === 0
                  ? 0
                  : statistics.lowestNetSalary,
              )}
            />
            <StatCard
              title="Total Hardship Allowance"
              value={formatCurrency(statistics.totalHardshipAllowance)}
            />
            <StatCard
              title="Total Deductions"
              value={formatCurrency(statistics.totalDeductions)}
            />
            <StatCard
              title="Total Payroll Records"
              value={String(statistics.totalRecords)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
