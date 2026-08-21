export type HrPersonStatus = "active" | "inactive";

export type HrPersonRecord = {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  employeeId: string;
  status: HrPersonStatus;
  createdAt: string;
};

export type HrPersonFilters = {
  query?: string;
  status?: HrPersonStatus | "all";
  sortBy?: "createdAt" | "fullName" | "department" | "status";
  sortOrder?: "asc" | "desc";
};

export type HrPersonInput = {
  fullName: string;
  username: string;
  email?: string;
  phone?: string;
  department?: string;
  designation?: string;
  employeeId?: string;
  status?: HrPersonStatus;
};

const STORAGE_KEY = "logistix-hr-persons";
let memoryStore: HrPersonRecord[] = [];

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cloneRecords(records: HrPersonRecord[]): HrPersonRecord[] {
  return records.map((record) => ({ ...record }));
}

function getStorage() {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  return window.localStorage;
}

function readRecords(): HrPersonRecord[] {
  const storage = getStorage();

  if (storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as HrPersonRecord[];
        if (Array.isArray(parsed)) {
          memoryStore = cloneRecords(parsed);
          return cloneRecords(parsed);
        }
      }
    } catch {
      // Fall through to the in-memory store.
    }
  }

  return cloneRecords(memoryStore);
}

function persistRecords(records: HrPersonRecord[]) {
  const nextRecords = cloneRecords(records);
  memoryStore = nextRecords;

  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(nextRecords));
    } catch {
      // Ignore storage write failures.
    }
  }

  return nextRecords;
}

function normalizeString(value: string | undefined) {
  return value?.trim() || "";
}

export function validateHrPersonInput(input: HrPersonInput) {
  const fullName = normalizeString(input.fullName);
  const username = normalizeString(input.username);
  const email = normalizeString(input.email);
  const phone = normalizeString(input.phone);
  const status: HrPersonStatus =
    input.status === "inactive" ? "inactive" : "active";

  if (!fullName || fullName.length < 2) {
    return {
      error: "Full name is required and should be at least 2 characters long.",
    };
  }

  if (!username || username.length < 2) {
    return {
      error: "Username is required and should be at least 2 characters long.",
    };
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Please enter a valid email address." };
  }

  if (phone && !/^[+\d\-\s()]{4,}$/.test(phone)) {
    return { error: "Please enter a valid phone number." };
  }

  return {
    data: {
      fullName,
      username,
      email,
      phone,
      department: normalizeString(input.department),
      designation: normalizeString(input.designation),
      employeeId: normalizeString(input.employeeId),
      status,
    },
  };
}

export function listHrPeople(filters: HrPersonFilters = {}) {
  const records = readRecords();
  const query = normalizeString(filters.query).toLowerCase();
  const status =
    filters.status === "active" || filters.status === "inactive"
      ? filters.status
      : "all";
  const sortBy = filters.sortBy || "createdAt";
  const sortOrder = filters.sortOrder || "desc";

  const filtered = records.filter((record) => {
    const matchesQuery =
      !query ||
      [
        record.fullName,
        record.username,
        record.department,
        record.designation,
        record.employeeId,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);

    const matchesStatus = status === "all" || record.status === status;

    return matchesQuery && matchesStatus;
  });

  filtered.sort((a, b) => {
    const left = a[sortBy] ?? "";
    const right = b[sortBy] ?? "";
    const comparison = String(left).localeCompare(String(right), undefined, {
      sensitivity: "base",
    });

    return sortOrder === "asc" ? comparison : -comparison;
  });

  return cloneRecords(filtered);
}

export function createHrPerson(input: HrPersonInput) {
  const validation = validateHrPersonInput(input);
  if ("error" in validation) {
    return { error: validation.error };
  }

  const nextRecord: HrPersonRecord = {
    id: createId(),
    ...validation.data,
    createdAt: new Date().toISOString(),
  };

  const nextRecords = [nextRecord, ...readRecords()];
  persistRecords(nextRecords);

  return { success: true, hrPerson: nextRecord };
}

export function updateHrPerson(id: string, input: HrPersonInput) {
  const validation = validateHrPersonInput(input);
  if ("error" in validation) {
    return { error: validation.error };
  }

  const current = readRecords();
  const index = current.findIndex((record) => record.id === id);

  if (index === -1) {
    return { error: "HR person not found." };
  }

  const updatedRecord: HrPersonRecord = {
    ...current[index],
    ...validation.data,
  };

  const nextRecords = current.map((record) =>
    record.id === id ? updatedRecord : record,
  );
  persistRecords(nextRecords);

  return { success: true, hrPerson: updatedRecord };
}

export function deleteHrPerson(id: string) {
  const current = readRecords();
  const exists = current.some((record) => record.id === id);

  if (!exists) {
    return { error: "HR person not found." };
  }

  const nextRecords = current.filter((record) => record.id !== id);
  persistRecords(nextRecords);

  return { success: true };
}
