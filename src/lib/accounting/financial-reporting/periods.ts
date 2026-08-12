/**
 * Shared reporting date-period helpers (Phase 1 + Phase 2).
 */

export type DatePeriodPreset =
  | 'today'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year'
  | 'previous_year'
  | 'custom';

export type DatePeriod = {
  dateFrom: string;
  dateTo: string;
  preset: DatePeriodPreset;
  label: string;
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toIso(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function startOfMonthUTC(y: number, m0: number) {
  return new Date(Date.UTC(y, m0, 1));
}

function endOfMonthUTC(y: number, m0: number) {
  return new Date(Date.UTC(y, m0 + 1, 0));
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function todayIso(now = new Date()) {
  return toIso(
    new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  );
}

export function formatMonthYear(iso: string) {
  const [y, m] = iso.split('-');
  const mi = Math.max(0, Number(m || 1) - 1);
  return `${MONTHS[mi]} ${y}`;
}

export function formatPeriodRange(dateFrom: string, dateTo: string) {
  if (dateFrom.slice(0, 7) === dateTo.slice(0, 7)) {
    return formatMonthYear(dateFrom);
  }
  const a = formatMonthYear(dateFrom);
  const b = formatMonthYear(dateTo);
  return a === b ? a : `${a} - ${b}`;
}

export function resolveDatePeriod(
  preset: DatePeriodPreset,
  custom?: { dateFrom?: string; dateTo?: string },
  now = new Date()
): DatePeriod {
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = todayIso(now);

  if (preset === 'custom') {
    const dateTo = (custom?.dateTo || today).slice(0, 10);
    const dateFrom = (custom?.dateFrom || `${dateTo.slice(0, 4)}-01-01`).slice(
      0,
      10
    );
    return {
      dateFrom,
      dateTo,
      preset: 'custom',
      label: formatPeriodRange(dateFrom, dateTo),
    };
  }

  if (preset === 'today') {
    return { dateFrom: today, dateTo: today, preset, label: 'Today' };
  }

  if (preset === 'this_month') {
    const from = toIso(startOfMonthUTC(y, m));
    const to = toIso(endOfMonthUTC(y, m));
    return {
      dateFrom: from,
      dateTo: to,
      preset,
      label: formatMonthYear(from),
    };
  }

  if (preset === 'last_month') {
    const lm = m === 0 ? 11 : m - 1;
    const ly = m === 0 ? y - 1 : y;
    const from = toIso(startOfMonthUTC(ly, lm));
    const to = toIso(endOfMonthUTC(ly, lm));
    return {
      dateFrom: from,
      dateTo: to,
      preset,
      label: formatMonthYear(from),
    };
  }

  if (preset === 'this_quarter') {
    const q0 = Math.floor(m / 3) * 3;
    const from = toIso(startOfMonthUTC(y, q0));
    const to = toIso(endOfMonthUTC(y, q0 + 2));
    return {
      dateFrom: from,
      dateTo: to,
      preset,
      label: formatPeriodRange(from, to),
    };
  }

  if (preset === 'this_year') {
    const from = `${y}-01-01`;
    const to = `${y}-12-31`;
    return { dateFrom: from, dateTo: to, preset, label: String(y) };
  }

  // previous_year
  const py = y - 1;
  return {
    dateFrom: `${py}-01-01`,
    dateTo: `${py}-12-31`,
    preset: 'previous_year',
    label: String(py),
  };
}

export const DATE_PERIOD_PRESETS: {
  id: DatePeriodPreset;
  label: string;
}[] = [
  { id: 'today', label: 'Today' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'this_quarter', label: 'This Quarter' },
  { id: 'this_year', label: 'This Year' },
  { id: 'previous_year', label: 'Previous Year' },
  { id: 'custom', label: 'Custom' },
];
