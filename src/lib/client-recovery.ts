import { isStaleClientError } from "@/lib/user-facing-error";

const RELOADED_AT_KEY = "logistix-stale-reload-at";
const RELOAD_COOLDOWN_MS = 60_000;

/**
 * A page that crashed because this tab is on an older build is fixed by reloading
 * it. The page is already gone, so no work is lost. The cooldown stops a reload loop.
 */
export function reloadIfStaleClient(error: unknown): boolean {
  if (!isStaleClientError(error)) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT_KEY) ?? 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
