"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Calculator } from "lucide-react";
import {
  getSharedInquiryCalculatorValues,
  saveInquiryCalculatorField,
} from "@/app/actions/inquiries";
import {
  computeInquiryTaxBreakdown,
  PRICING_CONFIG_KEYS,
  sanitizeCalculatorValues,
} from "@/lib/inquiry-calculator";

type CalcValues = {
  inv_value: string;
  exchange_rate: string;
  custom_duty_rate: string;
  add_cd_rate: string;
  gst_rate: string;
  add_gst_rate: string;
  income_tax_rate: string;
  excise_rate: string;
  regular_duty_rate: string;
  stamp_duty_rate: string;
  inv_fine: string;
  gross_weight_value: string;
  volumetric_weight_value: string;
  cbm_value: string;
};

const EMPTY_CALC: CalcValues = {
  inv_value: "",
  exchange_rate: "2254.13",
  custom_duty_rate: "0",
  add_cd_rate: "0",
  gst_rate: "18",
  add_gst_rate: "0",
  income_tax_rate: "12",
  excise_rate: "1.8",
  regular_duty_rate: "30",
  stamp_duty_rate: "0",
  inv_fine: "0",
  gross_weight_value: "0",
  volumetric_weight_value: "0",
  cbm_value: "0",
};

