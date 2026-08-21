"use server";

import { createAdminClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertHrChildPermission } from "@/lib/hr-auth";

export type GeneratedReport = {
  id: string;
  report_type:
    | "attendance"
    | "leave"
    | "payroll"
    | "documents"
    | "employee_summary";
  report_title: string;
  report_content: string | null;
  generated_by: string | null;
  generated_at: string;
  pdf_name: string | null;
  pdf_path: string | null;
  created_at: string;
  updated_at: string;
};

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function revalidateReportPaths() {
  revalidatePath("/hr");
  revalidatePath("/hr/reports");
  revalidatePath("/hr/dashboard");
}

export async function getHrReportMeta() {
  const session = await assertHrChildPermission("report_generation");

  return {
    organizationName: session.organizationName?.trim() || "Logistix",
    generatedByName: session.fullName?.trim() || session.username,
  };
}

export async function createReport(formData: FormData) {
  await assertHrChildPermission("report_generation");

  const reportType = String(
    formData.get("reportType") || formData.get("report_type") || "",
  ).trim();
  const reportTitle = String(
    formData.get("reportTitle") || formData.get("report_title") || "",
  ).trim();
  const generatedBy = String(
    formData.get("generatedBy") || formData.get("generated_by") || "",
  ).trim();
  const reportContent = String(
    formData.get("reportContent") || formData.get("report_content") || "",
  ).trim();
  const pdfName = String(
    formData.get("pdfName") || formData.get("pdf_name") || "",
  ).trim();
  const pdfPath = String(
    formData.get("pdfPath") || formData.get("pdf_path") || "",
  ).trim();

  if (!reportType) {
    return { error: "Report type is required" };
  }

  if (!reportTitle) {
    return { error: "Report title is required" };
  }

  if (!reportContent) {
    return { error: "Report content is required" };
  }

  const validReportTypes = [
    "attendance",
    "leave",
    "payroll",
    "documents",
    "employee_summary",
  ];
  if (!validReportTypes.includes(reportType)) {
    return { error: "Invalid report type" };
  }

  const supabase = await createAdminClient();

  let generatedById: string | null = emptyToNull(generatedBy);
  if (generatedById) {
    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("id")
      .eq("id", generatedById)
      .maybeSingle();

    if (employeeError) {
      return { error: employeeError.message };
    }

    if (!employee) {
      return { error: "Employee not found" };
    }
  }

  const { data: report, error } = await supabase
    .from("generated_reports")
    .insert([
      {
        report_type: reportType,
        report_title: reportTitle,
        report_content: reportContent,
        generated_by: generatedById,
        generated_at: new Date().toISOString(),
        pdf_name: emptyToNull(pdfName),
        pdf_path: emptyToNull(pdfPath),
      },
    ])
    .select("*")
    .single();

  if (error) {
    if (
      error.message.includes("does not exist") ||
      error.message.includes("relation") ||
      error.code === "42P01"
    ) {
      return {
        error:
          "Generated reports table does not exist. Please run the SQL migration in Supabase.",
      };
    }
    if (
      error.message.includes("report_content") ||
      error.message.includes("generated_by")
    ) {
      return {
        error:
          "Generated reports table is missing required columns. Please run supabase/HR-migrations/202608030002_add_report_content_to_generated_reports.sql in Supabase.",
      };
    }
    return { error: error.message || "Failed to create report" };
  }

  revalidateReportPaths();
  return { success: true, report: report as GeneratedReport };
}

export async function getReports(reportType?: string) {
  await assertHrChildPermission("report_generation");

  const supabase = await createAdminClient();

  let query = supabase.from("generated_reports").select("*");

  if (reportType) {
    query = query.eq("report_type", reportType);
  }

  const { data, error } = await query.order("generated_at", {
    ascending: false,
  });

  if (error) {
    if (
      error.message.includes("does not exist") ||
      error.message.includes("relation") ||
      error.code === "42P01"
    ) {
      return { reports: [] as GeneratedReport[] };
    }
    return { error: error.message };
  }

  return { reports: (data || []) as GeneratedReport[] };
}

export async function deleteReport(formData: FormData) {
  await assertHrChildPermission("report_generation");

  const id = String(formData.get("id") || "").trim();
  if (!id) {
    return { error: "Report ID is required" };
  }

  const supabase = await createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("generated_reports")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message };
  }

  if (!existing) {
    return { error: "Report not found" };
  }

  const { error } = await supabase
    .from("generated_reports")
    .delete()
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidateReportPaths();
  return { success: true };
}
