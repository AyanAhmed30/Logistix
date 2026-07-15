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

export function getEmptyCalculatorValues(): Record<string, string> {
  return {
    inv_value: "0",
    unit_value: "0",
    exchange_rate: "0",
    custom_duty_rate: "0",
    add_cd_rate: "0",
    gst_rate: "0",
    add_gst_rate: "0",
    income_tax_rate: "0",
    excise_rate: "0",
    regular_duty_rate: "0",
    stamp_duty_rate: "0",
    inv_fine: "0",
    uom: "KG",
    quantity: "0",
    hs_code: "",
  };
}

/** Derives invoice value from quantity × unit value, with legacy inv_value fallback. */
export function deriveInvValue(values: Record<string, unknown> | null | undefined): number {
  if (!values || typeof values !== "object") return 0;
  const quantity = toNum(values.quantity);
  const unitValue = toNum(values.unit_value);
  if (quantity > 0 && unitValue > 0) {
    const product = quantity * unitValue;
    return Number.isFinite(product) ? product : 0;
  }
  return toNum(values.inv_value ?? values["PKR Value"]);
}

export function computeInvValueString(quantity: string, unitValue: string): string {
  const q = toNum(quantity);
  const u = toNum(unitValue);
  if (q > 0 && u > 0) {
    const product = q * u;
    return Number.isFinite(product) ? String(product) : "0";
  }
  return "0";
}

export function withDerivedInvValue(values: Record<string, string>): Record<string, string> {
  const quantity = values.quantity ?? "0";
  const unitValue = values.unit_value ?? "0";
  const derived = computeInvValueString(quantity, unitValue);
  const canDerive = toNum(quantity) > 0 && toNum(unitValue) > 0;
  // Never wipe a stored inv_value when qty × unit cannot be derived yet.
  const invValue = canDerive
    ? derived
    : toNum(values.inv_value) > 0
      ? String(values.inv_value)
      : derived;

  return {
    ...values,
    inv_value: invValue,
  };
}

export type StoredCalculatorPayload = {
  calculators: Record<string, string>[];
  operationsDescription: string;
};

const CALCULATOR_PAYLOAD_METADATA_KEYS = new Set([
  "calculators",
  "operations_description",
  "operations_attachment_urls",
]);

const MEANINGFUL_CALCULATOR_KEYS = [
  "unit_value",
  "inv_value",
  "exchange_rate",
  "custom_duty_rate",
  "add_cd_rate",
  "gst_rate",
  "add_gst_rate",
  "income_tax_rate",
  "excise_rate",
  "regular_duty_rate",
  "stamp_duty_rate",
  "inv_fine",
  "hs_code",
] as const;

function sanitizeSingleCalculatorValues(
  values: Record<string, unknown> | null | undefined
): Record<string, string> {
  const sanitized = sanitizeCalculatorValues(values);
  for (const key of CALCULATOR_PAYLOAD_METADATA_KEYS) {
    delete sanitized[key];
  }
  return withDerivedInvValue(sanitized);
}

