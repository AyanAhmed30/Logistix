"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PdfAttachmentInput } from "@/components/hr/PdfAttachmentInput";
import { getAllEmployees, type Employee } from "@/app/actions/employees";
import {
  getAttendance,
  type AttendanceRecord,
} from "@/app/actions/attendance";
import { getLeaveRequests, type LeaveRequest } from "@/app/actions/leave";
import {
  getDocuments,
  type EmployeeDocument,
} from "@/app/actions/documents";
import { getPayroll, type PayrollRecord } from "@/app/actions/payroll";
import {
  getReports,
  createReport,
  deleteReport,
  getHrReportMeta,
  type GeneratedReport,
} from "@/app/actions/reports";
import {
  buildAttendanceReport,
  buildHrSummaryReport,
  buildPayrollReport,
  downloadReportContentAsPdf,
  reportTypeLabel,
  type ReportBuildContext,
} from "@/lib/hr-report-utils";
import {
  downloadPdfAttachment,
  revokePdfAttachment,
  storePdfAttachment,
  type PdfAttachmentMeta,
} from "@/lib/hr-pdf-attachment";

type GeneratingKey = "employee_summary" | "attendance" | "payroll" | null;

function formatReportDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatReportTime(value: string) {
  return new Date(value).toLocaleTimeString();
}

