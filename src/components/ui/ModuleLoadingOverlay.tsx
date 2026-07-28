"use client";

import { Loader2 } from "lucide-react";

type Props = {
  label: string;
};

export function ModuleLoadingOverlay({ label }: Props) {
  return (
    <div
      className="fixed inset-0 z-[9998] flex flex-col items-center justify-center bg-slate-900/40 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-3 rounded-lg bg-white px-8 py-6 shadow-lg border border-slate-200">
        <Loader2 className="h-8 w-8 animate-spin text-[#017e84]" aria-hidden />
        <p className="text-sm font-medium text-primary-dark">Loading {label}…</p>
      </div>
    </div>
  );
}