function toNum(v: string | null | undefined) {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(n: number) {
  return Number.isFinite(n)
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "-";
}

export function AdminCalculatorPanel() {
  const [calcValues, setCalcValues] = useState<CalcValues>(EMPTY_CALC);
  const [lastSnapshot, setLastSnapshot] = useState<Record<string, string>>({});

  useEffect(() => {
    async function loadSharedCalculator() {
      const result = await getSharedInquiryCalculatorValues();
      if ("error" in result) {
        toast.error(result.error || "Unable to load calculator values");
        return;
      }
      const resolved: CalcValues = {
        ...EMPTY_CALC,
        ...sanitizeCalculatorValues(result.values),
      };
      setCalcValues(resolved);
      setLastSnapshot(resolved);
    }
    loadSharedCalculator();
  }, []);

  async function persistField(field: keyof CalcValues, nextValue: string) {
    const prevValue = lastSnapshot[field] ?? "";
    if (prevValue === nextValue) return;

    const save = await saveInquiryCalculatorField("shared", field, nextValue);
    if ("error" in save) {
      toast.error(save.error || "Failed to save calculator value.");
      return;
    }

    setLastSnapshot((prev) => ({ ...prev, [field]: nextValue }));
  }

  const taxBreakdown = computeInquiryTaxBreakdown(calcValues);
  const invValue = taxBreakdown?.invValue ?? toNum(calcValues.inv_value);
  const pkrValue = taxBreakdown?.pkrValue ?? 0;
  const assessedValue = taxBreakdown?.assessedValue ?? 0;
  const customDuty = taxBreakdown?.customDuty ?? 0;
  const addCd = taxBreakdown?.addCd ?? 0;
  const gst = taxBreakdown?.gst ?? 0;
  const addGst = taxBreakdown?.addGst ?? 0;
  const incomeTax = taxBreakdown?.incomeTax ?? 0;
  const excise = taxBreakdown?.excise ?? 0;
  const regularDuty = taxBreakdown?.regularDuty ?? 0;
  const stampDuty = taxBreakdown?.stampDuty ?? 0;
  const invFine = taxBreakdown?.invFine ?? 0;
  const sumOfAllTaxes = taxBreakdown?.sumOfAllTaxes ?? 0;

  const pricingFields = [
    {
      key: PRICING_CONFIG_KEYS.grossWeightValue,
      label: "Gross Weight Value",
      description: "Used in Case 1: Final = X + Gross Weight Value",
    },
    {
      key: PRICING_CONFIG_KEYS.volumetricWeightValue,
      label: "Volumetric Weight Value",
      description: "Used in Case 2.1: Final = X + Volumetric Weight Value",
    },
    {
      key: PRICING_CONFIG_KEYS.cbmValue,
      label: "CBM Value",
      description: "Used in Case 2.2: Final = X + CBM Value",
    },
  ] as const;

  return (
    <div className="space-y-4">
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calculator className="h-5 w-5 text-teal-600" />
            Shared Calculator Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="border rounded-lg overflow-hidden">
            <div className="grid grid-cols-12 bg-slate-50 border-b text-xs font-semibold text-slate-600">
              <div className="col-span-5 px-3 py-2 border-r">Item</div>
              <div className="col-span-3 px-3 py-2 border-r">Rate / Input</div>
              <div className="col-span-4 px-3 py-2 text-right">Amount</div>
            </div>

            <div className="grid grid-cols-12 border-b">
              <div className="col-span-5 px-3 py-2 border-r text-sm font-medium">INV Value</div>
              <div className="col-span-3 px-2 py-1.5 border-r">
                <Input
                  value={calcValues.inv_value}
                  onChange={(e) => setCalcValues((p) => ({ ...p, inv_value: e.target.value }))}
                  onBlur={() => void persistField("inv_value", calcValues.inv_value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{invValue || "-"}</div>
            </div>

            <div className="grid grid-cols-12 border-b">
              <div className="col-span-5 px-3 py-2 border-r text-sm font-medium">@ (Exchange Rate)</div>
              <div className="col-span-3 px-2 py-1.5 border-r">
                <Input
                  value={calcValues.exchange_rate}
                  onChange={(e) => setCalcValues((p) => ({ ...p, exchange_rate: e.target.value }))}
                  onBlur={() => void persistField("exchange_rate", calcValues.exchange_rate)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{calcValues.exchange_rate || "-"}</div>
            </div>

            <div className="grid grid-cols-12 border-b">
              <div className="col-span-8 px-3 py-2 border-r text-sm font-medium">PKR Value</div>
              <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{fmtMoney(pkrValue)}</div>
            </div>
            <div className="grid grid-cols-12 border-b">
              <div className="col-span-8 px-3 py-2 border-r text-sm font-medium">Assessed Value</div>
              <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{fmtMoney(assessedValue)}</div>
            </div>

            {[
              { key: "custom_duty_rate", label: "Custom Duty", amount: customDuty },
              { key: "add_cd_rate", label: "Add CD", amount: addCd },
              { key: "gst_rate", label: "Sales Tax", amount: gst },
              { key: "add_gst_rate", label: "Add GST", amount: addGst },
              { key: "income_tax_rate", label: "Income Tax", amount: incomeTax },
              { key: "excise_rate", label: "Excise", amount: excise },
              { key: "regular_duty_rate", label: "Regular Duty", amount: regularDuty },
              { key: "stamp_duty_rate", label: "Stamp Duty", amount: stampDuty },
            ].map((row) => (
              <div key={row.key} className="grid grid-cols-12 border-b">
                <div className="col-span-5 px-3 py-2 border-r text-sm">{row.label}</div>
                <div className="col-span-3 px-2 py-1.5 border-r">
                  <Input
                    value={calcValues[row.key as keyof CalcValues]}
                    onChange={(e) =>
                      setCalcValues((p) => ({ ...p, [row.key]: e.target.value }))
                    }
                    onBlur={() =>
                      void persistField(
                        row.key as keyof CalcValues,
                        calcValues[row.key as keyof CalcValues]
                      )
                    }
                    className="h-8 text-xs"
                  />
                </div>
                <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{fmtMoney(row.amount)}</div>
              </div>
            ))}

            <div className="grid grid-cols-12 border-b">
              <div className="col-span-5 px-3 py-2 border-r text-sm">INV Fine</div>
              <div className="col-span-3 px-2 py-1.5 border-r">
                <Input
                  value={calcValues.inv_fine}
                  onChange={(e) => setCalcValues((p) => ({ ...p, inv_fine: e.target.value }))}
                  onBlur={() => void persistField("inv_fine", calcValues.inv_fine)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{fmtMoney(invFine)}</div>
            </div>

            <div className="grid grid-cols-12 bg-slate-50">
              <div className="col-span-8 px-3 py-2 border-r text-sm font-bold text-slate-800">Sum of All Taxes</div>
              <div className="col-span-4 px-3 py-2 text-right text-sm font-bold text-slate-900">{fmtMoney(sumOfAllTaxes)}</div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Pricing Constants</h3>
              <p className="text-xs text-slate-500 mt-1">
                These values are used by the Operations calculator for final pricing (X + Y / Z / CBM).
              </p>
            </div>
            <div className="border rounded-lg overflow-hidden">
              {pricingFields.map((row) => (
                <div key={row.key} className="grid grid-cols-12 border-b last:border-b-0">
                  <div className="col-span-5 px-3 py-3 border-r">
                    <div className="text-sm font-medium text-slate-800">{row.label}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{row.description}</div>
                  </div>
                  <div className="col-span-7 px-2 py-2">
                    <Input
                      value={calcValues[row.key]}
                      onChange={(e) =>
                        setCalcValues((p) => ({ ...p, [row.key]: e.target.value }))
                      }
                      onBlur={() => void persistField(row.key, calcValues[row.key])}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
