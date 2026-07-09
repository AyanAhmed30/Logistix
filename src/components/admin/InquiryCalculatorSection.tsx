"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InquiryPricingSummary } from "@/components/admin/InquiryPricingSummary";
import {
  computeInquiryTaxBreakdown,
  computeInvValueString,
  withDerivedInvValue,
  type CalculatorPricingConfig,
} from "@/lib/inquiry-calculator";

export type InquiryCalculatorValues = Record<string, string>;

type InquiryCalculatorSectionProps = {
  values: InquiryCalculatorValues;
  onChange: (values: InquiryCalculatorValues) => void;
  onFieldBlur?: (field: string, value: string) => void;
  inquiryQuantity: string;
  totalWeightKg: number;
  cbm: number;
  pricingConfig: CalculatorPricingConfig;
  adminCalculatorMode?: boolean;
  showPricingSummary?: boolean;
  showWeightCbm?: boolean;
  title?: string;
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

function fmtRate(v: string) {
  return `${toNum(v).toFixed(2)}%`;
}

export function InquiryCalculatorSection({
  values,
  onChange,
  onFieldBlur,
  inquiryQuantity,
  totalWeightKg,
  cbm,
  pricingConfig,
  adminCalculatorMode = false,
  showPricingSummary = true,
  showWeightCbm = true,
  title = "Calculation on Actual",
}: InquiryCalculatorSectionProps) {
  const calculatorValuesRecord = withDerivedInvValue({
    ...values,
    quantity: values.quantity || inquiryQuantity,
  });

  const taxBreakdown = computeInquiryTaxBreakdown(calculatorValuesRecord);

  const calc = {
    invValue: taxBreakdown?.invValue ?? toNum(calculatorValuesRecord.inv_value),
    pkrValue: taxBreakdown?.pkrValue ?? 0,
    assessedValue: taxBreakdown?.assessedValue ?? 0,
    customDuty: taxBreakdown?.customDuty ?? 0,
    addCd: taxBreakdown?.addCd ?? 0,
    gst: taxBreakdown?.gst ?? 0,
    addGst: taxBreakdown?.addGst ?? 0,
    incomeTax: taxBreakdown?.incomeTax ?? 0,
    excise: taxBreakdown?.excise ?? 0,
    regularDuty: taxBreakdown?.regularDuty ?? 0,
    stampDuty: taxBreakdown?.stampDuty ?? 0,
    invFine: taxBreakdown?.invFine ?? 0,
    sumOfAllTaxes: taxBreakdown?.sumOfAllTaxes ?? 0,
  };

  const updateField = (field: string, rawValue: string) => {
    let value = rawValue;
    if (field === "quantity") {
      value = rawValue.replace(/\D/g, "");
    }
    const next = { ...values, [field]: value };
    if (field === "quantity" || field === "unit_value") {
      next.inv_value = computeInvValueString(
        field === "quantity" ? value : next.quantity ?? "0",
        field === "unit_value" ? value : next.unit_value ?? "0"
      );
    }
    onChange(withDerivedInvValue(next));
  };

  const rateRows = [
    { field: "custom_duty_rate", label: "Custom Duty", rate: values.custom_duty_rate ?? "0", amount: calc.customDuty },
    { field: "add_cd_rate", label: "Add CD", rate: values.add_cd_rate ?? "0", amount: calc.addCd },
    { field: "gst_rate", label: "Sales Tax", rate: values.gst_rate ?? "0", amount: calc.gst },
    { field: "add_gst_rate", label: "Add GST", rate: values.add_gst_rate ?? "0", amount: calc.addGst },
    { field: "income_tax_rate", label: "Income Tax", rate: values.income_tax_rate ?? "0", amount: calc.incomeTax },
    { field: "excise_rate", label: "Excise", rate: values.excise_rate ?? "0", amount: calc.excise },
    { field: "regular_duty_rate", label: "Regular Duty", rate: values.regular_duty_rate ?? "0", amount: calc.regularDuty },
    { field: "stamp_duty_rate", label: "Stamp Duty", rate: values.stamp_duty_rate ?? "0", amount: calc.stampDuty },
  ];

  const invValueDisplay = calculatorValuesRecord.inv_value || "0";

  return (
    <div className="border-t pt-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">{title}</h3>
      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 bg-slate-50 border-b text-xs font-semibold text-slate-600">
          <div className="col-span-5 px-3 py-2 border-r">Item</div>
          <div className="col-span-3 px-3 py-2 border-r">Rate / Input</div>
          <div className="col-span-4 px-3 py-2 text-right">Amount</div>
        </div>

        <div className="grid grid-cols-12 border-b">
          <div className="col-span-5 px-3 py-2 border-r text-sm">UOM</div>
          <div className="col-span-7 px-2 py-1.5">
            <Select
              value={values.uom ?? "KG"}
              onValueChange={(value) => {
                updateField("uom", value);
                onFieldBlur?.("uom", value);
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="KG">KG</SelectItem>
                <SelectItem value="M³">M³</SelectItem>
                <SelectItem value="PCS/U">PCS/U</SelectItem>
                <SelectItem value="Pairs (2U)">Pairs (2U)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-12 border-b">
          <div className="col-span-5 px-3 py-2 border-r text-sm">Quantity</div>
          <div className="col-span-7 px-2 py-1.5">
            <Input
              value={values.quantity ?? "0"}
              onChange={(e) => updateField("quantity", e.target.value)}
              onBlur={() => onFieldBlur?.("quantity", values.quantity ?? "0")}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-12 border-b">
          <div className="col-span-5 px-3 py-2 border-r text-sm">Unit Value</div>
          <div className="col-span-7 px-2 py-1.5">
            <Input
              value={values.unit_value ?? "0"}
              onChange={(e) => updateField("unit_value", e.target.value)}
              onBlur={() => onFieldBlur?.("unit_value", values.unit_value ?? "0")}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-12 border-b">
          <div className="col-span-5 px-3 py-2 border-r text-sm font-medium">INV Value</div>
          <div className="col-span-3 px-2 py-1.5 border-r">
            <Input
              value={invValueDisplay}
              readOnly
              className="h-8 text-xs bg-slate-50"
            />
          </div>
          <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{calc.invValue || "-"}</div>
        </div>

        <div className="grid grid-cols-12 border-b">
          <div className="col-span-5 px-3 py-2 border-r text-sm">HS Code</div>
          <div className="col-span-7 px-2 py-1.5">
            <Input
              value={values.hs_code ?? ""}
              onChange={(e) => updateField("hs_code", e.target.value)}
              onBlur={() => onFieldBlur?.("hs_code", values.hs_code ?? "")}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-12 border-b">
          <div className="col-span-5 px-3 py-2 border-r text-sm font-medium">@ (Exchange Rate)</div>
          <div className="col-span-3 px-2 py-1.5 border-r">
            <Input
              value={values.exchange_rate ?? "0"}
              onChange={(e) => updateField("exchange_rate", e.target.value)}
              onBlur={() => onFieldBlur?.("exchange_rate", values.exchange_rate ?? "0")}
              className="h-8 text-xs"
            />
          </div>
          <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{values.exchange_rate || "-"}</div>
        </div>

        {(!adminCalculatorMode || calc.pkrValue !== 0) && (
          <div className="grid grid-cols-12 border-b">
            <div className="col-span-8 px-3 py-2 border-r text-sm font-medium">PKR Value</div>
            <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{fmtMoney(calc.pkrValue)}</div>
          </div>
        )}
        {(!adminCalculatorMode || calc.assessedValue !== 0) && (
          <div className="grid grid-cols-12 border-b">
            <div className="col-span-8 px-3 py-2 border-r text-sm font-medium">Assessed Value</div>
            <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{fmtMoney(calc.assessedValue)}</div>
          </div>
        )}

        {rateRows.map((row) => (
          <div key={row.label} className="grid grid-cols-12 border-b">
            <div className="col-span-5 px-3 py-2 border-r text-sm">{row.label}</div>
            <div className="col-span-3 px-2 py-1.5 border-r">
              <Input
                value={row.rate}
                onChange={(e) => updateField(row.field, e.target.value)}
                onBlur={() => onFieldBlur?.(row.field, row.rate)}
                className="h-8 text-xs"
              />
              <div className="text-[10px] text-slate-500 mt-0.5">{fmtRate(row.rate)}</div>
            </div>
            <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{fmtMoney(row.amount)}</div>
          </div>
        ))}

        <div className="grid grid-cols-12 border-b">
          <div className="col-span-5 px-3 py-2 border-r text-sm">INV Fine</div>
          <div className="col-span-3 px-2 py-1.5 border-r">
            <Input
              value={values.inv_fine ?? "0"}
              onChange={(e) => updateField("inv_fine", e.target.value)}
              onBlur={() => onFieldBlur?.("inv_fine", values.inv_fine ?? "0")}
              className="h-8 text-xs"
            />
          </div>
          <div className="col-span-4 px-3 py-2 text-right text-sm font-semibold">{fmtMoney(calc.invFine)}</div>
        </div>

        <div className="grid grid-cols-12 border-b bg-slate-50">
          <div className="col-span-8 px-3 py-2 border-r text-sm font-bold text-slate-800">Sum of All Taxes</div>
          <div className="col-span-4 px-3 py-2 text-right text-sm font-bold text-slate-900">{fmtMoney(calc.sumOfAllTaxes)}</div>
        </div>
      </div>

      {showPricingSummary && (
        <div className="mt-4">
          <InquiryPricingSummary
            calculatorValues={calculatorValuesRecord}
            totalWeightKg={totalWeightKg}
            cbm={cbm}
            pricingConfig={pricingConfig}
          />
        </div>
      )}

      {showWeightCbm && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-2">
          {(!adminCalculatorMode || totalWeightKg !== 0) && (
            <div>
              <div className="text-xs text-slate-500 font-medium">Weight (kg)</div>
              <div className="text-sm font-semibold text-slate-800 mt-0.5">{totalWeightKg || "-"}</div>
            </div>
          )}
          {(!adminCalculatorMode || cbm !== 0) && (
            <div>
              <div className="text-xs text-slate-500 font-medium">CBM</div>
              <div className="text-sm font-semibold text-slate-800 mt-0.5">{cbm || "-"}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
