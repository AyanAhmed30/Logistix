export type CalculatorTotals = {
  pkrValue: number;
  assessedValue: number;
  totalDutyCost: number;
  costPerWeight: number;
  unitPrice: number;
  totalAmount: number;
};

function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const cleaned = String(value).replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function computeCalculatorTotals(
  values: Record<string, unknown> | null | undefined,
  options?: { weightKg?: string | number; quantity?: string | number }
): CalculatorTotals | null {
  if (!values || typeof values !== "object") return null;

  const invValue = toNum(values.inv_value ?? values["PKR Value"]);
  const exchangeRate = toNum(values.exchange_rate ?? values["Exchange Rate"]);
  const customDutyRate = toNum(values.custom_duty_rate);
  const addCdRate = toNum(values.add_cd_rate);
  const gstRate = toNum(values.gst_rate);
  const addGstRate = toNum(values.add_gst_rate);
  const incomeTaxRate = toNum(values.income_tax_rate);
  const exciseRate = toNum(values.excise_rate);
  const regularDutyRate = toNum(values.regular_duty_rate);
  const stampDutyRate = toNum(values.stamp_duty_rate);
  const invFine = toNum(values.inv_fine);
  const freight = toNum(values.freight);
  const shippingLineCharges = toNum(values.shipping_line_charges);
  const clearanceExpense = toNum(values.clearance_expense);
  const salesTaxRate = toNum(values.sales_tax_rate);

  const pkrValue =
    invValue > 0 && exchangeRate > 0
      ? invValue * exchangeRate
      : toNum(values["PKR Value"] ?? values["Assessed Value"] ?? values["Total Duty Cost"]);

  if (pkrValue <= 0 && toNum(values["Total Duty Cost"]) <= 0) return null;

  const assessedValue = pkrValue;
  const customDuty = (assessedValue * customDutyRate) / 100;
  const addCd = (assessedValue * addCdRate) / 100;
  const gst = (assessedValue * gstRate) / 100;
  const addGst = (assessedValue * addGstRate) / 100;
  const incomeTax = (assessedValue * incomeTaxRate) / 100;
  const excise = (assessedValue * exciseRate) / 100;
  const regularDuty = (assessedValue * regularDutyRate) / 100;
  const stampDuty = (assessedValue * stampDutyRate) / 100;

  const subTotalDutyCost =
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

  const salesTax = (subTotalDutyCost * salesTaxRate) / 100;
  const totalDutyCost = subTotalDutyCost + salesTax;

  const weightKg = toNum(options?.weightKg);
  const quantity = toNum(options?.quantity ?? values.quantity ?? 1) || 1;
  const costPerWeight = weightKg > 0 ? totalDutyCost / weightKg : 0;
  const totalAmount = totalDutyCost > 0 ? totalDutyCost : pkrValue;
  const unitPrice = quantity > 0 ? totalAmount / quantity : totalAmount;

  return {
    pkrValue,
    assessedValue,
    totalDutyCost,
    costPerWeight,
    unitPrice,
    totalAmount,
  };
}

export const CALCULATOR_FIELD_LABELS: Record<string, string> = {
  inv_value: "Invoice Value",
  exchange_rate: "Exchange Rate",
  custom_duty_rate: "Custom Duty %",
  add_cd_rate: "ADD CD %",
  gst_rate: "GST %",
  add_gst_rate: "ADD GST %",
  income_tax_rate: "Income Tax %",
  excise_rate: "Excise %",
  regular_duty_rate: "Regular Duty %",
  stamp_duty_rate: "Stamp Duty %",
  inv_fine: "INV Fine",
  freight: "Freight",
  shipping_line_charges: "Shipping Line Charges",
  clearance_expense: "Clearance Expense",
  sales_tax_rate: "Sales Tax %",
  uom: "UOM",
  quantity: "Quantity",
  hs_code: "HS Code",
};
