"use client";

import { useEffect } from "react";
import { useSuperAdminViewOnly } from "@/contexts/AdminOrganizationContext";
import { toast } from "@/lib/app-toast";
import { isWriteActionLabel } from "@/lib/view-only-labels";

const MARK = "data-view-only-disabled";
const CLICKABLE = 'button, a, [role="button"], [role="menuitem"]';

function isWriteControl(el: Element) {
  if (el.closest("[data-view-only-allow]")) return false;
  // Dropdowns show the chosen value (e.g. a stage called "New"), not an action.
  if (el.getAttribute("role") === "combobox" || el.getAttribute("aria-haspopup") === "listbox") return false;
  return isWriteActionLabel(el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "");
}

/**
 * Mounted inside CRM, Contact, Sales and Accounting. When Super Admin is viewing
 * an organization it turns off controls that change records. It renders nothing.
 * The server refuses the same changes, so this only keeps the screen honest.
 */
export function ViewOnlyGuard() {
  const viewOnly = useSuperAdminViewOnly();

  useEffect(() => {
    if (!viewOnly) return;

    const sweep = () => {
      document.querySelectorAll(`${CLICKABLE}`).forEach((el) => {
        if (el.hasAttribute(MARK) || !isWriteControl(el)) return;
        if (el instanceof HTMLButtonElement) {
          if (el.disabled) return;
          el.disabled = true;
        } else {
          // Links cannot be disabled; they look disabled and their clicks are stopped below.
          el.setAttribute("aria-disabled", "true");
          el.classList.add("pointer-events-none", "opacity-50");
        }
        el.setAttribute(MARK, "");
      });
    };

    let frame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sweep);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    sweep();

    // Links and menu items cannot be disabled, so their clicks are stopped instead.
    const onClick = (event: MouseEvent) => {
      const target = (event.target as Element | null)?.closest(CLICKABLE);
      if (!target || !isWriteControl(target)) return;
      event.preventDefault();
      event.stopPropagation();
      toast.info("View only: changes are turned off while you are viewing an organization.");
    };
    document.addEventListener("click", onClick, true);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
      document.querySelectorAll(`[${MARK}]`).forEach((el) => {
        if (el instanceof HTMLButtonElement) {
          el.disabled = false;
        } else {
          el.removeAttribute("aria-disabled");
          el.classList.remove("pointer-events-none", "opacity-50");
        }
        el.removeAttribute(MARK);
      });
    };
  }, [viewOnly]);

  return null;
}
