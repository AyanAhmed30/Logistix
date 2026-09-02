"use server";

import { createAdminClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import {
  assertHrAccess,
  assertHrChildPermission,
} from "@/lib/hr-auth";

export type EmploymentStatus =
  | "active"
  | "inactive"
  | "on_leave"
  | "suspended"
  | "resigned"
  | "terminated";

export type EmploymentType =
  | "permanent"
  | "probation"
  | "contract"
  | "temporary"
  | "part_time"
  | "full_time"
  | "internee";

export type EmployeeGender = "male" | "female" | "other" | "prefer_not_to_say";

export type Employee = {
  id: string;
  full_name: string;
  username: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  designation: string | null;
  employee_id: string | null;
  status: EmploymentStatus;
  employment_type: EmploymentType | null;
  shift_timing: string | null;
  joining_date: string | null;
  reporting_manager: string | null;
  secondary_reporting_manager: string | null;
  date_of_birth: string | null;
  age: number | null;
  gender: EmployeeGender | null;
  institute_name: string | null;
  degree_diploma: string | null;
  specialization: string | null;
  company_name: string | null;
  job_title: string | null;
  duration: string | null;
  job_description: string | null;
  created_at: string;
  updated_at: string;
};

const EMPLOYMENT_STATUSES: EmploymentStatus[] = [
  "active",
  "inactive",
  "on_leave",
  "suspended",
  "resigned",
  "terminated",
];

const EMPLOYMENT_TYPES: EmploymentType[] = [
  "permanent",
  "probation",
  "contract",
  "temporary",
  "part_time",
  "full_time",
  "internee",
];

const GENDERS: EmployeeGender[] = [
  "male",
  "female",
  "other",
  "prefer_not_to_say",
];

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function hasValidationError(
  value: unknown,
): value is { error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string"
  );
}

function parseOptionalInt(
  value: string,
): { value: number | null } | { error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { value: null };
  const parsed = Number.parseInt(trimmed, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return { error: "Age must be a valid non-negative number" };
  }
  return { value: parsed };
}

function normalizeStatus(value: string | null | undefined): EmploymentStatus {
  const normalized = String(value || "active")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (EMPLOYMENT_STATUSES.includes(normalized as EmploymentStatus)) {
    return normalized as EmploymentStatus;
  }

  return "active";
}

function normalizeEmploymentType(
  value: string,
): EmploymentType | null | { error: string } {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (EMPLOYMENT_TYPES.includes(normalized as EmploymentType)) {
    return normalized as EmploymentType;
  }

  return { error: "Invalid employment type" };
}

function normalizeGender(value: string): EmployeeGender | null | { error: string } {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.toLowerCase().replace(/\s+/g, "_");
  if (GENDERS.includes(normalized as EmployeeGender)) {
    return normalized as EmployeeGender;
  }

  return { error: "Invalid gender value" };
}

