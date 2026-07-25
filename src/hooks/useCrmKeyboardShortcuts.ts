"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

type Options = {
  /** Called when user presses / to focus search (if not typing in an input). */
  onFocusSearch?: () => void;
  /** Create opportunity / quick-create. */
  onCreate?: () => void;
  /** Save current form if a handler is registered. */
  onSave?: () => void;
  enabled?: boolean;
};

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("[contenteditable='true']"));
}

/**
 * Odoo-inspired CRM shortcuts architecture.
 * N → New, Ctrl/Cmd+S → Save, Esc → Cancel (browser/dialog), / → Search
 */
export function useCrmKeyboardShortcuts({
  onFocusSearch,
  onCreate,
  onSave,
  enabled = true,
}: Options) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      // Ctrl/Cmd + S → save (always prevent browser save dialog in CRM)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSave?.();
        window.dispatchEvent(new CustomEvent("crm:shortcut-save"));
        return;
      }

      if (isTypingTarget(e.target)) return;

      // / → focus search
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onFocusSearch?.();
        const el = document.querySelector<HTMLInputElement>("[data-crm-search]");
        el?.focus();
        return;
      }

      // N → new opportunity
      if (e.key.toLowerCase() === "n" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (onCreate) {
          onCreate();
          return;
        }
        if (pathname.startsWith("/crm/pipeline")) {
          window.dispatchEvent(
            new CustomEvent("crm:pipeline-quick-create", { detail: {} })
          );
          return;
        }
        router.push("/crm/opportunities/new");
      }

      // Esc → generic cancel signal (dialogs handle via Radix)
      if (e.key === "Escape") {
        window.dispatchEvent(new CustomEvent("crm:shortcut-escape"));
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled, onFocusSearch, onCreate, onSave, pathname, router]);
}
