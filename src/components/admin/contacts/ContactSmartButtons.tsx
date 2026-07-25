"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Target,
  ShoppingCart,
  Calendar,
  CheckSquare,
  FileStack,
  type LucideIcon,
} from "lucide-react";
import {
  CONTACT_SMART_BUTTONS,
  type ContactSmartButtonCounts,
  type ContactSmartButtonKey,
} from "@/lib/contacts-integration";

const ICONS: Record<ContactSmartButtonKey, LucideIcon> = {
  opportunities: Target,
  sales: ShoppingCart,
  meetings: Calendar,
  tasks: CheckSquare,
  documents: FileStack,
};

type Props = {
  /** When false (unsaved contact), buttons are visible but non-interactive. */
  contactSaved?: boolean;
  contactId?: string | null;
  counts?: ContactSmartButtonCounts;
};

export function ContactSmartButtons({
  contactSaved = true,
  contactId = null,
  counts = {},
}: Props) {
  const router = useRouter();

  function handleClick(key: ContactSmartButtonKey, label: string, comingSoon?: boolean) {
    if (!contactSaved) return;

    if (comingSoon || key !== "opportunities") {
      toast.info(`${label} — Coming Soon`, {
        description: "This integration will be available in a future release.",
      });
      return;
    }

    if (!contactId) {
      toast.info("Save the contact first");
      return;
    }

    router.push(`/crm/pipeline?contactId=${encodeURIComponent(contactId)}`);
  }

  return (
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label="Related records"
    >
      {CONTACT_SMART_BUTTONS.map(({ key, label, placeholderCount, comingSoon }) => {
        const Icon = ICONS[key];
        const count = counts[key] ?? placeholderCount;
        return (
          <button
            key={key}
            type="button"
            disabled={!contactSaved}
            onClick={() => handleClick(key, label, comingSoon)}
            title={contactSaved ? label : "Save the contact first"}
            className="inline-flex items-stretch min-w-[7.5rem] h-11 rounded-md border border-slate-200 bg-white shadow-sm hover:bg-slate-50 hover:border-[#017e84]/40 transition-colors text-left overflow-hidden disabled:opacity-55 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-slate-200"
          >
            <div className="flex items-center justify-center px-2.5 border-r border-slate-100 text-slate-500 shrink-0">
              <Icon className="h-4 w-4" aria-hidden />
            </div>
            <div className="flex flex-col justify-center px-2.5 py-0.5 min-w-0">
              <span className="text-[11px] font-medium text-slate-600 leading-tight truncate">
                {label}
              </span>
              <span className="text-sm font-semibold text-primary-dark leading-tight tabular-nums">
                {count}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
