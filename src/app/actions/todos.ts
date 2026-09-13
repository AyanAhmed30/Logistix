"use server";

import { createAdminClient } from "@/utils/supabase/server";
import { getSession, type SessionPayload } from "@/lib/auth/session";
import { canAccessAdminDashboard } from "@/lib/auth/portal-access";
import { isSuperAdminSession } from "@/lib/auth/super-admin";
import { revalidatePath } from "next/cache";

export type TodoPriority = "low" | "medium" | "high";
export type TodoStatus = "pending" | "in_progress" | "completed";

export type Todo = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: TodoPriority;
  status: TodoStatus;
  assigned_to_user_id: string | null;
  assigned_to_employee_id: string | null;
  assigned_to_username: string;
  assigned_to_name: string;
  created_by_user_id: string | null;
  created_by_username: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
};

export type TodoListItem = Todo & {
  canManage: boolean;
};

export type TodoAssignableUser = {
  key: string;
  id: string | null;
  name: string;
  username: string;
};

const CURRENT_ADMIN_ASSIGNEE_KEY = "__current_admin__";

const PRIORITIES: TodoPriority[] = ["low", "medium", "high"];
const STATUSES: TodoStatus[] = ["pending", "in_progress", "completed"];

const TABLE_MISSING_MESSAGE =
  "To-Do table does not exist. Please run the SQL in supabase/to-do-migrations/.";

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isMissingTableError(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = String(error.message || "").toLowerCase();
  return (
    error.code === "42P01" ||
    message.includes("does not exist") ||
    message.includes("relation")
  );
}

