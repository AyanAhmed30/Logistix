export type LocalPortalUser = {
  id: string;
  username: string;
  email: string;
  password: string;
  createdAt: string;
};

const STORAGE_KEY = "logistix-local-portal-users";
const CURRENT_USER_KEY = "logistix-current-portal-user";

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getStoredPortalUsers(): LocalPortalUser[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePortalUser(
  user: Omit<LocalPortalUser, "id" | "createdAt">,
) {
  const users = getStoredPortalUsers();
  const duplicate = users.some(
    (entry) => entry.username.toLowerCase() === user.username.toLowerCase(),
  );

  if (duplicate) {
    return { error: "A user with this username already exists." } as const;
  }

  const nextUser: LocalPortalUser = {
    id: createId(),
    ...user,
    createdAt: new Date().toISOString(),
  };

  const nextUsers = [nextUser, ...users];

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUsers));
  }

  return { success: true, user: nextUser } as const;
}

export function authenticatePortalUser(username: string, password: string) {
  const users = getStoredPortalUsers();
  const match = users.find(
    (entry) =>
      entry.username.toLowerCase() === username.trim().toLowerCase() &&
      entry.password === password,
  );

  if (!match) {
    return null;
  }

  if (typeof window !== "undefined") {
    window.localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(match));
  }

  return match;
}

export function getCurrentPortalUser() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(CURRENT_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
