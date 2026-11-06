import { toast as sonner, type ExternalToast } from "sonner";
import {
  REFRESH_NEEDED_MESSAGE,
  isStaleClientError,
  isTechnicalError,
  toUserMessage,
} from "@/lib/user-facing-error";

type ToastMessage = Parameters<typeof sonner.error>[0];

function clean(message: ToastMessage): ToastMessage {
  if (typeof message !== "string") return message;
  if (isTechnicalError(message)) console.error("[toast]", message);
  return toUserMessage(message);
}

function error(message: ToastMessage, data?: ExternalToast) {
  if (typeof message === "string" && isStaleClientError(message)) {
    return showRefreshNeeded();
  }
  const text = clean(message);
  const description = typeof data?.description === "string" ? toUserMessage(data.description) : data?.description;
  // One id per text, so a repeated failure updates the toast instead of stacking.
  const id = data?.id ?? (typeof text === "string" ? `error:${text}` : undefined);
  return sonner.error(text, { ...data, description, id });
}

export function showRefreshNeeded() {
  return sonner.error(REFRESH_NEEDED_MESSAGE, {
    id: "refresh-needed",
    duration: Infinity,
    action: { label: "Refresh", onClick: () => window.location.reload() },
  });
}

/** Use this instead of importing from "sonner"; ESLint enforces it. */
export const toast = {
  error,
  success: sonner.success,
  info: (message: ToastMessage, data?: ExternalToast) => sonner.info(clean(message), data),
  message: (message: ToastMessage, data?: ExternalToast) => sonner.message(clean(message), data),
  warning: (message: ToastMessage, data?: ExternalToast) => sonner.warning(clean(message), data),
  dismiss: sonner.dismiss,
};
