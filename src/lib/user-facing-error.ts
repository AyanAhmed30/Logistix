/**
 * The one place that decides what an error may say to a user.
 *
 * Business messages ("Quantity exceeds stock") pass through unchanged. Technical
 * ones (database, network, runtime, framework) become a plain sentence, and the
 * detail goes to the logs instead of the screen.
 */

export const GENERIC_ERROR_MESSAGE = "We couldn't complete that request. Please try again.";
export const NETWORK_ERROR_MESSAGE = "Connection problem. Please check your internet and try again.";
export const REFRESH_NEEDED_MESSAGE =
  "This page needs a refresh. Your last action was not saved. Please refresh and try again.";

const POSTGRES_MESSAGES: Record<string, string> = {
  "23505": "This record already exists.",
  "23503": "This record is linked to other data, so the change could not be made.",
  "23502": "Some required information is missing.",
  "23514": "One of the values entered is not allowed.",
  "22001": "One of the values entered is too long.",
  "22003": "One of the numbers entered is too large.",
  "42501": "You do not have permission to do that.",
  "57014": "The request took too long. Please try again.",
};

/** Postgres SQLSTATE or PostgREST codes. Auth error codes are snake_case, so they do not match. */
const DATABASE_CODE = /^(?:[0-9A-Z]{5}|PGRST\d+)$/;
/** Raised on purpose by our own triggers and functions, so it is written for people. */
const RAISED_BY_OUR_SQL = "P0001";

const STALE_CLIENT_PATTERNS = [
  /^This page needs a refresh\./,
  /Server Action .* was not found/i,
  /failed-to-find-server-action/i,
  /An unexpected response was received from the server/i,
  /ChunkLoadError/i,
  /Loading (?:CSS )?chunk .* failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
];

const NETWORK_PATTERNS = [
  /\bFailed to fetch\b/i,
  /\bfetch failed\b/i,
  /\bNetworkError\b/i,
  /\bLoad failed\b/,
  /\bnetwork (?:request )?(?:error|failed)\b/i,
  /\bE(?:CONNRESET|CONNREFUSED|TIMEDOUT|NOTFOUND|AI_AGAIN)\b/,
];

const TECHNICAL_PATTERNS = [
  // Database
  /\brelation "?[\w.]+"? does not exist/i,
  /\bcolumn "?[\w.]+"? (?:of relation|does not exist)/i,
  /\bfunction [\w.]+\(.*\) does not exist/i,
  /\bviolates (?:unique|foreign key|check|not-null|row-level security|exclusion)/i,
  /\bduplicate key value\b/i,
  /\bpermission denied for\b/i,
  /\binvalid input (?:syntax|value) for\b/i,
  /\bsyntax error at or near\b/i,
  /\bstatement timeout\b/i,
  /\bschema cache\b/i,
  /\bCould not find (?:the|a) .*(?:column|function|relationship|table)\b/i,
  /\bJSON object requested\b/i,
  /\bCannot coerce the result\b/i,
  /\bPGRST\d+\b/,
  /\bSQLSTATE\b/,
  /\bsupabase\b/i,
  /\bInvalid API key\b/i,
  /\bJWT\b/,
  // Runtime and framework
  /\b(?:Type|Reference|Syntax|Range)Error\b/,
  /\bCannot read propert(?:y|ies)\b/i,
  /\bis not a function\b/,
  /\bis not iterable\b/,
  /\bundefined is not\b/,
  /\bnull is not an object\b/,
  /\bUnexpected token\b/,
  /\bis not valid JSON\b/,
  /\bServer Components render\b/,
  /\bdigest\b/i,
  /\bHydration\b/i,
  /\bat \S+ \(?\S+\.[jt]sx?:\d+/,
  // Infrastructure
  /<!doctype html/i,
  /\bInternal Server Error\b/i,
  /\b(?:Bad Gateway|Gateway Time-?out|Service Unavailable)\b/i,
  /\bFUNCTION_INVOCATION_\w+\b/,
];

const RUNTIME_ERROR_NAMES = new Set(["TypeError", "ReferenceError", "SyntaxError", "RangeError"]);

function rawMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const { message } = error as { message?: unknown };
    if (typeof message === "string") return message;
  }
  return "";
}

function errorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) {
    const { name } = error as { name?: unknown };
    if (typeof name === "string") return name;
  }
  return "";
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const { code } = error as { code?: unknown };
    if (typeof code === "string") return code;
  }
  return "";
}

const matchesAny = (patterns: RegExp[], text: string) => patterns.some((pattern) => pattern.test(text));

/** This tab is running an older build than the server. */
export function isStaleClientError(error: unknown): boolean {
  const name = errorName(error);
  if (name === "UnrecognizedActionError" || name === "ChunkLoadError") return true;
  return matchesAny(STALE_CLIENT_PATTERNS, rawMessage(error));
}

export function isNetworkError(error: unknown): boolean {
  return matchesAny(NETWORK_PATTERNS, rawMessage(error));
}

export function isTechnicalError(error: unknown): boolean {
  if (RUNTIME_ERROR_NAMES.has(errorName(error)) && !isNetworkError(error)) return true;
  const code = errorCode(error);
  if (DATABASE_CODE.test(code) && code !== RAISED_BY_OUR_SQL) return true;
  const message = rawMessage(error);
  return (
    matchesAny(TECHNICAL_PATTERNS, message) ||
    matchesAny(NETWORK_PATTERNS, message) ||
    matchesAny(STALE_CLIENT_PATTERNS, message)
  );
}

/** Returns text that is safe to show. Accepts an Error, a Supabase error, or a string. */
export function toUserMessage(error: unknown, fallback = GENERIC_ERROR_MESSAGE): string {
  if (isStaleClientError(error)) return REFRESH_NEEDED_MESSAGE;
  if (isNetworkError(error)) return NETWORK_ERROR_MESSAGE;

  const mapped = POSTGRES_MESSAGES[errorCode(error)];
  if (mapped) return mapped;

  if (isTechnicalError(error)) {
    return isTechnicalError(fallback) ? GENERIC_ERROR_MESSAGE : fallback;
  }
  return rawMessage(error).trim() || fallback;
}

/**
 * For `return { error: ... }` in server actions. Logs the technical detail for
 * developers. PostgREST `details` is left out because it can hold customer values.
 */
export function actionError(error: unknown, fallback = GENERIC_ERROR_MESSAGE): string {
  if (isTechnicalError(error)) {
    console.error("[action-error]", {
      code: errorCode(error) || undefined,
      message: rawMessage(error),
    });
  }
  return toUserMessage(error, fallback);
}
