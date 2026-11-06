const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const unit = (value: number, name: string) => `${value} ${name}${value === 1 ? '' : 's'}`;

/**
 * Readable duration, two units at most: "15 minutes", "2 hours 30 minutes",
 * "1 day 4 hours". A missing value stays "—" so it is never read as zero.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '—';
  }
  if (seconds < MINUTE) return 'Under a minute';

  const total = Math.round(seconds / MINUTE) * MINUTE;
  const days = Math.floor(total / DAY);
  const hours = Math.floor((total % DAY) / HOUR);
  const minutes = Math.floor((total % HOUR) / MINUTE);

  if (days > 0) return hours > 0 ? `${unit(days, 'day')} ${unit(hours, 'hour')}` : unit(days, 'day');
  if (hours > 0) return minutes > 0 ? `${unit(hours, 'hour')} ${unit(minutes, 'minute')}` : unit(hours, 'hour');
  return unit(minutes, 'minute');
}
