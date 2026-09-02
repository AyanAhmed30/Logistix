import type { Employee } from "@/app/actions/employees";
import type { AttendanceRecord } from "@/app/actions/attendance";
import type { LeaveRequest } from "@/app/actions/leave";
import type { EmployeeDocument } from "@/app/actions/documents";
import type { PayrollRecord } from "@/app/actions/payroll";
import type { GeneratedReport } from "@/app/actions/reports";
import { calculateAttendanceDistribution } from "@/lib/analytics-utils";
import {
  calculateNetSalary,
  formatCurrency,
} from "@/lib/payroll-utils";

export type ReportBuildContext = {
  organizationName: string;
  generatedAt?: Date;
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  documents: EmployeeDocument[];
  payrollRecords: PayrollRecord[];
};

function formatLabel(value: string | null | undefined) {
  if (!value) return "Unspecified";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function countBy(
  values: Array<string | null | undefined>,
): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const value of values) {
    const key = formatLabel(value);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

function linesFromCounts(counts: Array<[string, number]>) {
  if (counts.length === 0) return ["  None"];
  return counts.map(([label, count]) => `  ${label}: ${count}`);
}

function employeeNameMap(employees: Employee[]) {
  return new Map(employees.map((employee) => [employee.id, employee.full_name]));
}

function section(title: string, bodyLines: string[]) {
  return [`${title}`, "".padEnd(title.length, "-"), ...bodyLines, ""];
}

export function reportTypeLabel(type: GeneratedReport["report_type"]) {
  switch (type) {
    case "employee_summary":
      return "HR Summary";
    case "attendance":
      return "Attendance";
    case "payroll":
      return "Payroll";
    case "leave":
      return "Leave";
    case "documents":
      return "Documents";
    default:
      return formatLabel(type);
  }
}

export function buildHrSummaryReport(context: ReportBuildContext): string {
  const generatedAt = context.generatedAt || new Date();
  const attendance = calculateAttendanceDistribution(context.attendanceRecords);
  const leaveByStatus = countBy(context.leaveRequests.map((r) => r.status));
  const leaveByType = countBy(context.leaveRequests.map((r) => r.leave_type));
  const docsByCategory = countBy(context.documents.map((d) => d.category));
  const payrollPaid = context.payrollRecords.filter(
    (r) => r.payment_status === "paid",
  ).length;
  const payrollPending = context.payrollRecords.filter(
    (r) => r.payment_status === "pending",
  ).length;
  const payrollFailed = context.payrollRecords.filter(
    (r) => r.payment_status === "failed",
  ).length;
  const totalNet = context.payrollRecords.reduce(
    (sum, record) => sum + calculateNetSalary(record),
    0,
  );

  const lines = [
    "HR SUMMARY REPORT",
    "=================",
    "",
    `Organization: ${context.organizationName || "N/A"}`,
    `Date Generated: ${generatedAt.toLocaleString()}`,
    "",
    ...section("Workforce Overview", [
      `Total Employees: ${context.employees.length}`,
    ]),
    ...section(
      "Employees by Department",
      linesFromCounts(countBy(context.employees.map((e) => e.department))),
    ),
    ...section(
      "Employees by Employment Status",
      linesFromCounts(countBy(context.employees.map((e) => e.status))),
    ),
    ...section(
      "Employees by Employment Type",
      linesFromCounts(countBy(context.employees.map((e) => e.employment_type))),
    ),
    ...section("Attendance Summary", [
      `Total Attendance Records: ${context.attendanceRecords.length}`,
      `Present: ${attendance.present}`,
      `Absent: ${attendance.absent}`,
      `Late: ${attendance.late}`,
      `Half Day: ${attendance.halfDay}`,
      `Leave: ${attendance.leave}`,
      `Holiday: ${attendance.holiday}`,
    ]),
    ...section("Leave Summary", [
      `Total Leave Requests: ${context.leaveRequests.length}`,
      "By Status:",
      ...linesFromCounts(leaveByStatus),
      "By Type:",
      ...linesFromCounts(leaveByType),
    ]),
    ...section("Payroll Summary", [
      `Total Payroll Records: ${context.payrollRecords.length}`,
      `Paid: ${payrollPaid}`,
      `Pending: ${payrollPending}`,
      `Failed: ${payrollFailed}`,
      `Total Net Salary: ${formatCurrency(totalNet)}`,
    ]),
    ...section("Documents Summary", [
      `Total Documents: ${context.documents.length}`,
      "By Category:",
      ...linesFromCounts(docsByCategory),
    ]),
  ];

  return lines.join("\n").trimEnd();
}

export function buildAttendanceReport(context: ReportBuildContext): string {
  const generatedAt = context.generatedAt || new Date();
  const names = employeeNameMap(context.employees);
  const attendance = calculateAttendanceDistribution(context.attendanceRecords);
  const perEmployee = new Map<
    string,
    ReturnType<typeof calculateAttendanceDistribution>
  >();

  for (const record of context.attendanceRecords) {
    const current =
      perEmployee.get(record.employee_id) ||
      calculateAttendanceDistribution([]);
    const next = { ...current };
    switch (record.attendance_type) {
      case "present":
        next.present += 1;
        break;
      case "absent":
        next.absent += 1;
        break;
      case "late":
        next.late += 1;
        break;
      case "half_day":
        next.halfDay += 1;
        break;
      case "leave":
        next.leave += 1;
        break;
      case "holiday":
        next.holiday += 1;
        break;
      default:
        break;
    }
    perEmployee.set(record.employee_id, next);
  }

  const employeeLines =
    perEmployee.size === 0
      ? ["  No employee attendance summaries available."]
      : Array.from(perEmployee.entries()).map(([employeeId, summary]) => {
          const name = names.get(employeeId) || "Unknown Employee";
          return [
            `  ${name}`,
            `    Present: ${summary.present} | Absent: ${summary.absent} | Late: ${summary.late}`,
            `    Half Day: ${summary.halfDay} | Leave: ${summary.leave} | Holiday: ${summary.holiday}`,
          ].join("\n");
        });

  const recordLines =
    context.attendanceRecords.length === 0
      ? ["  No attendance records found."]
      : context.attendanceRecords.map((record) => {
          const name = names.get(record.employee_id) || "Unknown Employee";
          return `  ${record.date} | ${name} | ${formatLabel(record.attendance_type)} | ${formatLabel(record.status)}`;
        });

  const lines = [
    "ATTENDANCE REPORT",
    "=================",
    "",
    `Date Generated: ${generatedAt.toLocaleString()}`,
    "",
    ...section("Totals", [
      `Total Attendance Records: ${context.attendanceRecords.length}`,
      `Present: ${attendance.present}`,
      `Absent: ${attendance.absent}`,
      `Late: ${attendance.late}`,
      `Half Day: ${attendance.halfDay}`,
      `Leave: ${attendance.leave}`,
      `Holiday: ${attendance.holiday}`,
    ]),
    ...section("Employee Attendance Summary", employeeLines),
    ...section("Attendance Records", recordLines),
  ];

  return lines.join("\n").trimEnd();
}

export function buildPayrollReport(context: ReportBuildContext): string {
  const generatedAt = context.generatedAt || new Date();
  const names = employeeNameMap(context.employees);

  let totalBasic = 0;
  let totalHardship = 0;
  let totalDeductions = 0;
  let totalNet = 0;

  const recordLines =
    context.payrollRecords.length === 0
      ? ["  No payroll records found."]
      : context.payrollRecords.map((record) => {
          const name = names.get(record.employee_id) || "Unknown Employee";
          const net = calculateNetSalary(record);
          totalBasic += record.salary || 0;
          totalHardship += record.hardship_allowance || 0;
          totalDeductions += record.deductions || 0;
          totalNet += net;

          return [
            `  ${name}`,
            `    Payroll Date: ${record.payment_date || "N/A"}`,
            `    Basic Salary: ${formatCurrency(record.salary || 0)}`,
            `    Hardship Allowance: ${formatCurrency(record.hardship_allowance || 0)}`,
            `    Deductions: ${formatCurrency(record.deductions || 0)}`,
            `    Net Salary: ${formatCurrency(net)}`,
            `    Payment Status: ${formatLabel(record.payment_status)}`,
          ].join("\n");
        });

  const perEmployee = new Map<
    string,
    { basic: number; hardship: number; deductions: number; net: number; count: number }
  >();

  for (const record of context.payrollRecords) {
    const current = perEmployee.get(record.employee_id) || {
      basic: 0,
      hardship: 0,
      deductions: 0,
      net: 0,
      count: 0,
    };
    current.basic += record.salary || 0;
    current.hardship += record.hardship_allowance || 0;
    current.deductions += record.deductions || 0;
    current.net += calculateNetSalary(record);
    current.count += 1;
    perEmployee.set(record.employee_id, current);
  }

  const employeeLines =
    perEmployee.size === 0
      ? ["  No employee payroll summaries available."]
      : Array.from(perEmployee.entries()).map(([employeeId, summary]) => {
          const name = names.get(employeeId) || "Unknown Employee";
          return [
            `  ${name} (${summary.count} record${summary.count === 1 ? "" : "s"})`,
            `    Basic Salary: ${formatCurrency(summary.basic)}`,
            `    Hardship Allowance: ${formatCurrency(summary.hardship)}`,
            `    Deductions: ${formatCurrency(summary.deductions)}`,
            `    Net Salary: ${formatCurrency(summary.net)}`,
          ].join("\n");
        });

  const lines = [
    "PAYROLL REPORT",
    "==============",
    "",
    `Date Generated: ${generatedAt.toLocaleString()}`,
    "",
    ...section("Totals", [
      `Total Payroll Records: ${context.payrollRecords.length}`,
      `Total Basic Salary: ${formatCurrency(totalBasic)}`,
      `Total Hardship Allowance: ${formatCurrency(totalHardship)}`,
      `Total Deductions: ${formatCurrency(totalDeductions)}`,
      `Total Net Salary: ${formatCurrency(totalNet)}`,
    ]),
    ...section("Employee Payroll Summary", employeeLines),
    ...section("Payroll Records", recordLines),
  ];

  return lines.join("\n").trimEnd();
}

export async function downloadReportContentAsPdf(
  title: string,
  content: string,
  fileName?: string,
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, margin, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const contentLines = content.split("\n");
  for (const line of contentLines) {
    const wrapped =
      line.trim().length === 0
        ? [""]
        : doc.splitTextToSize(line, maxWidth);

    for (const wrappedLine of wrapped) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(wrappedLine || " ", margin, y);
      y += 5;
    }
  }

  const safeName = (fileName || title || "hr-report")
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  doc.save(`${safeName || "hr-report"}.pdf`);
}
