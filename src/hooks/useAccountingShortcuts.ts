"use client";

import { useEffect } from "react";

type Options = {
  enabled?: boolean;
  onSave?: () => void;
  onPrint?: () => void;
  onSearchFocus?: () => void;
  onEscape?: () => void;
};

/**
 * Odoo-inspired accounting shortcuts:
 * Ctrl/Cmd+S save, Ctrl/Cmd+P print, Ctrl/Cmd+F focus search, Esc close.
 */
export function useAccountingShortcuts({
  enabled = true,
  onSave,
  onPrint,
  onSearchFocus,
  onEscape,
}: Options) {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const typing =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable;

      if (e.key === "Escape") {
        onEscape?.();
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      const key = e.key.toLowerCase();
      if (key === "s" && onSave) {
        e.preventDefault();
        onSave();
        return;
      }
      if (key === "p" && onPrint) {
        e.preventDefault();
        onPrint();
        return;
      }
      if (key === "f" && onSearchFocus) {
        // Allow browser find unless we explicitly handle search focus for lists
        if (!typing) {
          e.preventDefault();
          onSearchFocus();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onSave, onPrint, onSearchFocus, onEscape]);
}
