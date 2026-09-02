"use server";

import { createAdminClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import {
  assertHrAccess,
  assertHrChildPermission,
} from "@/lib/hr-auth";

export type PayrollRecord = {
  id: string;
  employee_id: string;
  salary: number;
  hardship_allowance: number;
  deductions: number;
  gross_salary: number;
  net_salary: number;
  payment_status: "pending" | "paid" | "failed";
  payment_date: string | null;
  pdf_name: string | null;
  pdf_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function revalidatePayrollPaths() {
  revalidatePath("/hr");
  revalidatePath("/hr/payroll");
  revalidatePath("/hr/dashboard");
}

function parsePayrollAmounts(formData: FormData) {
  const employeeId = String(
    formData.get("employeeId") || formData.get("employee_id") || "",
  ).trim();
  const salary = String(formData.get("salary") || "").trim();
  const hardshipAllowance = String(
    formData.get("hardship_allowance") ||
      formData.get("hardshipAllowance") ||
      "0",
  ).trim();
  const deductions = String(formData.get("deductions") || "0").trim();
  const paymentStatus = String(
    formData.get("paymentStatus") || formData.get("payment_status") || "paid",
  ).trim();
  const paymentDate = String(
    formData.get("paymentDate") || formData.get("payment_date") || "",
  ).trim();
  const pdfName = String(
    formData.get("pdfName") || formData.get("pdf_name") || "",
  ).trim();
  const pdfPath = String(
    formData.get("pdfPath") || formData.get("pdf_path") || "",
  ).trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!employeeId) {
    return { error: "Employee is required" };
  }

  if (!paymentDate) {
    return { error: "Payroll date is required" };
  }

  if (!salary) {
    return { error: "Basic salary is required" };
  }

  if (!paymentStatus) {
    return { error: "Payment status is required" };
  }

  const salaryNum = Number.parseFloat(salary);
  if (!Number.isFinite(salaryNum) || salaryNum < 0) {
    return { error: "Basic salary cannot be negative" };
  }

  const hardshipAllowanceNum = Number.parseFloat(hardshipAllowance || "0");
  if (!Number.isFinite(hardshipAllowanceNum) || hardshipAllowanceNum < 0) {
    return { error: "Hardship allowance cannot be negative" };
  }

  const deductionsNum = Number.parseFloat(deductions || "0");
  if (!Number.isFinite(deductionsNum) || deductionsNum < 0) {
    return { error: "Deductions cannot be negative" };
  }

  const grossSalary = salaryNum + hardshipAllowanceNum;
  if (deductionsNum > grossSalary) {
    return {
      error: "Deductions cannot exceed total earnings (Basic Salary + Hardship Allowance)",
    };
  }

  const validStatuses = ["pending", "paid", "failed"];
  if (!validStatuses.includes(paymentStatus)) {
    return { error: "Invalid payment status" };
  }

  return {
    data: {
      employee_id: employeeId,
      salary: salaryNum,
      hardship_allowance: hardshipAllowanceNum,
      deductions: deductionsNum,
      gross_salary: grossSalary,
      net_salary: grossSalary - deductionsNum,
      payment_status: paymentStatus as PayrollRecord["payment_status"],
      payment_date: paymentDate,
      pdf_name: emptyToNull(pdfName),
      pdf_path: emptyToNull(pdfPath),
      notes: emptyToNull(notes),
    },
  };
}

export async function createPayroll(formData: FormData) {
  await assertHrChildPermission("payroll_management");

  const parsed = parsePayrollAmounts(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const supabase = await createAdminClient();

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id")
    .eq("id", parsed.data.employee_id)
    .maybeSingle();

  if (employeeError) {
    return { error: employeeError.message };
  }

  if (!employee) {
    return { error: "Employee not found" };
  }

  const { data: payrollRecord, error } = await supabase
    .from("payroll_records")
    .insert([parsed.data])
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
          "Payroll records table does not exist. Please run the SQL migration in Supabase.",
      };
    }
    if (
      error.message.includes("gross_salary") ||
      error.message.includes("net_salary") ||
      error.message.includes("notes")
    ) {
      return {
        error:
          "Payroll table is missing required columns. Please run supabase/HR-migrations/202608030001_enhance_payroll_records.sql in Supabase.",
      };
    }
    return { error: error.message || "Failed to create payroll record" };
  }

  revalidatePayrollPaths();
  return { success: true, payrollRecord: payrollRecord as PayrollRecord };
}

export async function getPayroll(employeeId?: string) {
  await assertHrAccess();

  const supabase = await createAdminClient();

  let query = supabase.from("payroll_records").select("*");

  if (employeeId) {
    query = query.eq("employee_id", employeeId);
  }

  const { data, error } = await query.order("payment_date", {
    ascending: false,
  });

  if (error) {
    if (
      error.message.includes("does not exist") ||
      error.message.includes("relation") ||
      error.code === "42P01"
    ) {
      return { payrollRecords: [] as PayrollRecord[] };
    }
    return { error: error.message };
  }

  return { payrollRecords: (data || []) as PayrollRecord[] };
}

export async function updatePayroll(formData: FormData) {
  await assertHrChildPermission("payroll_management");

  const id = String(formData.get("id") || "").trim();
  if (!id) {
    return { error: "Payroll record ID is required" };
  }

  const parsed = parsePayrollAmounts(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const supabase = await createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("payroll_records")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message };
  }

  if (!existing) {
    return { error: "Payroll record not found" };
  }

  const { data: payrollRecord, error } = await supabase
    .from("payroll_records")
    .update({
      ...parsed.data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePayrollPaths();
  return { success: true, payrollRecord: payrollRecord as PayrollRecord };
}

export async function deletePayroll(formData: FormData) {
  await assertHrChildPermission("payroll_management");

  const id = String(formData.get("id") || "").trim();
  if (!id) {
    return { error: "Payroll record ID is required" };
  }

  const supabase = await createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("payroll_records")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message };
  }

  if (!existing) {
    return { error: "Payroll record not found" };
  }

  const { error } = await supabase.from("payroll_records").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePayrollPaths();
  return { success: true };
}
