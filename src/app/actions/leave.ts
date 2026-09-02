"use server";

import { createAdminClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import {
  assertHrAccess,
  assertHrChildPermission,
} from "@/lib/hr-auth";

export type LeaveRequest = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  leave_type: "annual" | "sick" | "personal" | "maternity" | "paternity" | "unpaid" | "other";
  status: "pending" | "approved" | "rejected" | "cancelled";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function createLeaveRequest(formData: FormData) {
  await assertHrChildPermission("attendance_leave_tracking");

  const employeeId = String(formData.get("employeeId") || formData.get("employee_id") || "").trim();
  const startDate = String(formData.get("startDate") || formData.get("start_date") || "").trim();
  const endDate = String(formData.get("endDate") || formData.get("end_date") || "").trim();
  const leaveType = String(formData.get("leaveType") || formData.get("leave_type") || "").trim();
  const status = String(formData.get("status") || "pending").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!employeeId) {
    return { error: "Employee ID is required" };
  }

  if (!startDate) {
    return { error: "Start date is required" };
  }

  if (!endDate) {
    return { error: "End date is required" };
  }

  if (!leaveType) {
    return { error: "Leave type is required" };
  }

  const validLeaveTypes = ["annual", "sick", "personal", "maternity", "paternity", "unpaid", "other"];
  if (!validLeaveTypes.includes(leaveType)) {
    return { error: "Invalid leave type" };
  }

  const validStatuses = ["pending", "approved", "rejected", "cancelled"];
  if (!validStatuses.includes(status)) {
    return { error: "Invalid status" };
  }

  const supabase = await createAdminClient();

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id")
    .eq("id", employeeId)
    .maybeSingle();

  if (employeeError) {
    return { error: employeeError.message };
  }

  if (!employee) {
    return { error: "Employee not found" };
  }

  const { data: leaveRequest, error } = await supabase
    .from("leave_requests")
    .insert([
      {
        employee_id: employeeId,
        start_date: startDate,
        end_date: endDate,
        leave_type: leaveType,
        status,
        notes: emptyToNull(notes),
      },
    ])
    .select("*")
    .single();

  if (error) {
    if (error.message.includes("does not exist") || error.message.includes("relation") || error.code === "42P01") {
      return {
        error: "Leave requests table does not exist. Please run the SQL migration in Supabase.",
      };
    }
    return { error: error.message || "Failed to create leave request" };
  }

  revalidatePath("/hr");
  revalidatePath("/hr/attendance");
  revalidatePath("/hr/dashboard");
  return { success: true, leaveRequest: leaveRequest as LeaveRequest };
}

export async function getLeaveRequests(employeeId?: string) {
  await assertHrAccess();

  const supabase = await createAdminClient();

  let query = supabase.from("leave_requests").select("*");

  if (employeeId) {
    query = query.eq("employee_id", employeeId);
  }

  const { data, error } = await query.order("start_date", { ascending: false });

  if (error) {
    if (error.message.includes("does not exist") || error.message.includes("relation") || error.code === "42P01") {
      return { leaveRequests: [] as LeaveRequest[] };
    }
    return { error: error.message };
  }

  return { leaveRequests: (data || []) as LeaveRequest[] };
}

export async function updateLeaveRequest(formData: FormData) {
  await assertHrChildPermission("attendance_leave_tracking");

  const id = String(formData.get("id") || "").trim();
  const employeeId = String(formData.get("employeeId") || formData.get("employee_id") || "").trim();
  const startDate = String(formData.get("startDate") || formData.get("start_date") || "").trim();
  const endDate = String(formData.get("endDate") || formData.get("end_date") || "").trim();
  const leaveType = String(formData.get("leaveType") || formData.get("leave_type") || "").trim();
  const status = String(formData.get("status") || "pending").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!id) {
    return { error: "Leave request ID is required" };
  }

  if (!employeeId || !startDate || !endDate || !leaveType) {
    return { error: "Employee ID, start date, end date, and leave type are required" };
  }

  const validLeaveTypes = ["annual", "sick", "personal", "maternity", "paternity", "unpaid", "other"];
  if (!validLeaveTypes.includes(leaveType)) {
    return { error: "Invalid leave type" };
  }

  const validStatuses = ["pending", "approved", "rejected", "cancelled"];
  if (!validStatuses.includes(status)) {
    return { error: "Invalid status" };
  }

  const supabase = await createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("leave_requests")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message };
  }

  if (!existing) {
    return { error: "Leave request not found" };
  }

  const { data: leaveRequest, error } = await supabase
    .from("leave_requests")
    .update({
      employee_id: employeeId,
      start_date: startDate,
      end_date: endDate,
      leave_type: leaveType,
      status,
      notes: emptyToNull(notes),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/hr");
  revalidatePath("/hr/attendance");
  revalidatePath("/hr/dashboard");
  return { success: true, leaveRequest: leaveRequest as LeaveRequest };
}

export async function deleteLeaveRequest(formData: FormData) {
  await assertHrChildPermission("attendance_leave_tracking");

  const id = String(formData.get("id") || "").trim();
  if (!id) {
    return { error: "Leave request ID is required" };
  }

  const supabase = await createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("leave_requests")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message };
  }

  if (!existing) {
    return { error: "Leave request not found" };
  }

  const { error } = await supabase.from("leave_requests").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/hr");
  revalidatePath("/hr/attendance");
  revalidatePath("/hr/dashboard");
  return { success: true };
}
