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
  freight: string;
  shipping_line_charges: string;
  clearance_expense: string;
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
  freight: "0",
  shipping_line_charges: "0",
  clearance_expense: "0",
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
      const resolved: CalcValues = { ...EMPTY_CALC, ...(result.values || {}) };
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

  const invValue = toNum(calcValues.inv_value);
  const exchangeRate = toNum(calcValues.exchange_rate);
  const customDutyRate = toNum(calcValues.custom_duty_rate);
  const addCdRate = toNum(calcValues.add_cd_rate);
  const gstRate = toNum(calcValues.gst_rate);
  const addGstRate = toNum(calcValues.add_gst_rate);
  const incomeTaxRate = toNum(calcValues.income_tax_rate);
  const exciseRate = toNum(calcValues.excise_rate);
  const regularDutyRate = toNum(calcValues.regular_duty_rate);
  const stampDutyRate = toNum(calcValues.stamp_duty_rate);
  const invFine = toNum(calcValues.inv_fine);
  const freight = toNum(calcValues.freight);
  const shippingLineCharges = toNum(calcValues.shipping_line_charges);
  const clearanceExpense = toNum(calcValues.clearance_expense);
  const weightKg = 0;

  const pkrValue = invValue * exchangeRate;
  const assessedValue = pkrValue;
  const customDuty = (assessedValue * customDutyRate) / 100;
  const addCd = (assessedValue * addCdRate) / 100;
  const gst = (assessedValue * gstRate) / 100;
  const addGst = (assessedValue * addGstRate) / 100;
  const incomeTax = (assessedValue * incomeTaxRate) / 100;
  const excise = (assessedValue * exciseRate) / 100;
  const regularDuty = (assessedValue * regularDutyRate) / 100;
  const stampDuty = (assessedValue * stampDutyRate) / 100;
  const totalDutyCost =
    assessedValue +
    customDuty +
    addCd +
    gst +
    addGst +
    incomeTax +
    excise +
    regularDuty +
    stampDuty +
    invFine +
    freight +
    shippingLineCharges +
    clearanceExpense;
  const costPerWeight = weightKg > 0 ? totalDutyCost / weightKg : 0;

  return (
    <div className="space-y-4">
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calculator className="h-5 w-5 text-teal-600" />
            Shared Calculator Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
                { key: "gst_rate", label: "GST", amount: gst },
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

              {[
                { key: "inv_fine", label: "INV Fine", amount: invFine },
                { key: "freight", label: "Freight", amount: freight },
                { key: "shipping_line_charges", label: "Shipping Line Charges", amount: shippingLineCharges },
                { key: "clearance_expense", label: "Clearance Expense", amount: clearanceExpense },
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

              <div className="grid grid-cols-12 bg-yellow-50">
                <div className="col-span-8 px-3 py-2 border-r text-sm font-bold text-slate-800">Total Duty Cost</div>
                <div className="col-span-4 px-3 py-2 text-right text-sm font-bold text-slate-900">{fmtMoney(totalDutyCost)}</div>
              </div>
            </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
            <div>
              <div className="text-xs text-slate-500 font-medium">Weight</div>
              <div className="text-sm font-semibold text-slate-800 mt-0.5">-</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 font-medium">Cost per Weight</div>
              <div className="text-sm font-semibold text-slate-800 mt-0.5">
                {weightKg > 0 ? costPerWeight.toFixed(6) : "-"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

