/**
 * Fixed asset depreciation schedule helpers (Odoo-style straight-line).
 */

export type AssetDepreciationMethod = 'straight_line' | 'declining_balance' | 'manual';
export type AssetMethodPeriod = 'monthly' | 'yearly';

export type AssetScheduleLine = {
  sequence: number;
  period_label: string;
  depreciation_date: string;
  amount: number;
  remaining_value: number;
};

function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate + (isoDate.length <= 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function periodLabel(isoDate: string): string {
  const d = new Date(isoDate + (isoDate.length <= 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Build a depreciation board.
 * Depreciable base = originalValue - salvageValue.
 */
export function buildAssetDepreciationSchedule(opts: {
  originalValue: number;
  salvageValue?: number;
  method?: AssetDepreciationMethod;
  methodPeriod?: AssetMethodPeriod;
  numberOfDepreciations: number;
  firstDepreciationDate: string;
}): AssetScheduleLine[] {
  const original = round2(Math.max(0, opts.originalValue));
  const salvage = round2(Math.max(0, opts.salvageValue || 0));
  const base = round2(Math.max(0, original - salvage));
  const n = Math.max(1, Math.floor(opts.numberOfDepreciations || 1));
  const first = String(opts.firstDepreciationDate || '').slice(0, 10);
  const period = opts.methodPeriod || 'monthly';
  const stepMonths = period === 'yearly' ? 12 : 1;
  const method = opts.method || 'straight_line';

  if (base <= 0.004 || !first) {
    return [];
  }

  const lines: AssetScheduleLine[] = [];
  let remaining = original;
  let undepreciated = base;

  if (method === 'declining_balance') {
    // Double-declining rate capped so last period hits salvage.
    const rate = Math.min(1, (2 / n) * (period === 'yearly' ? 1 : 12 / 12));
    for (let i = 1; i <= n; i++) {
      const date = addMonths(first, (i - 1) * stepMonths);
      let amount =
        i === n
          ? round2(Math.max(0, remaining - salvage))
          : round2(Math.min(undepreciated, remaining * rate));
      if (amount > undepreciated) amount = round2(undepreciated);
      remaining = round2(Math.max(salvage, remaining - amount));
      undepreciated = round2(Math.max(0, undepreciated - amount));
      lines.push({
        sequence: i,
        period_label: periodLabel(date),
        depreciation_date: date,
        amount,
        remaining_value: remaining,
      });
    }
    return lines;
  }

  // Straight-line (default) — equal amounts; last line absorbs rounding.
  const per = round2(base / n);
  let allocated = 0;
  for (let i = 1; i <= n; i++) {
    const date = addMonths(first, (i - 1) * stepMonths);
    let amount = i === n ? round2(base - allocated) : per;
    if (amount < 0) amount = 0;
    allocated = round2(allocated + amount);
    remaining = round2(Math.max(salvage, remaining - amount));
    lines.push({
      sequence: i,
      period_label: periodLabel(date),
      depreciation_date: date,
      amount,
      remaining_value: remaining,
    });
  }
  return lines;
}

export function computeBookValue(original: number, accumulated: number) {
  return round2(Math.max(0, round2(original) - round2(accumulated)));
}
