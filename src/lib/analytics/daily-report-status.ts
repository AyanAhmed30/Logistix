/** Rules for the five daily report statuses, kept apart from data access. */

export type DailyReportDisplayStatus = 'not_started' | 'draft' | 'submitted' | 'late' | 'missing';

export const DAILY_REPORT_STATUS_LABELS: Record<DailyReportDisplayStatus, string> = {
  not_started: 'Not started',
  draft: 'Draft',
  submitted: 'Submitted',
  late: 'Late',
  missing: 'Missing',
};

export type DailyReportSettings = {
  /** HH:MM or HH:MM:SS, in the fixed business timezone. */
  deadlineLocal: string;
  /** ISO weekdays, 1 = Monday ... 7 = Sunday. */
  workingDays: number[];
};

const BUSINESS_OFFSET = '+05:00';

/** The moment a report for this date is due. */
export function dailyReportDeadline(reportYmd: string, deadlineLocal: string): Date {
  const time = deadlineLocal.length === 5 ? `${deadlineLocal}:00` : deadlineLocal;
  return new Date(`${reportYmd}T${time}${BUSINESS_OFFSET}`);
}

export function isWorkingDay(reportYmd: string, workingDays: number[]): boolean {
  const day = new Date(`${reportYmd}T12:00:00${BUSINESS_OFFSET}`).getUTCDay();
  return workingDays.includes(day === 0 ? 7 : day);
}

/**
 * A draft past its deadline counts as Missing: nothing was handed in.
 * Returns null on a non-working day when no report exists, so nobody is marked
 * as missing a report that was never due.
 */
export function resolveDailyReportStatus(input: {
  reportYmd: string;
  settings: DailyReportSettings;
  report: { status: 'draft' | 'submitted'; isLate: boolean } | null;
  now?: Date;
}): DailyReportDisplayStatus | null {
  const { reportYmd, settings, report } = input;
  const now = input.now ?? new Date();

  if (report?.status === 'submitted') return report.isLate ? 'late' : 'submitted';

  const working = isWorkingDay(reportYmd, settings.workingDays);
  if (!report && !working) return null;

  const pastDeadline = now.getTime() > dailyReportDeadline(reportYmd, settings.deadlineLocal).getTime();
  if (working && pastDeadline) return 'missing';
  return report ? 'draft' : 'not_started';
}

/** Submitted after the deadline. Non-working days are never late. */
export function isLateSubmission(
  reportYmd: string,
  settings: DailyReportSettings,
  submittedAt: Date
): boolean {
  if (!isWorkingDay(reportYmd, settings.workingDays)) return false;
  return submittedAt.getTime() > dailyReportDeadline(reportYmd, settings.deadlineLocal).getTime();
}
