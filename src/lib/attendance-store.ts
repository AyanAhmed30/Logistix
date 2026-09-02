export type AttendanceStatus =
  | "Present"
  | "Absent"
  | "Late"
  | "Half Day"
  | "Work From Home";

export type AttendanceRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  date: string; // ISO date
  checkIn?: string;
  checkOut?: string;
  status: AttendanceStatus;
  remarks?: string;
};

const STORAGE_KEY = "hr_attendance";

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getStorage() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage;
}

export function readAttendance(): AttendanceRecord[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as AttendanceRecord[];
  } catch {
    return [];
  }
}

export function persistAttendance(items: AttendanceRecord[]) {
  const storage = getStorage();
  if (!storage) return items;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {}
  return items;
}

export function listAttendance({
  query,
  date,
  department,
  status,
  sortBy,
  sortOrder,
}: {
  query?: string;
  date?: string;
  department?: string;
  status?: AttendanceStatus | "all";
  sortBy?: "date" | "employeeName";
  sortOrder?: "asc" | "desc";
} = {}) {
  let items = readAttendance();
  const q = query?.trim().toLowerCase() || "";
  const dept = department?.trim().toLowerCase() || "";
  const st = status === "all" || !status ? "all" : status;

  items = items.filter((r) => {
    const matchesQ =
      !q || `${r.employeeName} ${r.department}`.toLowerCase().includes(q);
    const matchesDate = !date || r.date === date;
    const matchesDept = !dept || r.department.toLowerCase() === dept;
    const matchesStatus = st === "all" || r.status === st;
    return matchesQ && matchesDate && matchesDept && matchesStatus;
  });

  const by = sortBy || "date";
  const order = sortOrder || "desc";
  items.sort((a, b) => {
    const left = a[by] || "";
    const right = b[by] || "";
    const cmp = String(left).localeCompare(String(right), undefined, {
      sensitivity: "base",
    });
    return order === "asc" ? cmp : -cmp;
  });

  return items;
}

export function createAttendance(input: {
  employeeId: string;
  employeeName: string;
  department: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: AttendanceStatus;
  remarks?: string;
}) {
  const items = readAttendance();
  // prevent duplicate for same employee/date
  if (
    items.some(
      (r) => r.employeeId === input.employeeId && r.date === input.date,
    )
  ) {
    return {
      error:
        "Attendance already recorded for this employee on the selected date.",
    };
  }

  const next: AttendanceRecord = {
    id: createId(),
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    department: input.department,
    date: input.date,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    status: input.status,
    remarks: input.remarks,
  };
  const nextItems = [next, ...items];
  persistAttendance(nextItems);
  return { success: true, record: next };
}

export function updateAttendance(
  id: string,
  input: {
    checkIn?: string;
    checkOut?: string;
    status?: AttendanceStatus;
    remarks?: string;
  },
) {
  const items = readAttendance();
  const idx = items.findIndex((r) => r.id === id);
  if (idx === -1) return { error: "Attendance record not found." };
  const updated = {
    ...items[idx],
    checkIn: input.checkIn ?? items[idx].checkIn,
    checkOut: input.checkOut ?? items[idx].checkOut,
    status: input.status ?? items[idx].status,
    remarks: input.remarks ?? items[idx].remarks,
  };
  const next = items.map((r) => (r.id === id ? updated : r));
  persistAttendance(next);
  return { success: true, record: updated };
}

export function deleteAttendance(id: string) {
  const items = readAttendance();
  if (!items.some((r) => r.id === id)) return { error: "Not found" };
  const next = items.filter((r) => r.id !== id);
  persistAttendance(next);
  return { success: true };
}
