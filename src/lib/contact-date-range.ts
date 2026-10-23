/**
 * Contact list date-range helpers (Meta Ads–style presets).
 * Business calendar: Asia/Karachi (UTC+5, no DST).
 * Filtering uses inclusive start + exclusive end against contacts.created_at (UTC).
 */

export const CONTACT_BUSINESS_TZ = 'Asia/Karachi';
/** Fixed offset — Pakistan Standard Time does not observe DST. */
export const CONTACT_TZ_OFFSET = '+05:00';

export type ContactDatePresetId =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_month'
  | 'custom'
  | `month:${string}`; // month:YYYY-MM

export type ContactDateRangeValue = {
  preset: ContactDatePresetId;
  /** Calendar dates in Asia/Karachi as YYYY-MM-DD (inclusive). */
  startYmd: string;
  endYmd: string;
};

export type ContactDateRangeQuery = {
  /** Inclusive lower bound (ISO UTC). */
  createdAtGte: string;
  /** Exclusive upper bound (ISO UTC) — day after endYmd at 00:00 Karachi. */
  createdAtLt: string;
};

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidYmd(value: string): boolean {
  if (!YMD_RE.test(value)) return false;
  const { y, m, d } = parseYmd(value);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const last = Number(endOfMonthYmd(formatYmd(y, m, 1)).slice(8, 10));
  return d <= last;
}

/** Today's calendar date in Asia/Karachi as YYYY-MM-DD. */
export function karachiTodayYmd(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CONTACT_BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number);
  return { y, m, d };
}

function formatYmd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Add calendar days to a Karachi YMD (handles month/year rollover). */
export function addDaysYmd(ymd: string, deltaDays: number): string {
  const start = new Date(`${ymd}T12:00:00${CONTACT_TZ_OFFSET}`);
  const next = new Date(start.getTime() + deltaDays * 24 * 60 * 60 * 1000);
  return karachiTodayYmd(next);
}

export function startOfMonthYmd(ymd: string): string {
  const { y, m } = parseYmd(ymd);
  return formatYmd(y, m, 1);
}

export function endOfMonthYmd(ymd: string): string {
  const { y, m } = parseYmd(ymd);
  // Day 0 of next month = last day of this month (UTC noon trick via Karachi offset)
  const last = new Date(Date.UTC(y, m, 0, 12, 0, 0));
  return formatYmd(last.getUTCFullYear(), last.getUTCMonth() + 1, last.getUTCDate());
}

export function shiftMonthYmd(ymd: string, deltaMonths: number): string {
  const { y, m, d } = parseYmd(ymd);
  const idx = y * 12 + (m - 1) + deltaMonths;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  const lastDay = Number(endOfMonthYmd(formatYmd(ny, nm, 1)).slice(8, 10));
  return formatYmd(ny, nm, Math.min(d, lastDay));
}

/** 00:00:00.000 Asia/Karachi on ymd → UTC ISO. */
export function karachiDayStartUtc(ymd: string): string {
  return new Date(`${ymd}T00:00:00.000${CONTACT_TZ_OFFSET}`).toISOString();
}

/**
 * Exclusive end: 00:00 Asia/Karachi on the calendar day after endYmd.
 * Ensures records created late on endYmd are included.
 */
export function karachiDayEndExclusiveUtc(endYmd: string): string {
  const next = addDaysYmd(endYmd, 1);
  return karachiDayStartUtc(next);
}

export function toContactDateRangeQuery(
  range: Pick<ContactDateRangeValue, 'startYmd' | 'endYmd'>
): ContactDateRangeQuery | null {
  if (!isValidYmd(range.startYmd) || !isValidYmd(range.endYmd)) return null;
  let start = range.startYmd;
  let end = range.endYmd;
  if (start > end) {
    const tmp = start;
    start = end;
    end = tmp;
  }
  return {
    createdAtGte: karachiDayStartUtc(start),
    createdAtLt: karachiDayEndExclusiveUtc(end),
  };
}

export function resolveContactDatePreset(
  preset: ContactDatePresetId,
  now: Date = new Date()
): ContactDateRangeValue {
  const today = karachiTodayYmd(now);

  if (preset.startsWith('month:')) {
    const ym = preset.slice('month:'.length);
    const anchor = `${ym}-01`;
    if (!isValidYmd(anchor)) {
      return resolveContactDatePreset('this_month', now);
    }
    return {
      preset,
      startYmd: startOfMonthYmd(anchor),
      endYmd: endOfMonthYmd(anchor),
    };
  }

  switch (preset) {
    case 'today':
      return { preset, startYmd: today, endYmd: today };
    case 'yesterday': {
      const y = addDaysYmd(today, -1);
      return { preset, startYmd: y, endYmd: y };
    }
    case 'last_7_days':
      return { preset, startYmd: addDaysYmd(today, -6), endYmd: today };
    case 'last_30_days':
      return { preset, startYmd: addDaysYmd(today, -29), endYmd: today };
    case 'this_month':
      return {
        preset,
        startYmd: startOfMonthYmd(today),
        endYmd: endOfMonthYmd(today),
      };
    case 'last_month': {
      const prev = shiftMonthYmd(startOfMonthYmd(today), -1);
      return {
        preset,
        startYmd: startOfMonthYmd(prev),
        endYmd: endOfMonthYmd(prev),
      };
    }
    case 'custom':
    default:
      return { preset: 'custom', startYmd: today, endYmd: today };
  }
}

export function formatContactDateRangeLabel(range: ContactDateRangeValue): string {
  if (range.preset.startsWith('month:')) {
    const anchor = `${range.preset.slice('month:'.length)}-01`;
    return formatMonthYearLabel(anchor);
  }
  switch (range.preset) {
    case 'today':
      return 'Today';
    case 'yesterday':
      return 'Yesterday';
    case 'last_7_days':
      return 'Last 7 Days';
    case 'last_30_days':
      return 'Last 30 Days';
    case 'this_month':
      return 'This Month';
    case 'last_month':
      return 'Last Month';
    case 'custom':
    default:
      if (range.startYmd === range.endYmd) {
        return formatShortDateLabel(range.startYmd);
      }
      return `${formatShortDateLabel(range.startYmd)} – ${formatShortDateLabel(range.endYmd)}`;
  }
}

export function formatMonthYearLabel(ymdOrYm: string): string {
  const ymd = YMD_RE.test(ymdOrYm) ? ymdOrYm : `${ymdOrYm}-01`;
  const { y, m } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, 1));
  return dt.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function formatShortDateLabel(ymd: string): string {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Recent months for the month picker (newest first), including current. */
export function listRecentMonthPresets(
  count = 18,
  now: Date = new Date()
): Array<{ id: `month:${string}`; label: string; startYmd: string; endYmd: string }> {
  const today = karachiTodayYmd(now);
  const out: Array<{
    id: `month:${string}`;
    label: string;
    startYmd: string;
    endYmd: string;
  }> = [];
  let cursor = startOfMonthYmd(today);
  for (let i = 0; i < count; i++) {
    const ym = cursor.slice(0, 7);
    out.push({
      id: `month:${ym}`,
      label: formatMonthYearLabel(cursor),
      startYmd: startOfMonthYmd(cursor),
      endYmd: endOfMonthYmd(cursor),
    });
    cursor = shiftMonthYmd(cursor, -1);
  }
  return out;
}

export const CONTACT_DATE_PRESET_OPTIONS: Array<{
  id: Exclude<ContactDatePresetId, `month:${string}` | 'custom'>;
  label: string;
}> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last_7_days', label: 'Last 7 Days' },
  { id: 'last_30_days', label: 'Last 30 Days' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
];
