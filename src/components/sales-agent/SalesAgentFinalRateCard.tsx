import { formatFinalAnswer } from "@/lib/inquiry-calculator";

export const FINAL_RATE_PER_KG_NOTE =
  "Based on the provided information, the rate is per kg.";

type SalesAgentFinalRateCardProps = {
  finalRate: number;
  variant?: "card" | "inline";
};

export function SalesAgentFinalRateCard({
  finalRate,
  variant = "card",
}: SalesAgentFinalRateCardProps) {
  if (variant === "inline") {
    return (
      <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
        <p className="text-emerald-600 font-medium text-xs">Final Rate</p>
        <p className="text-emerald-900 font-semibold text-base mt-0.5">
          {formatFinalAnswer(finalRate)}
        </p>
        <p className="text-emerald-700 text-xs mt-2 leading-relaxed">{FINAL_RATE_PER_KG_NOTE}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
        Approved Rates
      </p>
      <div className="mt-4 rounded-lg border border-emerald-200 bg-white px-4 py-3">
        <p className="text-slate-500 text-sm">Final Rate</p>
        <p className="font-bold text-emerald-800 mt-1 text-lg">
          {formatFinalAnswer(finalRate)}
        </p>
        <p className="text-slate-600 text-sm mt-2 leading-relaxed">{FINAL_RATE_PER_KG_NOTE}</p>
      </div>
    </div>
  );
}