/** Coerce jsonb that may arrive as a JSON string (double-encoded rows). */
export function coerceCalculatorRaw(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export function hasMeaningfulCalculatorData(raw: unknown): boolean {
  const coerced = coerceCalculatorRaw(raw);
  if (!coerced || typeof coerced !== "object") return false;

  const payload = parseStoredCalculatorPayload(coerced);
  for (const calc of payload.calculators) {
    for (const key of MEANINGFUL_CALCULATOR_KEYS) {
      const value = calc[key];
      if (key === "hs_code") {
        if (String(value || "").trim()) return true;
        continue;
      }
      if (toNum(value) > 0) return true;
    }
  }
  return false;
}

/**
 * Choose the best calculator payload between confirmation snapshot and inquiry row.
 * Confirmation wins when it has real calculator data; otherwise fall back to inquiry.
 */
export function resolveCalculatorValues(
  confirmationValues: unknown,
  inquiryValues?: unknown
): Record<string, unknown> {
  const confirmation = coerceCalculatorRaw(confirmationValues);
  const inquiry = coerceCalculatorRaw(inquiryValues);

  if (hasMeaningfulCalculatorData(confirmation)) {
    return (confirmation && typeof confirmation === "object"
      ? (confirmation as Record<string, unknown>)
      : {}) as Record<string, unknown>;
  }
  if (hasMeaningfulCalculatorData(inquiry)) {
    return (inquiry && typeof inquiry === "object"
      ? (inquiry as Record<string, unknown>)
      : {}) as Record<string, unknown>;
  }

  // Prefer non-empty confirmation shell over empty object for attachment meta etc.
  if (confirmation && typeof confirmation === "object" && Object.keys(confirmation as object).length > 0) {
    return confirmation as Record<string, unknown>;
  }
  if (inquiry && typeof inquiry === "object") {
    return inquiry as Record<string, unknown>;
  }
  return {};
}

export function parseStoredCalculatorPayload(raw: unknown): StoredCalculatorPayload {
  const coerced = coerceCalculatorRaw(raw);

  if (Array.isArray(coerced)) {
    const calculators = coerced
      .filter((item) => item && typeof item === "object")
      .map((item) => sanitizeSingleCalculatorValues(item as Record<string, unknown>));
    return {
      calculators: calculators.length > 0 ? calculators : [getEmptyCalculatorValues()],
      operationsDescription: "",
    };
  }

  if (coerced && typeof coerced === "object") {
    const obj = coerced as Record<string, unknown>;
    if (Array.isArray(obj.calculators)) {
      const calculators = obj.calculators
        .filter((item) => item && typeof item === "object")
        .map((item) => sanitizeSingleCalculatorValues(item as Record<string, unknown>));
      return {
        calculators: calculators.length > 0 ? calculators : [getEmptyCalculatorValues()],
        operationsDescription: String(obj.operations_description ?? "").trim(),
      };
    }

    const operationsDescription = String(obj.operations_description ?? "").trim();
    const calculatorOnly = sanitizeSingleCalculatorValues(obj);
    if (Object.keys(calculatorOnly).length > 0) {
      return {
        calculators: [calculatorOnly],
        operationsDescription,
      };
    }

    if (operationsDescription) {
      return {
        calculators: [getEmptyCalculatorValues()],
        operationsDescription,
      };
    }
  }

  return {
    calculators: [getEmptyCalculatorValues()],
    operationsDescription: "",
  };
}

export function serializeCalculatorPayload(
  calculators: Record<string, string>[],
  operationsDescription?: string
): Record<string, unknown> {
  const normalized = calculators.map((entry) =>
    sanitizeSingleCalculatorValues(entry as Record<string, unknown>)
  );
  const description = String(operationsDescription ?? "").trim();

  if (normalized.length === 1 && !description) {
    return { ...normalized[0] };
  }
  if (normalized.length === 1 && description) {
    return {
      ...normalized[0],
      operations_description: description,
    };
  }
  const payload: Record<string, unknown> = { calculators: normalized };
  if (description) {
    payload.operations_description = description;
  }
  return payload;
}

export function getPrimaryCalculatorValues(raw: unknown): Record<string, string> {
  return parseStoredCalculatorPayload(raw).calculators[0] ?? getEmptyCalculatorValues();
}

export function computeInquiryTaxBreakdown(
  values: Record<string, unknown> | null | undefined
): InquiryTaxBreakdown | null {
  if (!values || typeof values !== "object") return null;

  const invValue = deriveInvValue(values);
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

  const sumOfAllTaxes =
    customDuty +
    addCd +
    gst +
    addGst +
    incomeTax +
    excise +
    regularDuty +
    stampDuty +
    invFine;

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
  const normalizedValues = getPrimaryCalculatorValues(values);
  const taxBreakdown = computeInquiryTaxBreakdown(normalizedValues);
  if (!taxBreakdown) return null;

  const weightKg = Math.max(toNum(options?.weightKg), 0);
  const quantity = Math.max(toNum(options?.quantity ?? normalizedValues?.quantity ?? 1), 1) || 1;
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

export type EstimatedDutyRow = {
  name: string;
  rate: number | null;
  amount: number;
};

export type EstimatedDutiesDisplay = {
  exchangeRateDisplay: number;
  hsCodeDisplay: string;
  unitPrice: number;
  quantityDisplay: string;
  importValue: number;
  rows: EstimatedDutyRow[];
  grandTotal: number;
};

export function buildEstimatedDutiesDisplay(
  calculatorValues: Record<string, unknown> | null | undefined,
  options?: { hsCode?: string; quantity?: string }
): EstimatedDutiesDisplay | null {
  const values = getPrimaryCalculatorValues(calculatorValues);
  const taxBreakdown = computeInquiryTaxBreakdown(values);
  if (!taxBreakdown) return null;

  const customDutyRate = toNum(values.custom_duty_rate);
  const addCdRate = toNum(values.add_cd_rate);
  const gstRate = toNum(values.gst_rate);
  const addGstRate = toNum(values.add_gst_rate);
  const incomeTaxRate = toNum(values.income_tax_rate);
  const exciseRate = toNum(values.excise_rate);
  const regularDutyRate = toNum(values.regular_duty_rate);
  const stampDutyRate = toNum(values.stamp_duty_rate);

  const rows: EstimatedDutyRow[] = [
    { name: "Customs Duty", rate: customDutyRate, amount: taxBreakdown.customDuty },
    { name: "Add CD", rate: addCdRate, amount: taxBreakdown.addCd },
    { name: "Sales Tax", rate: gstRate, amount: taxBreakdown.gst },
    { name: "Add GST", rate: addGstRate, amount: taxBreakdown.addGst },
    { name: "Income Tax", rate: incomeTaxRate, amount: taxBreakdown.incomeTax },
    { name: "Excise", rate: exciseRate, amount: taxBreakdown.excise },
    { name: "Regular Duty", rate: regularDutyRate, amount: taxBreakdown.regularDuty },
    { name: "Stamp Duty", rate: stampDutyRate, amount: taxBreakdown.stampDuty },
    { name: "INV Fine", rate: null, amount: taxBreakdown.invFine },
  ].filter(
    (row) =>
      row.name === "Customs Duty" ||
      row.name === "Sales Tax" ||
      row.name === "Income Tax" ||
      row.rate === null ||
      row.rate > 0 ||
      Math.abs(row.amount) > 0
  );

  const hsCodeDisplay =
    (options?.hsCode || String(values.hs_code || "")).trim() || "-";
  const quantityDisplay =
    (options?.quantity || String(values.quantity || "")).trim() || "0";

  return {
    exchangeRateDisplay: taxBreakdown.exchangeRate,
    hsCodeDisplay,
    unitPrice: taxBreakdown.invValue,
    quantityDisplay,
    importValue: taxBreakdown.pkrValue,
    rows,
    grandTotal: rows.reduce((sum, row) => sum + row.amount, 0),
  };
}

export type ApprovedInquiryPricing = {
  quotation_number: string;
  unit_price: number;
  total_amount: number;
  final_price: number;
  notes: string | null;
};

export function formatFinalAnswer(n: number) {
  return Number.isFinite(n) ? n.toFixed(6) : "-";
}

export function buildApprovedInquiryPricing(
  calculatorValues: Record<string, unknown> | null | undefined,
  options: {
    weightKg?: string | number;
    quantity?: string | number;
    cbm?: string | number;
    pricingConfig?: CalculatorPricingConfig | Record<string, unknown> | null;
  }
): ApprovedInquiryPricing | null {
  const totals = computeCalculatorTotals(calculatorValues, options);
  if (!totals) return null;

  return {
    quotation_number: "APPROVED",
    unit_price: totals.unitPrice,
    total_amount: totals.totalAmount,
    final_price: totals.finalAnswer,
    notes: null,
  };
}

export const CALCULATOR_FIELD_LABELS: Record<string, string> = {
  inv_value: "Invoice Value",
  unit_value: "Unit Value",
  exchange_rate: "Exchange Rate",
  custom_duty_rate: "Custom Duty %",
  add_cd_rate: "ADD CD %",
  gst_rate: "Sales Tax %",
  add_gst_rate: "ADD GST %",
  income_tax_rate: "Income Tax %",
  excise_rate: "Excise %",
  regular_duty_rate: "Regular Duty %",
  stamp_duty_rate: "Stamp Duty %",
  inv_fine: "INV Fine",
  gross_weight_value: "Gross Weight Value",
  volumetric_weight_value: "Volumetric Weight Value",
  cbm_value: "CBM Value",
  uom: "UOM",
  quantity: "Quantity",
  hs_code: "HS Code",
};

/** Admin-shared rate defaults — not inquiry-specific values like inv_value or hs_code. */
export const SHARED_CALCULATOR_DEFAULT_KEYS = [
  "exchange_rate",
  "custom_duty_rate",
  "add_cd_rate",
  "gst_rate",
  "add_gst_rate",
  "income_tax_rate",
  "excise_rate",
  "regular_duty_rate",
  "stamp_duty_rate",
  "inv_fine",
] as const;

/** Removes deprecated Sales Tax (ST) field from calculator value maps. */
export function sanitizeCalculatorValues(
  values: Record<string, unknown> | null | undefined
): Record<string, string> {
  if (!values || typeof values !== "object") return {};
  const sanitized = { ...values } as Record<string, string>;
  delete sanitized.sales_tax_rate;
  return sanitized;
}

/** Picks only shared admin rate defaults — excludes inquiry-specific fields. */
export function pickSharedCalculatorDefaults(
  values: Record<string, unknown> | null | undefined
): Record<string, string> {
  const sanitized = sanitizeCalculatorValues(values);
  const picked: Record<string, string> = {};
  for (const key of SHARED_CALCULATOR_DEFAULT_KEYS) {
    if (sanitized[key] !== undefined) {
      picked[key] = sanitized[key];
    }
  }
  return picked;
}
