/**
 * One date filter for every Analytics KPI, chart, table and export.
 * Reuses the Contacts business calendar (Asia/Karachi, fixed +05:00).
 * Bounds are half-open to match the SQL functions: from <= value < to.
 */

import {
  CONTACT_TZ_OFFSET,
  addDaysYmd,
  endOfMonthYmd,
  isValidYmd,
  karachiDayEndExclusiveUtc,
  karachiDayStartUtc,
  karachiTodayYmd,
  startOfMonthYmd,
} from '../contact-date-range';

export type AnalyticsDatePreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'custom';

export const ANALYTICS_DATE_PRESETS: Array<{ id: AnalyticsDatePreset; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last_7_days', label: 'Last 7 days' },
  { id: 'last_30_days', label: 'Last 30 days' },
  { id: 'this_week', label: 'This week' },
  { id: 'last_week', label: 'Last week' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'custom', label: 'Custom range' },
];

export type AnalyticsCustomRange = {
  startYmd: string;
  endYmd: string;
  /** Optional HH:MM in business time. Omitted means the whole day. */
  startTime?: string;
  endTime?: string;
};

export type AnalyticsDateRange = {
  preset: AnalyticsDatePreset;
  /** Calendar dates (inclusive) for display. */
  startYmd: string;
  endYmd: string;
  /** ISO UTC, inclusive. */
  from: string;
  /** ISO UTC, exclusive. */
  to: string;
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Monday of the week containing the date. */
function startOfWeekYmd(ymd: string): string {
  const weekday = new Date(`${ymd}T12:00:00${CONTACT_TZ_OFFSET}`).getUTCDay();
  return addDaysYmd(ymd, -((weekday + 6) % 7));
}

function daysRange(preset: AnalyticsDatePreset, startYmd: string, endYmd: string): AnalyticsDateRange {
  return {
    preset,
    startYmd,
    endYmd,
    from: karachiDayStartUtc(startYmd),
    to: karachiDayEndExclusiveUtc(endYmd),
  };
}

export function resolveAnalyticsDateRange(
  preset: AnalyticsDatePreset,
  custom?: AnalyticsCustomRange,
  now: Date = new Date()
): AnalyticsDateRange | { error: string } {
  const today = karachiTodayYmd(now);

  switch (preset) {
    case 'today':
      return daysRange(preset, today, today);
    case 'yesterday': {
      const day = addDaysYmd(today, -1);
      return daysRange(preset, day, day);
    }
    case 'last_7_days':
      return daysRange(preset, addDaysYmd(today, -6), today);
    case 'last_30_days':
      return daysRange(preset, addDaysYmd(today, -29), today);
    case 'this_week':
      return daysRange(preset, startOfWeekYmd(today), today);
    case 'last_week': {
      const start = addDaysYmd(startOfWeekYmd(today), -7);
      return daysRange(preset, start, addDaysYmd(start, 6));
    }
    case 'this_month':
      return daysRange(preset, startOfMonthYmd(today), today);
    case 'last_month': {
      const lastDay = addDaysYmd(startOfMonthYmd(today), -1);
      return daysRange(preset, startOfMonthYmd(lastDay), endOfMonthYmd(lastDay));
    }
    case 'custom':
      return resolveCustomRange(custom);
  }
}

function resolveCustomRange(custom?: AnalyticsCustomRange): AnalyticsDateRange | { error: string } {
  if (!custom || !isValidYmd(custom.startYmd) || !isValidYmd(custom.endYmd)) {
    return { error: 'Choose a start date and an end date.' };
  }
  if (custom.startTime && !TIME_RE.test(custom.startTime)) return { error: 'Start time is not valid.' };
  if (custom.endTime && !TIME_RE.test(custom.endTime)) return { error: 'End time is not valid.' };

  const from = custom.startTime
    ? new Date(`${custom.startYmd}T${custom.startTime}:00${CONTACT_TZ_OFFSET}`).toISOString()
    : karachiDayStartUtc(custom.startYmd);
  // An end time includes that whole minute.
  const to = custom.endTime
    ? new Date(new Date(`${custom.endYmd}T${custom.endTime}:00${CONTACT_TZ_OFFSET}`).getTime() + 60_000).toISOString()
    : karachiDayEndExclusiveUtc(custom.endYmd);

  if (from >= to) return { error: 'The end must be after the start.' };
  return { preset: 'custom', startYmd: custom.startYmd, endYmd: custom.endYmd, from, to };
}
