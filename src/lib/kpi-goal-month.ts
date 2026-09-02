/**
 * Shared KPI goal month helpers (client + server safe).
 * Kept outside "use server" so they can be sync utilities.
 */

/**
 * Normalize month input to the first day of the month (YYYY-MM-01).
 * Accepts YYYY-MM or YYYY-MM-DD.
 */
export function normalizeGoalMonth(value: string): string | { error: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { error: "Month is required" };
  }

  const monthOnly = /^(\d{4})-(\d{2})$/.exec(trimmed);
  const fullDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);

  let year: number;
  let month: number;

  if (monthOnly) {
    year = Number(monthOnly[1]);
    month = Number(monthOnly[2]);
  } else if (fullDate) {
    year = Number(fullDate[1]);
    month = Number(fullDate[2]);
  } else {
    return { error: "Please select a valid month" };
  }

  if (month < 1 || month > 12) {
    return { error: "Please select a valid month" };
  }

  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** Display helper: 2026-07-01 → "July 2026" */
export function formatGoalMonthLabel(
  goalMonth: string | null | undefined,
): string {
  if (!goalMonth) return "—";
  const key = String(goalMonth).slice(0, 10);
  const match = /^(\d{4})-(\d{2})/.exec(key);
  if (!match) return key;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  if (Number.isNaN(date.getTime())) return key;

  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

/** Current calendar month as YYYY-MM-01 */
export function getCurrentGoalMonth(referenceDate: Date = new Date()): string {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

/** Value for <input type="month"> from YYYY-MM-01 */
export function toMonthInputValue(
  goalMonth: string | null | undefined,
): string {
  if (!goalMonth) return "";
  return String(goalMonth).slice(0, 7);
}
