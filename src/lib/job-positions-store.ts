export type JobPositionStatus = "Active" | "Inactive";

export type JobPosition = {
  id: string;
  title: string;
  department: string;
  description?: string;
  status: JobPositionStatus;
  createdAt: string;
};

const STORAGE_KEY = "hr_job_positions";

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getStorage() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage;
}

export function readPositions(): JobPosition[] {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as JobPosition[];
  } catch {
    return [];
  }
}

export function persistPositions(items: JobPosition[]) {
  const storage = getStorage();
  if (!storage) return items;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
  return items;
}

export function listPositions({
  query,
  department,
  status,
  sortBy,
  sortOrder,
}: {
  query?: string;
  department?: string;
  status?: JobPositionStatus | "all";
  sortBy?: "title" | "createdAt";
  sortOrder?: "asc" | "desc";
} = {}) {
  let items = readPositions();
  const q = query?.trim().toLowerCase() || "";
  const dept = department?.trim().toLowerCase() || "";
  const st = status === "Active" || status === "Inactive" ? status : "all";

  items = items.filter((p) => {
    const matchesQuery =
      !q || `${p.title} ${p.department}`.toLowerCase().includes(q);
    const matchesDept = !dept || p.department.toLowerCase() === dept;
    const matchesStatus = st === "all" || p.status === st;
    return matchesQuery && matchesDept && matchesStatus;
  });

  const by = sortBy || "createdAt";
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

export function createPosition(input: {
  title: string;
  department: string;
  description?: string;
  status?: JobPositionStatus;
}) {
  const title = input.title?.trim() || "";
  const department = input.department?.trim() || "";
  const description = input.description?.trim() || "";
  const status: JobPositionStatus =
    input.status === "Inactive" ? "Inactive" : "Active";

  if (!title) return { error: "Position title is required." };

  const existing = readPositions();
  if (existing.some((p) => p.title.toLowerCase() === title.toLowerCase())) {
    return { error: "A position with this title already exists." };
  }

  const next: JobPosition = {
    id: createId(),
    title,
    department,
    description,
    status,
    createdAt: new Date().toISOString(),
  };
  const items = [next, ...existing];
  persistPositions(items);
  return { success: true, position: next };
}

export function updatePosition(
  id: string,
  input: {
    title: string;
    department: string;
    description?: string;
    status?: JobPositionStatus;
  },
) {
  const items = readPositions();
  const index = items.findIndex((p) => p.id === id);
  if (index === -1) return { error: "Position not found." };

  const title = input.title?.trim() || "";
  if (!title) return { error: "Position title is required." };

  // Prevent duplicate title for other records
  if (
    items.some(
      (p) => p.id !== id && p.title.toLowerCase() === title.toLowerCase(),
    )
  ) {
    return { error: "A position with this title already exists." };
  }

  const updated: JobPosition = {
    ...items[index],
    title,
    department: input.department?.trim() || "",
    description: input.description?.trim() || "",
    status: input.status === "Inactive" ? "Inactive" : "Active",
  };
  const next = items.map((p) => (p.id === id ? updated : p));
  persistPositions(next);
  return { success: true, position: updated };
}

export function deletePosition(id: string) {
  const items = readPositions();
  if (!items.some((p) => p.id === id)) return { error: "Position not found." };
  const next = items.filter((p) => p.id !== id);
  persistPositions(next);
  return { success: true };
}
