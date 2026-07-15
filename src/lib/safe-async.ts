export type SafeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export const DEFAULT_ACTION_TIMEOUT_MS = 60_000;
export const DEFAULT_STUCK_LOADING_MS = 90_000;

export class ActionTimeoutError extends Error {
  constructor(message = "Request timed out. Please try again.") {
    super(message);
    this.name = "ActionTimeoutError";
  }
}

export function getErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  // Never surface Next.js control-flow exceptions as user-facing errors.
  if (
    (typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT")) ||
    (error instanceof Error && error.message.includes("NEXT_REDIRECT")) ||
    (typeof error === "string" && error.includes("NEXT_REDIRECT"))
  ) {
    return fallback;
  }
  if (error instanceof ActionTimeoutError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = DEFAULT_ACTION_TIMEOUT_MS,
  message = "Request timed out. Please try again."
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ActionTimeoutError(message));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function safeAsync<T>(
  fn: () => Promise<T>,
  options?: {
    timeoutMs?: number;
    timeoutMessage?: string;
    fallback?: T;
    fallbackError?: string;
  }
): Promise<SafeResult<T>> {
  try {
    const value = await withTimeout(
      fn(),
      options?.timeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS,
      options?.timeoutMessage
    );
    return { ok: true, value };
  } catch (error) {
    if (options && "fallback" in options) {
      return { ok: true, value: options.fallback as T };
    }
    return {
      ok: false,
      error: getErrorMessage(error, options?.fallbackError),
    };
  }
}

export function isActionErrorResult<T extends Record<string, unknown>>(
  result: T | null | undefined
): result is T & { error: string } {
  return Boolean(result && typeof result === "object" && "error" in result && result.error);
}
