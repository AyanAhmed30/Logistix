"use server";

import { createAdminClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { normalizeGoalMonth } from "@/lib/kpi-goal-month";
import {
  assertHrAccess,
  assertHrChildPermission,
} from "@/lib/hr-auth";

export type KpiGoalStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "on_hold"
  | "cancelled";

export type KpiGoal = {
  id: string;
  employee_id: string;
  goal: string;
  goal_month: string | null;
  weight: number;
  target: string;
  progress: number;
  status: KpiGoalStatus;
  created_at: string;
  updated_at: string;
};

const KPI_GOAL_STATUSES: KpiGoalStatus[] = [
  "not_started",
  "in_progress",
  "completed",
  "on_hold",
  "cancelled",
];

function normalizeStatus(value: string | null | undefined): KpiGoalStatus {
  const normalized = String(value || "not_started")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (KPI_GOAL_STATUSES.includes(normalized as KpiGoalStatus)) {
    return normalized as KpiGoalStatus;
  }

  return "not_started";
}

function sortGoalsByMonth(goals: KpiGoal[]): KpiGoal[] {
  return [...goals].sort((a, b) => {
    const aMonth = a.goal_month ? String(a.goal_month).slice(0, 10) : "";
    const bMonth = b.goal_month ? String(b.goal_month).slice(0, 10) : "";

    if (aMonth && bMonth && aMonth !== bMonth) {
      return bMonth.localeCompare(aMonth);
    }
    if (aMonth && !bMonth) return -1;
    if (!aMonth && bMonth) return 1;

    return String(b.created_at).localeCompare(String(a.created_at));
  });
}

function parseKpiGoalFormData(formData: FormData) {
  const employeeId = String(
    formData.get("employeeId") || formData.get("employee_id") || "",
  ).trim();
  const goal = String(formData.get("goal") || "").trim();
  const goalMonthRaw = String(
    formData.get("goalMonth") || formData.get("goal_month") || "",
  ).trim();
  const weight = String(formData.get("weight") || "").trim();
  const target = String(formData.get("target") || "").trim();
  const progress = String(formData.get("progress") || "0").trim();
  const status = normalizeStatus(String(formData.get("status") || "not_started"));

  if (!employeeId) {
    return { error: "Employee ID is required" };
  }

  if (!goal) {
    return { error: "Goal is required" };
  }

  const goalMonthResult = normalizeGoalMonth(goalMonthRaw);
  if (typeof goalMonthResult === "object" && "error" in goalMonthResult) {
    return { error: goalMonthResult.error };
  }

  if (!weight) {
    return { error: "Weight is required" };
  }

  const weightNum = Number.parseInt(weight, 10);
  if (Number.isNaN(weightNum) || weightNum < 0 || weightNum > 100) {
    return { error: "Weight must be between 0 and 100" };
  }

  if (!target) {
    return { error: "Target is required" };
  }

  const progressNum = Number.parseInt(progress, 10);
  if (Number.isNaN(progressNum) || progressNum < 0 || progressNum > 100) {
    return { error: "Progress must be between 0 and 100" };
  }

  return {
    data: {
      employee_id: employeeId,
      goal,
      goal_month: goalMonthResult,
      weight: weightNum,
      target,
      progress: progressNum,
      status,
    },
  };
}

function revalidateGoalPaths() {
  revalidatePath("/hr");
  revalidatePath("/hr/employees");
  revalidatePath("/hr/dashboard");
  revalidatePath("/admin/dashboard");
}

async function ensureEmployeeProfileAccess() {
  await assertHrChildPermission("employee_profile_management");
}

async function ensureHrReadAccess() {
  await assertHrAccess();
}

async function findDuplicateGoal(params: {
  employeeId: string;
  goal: string;
  goalMonth: string;
  excludeId?: string;
}) {
  const supabase = await createAdminClient();

  let query = supabase
    .from("employee_kpi_goals")
    .select("id, goal, goal_month")
    .eq("employee_id", params.employeeId)
    .eq("goal_month", params.goalMonth);

  if (params.excludeId) {
    query = query.neq("id", params.excludeId);
  }

  const { data, error } = await query;
  if (error) {
    return { error: error.message };
  }

  const normalizedTitle = params.goal.trim().toLowerCase();
  const duplicate = (data || []).find(
    (row) => String(row.goal || "").trim().toLowerCase() === normalizedTitle,
  );

  if (duplicate) {
    return {
      error:
        "A goal with the same title already exists for this employee in the selected month",
    };
  }

  return { ok: true as const };
}

export async function createGoal(formData: FormData) {
  await ensureEmployeeProfileAccess();

  const parsed = parseKpiGoalFormData(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const duplicate = await findDuplicateGoal({
    employeeId: parsed.data.employee_id,
    goal: parsed.data.goal,
    goalMonth: parsed.data.goal_month,
  });
  if ("error" in duplicate) {
    return { error: duplicate.error };
  }

  const supabase = await createAdminClient();

  const { data: goal, error } = await supabase
    .from("employee_kpi_goals")
    .insert([parsed.data])
    .select("*")
    .single();

  if (error || !goal) {
    if (
      error?.message?.includes("does not exist") ||
      error?.message?.includes("relation") ||
      error?.code === "42P01"
    ) {
      return {
        error:
          "Employee KPI goals table does not exist. Please run the SQL migration in Supabase.",
      };
    }

    if (error?.code === "23505") {
      return {
        error:
          "A goal with the same title already exists for this employee in the selected month",
      };
    }

    return { error: error?.message || "Failed to create goal" };
  }

  revalidateGoalPaths();
  return { success: true, goal: goal as KpiGoal };
}

export async function updateGoal(formData: FormData) {
  await ensureEmployeeProfileAccess();

  const id = String(formData.get("id") || "").trim();
  if (!id) {
    return { error: "Goal id is required" };
  }

  const parsed = parseKpiGoalFormData(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const duplicate = await findDuplicateGoal({
    employeeId: parsed.data.employee_id,
    goal: parsed.data.goal,
    goalMonth: parsed.data.goal_month,
    excludeId: id,
  });
  if ("error" in duplicate) {
    return { error: duplicate.error };
  }

  const supabase = await createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("employee_kpi_goals")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message };
  }

  if (!existing) {
    return { error: "Goal not found" };
  }

  const { data: goal, error } = await supabase
    .from("employee_kpi_goals")
    .update({
      ...parsed.data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        error:
          "A goal with the same title already exists for this employee in the selected month",
      };
    }
    return { error: error.message };
  }

  revalidateGoalPaths();
  return { success: true, goal: goal as KpiGoal };
}

export async function deleteGoal(formData: FormData) {
  await ensureEmployeeProfileAccess();

  const id = String(formData.get("id") || "").trim();
  if (!id) {
    return { error: "Goal id is required" };
  }

  const supabase = await createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("employee_kpi_goals")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message };
  }

  if (!existing) {
    return { error: "Goal not found" };
  }

  const { error } = await supabase.from("employee_kpi_goals").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidateGoalPaths();
  return { success: true };
}

export async function getGoals(employeeId: string) {
  await ensureHrReadAccess();

  if (!employeeId) {
    return { error: "Employee ID is required" };
  }

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("employee_kpi_goals")
    .select("*")
    .eq("employee_id", employeeId)
    .order("goal_month", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    if (
      error.message.includes("does not exist") ||
      error.message.includes("relation") ||
      error.code === "42P01"
    ) {
      return { goals: [] as KpiGoal[] };
    }
    return { error: error.message };
  }

  return { goals: sortGoalsByMonth((data || []) as KpiGoal[]) };
}
