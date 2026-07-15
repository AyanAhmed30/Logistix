/**
 * Next.js uses thrown errors for control-flow (redirect / not-found).
 * These must never be shown as application errors.
 */
export function isNextRedirectError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const digest =
    "digest" in error && typeof (error as { digest?: unknown }).digest === "string"
      ? (error as { digest: string }).digest
      : "";

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return (
    digest.startsWith("NEXT_REDIRECT") ||
    message === "NEXT_REDIRECT" ||
    message.includes("NEXT_REDIRECT")
  );
}

export function isNextControlFlowError(error: unknown): boolean {
  if (isNextRedirectError(error)) return true;
  if (!error || typeof error !== "object") return false;

  const digest =
    "digest" in error && typeof (error as { digest?: unknown }).digest === "string"
      ? (error as { digest: string }).digest
      : "";

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return (
    digest.startsWith("NEXT_NOT_FOUND") ||
    message === "NEXT_NOT_FOUND" ||
    message.includes("NEXT_NOT_FOUND")
  );
}