function isMissingColumnError(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = String(error.message || "").toLowerCase();
  return (
    error.code === "42703" ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

function displayName(fullName: string | null | undefined, username: string) {
  const name = String(fullName || "").trim();
  return name || username;
}

async function requireTodoAdminSession(): Promise<
  SessionPayload | { error: string }
> {
  const session = await getSession();
  if (!session || !canAccessAdminDashboard(session)) {
    return { error: "Unauthorized" };
  }
  return session;
}

function mapTodo(row: Record<string, unknown>): Todo {
  const priority = String(row.priority || "medium");
  const status = String(row.status || "pending");
  return {
    id: String(row.id),
    title: String(row.title || ""),
    description: row.description ? String(row.description) : null,
    due_date: row.due_date ? String(row.due_date) : null,
    priority: PRIORITIES.includes(priority as TodoPriority)
      ? (priority as TodoPriority)
      : "medium",
    status: STATUSES.includes(status as TodoStatus)
      ? (status as TodoStatus)
      : "pending",
    assigned_to_user_id: row.assigned_to_user_id
      ? String(row.assigned_to_user_id)
      : null,
    assigned_to_employee_id: row.assigned_to_employee_id
      ? String(row.assigned_to_employee_id)
      : null,
    assigned_to_username: String(row.assigned_to_username || ""),
    assigned_to_name: String(row.assigned_to_name || ""),
    created_by_user_id: row.created_by_user_id
      ? String(row.created_by_user_id)
      : null,
    created_by_username: String(row.created_by_username || ""),
    created_by_name: String(row.created_by_name || ""),
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
  };
}

function isAssignedToSession(todo: Todo, session: SessionPayload) {
  if (
    session.appUserId &&
    todo.assigned_to_user_id &&
    todo.assigned_to_user_id === session.appUserId
  ) {
    return true;
  }

  if (
    !todo.assigned_to_user_id &&
    !todo.assigned_to_employee_id &&
    todo.assigned_to_username === session.username
  ) {
    return true;
  }

  return false;
}

async function assignToCurrentUser(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  session: SessionPayload
): Promise<
  | {
      assigned_to_user_id: string | null;
      assigned_to_employee_id: string | null;
      assigned_to_username: string;
      assigned_to_name: string;
    }
  | { error: string }
> {
  if (session.appUserId) {
    const { data, error } = await supabase
      .from("app_users")
      .select("id, username, full_name")
      .eq("id", session.appUserId)
      .maybeSingle();
    if (error) return { error: error.message };
    if (data) {
      const username = String(data.username || session.username);
      return {
        assigned_to_user_id: String(data.id),
        assigned_to_employee_id: null,
        assigned_to_username: username,
        assigned_to_name: displayName(
          data.full_name ? String(data.full_name) : session.fullName,
          username
        ),
      };
    }
  }

  return {
    assigned_to_user_id: null,
    assigned_to_employee_id: null,
    assigned_to_username: session.username,
    assigned_to_name: displayName(session.fullName, session.username),
  };
}

async function resolveAppUserAssignee(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  userId: string
): Promise<
  | {
      assigned_to_user_id: string | null;
      assigned_to_employee_id: string | null;
      assigned_to_username: string;
      assigned_to_name: string;
    }
  | { error: string }
> {
  const id = userId.trim();
  if (!id) return { error: "Assigned user is required" };

  const { data, error } = await supabase
    .from("app_users")
    .select("id, username, full_name")
    .eq("id", id)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Assigned user not found" };

  const username = String(data.username || "");
  return {
    assigned_to_user_id: String(data.id),
    assigned_to_employee_id: null,
    assigned_to_username: username,
    assigned_to_name: displayName(
      data.full_name ? String(data.full_name) : null,
      username
    ),
  };
}

export async function createTodo(formData: FormData) {
  const sessionOrError = await requireTodoAdminSession();
  if ("error" in sessionOrError) return sessionOrError;
  const session = sessionOrError;

  const title = String(formData.get("title") || "").trim();
  const description = emptyToNull(String(formData.get("description") || ""));
  const dueDate = String(formData.get("due_date") || formData.get("dueDate") || "").trim();
  const priorityRaw = String(formData.get("priority") || "medium")
    .trim()
    .toLowerCase();
  const statusRaw = String(formData.get("status") || "pending")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!title) return { error: "Title is required" };
  if (!dueDate) return { error: "Due date is required" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return { error: "Due date must be a valid date" };
  }

  const priority = PRIORITIES.includes(priorityRaw as TodoPriority)
    ? (priorityRaw as TodoPriority)
    : null;
  if (!priority) return { error: "Invalid priority" };

  const status = STATUSES.includes(statusRaw as TodoStatus)
    ? (statusRaw as TodoStatus)
    : null;
  if (!status) return { error: "Invalid status" };

  const supabase = await createAdminClient();
  const assignee = await assignToCurrentUser(supabase, session);
  if ("error" in assignee) return assignee;

  const now = new Date().toISOString();
  const payload = {
    title,
    description,
    due_date: dueDate,
    priority,
    status,
    assigned_to_user_id: assignee.assigned_to_user_id,
    assigned_to_employee_id: assignee.assigned_to_employee_id,
    assigned_to_username: assignee.assigned_to_username,
    assigned_to_name: assignee.assigned_to_name,
    created_by_user_id: session.appUserId ?? null,
    created_by_username: session.username,
    created_by_name: displayName(session.fullName, session.username),
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("todos")
    .insert([payload])
    .select("*")
    .single();

  if (error || !data) {
    if (isMissingTableError(error)) {
      return { error: TABLE_MISSING_MESSAGE };
    }
    return { error: error?.message || "Failed to create to-do" };
  }

  revalidatePath("/todo");
  revalidatePath("/todo/my-tasks");
  return { success: true as const, todo: mapTodo(data as Record<string, unknown>) };
}

export async function getTodoAssignableUsers(): Promise<
  { users: TodoAssignableUser[] } | { error: string }
> {
  const sessionOrError = await requireTodoAdminSession();
  if ("error" in sessionOrError) return sessionOrError;
  const session = sessionOrError;

  if (!isSuperAdminSession(session)) {
    return { error: "Access Denied" };
  }

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("app_users")
    .select("id, username, full_name")
    .order("username", { ascending: true });

  if (error && !isMissingTableError(error)) {
    return { error: error.message };
  }

  const users: TodoAssignableUser[] = [];
  const seenUsernames = new Set<string>();

  users.push({
    key: CURRENT_ADMIN_ASSIGNEE_KEY,
    id: session.appUserId ?? null,
    name: displayName(session.fullName, session.username),
    username: session.username,
  });
  seenUsernames.add(session.username.toLowerCase());

  for (const row of data || []) {
    const username = String(row.username || "").trim();
    if (!username) continue;
    if (seenUsernames.has(username.toLowerCase())) continue;
    seenUsernames.add(username.toLowerCase());
    users.push({
      key: `user:${String(row.id)}`,
      id: String(row.id),
      name: displayName(row.full_name ? String(row.full_name) : null, username),
      username,
    });
  }

  return { users };
}

export async function createAssignedTodo(formData: FormData) {
  const sessionOrError = await requireTodoAdminSession();
  if ("error" in sessionOrError) return sessionOrError;
  const session = sessionOrError;

  if (!isSuperAdminSession(session)) {
    return { error: "Access Denied" };
  }

  const title = String(formData.get("title") || "").trim();
  const description = emptyToNull(String(formData.get("description") || ""));
  const dueDate = String(formData.get("due_date") || formData.get("dueDate") || "").trim();
  const priorityRaw = String(formData.get("priority") || "medium")
    .trim()
    .toLowerCase();
  const statusRaw = String(formData.get("status") || "pending")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const assigneeKey = String(formData.get("assignee_key") || "").trim();

  if (!title) return { error: "Title is required" };
  if (!dueDate) return { error: "Due date is required" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return { error: "Due date must be a valid date" };
  }
  if (!assigneeKey) return { error: "Assigned user is required" };

  const priority = PRIORITIES.includes(priorityRaw as TodoPriority)
    ? (priorityRaw as TodoPriority)
    : null;
  if (!priority) return { error: "Invalid priority" };

  const status = STATUSES.includes(statusRaw as TodoStatus)
    ? (statusRaw as TodoStatus)
    : null;
  if (!status) return { error: "Invalid status" };

  const supabase = await createAdminClient();
  const assignee =
    assigneeKey === CURRENT_ADMIN_ASSIGNEE_KEY
      ? await assignToCurrentUser(supabase, session)
      : assigneeKey.startsWith("user:")
        ? await resolveAppUserAssignee(supabase, assigneeKey.slice("user:".length))
        : { error: "Invalid assigned user" };
  if ("error" in assignee) return assignee;

  const now = new Date().toISOString();
  const payload = {
    title,
    description,
    due_date: dueDate,
    priority,
    status,
    assigned_to_user_id: assignee.assigned_to_user_id,
    assigned_to_employee_id: null,
    assigned_to_username: assignee.assigned_to_username,
    assigned_to_name: assignee.assigned_to_name,
    created_by_user_id: session.appUserId ?? null,
    created_by_username: session.username,
    created_by_name: displayName(session.fullName, session.username),
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("todos")
    .insert([payload])
    .select("*")
    .single();

  if (error || !data) {
    if (isMissingTableError(error)) {
      return { error: TABLE_MISSING_MESSAGE };
    }
    return { error: error?.message || "Failed to assign to-do" };
  }

  revalidatePath("/todo");
  revalidatePath("/todo/my-tasks");
  return { success: true as const, todo: mapTodo(data as Record<string, unknown>) };
}

function toListItem(todo: Todo, session: SessionPayload): TodoListItem {
  return {
    ...todo,
    canManage: isAssignedToSession(todo, session),
  };
}

export async function getMyTodos() {
  const sessionOrError = await requireTodoAdminSession();
  if ("error" in sessionOrError) return sessionOrError;
  const session = sessionOrError;
  const isSystemAdmin = isSuperAdminSession(session);

  const supabase = await createAdminClient();

  if (isSystemAdmin) {
    const { data, error } = await supabase
      .from("todos")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      if (isMissingTableError(error) || isMissingColumnError(error)) {
        return { todos: [] as TodoListItem[], isSystemAdmin };
      }
      return { error: error.message };
    }

    return {
      todos: (data || []).map((row) =>
        toListItem(mapTodo(row as Record<string, unknown>), session)
      ),
      isSystemAdmin,
    };
  }

  const rows: Record<string, unknown>[] = [];

  if (session.appUserId) {
    const { data, error } = await supabase
      .from("todos")
      .select("*")
      .eq("assigned_to_user_id", session.appUserId)
      .order("created_at", { ascending: false });

    if (error) {
      if (isMissingTableError(error) || isMissingColumnError(error)) {
        return { todos: [] as TodoListItem[], isSystemAdmin };
      }
      return { error: error.message };
    }
    for (const row of data || []) {
      rows.push(row as Record<string, unknown>);
    }
  }

  const { data, error } = await supabase
    .from("todos")
    .select("*")
    .is("assigned_to_user_id", null)
    .is("assigned_to_employee_id", null)
    .eq("assigned_to_username", session.username)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error) || isMissingColumnError(error)) {
      return { todos: [] as TodoListItem[], isSystemAdmin };
    }
    return { error: error.message };
  }

  for (const row of data || []) {
    rows.push(row as Record<string, unknown>);
  }

  const merged = new Map<string, TodoListItem>();
  for (const row of rows) {
    const todo = mapTodo(row);
    if (isAssignedToSession(todo, session)) {
      merged.set(todo.id, toListItem(todo, session));
    }
  }

  const todos = Array.from(merged.values()).sort((left, right) =>
    String(right.created_at).localeCompare(String(left.created_at))
  );

  return { todos, isSystemAdmin };
}

