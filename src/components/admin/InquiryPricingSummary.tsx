import {
  computeInquiryPricing,
  computeInquiryTaxBreakdown,
  computeVolumetricWeight,
  type CalculatorPricingConfig,
  type InquiryPricingResult,
} from "@/lib/inquiry-calculator";

function toNum(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(n: number) {
  return Number.isFinite(n)
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "-";
}

function fmtRate(n: number) {
  return Number.isFinite(n) ? n.toFixed(6) : "-";
}

type InquiryPricingSummaryProps = {
  calculatorValues: Record<string, string>;
  totalWeightKg: number;
  cbm: number;
  pricingConfig: CalculatorPricingConfig;
};

export function buildInquiryPricingResult({
  calculatorValues,
  totalWeightKg,
  cbm,
  pricingConfig,
}: InquiryPricingSummaryProps): InquiryPricingResult | null {
  const taxBreakdown = computeInquiryTaxBreakdown(calculatorValues);
  if (!taxBreakdown) return null;

  return computeInquiryPricing(taxBreakdown, {
    totalWeightKg,
    cbm,
    pricingConfig,
  });
}

export function InquiryPricingSummary({
  calculatorValues,
  totalWeightKg,
  cbm,
  pricingConfig,
}: InquiryPricingSummaryProps) {
  const pricing = buildInquiryPricingResult({
    calculatorValues,
    totalWeightKg,
    cbm,
    pricingConfig,
  });

  if (!pricing) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
        Enter invoice and tax values to calculate pricing.
      </div>
    );
  }

  const volumetricWeight = computeVolumetricWeight(cbm);

  return (
    <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50/40 p-4">
      <div className="text-sm font-semibold text-teal-800">Final Pricing</div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-xs text-slate-500">Volumetric Weight (CBM × 200)</div>
          <div className="font-semibold text-slate-800">{fmtRate(volumetricWeight)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Total Weight (kg)</div>
          <div className="font-semibold text-slate-800">{totalWeightKg > 0 ? totalWeightKg : "-"}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">X (Sum of Taxes ÷ Weight)</div>
          <div className="font-semibold text-slate-800">{fmtRate(pricing.taxPerKg)}</div>
        </div>
      </div>

      {pricing.pricingCase === "gross_weight" ? (
        <div className="rounded-md border border-white bg-white px-3 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Case 1 — VW &lt; Total Weight
          </div>
          <div className="text-sm text-slate-700">
            Final Answer = X + Gross Weight Value
          </div>
          <div className="mt-1 text-base font-bold text-slate-900">
            {fmtRate(pricing.taxPerKg)} + {fmtMoney(pricing.grossWeightValue)} = {fmtRate(pricing.finalAnswer)}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Case 2 — VW &gt; Total Weight
          </div>

          <div className="rounded-md border border-white bg-white px-3 py-3">
            <div className="text-xs font-semibold text-slate-600 mb-1">Subcase 2.1 — Volumetric</div>
            <div className="text-sm text-slate-700">Final Answer = X + Volumetric Weight Value</div>
            <div className="mt-1 text-sm text-slate-600">X: {fmtRate(pricing.taxPerKg)}</div>
            <div className="text-base font-bold text-slate-900">
              {fmtRate(pricing.taxPerKg)} + {fmtMoney(pricing.volumetricWeightValue)} ={" "}
              {fmtRate(pricing.case2Subcases!.volumetric.finalAnswer)}
            </div>
          </div>

          <div className="rounded-md border border-white bg-white px-3 py-3">
            <div className="text-xs font-semibold text-slate-600 mb-1">Subcase 2.2 — CBM</div>
            <div className="text-sm text-slate-700">Final Answer = X + CBM Value</div>
            <div className="mt-1 text-sm text-slate-600">X: {fmtRate(pricing.taxPerKg)}</div>
            <div className="text-base font-bold text-slate-900">
              {fmtRate(pricing.taxPerKg)} + {fmtMoney(pricing.cbmValue)} ={" "}
              {fmtRate(pricing.case2Subcases!.cbm.finalAnswer)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { fmtMoney, fmtRate, toNum };
