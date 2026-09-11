"use client";

import type { InquiryFlag } from "@/lib/inquiry-flags";

function formatFlagWhen(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

export function InquiryFlagMessages({
  flags,
  title = "Operations flag",
}: {
  flags: InquiryFlag[] | null | undefined;
  title?: string;
}) {
  const items = Array.isArray(flags) ? flags.filter((flag) => flag.message?.trim()) : [];
  if (items.length === 0) return null;

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 space-y-3">
      <p className="text-sm font-semibold text-amber-950">{title}</p>
      {items.map((flag) => (
        <div key={flag.id} className="space-y-1">
          <p className="text-sm text-amber-950 whitespace-pre-wrap">{flag.message}</p>
          <p className="text-xs text-amber-900/70">
            {[flag.raised_by, formatFlagWhen(flag.created_at)].filter(Boolean).join(" · ")}
          </p>
        </div>
      ))}
    </div>
  );
}
