import type { PayrollRecord } from "@/app/actions/payroll";

export function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function calculateGrossSalary(
  basicSalary: number,
  hardshipAllowance: number,
): number {
  return (basicSalary || 0) + (hardshipAllowance || 0);
}

export function calculateNetSalaryFromParts(
  basicSalary: number,
  hardshipAllowance: number,
  deductions: number,
): number {
  return calculateGrossSalary(basicSalary, hardshipAllowance) - (deductions || 0);
}

export function calculateNetSalary(record: PayrollRecord): number {
  if (typeof record.net_salary === "number" && Number.isFinite(record.net_salary)) {
    return record.net_salary;
  }
  return calculateNetSalaryFromParts(
    record.salary,
    record.hardship_allowance || 0,
    record.deductions || 0,
  );
}

/** Inclusive window: from first day of (current month - 1) through today. */
export function isWithinLastTwoMonths(dateValue: string | null | undefined) {
  if (!dateValue) return false;
  const date = new Date(`${dateValue.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  end.setHours(23, 59, 59, 999);

  return date >= start && date <= end;
}

export function calculatePayrollStatistics(records: PayrollRecord[]) {
  if (records.length === 0) {
    return {
      averageNetSalary: 0,
      highestNetSalary: 0,
      lowestNetSalary: 0,
      totalHardshipAllowance: 0,
      totalDeductions: 0,
      totalRecords: 0,
    };
  }

  const netSalaries = records.map(calculateNetSalary);
  const totalHardshipAllowance = records.reduce(
    (sum, r) => sum + (r.hardship_allowance || 0),
    0,
  );
  const totalDeductions = records.reduce(
    (sum, r) => sum + (r.deductions || 0),
    0,
  );

  return {
    averageNetSalary: netSalaries.reduce((a, b) => a + b, 0) / records.length,
    highestNetSalary: Math.max(...netSalaries),
    lowestNetSalary: Math.min(...netSalaries),
    totalHardshipAllowance,
    totalDeductions,
    totalRecords: records.length,
  };
}
