/**
 * Groups a daily series into weeks or months so long periods stay readable.
 * Days are Karachi calendar dates (YYYY-MM-DD); weeks start on Monday.
 */

export type SeriesBucket = 'day' | 'week' | 'month';

/** Daily up to two months, weekly up to about a year, monthly beyond. */
export function bucketForDays(dayCount: number): SeriesBucket {
  if (dayCount <= 62) return 'day';
  if (dayCount <= 370) return 'week';
  return 'month';
}

export function bucketStart(day: string, bucket: SeriesBucket): string {
  if (bucket === 'day') return day;
  if (bucket === 'month') return `${day.slice(0, 7)}-01`;
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

/** Sums every numeric field per bucket. The bucket's first day becomes `day`. */
export function groupSeries<T extends { day: string }>(points: T[], bucket: SeriesBucket): T[] {
  if (bucket === 'day') return points;
  const grouped = new Map<string, T>();
  for (const point of points) {
    const day = bucketStart(point.day, bucket);
    const current = grouped.get(day);
    if (!current) {
      grouped.set(day, { ...point, day });
      continue;
    }
    const next = { ...current } as Record<string, unknown>;
    for (const [key, value] of Object.entries(point)) {
      if (typeof value === 'number') next[key] = Number(next[key] ?? 0) + value;
    }
    grouped.set(day, next as T);
  }
  return [...grouped.values()];
}

/** Drops leading buckets with no activity at all, so "All time" starts at the first record. */
export function trimLeadingEmpty<T extends { day: string }>(points: T[]): T[] {
  const first = points.findIndex((point) =>
    Object.entries(point).some(([key, value]) => key !== 'day' && typeof value === 'number' && value > 0)
  );
  return first <= 0 ? points : points.slice(first);
}
