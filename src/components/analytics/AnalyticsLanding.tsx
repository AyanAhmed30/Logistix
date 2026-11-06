"use client";

import Link from "next/link";

const CARD =
  "flex h-40 items-center justify-center rounded-lg border border-slate-200 bg-white text-lg font-semibold text-primary-dark hover:border-[#017e84] hover:text-[#017e84] focus-visible:outline-2 focus-visible:outline-[#017e84]";

export function AnalyticsLanding() {
  return (
    <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
      <Link href="/analytics/sales" className={CARD}>
        Sales
      </Link>
      <Link href="/analytics/operations" className={CARD}>
        Operations
      </Link>
    </div>
  );
}
