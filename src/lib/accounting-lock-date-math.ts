/** Pure lock-date comparisons — no server imports. */

export function dateOnly(v: string | null | undefined): string {
  return String(v || '').slice(0, 10);
}

/** True when the document date is on or before a lock date (empty lock = unlocked). */
export function isAccountingDateOnOrBeforeLock(
  docDate: string,
  lockDate: string | null | undefined
): boolean {
  const lock = dateOnly(lockDate);
  if (!lock) return false;
  return dateOnly(docDate) <= lock;
}