function parseEmployeeFormData(formData: FormData) {
  const fullName = String(
    formData.get("fullName") || formData.get("full_name") || "",
  ).trim();
  const username = String(formData.get("username") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const department = String(formData.get("department") || "").trim();
  const designation = String(formData.get("designation") || "").trim();
  const employeeId = String(
    formData.get("employeeId") || formData.get("employee_id") || "",
  ).trim();
  const status = normalizeStatus(String(formData.get("status") || "active"));
  const employmentTypeResult = normalizeEmploymentType(
    String(formData.get("employmentType") || formData.get("employment_type") || ""),
  );
  const shiftTiming = String(
    formData.get("shiftTiming") || formData.get("shift_timing") || "",
  ).trim();
  const joiningDate = String(
    formData.get("joiningDate") || formData.get("joining_date") || "",
  ).trim();
  const reportingManager = String(
    formData.get("reportingManager") || formData.get("reporting_manager") || "",
  ).trim();
  const secondaryReportingManager = String(
    formData.get("secondaryReportingManager") ||
      formData.get("secondary_reporting_manager") ||
      "",
  ).trim();
  const dateOfBirth = String(
    formData.get("dateOfBirth") || formData.get("date_of_birth") || "",
  ).trim();
  const ageResult = parseOptionalInt(String(formData.get("age") || ""));
  const genderResult = normalizeGender(String(formData.get("gender") || ""));
  const instituteName = String(
    formData.get("instituteName") || formData.get("institute_name") || "",
  ).trim();
  const degreeDiploma = String(
    formData.get("degreeDiploma") || formData.get("degree_diploma") || "",
  ).trim();
  const specialization = String(formData.get("specialization") || "").trim();
  const companyName = String(
    formData.get("companyName") || formData.get("company_name") || "",
  ).trim();
  const jobTitle = String(formData.get("jobTitle") || formData.get("job_title") || "").trim();
  const duration = String(formData.get("duration") || "").trim();
  const jobDescription = String(
    formData.get("jobDescription") || formData.get("job_description") || "",
  ).trim();

  if (!fullName) {
    return { error: "Full name is required" };
  }

  if (!username) {
    return { error: "Username is required" };
  }

  if (!employeeId) {
    return { error: "Employee ID is required" };
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Please enter a valid email address" };
  }

  if (hasValidationError(employmentTypeResult)) {
    return { error: employmentTypeResult.error };
  }

  if (hasValidationError(ageResult)) {
    return { error: ageResult.error };
  }

  if (hasValidationError(genderResult)) {
    return { error: genderResult.error };
  }

  return {
    data: {
      full_name: fullName,
      username,
      email: emptyToNull(email),
      phone: emptyToNull(phone),
      department: emptyToNull(department),
      designation: emptyToNull(designation),
      employee_id: employeeId,
      status,
      employment_type: employmentTypeResult,
      shift_timing: emptyToNull(shiftTiming),
      joining_date: emptyToNull(joiningDate),
      reporting_manager: emptyToNull(reportingManager),
      secondary_reporting_manager: emptyToNull(secondaryReportingManager),
      date_of_birth: emptyToNull(dateOfBirth),
      age: ageResult.value,
      gender: genderResult,
      institute_name: emptyToNull(instituteName),
      degree_diploma: emptyToNull(degreeDiploma),
      specialization: emptyToNull(specialization),
      company_name: emptyToNull(companyName),
      job_title: emptyToNull(jobTitle),
      duration: emptyToNull(duration),
      job_description: emptyToNull(jobDescription),
    },
  };
}

async function ensureHrReadAccess() {
  await assertHrAccess();
}

async function ensureEmployeeProfileAccess() {
  await assertHrChildPermission("employee_profile_management");
}

export async function createEmployee(formData: FormData) {
  await ensureEmployeeProfileAccess();

  const parsed = parseEmployeeFormData(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const supabase = await createAdminClient();

  const { data: employee, error } = await supabase
    .from("employees")
    .insert([parsed.data])
    .select("*")
    .single();

  if (error || !employee) {
    if (
      error?.message?.includes("does not exist") ||
      error?.message?.includes("relation") ||
      error?.code === "42P01"
    ) {
      return {
        error:
          "Employees table does not exist. Please run the SQL migration in Supabase.",
      };
    }

    if (error?.code === "23505") {
      return { error: "Employee with this username already exists" };
    }

    return { error: error?.message || "Failed to create employee" };
  }

  revalidatePath("/hr");
  revalidatePath("/hr/employees");
  revalidatePath("/hr/dashboard");
  revalidatePath("/admin/dashboard");
  return { success: true, employee: employee as Employee };
}

export async function updateEmployee(formData: FormData) {
  await ensureEmployeeProfileAccess();

  const id = String(formData.get("id") || "").trim();
  if (!id) {
    return { error: "Employee id is required" };
  }

  const parsed = parseEmployeeFormData(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const supabase = await createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("employees")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message };
  }

  if (!existing) {
    return { error: "Employee not found" };
  }

  const { data: employee, error } = await supabase
    .from("employees")
    .update({
      ...parsed.data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Employee with this username already exists" };
    }
    return { error: error.message };
  }

  revalidatePath("/hr");
  revalidatePath("/hr/employees");
  revalidatePath("/hr/dashboard");
  revalidatePath("/admin/dashboard");
  return { success: true, employee: employee as Employee };
}

export async function deleteEmployee(formData: FormData) {
  await ensureEmployeeProfileAccess();

  const id = String(formData.get("id") || "").trim();
  if (!id) {
    return { error: "Employee id is required" };
  }

  const supabase = await createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("employees")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message };
  }

  if (!existing) {
    return { error: "Employee not found" };
  }

  const { error } = await supabase.from("employees").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/hr");
  revalidatePath("/hr/employees");
  revalidatePath("/hr/dashboard");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function getEmployee(id: string) {
  return getEmployeeById(id);
}

export async function getEmployeeById(id: string) {
  await ensureHrReadAccess();

  if (!id) {
    return { error: "Employee id is required" };
  }

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { error: error.message };
  }

  if (!data) {
    return { error: "Employee not found" };
  }

  return { employee: data as Employee };
}

export async function getAllEmployees() {
  await ensureHrReadAccess();

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    if (
      error.message.includes("does not exist") ||
      error.message.includes("relation") ||
      error.code === "42P01"
    ) {
      return { employees: [] as Employee[] };
    }
    return { error: error.message };
  }

  return { employees: (data || []) as Employee[] };
}