export async function updateTodoStatus(todoId: string, status: string) {
  const sessionOrError = await requireTodoAdminSession();
  if ("error" in sessionOrError) return sessionOrError;
  const session = sessionOrError;

  const id = String(todoId || "").trim();
  if (!id) return { error: "To-do id is required" };

  const normalized = String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!STATUSES.includes(normalized as TodoStatus)) {
    return { error: "Invalid status" };
  }

  const supabase = await createAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("todos")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    if (isMissingTableError(existingError)) {
      return { error: TABLE_MISSING_MESSAGE };
    }
    return { error: existingError.message };
  }

  if (!existing) return { error: "To-do not found" };

  const current = mapTodo(existing as Record<string, unknown>);
  if (!isAssignedToSession(current, session)) {
    return { error: "Access Denied" };
  }

  const { data, error } = await supabase
    .from("todos")
    .update({
      status: normalized,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    return { error: error?.message || "Failed to update status" };
  }

  revalidatePath("/todo");
  revalidatePath("/todo/my-tasks");
  return { success: true as const, todo: mapTodo(data as Record<string, unknown>) };
}

export async function updateTodo(formData: FormData) {
  const sessionOrError = await requireTodoAdminSession();
  if ("error" in sessionOrError) return sessionOrError;
  const session = sessionOrError;

  const id = String(formData.get("id") || "").trim();
  if (!id) return { error: "To-do id is required" };

  const title = String(formData.get("title") || "").trim();
  const description = emptyToNull(String(formData.get("description") || ""));
  const dueDate = String(formData.get("due_date") || formData.get("dueDate") || "").trim();
  const priorityRaw = String(formData.get("priority") || "medium")
    .trim()
    .toLowerCase();
  const statusRaw = String(formData.get("status") || "pending")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (!title) return { error: "Title is required" };
  if (!dueDate) return { error: "Due date is required" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return { error: "Due date must be a valid date" };
  }

  const priority = PRIORITIES.includes(priorityRaw as TodoPriority)
    ? (priorityRaw as TodoPriority)
    : null;
  if (!priority) return { error: "Invalid priority" };

  const status = STATUSES.includes(statusRaw as TodoStatus)
    ? (statusRaw as TodoStatus)
    : null;
  if (!status) return { error: "Invalid status" };

  const supabase = await createAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("todos")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    if (isMissingTableError(existingError)) {
      return { error: TABLE_MISSING_MESSAGE };
    }
    return { error: existingError.message };
  }

  if (!existing) return { error: "To-do not found" };

  const current = mapTodo(existing as Record<string, unknown>);
  if (!isAssignedToSession(current, session)) {
    return { error: "Access Denied" };
  }

  const { data, error } = await supabase
    .from("todos")
    .update({
      title,
      description,
      due_date: dueDate,
      priority,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    return { error: error?.message || "Failed to update to-do" };
  }

  revalidatePath("/todo");
  revalidatePath("/todo/my-tasks");
  return { success: true as const, todo: mapTodo(data as Record<string, unknown>) };
}

export async function deleteTodo(todoId: string) {
  const sessionOrError = await requireTodoAdminSession();
  if ("error" in sessionOrError) return sessionOrError;
  const session = sessionOrError;

  const id = String(todoId || "").trim();
  if (!id) return { error: "To-do id is required" };

  const supabase = await createAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("todos")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    if (isMissingTableError(existingError)) {
      return { error: TABLE_MISSING_MESSAGE };
    }
    return { error: existingError.message };
  }

  if (!existing) return { error: "To-do not found" };

  const current = mapTodo(existing as Record<string, unknown>);
  if (!isAssignedToSession(current, session)) {
    return { error: "Access Denied" };
  }

  const { error } = await supabase.from("todos").delete().eq("id", id);

  if (error) {
    return { error: error.message || "Failed to delete to-do" };
  }

  revalidatePath("/todo");
  revalidatePath("/todo/my-tasks");
  return { success: true as const };
}
