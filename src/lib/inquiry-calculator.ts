export const VOLUMETRIC_CBM_FACTOR = 200;

export const PRICING_CONFIG_KEYS = {
  grossWeightValue: "gross_weight_value",
  volumetricWeightValue: "volumetric_weight_value",
  cbmValue: "cbm_value",
} as const;

export type CalculatorPricingConfig = {
  grossWeightValue: number;
  volumetricWeightValue: number;
  cbmValue: number;
};

export type InquiryTaxBreakdown = {
  invValue: number;
  exchangeRate: number;
  pkrValue: number;
  assessedValue: number;
  customDuty: number;
  addCd: number;
  gst: number;
  addGst: number;
  incomeTax: number;
  excise: number;
  regularDuty: number;
  stampDuty: number;
  invFine: number;
  salesTaxRate: number;
  salesTaxAmount: number;
  subTotalBeforeSalesTax: number;
  sumOfAllTaxes: number;
};

export type PricingCase = "gross_weight" | "volumetric";

export type Case2Subcase = {
  taxPerKg: number;
  addonLabel: string;
  addonValue: number;
  finalAnswer: number;
};

export type InquiryPricingResult = {
  volumetricWeight: number;
  totalWeightKg: number;
  cbm: number;
  taxPerKg: number;
  sumOfAllTaxes: number;
  pricingCase: PricingCase;
  grossWeightValue: number;
  volumetricWeightValue: number;
  cbmValue: number;
  finalAnswer: number;
  case2Subcases?: {
    volumetric: Case2Subcase;
    cbm: Case2Subcase;
  };
};

