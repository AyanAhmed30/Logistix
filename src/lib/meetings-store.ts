export type MeetingStatus = "Scheduled" | "Completed" | "Cancelled";
export type MeetingType = "Online" | "In Person";

export type MeetingRecord = {
  id: string;
  title: string;
  agenda: string;
  date: string; // ISO date
  startTime: string;
  endTime: string;
  organizer: string;
  participants: string[];
  location: string;
  meetingType: MeetingType;
  status: MeetingStatus;
  notes?: string;
};

const STORAGE_KEY = "hr_meetings";

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getStorage() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage;
}

export function readMeetings(): MeetingRecord[] {
  const s = getStorage();
  if (!s) return [];
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as MeetingRecord[];
  } catch {
    return [];
  }
}

export function persistMeetings(items: MeetingRecord[]) {
  const s = getStorage();
  if (!s) return items;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {}
  return items;
}

export function listMeetings({
  query,
  date,
  status,
  meetingType,
  sortBy,
  sortOrder,
}: {
  query?: string;
  date?: string;
  status?: MeetingStatus | "all";
  meetingType?: MeetingType | "all";
  sortBy?: "date" | "title";
  sortOrder?: "asc" | "desc";
} = {}) {
  let items = readMeetings();
  const q = query?.trim().toLowerCase() || "";
  const st = status && status !== "all" ? status : "all";
  const mt = meetingType && meetingType !== "all" ? meetingType : "all";

  items = items.filter((m) => {
    const matchesQ =
      !q || `${m.title} ${m.organizer}`.toLowerCase().includes(q);
    const matchesDate = !date || m.date === date;
    const matchesStatus = st === "all" || m.status === st;
    const matchesType = mt === "all" || m.meetingType === mt;
    return matchesQ && matchesDate && matchesStatus && matchesType;
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

export function createMeeting(
  input: Omit<MeetingRecord, "id" | "createdAt"> & {
    /* no createdAt in shape */
  },
) {
  const title = input.title?.trim() || "";
  const date = input.date;
  const startTime = input.startTime?.trim() || "";
  const endTime = input.endTime?.trim() || "";
  if (!title) return { error: "Title required" };
  if (!date) return { error: "Date required" };
  if (!startTime) return { error: "Start time required" };
  if (!endTime) return { error: "End time required" };

  const items = readMeetings();
  const next: MeetingRecord = {
    id: createId(),
    title,
    agenda: input.agenda || "",
    date,
    startTime,
    endTime,
    organizer: input.organizer || "",
    participants: input.participants || [],
    location: input.location || "",
    meetingType: input.meetingType || "Online",
    status: input.status || "Scheduled",
    notes: input.notes || "",
  };
  const nextItems = [next, ...items];
  persistMeetings(nextItems);
  return { success: true, meeting: next };
}

export function updateMeeting(id: string, input: Partial<MeetingRecord>) {
  const items = readMeetings();
  const idx = items.findIndex((m) => m.id === id);
  if (idx === -1) return { error: "Not found" };
  const updated = { ...items[idx], ...input };
  const next = items.map((m) => (m.id === id ? updated : m));
  persistMeetings(next);
  return { success: true, meeting: updated };
}

export function deleteMeeting(id: string) {
  const items = readMeetings();
  if (!items.some((m) => m.id === id)) return { error: "Not found" };
  const next = items.filter((m) => m.id !== id);
  persistMeetings(next);
  return { success: true };
}