export function ReportsGeneration() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [reports, setReports] = useState<GeneratedReport[]>([]);
  const [organizationName, setOrganizationName] = useState("Logistix");
  const [reportPdf, setReportPdf] = useState<PdfAttachmentMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [generating, setGenerating] = useState<GeneratingKey>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewingReport, setViewingReport] = useState<GeneratedReport | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<GeneratedReport | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  async function refreshReports() {
    const reportsResult = await getReports();
    if ("error" in reportsResult) {
      toast.error(reportsResult.error);
      return;
    }
    setReports(reportsResult.reports || []);
  }

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [
          metaResult,
          employeesResult,
          attendanceResult,
          leaveResult,
          documentsResult,
          payrollResult,
          reportsResult,
        ] = await Promise.all([
          getHrReportMeta(),
          getAllEmployees(),
          getAttendance(),
          getLeaveRequests(),
          getDocuments(),
          getPayroll(),
          getReports(),
        ]);

        setOrganizationName(metaResult.organizationName || "Logistix");

        if (!("error" in employeesResult)) {
          setEmployees(employeesResult.employees || []);
        }

        if (!("error" in attendanceResult)) {
          setAttendanceRecords(attendanceResult.attendanceRecords || []);
        }

        if (!("error" in leaveResult)) {
          setLeaveRequests(leaveResult.leaveRequests || []);
        }

        if (!("error" in documentsResult)) {
          setDocuments(documentsResult.documents || []);
        }

        if (!("error" in payrollResult)) {
          setPayrollRecords(payrollResult.payrollRecords || []);
        }

        if (!("error" in reportsResult)) {
          setReports(reportsResult.reports || []);
        }
      } catch (err) {
        toast.error(String(err || "Failed to load reports data"));
      } finally {
        setIsLoading(false);
      }
    }

    void loadData();
  }, []);

  const reportContext = useMemo<ReportBuildContext>(
    () => ({
      organizationName,
      employees,
      attendanceRecords,
      leaveRequests,
      documents,
      payrollRecords,
    }),
    [
      organizationName,
      employees,
      attendanceRecords,
      leaveRequests,
      documents,
      payrollRecords,
    ],
  );

  const latestReport = reports[0] || null;
  const recentHistory = reports.slice(0, 5);

  async function handleGenerate(
    reportType: NonNullable<GeneratingKey>,
    title: string,
    contentBuilder: (context: ReportBuildContext) => string,
  ) {
    setGenerating(reportType);
    try {
      const generatedAt = new Date();
      const content = contentBuilder({
        ...reportContext,
        generatedAt,
      });

      const formData = new FormData();
      formData.append("report_type", reportType);
      formData.append("report_title", title);
      formData.append("report_content", content);
      if (employees[0]?.id) {
        formData.append("generated_by", employees[0].id);
      }
      formData.append("pdf_name", reportPdf?.fileName || "");
      formData.append("pdf_path", "");

      const result = await createReport(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      if (reportPdf && result.report) {
        storePdfAttachment(result.report.id, reportPdf);
      }

      setReportPdf(null);

      await refreshReports();
      toast.success(`${title} generated successfully`);
    } catch (err) {
      toast.error(String(err || "Failed to generate report"));
    } finally {
      setGenerating(null);
    }
  }

  function openView(report: GeneratedReport) {
    setViewingReport(report);
    setViewOpen(true);
  }

  async function handleDownload(report: GeneratedReport) {
    if (report.report_content) {
      try {
        await downloadReportContentAsPdf(
          report.report_title,
          report.report_content,
          report.report_title,
        );
        toast.success("Report downloaded");
        return;
      } catch (err) {
        toast.error(String(err || "Failed to download report"));
        return;
      }
    }

    const attached = downloadPdfAttachment(report.id);
    if (attached) {
      toast.success("Attached PDF downloaded");
      return;
    }

    toast.error("No report content available to download");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const formData = new FormData();
      formData.append("id", deleteTarget.id);
      const result = await deleteReport(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      revokePdfAttachment(deleteTarget.id);
      setDeleteTarget(null);
      if (viewingReport?.id === deleteTarget.id) {
        setViewOpen(false);
        setViewingReport(null);
      }
      await refreshReports();
      toast.success("Report deleted");
    } catch (err) {
      toast.error(String(err || "Failed to delete report"));
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="py-16 text-center text-secondary-muted">
        Loading reports data...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">
          Generate Reports
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Create HR, attendance, and payroll reports from live module data.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#0f766e]">Summary Statistics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Total Employees</span>
              <span className="font-medium text-slate-900">
                {employees.length}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Attendance Records</span>
              <span className="font-medium text-slate-900">
                {attendanceRecords.length}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Documents</span>
              <span className="font-medium text-slate-900">
                {documents.length}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Payroll Records</span>
              <span className="font-medium text-slate-900">
                {payrollRecords.length}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#0f766e]">Quick Reports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <PdfAttachmentInput
              label="Attach report PDF (optional)"
              description="PDF only. Maximum size 10 MB. Report generation works without an attachment."
              value={reportPdf}
              onChange={setReportPdf}
            />
            <Button
              type="button"
              className="w-full"
              disabled={generating !== null}
              onClick={() =>
                void handleGenerate(
                  "employee_summary",
                  "HR Summary Report",
                  buildHrSummaryReport,
                )
              }
            >
              {generating === "employee_summary"
                ? "Generating..."
                : "Generate HR Summary Report"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={generating !== null}
              onClick={() =>
                void handleGenerate(
                  "attendance",
                  "Attendance Report",
                  buildAttendanceReport,
                )
              }
            >
              {generating === "attendance"
                ? "Generating..."
                : "Generate Attendance Report"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={generating !== null}
              onClick={() =>
                void handleGenerate(
                  "payroll",
                  "Payroll Report",
                  buildPayrollReport,
                )
              }
            >
              {generating === "payroll"
                ? "Generating..."
                : "Generate Payroll Report"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-[#0f766e]">Report History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Reports generated</span>
                <span className="font-medium text-slate-900">
                  {reports.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Latest report</span>
                <span className="font-medium text-slate-900">
                  {latestReport
                    ? formatReportDate(latestReport.generated_at)
                    : "None"}
                </span>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-medium text-slate-800">
                Recent history
              </h4>
              {recentHistory.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No reports generated yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {recentHistory.map((report) => (
                    <div
                      key={report.id}
                      className="rounded-md border border-slate-200 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium text-slate-900">
                          {report.report_title}
                        </span>
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {reportTypeLabel(report.report_type)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatReportDate(report.generated_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-[#0f766e]">Generated Reports</CardTitle>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No reports generated yet. Use Quick Reports above to create your
              first report.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Report Name</TableHead>
                    <TableHead>Report Type</TableHead>
                    <TableHead>Generated Date</TableHead>
                    <TableHead>Generated Time</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="font-medium">
                        {report.report_title}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {reportTypeLabel(report.report_type)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {formatReportDate(report.generated_at)}
                      </TableCell>
                      <TableCell>
                        {formatReportTime(report.generated_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openView(report)}
                          >
                            <Eye className="mr-1 h-4 w-4" />
                            View
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void handleDownload(report)}
                          >
                            <Download className="mr-1 h-4 w-4" />
                            Download
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleteTarget(report)}
                          >
                            <Trash2 className="mr-1 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {viewingReport?.report_title || "Report Details"}
            </DialogTitle>
            <DialogDescription>
              {viewingReport
                ? `${reportTypeLabel(viewingReport.report_type)} · ${new Date(viewingReport.generated_at).toLocaleString()}`
                : "Generated report details"}
            </DialogDescription>
          </DialogHeader>
          {viewingReport ? (
            <div className="space-y-4">
              {viewingReport.pdf_name ? (
                <p className="text-sm text-slate-600">
                  Attached PDF: {viewingReport.pdf_name}
                </p>
              ) : null}
              <pre className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
                {viewingReport.report_content || "No report content available."}
              </pre>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setViewOpen(false)}
            >
              Close
            </Button>
            {viewingReport ? (
              <Button
                type="button"
                onClick={() => void handleDownload(viewingReport)}
              >
                <Download className="mr-1 h-4 w-4" />
                Download
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Report</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-slate-900">
                {deleteTarget?.report_title}
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
