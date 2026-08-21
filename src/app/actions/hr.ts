"use server";

import { createAdminClient } from "@/utils/supabase/server";
import { getSession } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import {
  HR_MODULE_PERMISSIONS,
  normalizeStoredPermissions,
} from "@/lib/module-permissions";

export type HRStaff = {
  id: string;
  user_id: string;
  full_name: string;
  username: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  designation: string | null;
  employee_id: string | null;
  joining_date: string | null;
  status: "active" | "inactive";
  address: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeStatus(value: string | null | undefined): "active" | "inactive" {
  return value === "inactive" ? "inactive" : "active";
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function ensureAdmin(session: Awaited<ReturnType<typeof getSession>>) {
  if (!session || session.role !== "admin") {
    throw new Error("Unauthorized");
  }
}

export async function createHR(formData: FormData) {
  const session = await getSession();
  ensureAdmin(session);

  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const fullName =
    String(formData.get("fullName") || formData.get("full_name") || "").trim() ||
    username;
  const phone = String(formData.get("phone") || "").trim();
  const department = String(formData.get("department") || "").trim();
  const designation = String(formData.get("designation") || "").trim();
  const employeeId = String(
    formData.get("employeeId") || formData.get("employee_id") || "",
  ).trim();
  const joiningDate = String(
    formData.get("joiningDate") || formData.get("joining_date") || "",
  ).trim();
  const address = String(formData.get("address") || "").trim();
  const status = normalizeStatus(String(formData.get("status") || "active"));

  if (!username || !password) {
    return { error: "Username and password are required" };
  }

  if (!fullName) {
    return { error: "Full name is required" };
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Please enter a valid email address" };
  }

  const supabase = await createAdminClient();

  const { data: existingUser, error: existingUserError } = await supabase
    .from("app_users")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (existingUserError) {
    return { error: existingUserError.message };
  }

  if (existingUser) {
    return { error: "Username already exists" };
  }

  const { data: authUser, error: authError } = await supabase
    .from("app_users")
    .insert([
      {
        username,
        password,
        role: "user",
        full_name: fullName,
        email: emptyToNull(email),
        phone: emptyToNull(phone),
        permissions: normalizeStoredPermissions([
          "hr",
          ...HR_MODULE_PERMISSIONS.map((module) => module.key),
        ]),
      },
    ])
    .select("id")
    .single();

  if (authError || !authUser) {
    if (authError?.code === "23505") {
      return { error: "Username already exists" };
    }
    return { error: authError?.message || "Failed to create HR login account" };
  }

  const { data: hrStaff, error: hrError } = await supabase
    .from("hr_staff")
    .insert([
      {
        user_id: authUser.id,
        full_name: fullName,
        username,
        email: emptyToNull(email),
        phone: emptyToNull(phone),
        department: emptyToNull(department),
        designation: emptyToNull(designation),
        employee_id: emptyToNull(employeeId),
        joining_date: emptyToNull(joiningDate),
        status,
        address: emptyToNull(address),
      },
    ])
    .select("*")
    .single();

  if (hrError || !hrStaff) {
    await supabase.from("app_users").delete().eq("id", authUser.id);

    if (
      hrError?.message?.includes("does not exist") ||
      hrError?.message?.includes("relation") ||
      hrError?.code === "42P01"
    ) {
      return {
        error:
          "HR staff table does not exist. Please run the SQL migration in Supabase.",
      };
    }

    if (hrError?.code === "23505") {
      return { error: "HR staff with this username already exists" };
    }

    return { error: hrError?.message || "Failed to create HR staff profile" };
  }

  revalidatePath("/admin/dashboard");
  return { success: true, hrStaff: hrStaff as HRStaff };
}

export async function updateHR(formData: FormData) {
  const session = await getSession();
  ensureAdmin(session);

  const id = String(formData.get("id") || "").trim();
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const fullName = String(
    formData.get("fullName") || formData.get("full_name") || "",
  ).trim();
  const phone = String(formData.get("phone") || "").trim();
  const department = String(formData.get("department") || "").trim();
  const designation = String(formData.get("designation") || "").trim();
  const employeeId = String(
    formData.get("employeeId") || formData.get("employee_id") || "",
  ).trim();
  const joiningDate = String(
    formData.get("joiningDate") || formData.get("joining_date") || "",
  ).trim();
  const address = String(formData.get("address") || "").trim();
  const status = normalizeStatus(String(formData.get("status") || "active"));

  if (!id) {
    return { error: "HR staff id is required" };
  }

  if (!username || !fullName) {
    return { error: "Full name and username are required" };
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Please enter a valid email address" };
  }

  const supabase = await createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("hr_staff")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message };
  }

  if (!existing) {
    return { error: "HR staff member not found" };
  }

  const authUpdate: { username: string; password?: string } = { username };
  if (password) {
    authUpdate.password = password;
  }

  const { error: authError } = await supabase
    .from("app_users")
    .update(authUpdate)
    .eq("id", existing.user_id);

  if (authError) {
    if (authError.code === "23505") {
      return { error: "Username already exists" };
    }
    return { error: authError.message };
  }

  const { data: hrStaff, error: hrError } = await supabase
    .from("hr_staff")
    .update({
      full_name: fullName,
      username,
      email: emptyToNull(email),
      phone: emptyToNull(phone),
      department: emptyToNull(department),
      designation: emptyToNull(designation),
      employee_id: emptyToNull(employeeId),
      joining_date: emptyToNull(joiningDate),
      status,
      address: emptyToNull(address),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (hrError) {
    return { error: hrError.message };
  }

  revalidatePath("/admin/dashboard");
  return { success: true, hrStaff: hrStaff as HRStaff };
}

export async function deleteHR(formData: FormData) {
  const session = await getSession();
  ensureAdmin(session);

  const id = String(formData.get("id") || "").trim();
  if (!id) {
    return { error: "HR staff id is required" };
  }

  const supabase = await createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("hr_staff")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message };
  }

  if (!existing) {
    return { error: "HR staff member not found" };
  }

  const { error } = await supabase
    .from("app_users")
    .delete()
    .eq("id", existing.user_id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function getHRById(id: string) {
  const session = await getSession();
  ensureAdmin(session);

  if (!id) {
    return { error: "HR staff id is required" };
  }

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("hr_staff")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { error: error.message };
  }

  if (!data) {
    return { error: "HR staff member not found" };
  }

  return { hrStaff: data as HRStaff };
}

export async function getAllHRs() {
  const session = await getSession();
  ensureAdmin(session);

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("hr_staff")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    if (
      error.message.includes("does not exist") ||
      error.message.includes("relation") ||
      error.code === "42P01"
    ) {
      return { hrStaff: [] as HRStaff[] };
    }
    return { error: error.message };
  }

  return { hrStaff: (data || []) as HRStaff[] };
}
