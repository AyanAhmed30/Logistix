/**
 * Central Currency Engine (Odoo-inspired).
 * Single source of truth for currency master, rates, conversion, and formatting.
 * All accounting modules must consume this — never duplicate FX math elsewhere.
 */

export type CurrencySymbolPosition = 'before' | 'after';
export type ExchangeRateType = 'manual' | 'api' | 'bank' | 'import';

export type CurrencyDef = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimal_places: number;
  rounding: number;
  symbol_position: CurrencySymbolPosition;
  is_base: boolean;
  is_active: boolean;
  sequence: number;
};

export type ExchangeRateDef = {
  id?: string;
  currency_id: string;
  currency_code?: string;
  rate_date: string;
  /** Units of base currency per 1 unit of this currency (foreign * rate = base). */
  rate_to_base: number;
  source?: string | null;
  rate_type?: ExchangeRateType;
};

export type MoneyConversionResult = {
  amount: number;
  from_code: string;
  to_code: string;
  rate_from_to_base: number;
  rate_to_to_base: number;
  /** Effective multiplier: amount_to = amount_from * rate_effective */
  rate_effective: number;
  rate_date: string;
};

export const FALLBACK_BASE_CURRENCY = 'PKR';

export function normalizeCurrencyCode(code: string | null | undefined): string {
  return String(code || '').trim().toUpperCase();
}

export function toFiniteAmount(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Round using currency decimal places (Odoo-style monetary rounding). */
export function roundCurrencyAmount(
  amount: number,
  decimalPlaces = 2
): number {
  const d = Math.max(0, Math.min(6, Math.floor(decimalPlaces)));
  const factor = 10 ** d;
  return Math.round((toFiniteAmount(amount) + Number.EPSILON) * factor) / factor;
}

/** Round using currency.rounding step when provided (e.g. 0.01, 0.05). */
export function roundToCurrencyRounding(
  amount: number,
  rounding: number,
  decimalPlaces = 2
): number {
  const step = toFiniteAmount(rounding, 0);
  if (step <= 0) return roundCurrencyAmount(amount, decimalPlaces);
  const rounded = Math.round(toFiniteAmount(amount) / step) * step;
  return roundCurrencyAmount(rounded, decimalPlaces);
}

export function formatCurrencyAmount(
  amount: number,
  currency?: Pick<
    CurrencyDef,
    'code' | 'symbol' | 'decimal_places' | 'symbol_position'
  > | null,
  opts?: { useSymbol?: boolean }
): string {
  const code = normalizeCurrencyCode(currency?.code) || FALLBACK_BASE_CURRENCY;
  const decimals =
    currency?.decimal_places != null
      ? Math.max(0, Math.min(6, currency.decimal_places))
      : 2;
  const useSymbol = opts?.useSymbol !== false;
  const value = roundCurrencyAmount(amount, decimals);
  const formatted = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);

  if (!useSymbol) {
    return `${formatted} ${code}`;
  }

  const symbol = (currency?.symbol || code).trim() || code;
  if (currency?.symbol_position === 'after') {
    return `${formatted} ${symbol}`;
  }
  return `${symbol} ${formatted}`;
}

/**
 * Convert amount using rate_to_base model:
 * base = foreign * rate_to_base
 * foreign = base / rate_to_base
 * A→B via base triangulation when both rates known.
 */
export function convertViaBaseRates(args: {
  amount: number;
  fromRateToBase: number;
  toRateToBase: number;
  toDecimalPlaces?: number;
}): number {
  const amount = toFiniteAmount(args.amount);
  const fromRate = toFiniteAmount(args.fromRateToBase);
  const toRate = toFiniteAmount(args.toRateToBase);
  if (fromRate <= 0 || toRate <= 0) {
    throw new Error('Exchange rates must be greater than zero.');
  }
  const base = amount * fromRate;
  return roundCurrencyAmount(base / toRate, args.toDecimalPlaces ?? 2);
}