export type CalculatorTotals = {
  pkrValue: number;
  assessedValue: number;
  sumOfAllTaxes: number;
  taxPerKg: number;
  volumetricWeight: number;
  pricingCase: PricingCase;
  finalAnswer: number;
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

export function parsePricingConfig(
  values: Record<string, unknown> | null | undefined
): CalculatorPricingConfig {
  const source = values && typeof values === "object" ? values : {};
  return {
    grossWeightValue: toNum(source[PRICING_CONFIG_KEYS.grossWeightValue]),
    volumetricWeightValue: toNum(source[PRICING_CONFIG_KEYS.volumetricWeightValue]),
    cbmValue: toNum(source[PRICING_CONFIG_KEYS.cbmValue]),
  };
}

export function computeVolumetricWeight(cbm: number): number {
  const safeCbm = Math.max(toNum(cbm), 0);
  return safeCbm * VOLUMETRIC_CBM_FACTOR;
}

export function computeInquiryTaxBreakdown(
  values: Record<string, unknown> | null | undefined
): InquiryTaxBreakdown | null {
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
  const salesTaxRate = toNum(values.sales_tax_rate);

  const pkrValue =
    invValue > 0 && exchangeRate > 0
      ? invValue * exchangeRate
      : toNum(values["PKR Value"] ?? values["Assessed Value"]);

  if (pkrValue <= 0) return null;

  const assessedValue = pkrValue;
  const customDuty = (assessedValue * customDutyRate) / 100;
  const addCd = (assessedValue * addCdRate) / 100;
  const gst = (assessedValue * gstRate) / 100;
  const addGst = (assessedValue * addGstRate) / 100;
  const incomeTax = (assessedValue * incomeTaxRate) / 100;
  const excise = (assessedValue * exciseRate) / 100;
  const regularDuty = (assessedValue * regularDutyRate) / 100;
  const stampDuty = (assessedValue * stampDutyRate) / 100;

  const subTotalBeforeSalesTax =
    assessedValue +
    customDuty +
    addCd +
    gst +
    addGst +
    incomeTax +
    excise +
    regularDuty +
    stampDuty +
    invFine;

  const salesTaxAmount = (subTotalBeforeSalesTax * salesTaxRate) / 100;

  const sumOfAllTaxes =
    customDuty +
    addCd +
    gst +
    addGst +
    incomeTax +
    excise +
    regularDuty +
    stampDuty +
    invFine +
    salesTaxAmount;

  return {
    invValue,
    exchangeRate,
    pkrValue,
    assessedValue,
    customDuty,
    addCd,
    gst,
    addGst,
    incomeTax,
    excise,
    regularDuty,
    stampDuty,
    invFine,
    salesTaxRate,
    salesTaxAmount,
    subTotalBeforeSalesTax,
    sumOfAllTaxes,
  };
}

export function computeTaxPerKg(sumOfAllTaxes: number, totalWeightKg: number): number {
  const weight = Math.max(toNum(totalWeightKg), 0);
  if (weight <= 0) return 0;
  return sumOfAllTaxes / weight;
}

export function computeInquiryPricing(
  taxBreakdown: InquiryTaxBreakdown,
  options: {
    totalWeightKg: number;
    cbm: number;
    pricingConfig: CalculatorPricingConfig;
  }
): InquiryPricingResult {
  const totalWeightKg = Math.max(toNum(options.totalWeightKg), 0);
  const cbm = Math.max(toNum(options.cbm), 0);
  const pricingConfig = options.pricingConfig;

  const volumetricWeight = computeVolumetricWeight(cbm);
  const taxPerKg = computeTaxPerKg(taxBreakdown.sumOfAllTaxes, totalWeightKg);

  const grossWeightValue = pricingConfig.grossWeightValue;
  const volumetricWeightValue = pricingConfig.volumetricWeightValue;
  const cbmValue = pricingConfig.cbmValue;

  if (volumetricWeight < totalWeightKg) {
    return {
      volumetricWeight,
      totalWeightKg,
      cbm,
      taxPerKg,
      sumOfAllTaxes: taxBreakdown.sumOfAllTaxes,
      pricingCase: "gross_weight",
      grossWeightValue,
      volumetricWeightValue,
      cbmValue,
      finalAnswer: taxPerKg + grossWeightValue,
    };
  }

  const volumetricSubcase: Case2Subcase = {
    taxPerKg,
    addonLabel: "Volumetric Weight Value",
    addonValue: volumetricWeightValue,
    finalAnswer: taxPerKg + volumetricWeightValue,
  };

  const cbmSubcase: Case2Subcase = {
    taxPerKg,
    addonLabel: "CBM Value",
    addonValue: cbmValue,
    finalAnswer: taxPerKg + cbmValue,
  };

  return {
    volumetricWeight,
    totalWeightKg,
    cbm,
    taxPerKg,
    sumOfAllTaxes: taxBreakdown.sumOfAllTaxes,
    pricingCase: "volumetric",
    grossWeightValue,
    volumetricWeightValue,
    cbmValue,
    finalAnswer: volumetricSubcase.finalAnswer,
    case2Subcases: {
      volumetric: volumetricSubcase,
      cbm: cbmSubcase,
    },
  };
}

export function computeCalculatorTotals(
  values: Record<string, unknown> | null | undefined,
  options?: {
    weightKg?: string | number;
    quantity?: string | number;
    cbm?: string | number;
    pricingConfig?: CalculatorPricingConfig | Record<string, unknown> | null;
  }
): CalculatorTotals | null {
  const taxBreakdown = computeInquiryTaxBreakdown(values);
  if (!taxBreakdown) return null;

  const weightKg = Math.max(toNum(options?.weightKg), 0);
  const quantity = Math.max(toNum(options?.quantity ?? values?.quantity ?? 1), 1) || 1;
  const cbm = toNum(options?.cbm);
  const pricingConfig = parsePricingConfig(
    options?.pricingConfig && typeof options.pricingConfig === "object" && "grossWeightValue" in options.pricingConfig
      ? {
          [PRICING_CONFIG_KEYS.grossWeightValue]: (options.pricingConfig as CalculatorPricingConfig).grossWeightValue,
          [PRICING_CONFIG_KEYS.volumetricWeightValue]: (options.pricingConfig as CalculatorPricingConfig).volumetricWeightValue,
          [PRICING_CONFIG_KEYS.cbmValue]: (options.pricingConfig as CalculatorPricingConfig).cbmValue,
        }
      : (options?.pricingConfig as Record<string, unknown> | null | undefined)
  );

  const pricing = computeInquiryPricing(taxBreakdown, {
    totalWeightKg: weightKg,
    cbm,
    pricingConfig,
  });

  const costPerWeight = pricing.finalAnswer;
  const totalAmount = weightKg > 0 ? pricing.finalAnswer * weightKg : pricing.finalAnswer;
  const unitPrice = quantity > 0 ? totalAmount / quantity : totalAmount;

  return {
    pkrValue: taxBreakdown.pkrValue,
    assessedValue: taxBreakdown.assessedValue,
    sumOfAllTaxes: taxBreakdown.sumOfAllTaxes,
    taxPerKg: pricing.taxPerKg,
    volumetricWeight: pricing.volumetricWeight,
    pricingCase: pricing.pricingCase,
    finalAnswer: pricing.finalAnswer,
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
  sales_tax_rate: "Sales Tax %",
  gross_weight_value: "Gross Weight Value",
  volumetric_weight_value: "Volumetric Weight Value",
  cbm_value: "CBM Value",
  uom: "UOM",
  quantity: "Quantity",
  hs_code: "HS Code",
};
