"use server";

import {
  createHrPerson,
  deleteHrPerson,
  listHrPeople,
  updateHrPerson,
  type HrPersonFilters,
  type HrPersonInput,
} from "@/lib/hr-people-store";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/utils/supabase/server";
import { isSuperAdminSession } from "@/lib/auth/super-admin";
import {
  hasDepartmentAccess,
  HR_MODULE_PERMISSIONS,
  normalizeStoredPermissions,
} from "@/lib/module-permissions";

export type HrPersonServerResult =
  | { success: true; hrPerson?: unknown }
  | { success: false; error: string };

async function ensureAdminAccess() {
  const session = await getSession();
  if (!session || !isSuperAdminSession(session)) {
    return { error: "Unauthorized" };
  }

  return { success: true as const };
}

async function ensureHrModulePermissionAccess() {
  const session = await getSession();
  if (!session) {
    return { error: "Unauthorized" };
  }

  if (isSuperAdminSession(session)) {
    return { success: true as const };
  }

  if (!hasDepartmentAccess(session.permissions, "hr")) {
    return { error: "Unauthorized" };
  }

  return { success: true as const };
}

export async function createHrPersonUserAction(formData: FormData) {
  const access = await ensureAdminAccess();
  if ("error" in access) {
    return access;
  }

  const username = String(formData.get("username") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "").trim();

  if (!username || username.length < 2) {
    return {
      success: false as const,
      error: "Username is required and should be at least 2 characters long.",
    };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false as const, error: "A valid email is required." };
  }

  if (!password || password.length < 6) {
    return {
      success: false as const,
      error: "Password is required and should be at least 6 characters long.",
    };
  }

  const supabase = await createAdminClient();
  const { error: insertError } = await supabase.from("app_users").insert([
    {
      username,
      password,
      role: "user",
      email,
      full_name: username,
      permissions: normalizeStoredPermissions([
        "hr",
        ...HR_MODULE_PERMISSIONS.map((module) => module.key),
      ]),
    },
  ]);

  if (insertError) {
    return { success: false as const, error: insertError.message };
  }

  const hrCreateResult = createHrPerson({
    fullName: username,
    username,
    email,
    status: "active",
  });

  if ("error" in hrCreateResult) {
    await supabase.from("app_users").delete().eq("username", username);
    return { success: false as const, error: hrCreateResult.error };
  }

  return { success: true as const, hrPerson: hrCreateResult.hrPerson };
}

export async function createHrPersonAction(formData: FormData) {
  const access = await ensureHrModulePermissionAccess();
  if ("error" in access) {
    return access;
  }

  const input: HrPersonInput = {
    fullName: String(formData.get("fullName") || ""),
    username: String(formData.get("username") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    department: String(formData.get("department") || ""),
    designation: String(formData.get("designation") || ""),
    employeeId: String(formData.get("employeeId") || ""),
    status:
      (String(formData.get("status") || "active") as "active" | "inactive") ||
      "active",
  };

  const result = createHrPerson(input);
  if ("error" in result) {
    return { success: false as const, error: result.error };
  }

  return { success: true as const, hrPerson: result.hrPerson };
}

export async function getHrPeopleAction(filters: HrPersonFilters = {}) {
  const access = await ensureHrModulePermissionAccess();
  if ("error" in access) {
    return access;
  }

  return { success: true as const, hrPeople: listHrPeople(filters) };
}

export async function updateHrPersonAction(id: string, input: HrPersonInput) {
  const access = await ensureHrModulePermissionAccess();
  if ("error" in access) {
    return access;
  }

  const result = updateHrPerson(id, input);
  if ("error" in result) {
    return { success: false as const, error: result.error };
  }

  return { success: true as const, hrPerson: result.hrPerson };
}

export async function deleteHrPersonAction(id: string) {
  const access = await ensureHrModulePermissionAccess();
  if ("error" in access) {
    return access;
  }

  const result = deleteHrPerson(id);
  if ("error" in result) {
    return { success: false as const, error: result.error };
  }

  return { success: true as const };
}