export function convertToBaseAmount(
  foreignAmount: number,
  rateToBase: number,
  decimalPlaces = 2
): number {
  const amount = toFiniteAmount(foreignAmount);
  const rate = toFiniteAmount(rateToBase);
  if (rate <= 0) throw new Error('Exchange rate must be greater than zero.');
  return roundCurrencyAmount(amount * rate, decimalPlaces);
}

export function convertFromBaseAmount(
  baseAmount: number,
  rateToBase: number,
  decimalPlaces = 2
): number {
  const amount = toFiniteAmount(baseAmount);
  const rate = toFiniteAmount(rateToBase);
  if (rate <= 0) throw new Error('Exchange rate must be greater than zero.');
  return roundCurrencyAmount(amount / rate, decimalPlaces);
}

/**
 * Effective rate from document currency → company currency.
 * rate_to_base stored as: 1 foreign = rate base units.
 */
export function companyRateFromDocument(args: {
  documentRateToBase: number;
  companyRateToBase: number;
}): number {
  const doc = toFiniteAmount(args.documentRateToBase);
  const company = toFiniteAmount(args.companyRateToBase);
  if (doc <= 0 || company <= 0) {
    throw new Error('Exchange rates must be greater than zero.');
  }
  return doc / company;
}

export function buildConversionResult(args: {
  amount: number;
  fromCode: string;
  toCode: string;
  fromRateToBase: number;
  toRateToBase: number;
  rateDate: string;
  toDecimalPlaces?: number;
}): MoneyConversionResult {
  const from = normalizeCurrencyCode(args.fromCode);
  const to = normalizeCurrencyCode(args.toCode);
  const converted =
    from === to
      ? roundCurrencyAmount(args.amount, args.toDecimalPlaces ?? 2)
      : convertViaBaseRates({
          amount: args.amount,
          fromRateToBase: args.fromRateToBase,
          toRateToBase: args.toRateToBase,
          toDecimalPlaces: args.toDecimalPlaces,
        });

  const rateEffective =
    from === to
      ? 1
      : toFiniteAmount(args.fromRateToBase) / toFiniteAmount(args.toRateToBase);

  return {
    amount: converted,
    from_code: from,
    to_code: to,
    rate_from_to_base: toFiniteAmount(args.fromRateToBase),
    rate_to_to_base: toFiniteAmount(args.toRateToBase),
    rate_effective: rateEffective,
    rate_date: args.rateDate,
  };
}

/**
 * Realized FX difference on settlement (company currency).
 * positive difference = loss (settled more company than original),
 * negative = gain — matches existing multiCurrency.calculate_exchange_difference.
 */
export function calculateRealizedExchangeDifference(args: {
  settledCompanyAmount: number;
  originalCompanyAmount: number;
}): {
  difference: number;
  type: 'gain' | 'loss' | 'none';
  absolute: number;
} {
  const settled = toFiniteAmount(args.settledCompanyAmount);
  const original = toFiniteAmount(args.originalCompanyAmount);
  const difference = roundCurrencyAmount(settled - original, 2);
  return {
    difference,
    type: difference > 0 ? 'loss' : difference < 0 ? 'gain' : 'none',
    absolute: Math.abs(difference),
  };
}

export function currencySummaryLabel(c: Pick<CurrencyDef, 'code' | 'name' | 'symbol'>): string {
  const sym = c.symbol ? ` (${c.symbol})` : '';
  return `${c.code} — ${c.name}${sym}`;
}

export function isValidIsoCurrencyCode(code: string): boolean {
  return /^[A-Z]{3}$/.test(normalizeCurrencyCode(code));
}

/** Fallback list when DB currencies are unavailable (UI only). */
export const FALLBACK_CURRENCY_CODES = [
  'PKR',
  'USD',
  'AED',
  'SAR',
  'EUR',
  'GBP',
] as const;
