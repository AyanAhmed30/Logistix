export type EmploymentStatus =
  | "active"
  | "inactive"
  | "on_leave"
  | "suspended"
  | "resigned"
  | "terminated";

/** Maps expanded employment status to active/inactive for list UIs. */
export function toEmployeeListStatus(
  status: EmploymentStatus,
): "active" | "inactive" {
  return status === "active" ? "active" : "inactive";
}
