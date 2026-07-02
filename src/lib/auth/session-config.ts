/** Maximum JWT / cookie lifetime (sliding window, extended on activity). */
export const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000;
export const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_MS / 1000;

/**
 * Inactivity timeout — session expires when no user activity for this duration.
 * Defaults to 2 hours to match the previous hard JWT expiry behavior.
 */
export const INACTIVITY_TIMEOUT_MS = Number(
  process.env.SESSION_INACTIVITY_TIMEOUT_MS ?? SESSION_MAX_AGE_MS
);

/** Client-side mirror (must match server default). */
export const CLIENT_INACTIVITY_TIMEOUT_MS = Number(
  process.env.NEXT_PUBLIC_SESSION_INACTIVITY_TIMEOUT_MS ?? SESSION_MAX_AGE_MS
);

/** Minimum interval between server-side session refresh calls. */
export const SESSION_REFRESH_THROTTLE_MS = 5 * 60 * 1000;

/** How often the client checks inactivity / polls session health. */
export const SESSION_HEALTH_CHECK_MS = 60 * 1000;

export const SESSION_EXPIRED_STORAGE_KEY = "logistix-session-expired";
