"use client";

import type { PipelineSummary } from "@/lib/crm-pipeline-filter";

const CARDS: Array<{ key: keyof PipelineSummary; label: string }> = [
  { key: "contacts", label: "Contacts" },
  { key: "inquiriesSent", label: "Inquiries sent" },
  { key: "approved", label: "Approved inquiries" },
  { key: "rejected", label: "Rejected inquiries" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];

/** Super Admin's summary for the filtered pipeline: six numbers. */
export function CrmPipelineOverview({
  summary,
}: {
  /** null while that number is loading. */
  summary: Record<keyof PipelineSummary, number | null>;
}) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {CARDS.map((card) => {
          const value = summary[card.key];
          return (
            <div key={card.key} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              <p className="text-xs font-medium text-slate-600">{card.label}</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums text-primary-dark" aria-busy={value === null}>
                {value === null ? "…" : value.toLocaleString()}
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        Contacts and inquiries match the Contacts and All Inquiries pages and follow the date and assignee filters.
        Won and Lost count the deals on the board below.
      </p>
    </div>
  );
}
