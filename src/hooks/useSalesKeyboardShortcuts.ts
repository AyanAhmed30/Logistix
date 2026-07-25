"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

type Options = {
  onFocusSearch?: () => void;
  onCreate?: () => void;
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
 * Odoo-inspired Sales shortcuts.
 * N → New, Ctrl/Cmd+S → Save, / → Search, Esc → cancel signal
 */
export function useSalesKeyboardShortcuts({
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSave?.();
        window.dispatchEvent(new CustomEvent("sales:shortcut-save"));
        return;
      }

      if (isTypingTarget(e.target)) return;

      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onFocusSearch?.();
        document
          .querySelector<HTMLInputElement>("[data-sales-search]")
          ?.focus();
        return;
      }

      if (
        e.key.toLowerCase() === "n" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        if (onCreate) {
          onCreate();
          return;
        }
        if (pathname.startsWith("/sales/products")) {
          router.push("/sales/products/new");
          return;
        }
        if (pathname.startsWith("/sales/customers")) {
          router.push("/sales/customers/new");
          return;
        }
        if (
          pathname.startsWith("/sales/quotations") ||
          pathname.startsWith("/sales/orders") ||
          pathname === "/sales"
        ) {
          router.push("/sales/quotations/new");
        }
      }

      if (e.key === "Escape") {
        window.dispatchEvent(new CustomEvent("sales:shortcut-escape"));
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled, onFocusSearch, onCreate, onSave, pathname, router]);
}
