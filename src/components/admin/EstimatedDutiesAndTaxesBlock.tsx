"use client";

import { buildEstimatedDutiesDisplay, withDerivedInvValue } from "@/lib/inquiry-calculator";

type EstimatedDutiesAndTaxesBlockProps = {
  calculatorValues: Record<string, string>;
  quantityFallback?: string;
  showDisclaimer?: boolean;
  sectionTitle?: string;
};

function fmtDecimal4(n: number) {
  return Number.isFinite(n)
    ? n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })
    : "0.0000";
}

function fmtAmount(n: number) {
  return Number.isFinite(n) ? Math.round(n).toLocaleString() : "0";
}

function toNum(v: string | null | undefined) {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function EstimatedDutiesAndTaxesBlock({
  calculatorValues,
  quantityFallback,
  showDisclaimer = true,
  sectionTitle,
}: EstimatedDutiesAndTaxesBlockProps) {
  const display = buildEstimatedDutiesDisplay(calculatorValues, {
    hsCode: calculatorValues.hs_code,
    quantity: calculatorValues.quantity || quantityFallback,
  });

  const derivedValues = withDerivedInvValue({
    ...calculatorValues,
    quantity: calculatorValues.quantity || quantityFallback || "0",
  });
  const unitValueDisplay = toNum(derivedValues.unit_value);
  const totalInvValueDisplay = toNum(derivedValues.inv_value);

  if (!display) {
    return (
      <div className="border border-slate-300 rounded-sm overflow-hidden text-sm">
        {sectionTitle ? (
          <div className="bg-gradient-to-b from-[#d4d4d4] to-[#b8b8b8] border-b border-slate-400 px-3 py-2 font-bold text-slate-900">
            {sectionTitle}
          </div>
        ) : null}
        <div className="px-3 py-4 text-center text-slate-500 bg-white">
          No duty values entered in the calculator yet.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {showDisclaimer && (
        <p className="text-sm text-slate-800">
          Disclaimer : Calculated duties and taxes are indicative only by assuming Landing Charges
          &amp; Insurance 1% and current Exchange Rate:{" "}
          {display.exchangeRateDisplay > 0 ? display.exchangeRateDisplay.toFixed(6) : "0.000000"}
        </p>
      )}

      <div className="border border-slate-300 rounded-sm overflow-hidden text-sm">
        <div className="bg-gradient-to-b from-[#d4d4d4] to-[#b8b8b8] border-b border-slate-400 px-3 py-2 font-bold text-slate-900">
          {sectionTitle || "Estimated Duties And Taxes"}
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gradient-to-b from-[#ececec] to-[#d8d8d8] border-b border-slate-300">
              <th className="border-r border-slate-300 px-3 py-2 text-left font-semibold text-slate-800">
                HS Code
              </th>
              <th className="border-r border-slate-300 px-3 py-2 text-center font-semibold text-slate-800">
                Unit Value
              </th>
              <th className="border-r border-slate-300 px-3 py-2 text-center font-semibold text-slate-800">
                Total INV Value
              </th>
              <th className="px-3 py-2 text-center font-semibold text-slate-800">
                Import Value
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-white border-b border-slate-300">
              <td className="border-r border-slate-300 px-3 py-2">
                <span className="inline-flex items-center gap-2">
                  <span className="text-slate-700 font-bold leading-none">−</span>
                  <span className="font-bold text-slate-900">{display.hsCodeDisplay}</span>
                </span>
              </td>
              <td className="border-r border-slate-300 px-3 py-2 text-center text-slate-800">
                {fmtDecimal4(unitValueDisplay)}
              </td>
              <td className="border-r border-slate-300 px-3 py-2 text-center text-slate-800">
                {fmtDecimal4(totalInvValueDisplay)}
              </td>
              <td className="px-3 py-2 text-center text-slate-800">
                {fmtDecimal4(display.importValue)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="bg-white">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gradient-to-b from-[#ececec] to-[#d8d8d8] border-b border-slate-300">
                <th className="border-r border-slate-300 px-3 py-2 text-left font-semibold text-slate-800 w-[40%]">
                  Duty Name
                </th>
                <th className="border-r border-slate-300 px-3 py-2 text-center font-semibold text-slate-800 w-[30%]">
                  Applicable Rate
                </th>
                <th className="px-3 py-2 text-center font-semibold text-slate-800 w-[30%]">
                  Net Payable Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {display.rows.length > 0 ? (
                display.rows.map((row) => (
                  <tr
                    key={row.name}
                    className={`border-b border-slate-300 ${
                      row.name === "Sales Tax" ? "bg-sky-100" : "bg-white"
                    }`}
                  >
                    <td className="border-r border-slate-300 px-3 py-2 text-slate-800">
                      {row.name}
                    </td>
                    <td className="border-r border-slate-300 px-3 py-2 text-center text-slate-800">
                      {row.rate === null ? "—" : `${row.rate.toFixed(0)}%`}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-800">
                      {fmtAmount(row.amount)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="bg-white border-b border-slate-300">
                  <td colSpan={3} className="px-3 py-4 text-center text-slate-500">
                    No duty values entered in the calculator yet.
                  </td>
                </tr>
              )}
            </tbody>
            {display.rows.length > 0 && (
              <tfoot>
                <tr className="bg-white">
                  <td
                    colSpan={2}
                    className="border-r border-slate-300 border-t border-slate-300 px-3 py-2 text-center font-bold text-slate-900"
                  >
                    Grand Total
                  </td>
                  <td className="border-t border-slate-300 px-3 py-2 text-center font-bold text-slate-900">
                    {fmtAmount(display.grandTotal)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
