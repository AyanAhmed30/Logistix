"use server";

import { createAdminClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import {
  assertHrAccess,
  assertHrChildPermission,
} from "@/lib/hr-auth";

export type AttendanceRecord = {
  id: string;
  employee_id: string;
  date: string;
  attendance_type: "present" | "absent" | "late" | "half_day" | "leave" | "holiday";
  status: "pending" | "approved" | "rejected";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function createAttendance(formData: FormData) {
  await assertHrChildPermission("attendance_leave_tracking");

  const employeeId = String(formData.get("employeeId") || formData.get("employee_id") || "").trim();
  const date = String(formData.get("date") || "").trim();
  const attendanceType = String(formData.get("attendanceType") || formData.get("attendance_type") || "").trim();
  const status = String(formData.get("status") || "pending").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!employeeId) {
    return { error: "Employee ID is required" };
  }

  if (!date) {
    return { error: "Date is required" };
  }

  if (!attendanceType) {
    return { error: "Attendance type is required" };
  }

  const validAttendanceTypes = ["present", "absent", "late", "half_day", "leave", "holiday"];
  if (!validAttendanceTypes.includes(attendanceType)) {
    return { error: "Invalid attendance type" };
  }

  const validStatuses = ["pending", "approved", "rejected"];
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

  const { data: attendanceRecord, error } = await supabase
    .from("attendance_records")
    .insert([
      {
        employee_id: employeeId,
        date,
        attendance_type: attendanceType,
        status,
        notes: emptyToNull(notes),
      },
    ])
    .select("*")
    .single();

  if (error) {
    if (error.message.includes("does not exist") || error.message.includes("relation") || error.code === "42P01") {
      return {
        error: "Attendance records table does not exist. Please run the SQL migration in Supabase.",
      };
    }
    return { error: error.message || "Failed to create attendance record" };
  }

  revalidatePath("/hr");
  revalidatePath("/hr/attendance");
  revalidatePath("/hr/dashboard");
  return { success: true, attendanceRecord: attendanceRecord as AttendanceRecord };
}

export async function getAttendance(employeeId?: string) {
  await assertHrAccess();

  const supabase = await createAdminClient();

  let query = supabase.from("attendance_records").select("*");

  if (employeeId) {
    query = query.eq("employee_id", employeeId);
  }

  const { data, error } = await query.order("date", { ascending: false });

  if (error) {
    if (error.message.includes("does not exist") || error.message.includes("relation") || error.code === "42P01") {
      return { attendanceRecords: [] as AttendanceRecord[] };
    }
    return { error: error.message };
  }

  return { attendanceRecords: (data || []) as AttendanceRecord[] };
}

export async function updateAttendance(formData: FormData) {
  await assertHrChildPermission("attendance_leave_tracking");

  const id = String(formData.get("id") || "").trim();
  const employeeId = String(formData.get("employeeId") || formData.get("employee_id") || "").trim();
  const date = String(formData.get("date") || "").trim();
  const attendanceType = String(formData.get("attendanceType") || formData.get("attendance_type") || "").trim();
  const status = String(formData.get("status") || "pending").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!id) {
    return { error: "Attendance record ID is required" };
  }

  if (!employeeId || !date || !attendanceType) {
    return { error: "Employee ID, date, and attendance type are required" };
  }

  const validAttendanceTypes = ["present", "absent", "late", "half_day", "leave", "holiday"];
  if (!validAttendanceTypes.includes(attendanceType)) {
    return { error: "Invalid attendance type" };
  }

  const validStatuses = ["pending", "approved", "rejected"];
  if (!validStatuses.includes(status)) {
    return { error: "Invalid status" };
  }

  const supabase = await createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("attendance_records")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message };
  }

  if (!existing) {
    return { error: "Attendance record not found" };
  }

  const { data: attendanceRecord, error } = await supabase
    .from("attendance_records")
    .update({
      employee_id: employeeId,
      date,
      attendance_type: attendanceType,
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
  return { success: true, attendanceRecord: attendanceRecord as AttendanceRecord };
}

export async function deleteAttendance(formData: FormData) {
  await assertHrChildPermission("attendance_leave_tracking");

  const id = String(formData.get("id") || "").trim();
  if (!id) {
    return { error: "Attendance record ID is required" };
  }

  const supabase = await createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("attendance_records")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message };
  }

  if (!existing) {
    return { error: "Attendance record not found" };
  }

  const { error } = await supabase.from("attendance_records").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/hr");
  revalidatePath("/hr/attendance");
  revalidatePath("/hr/dashboard");
  return { success: true };
}
