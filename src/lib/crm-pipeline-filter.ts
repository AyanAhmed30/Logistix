import type { CrmOpportunityCard, CrmPipelineStage } from '@/app/actions/crm/types';

/**
 * One filter state for Super Admin's pipeline page. The board, the summary cards
 * and the charts are all computed from the same filtered list, so they always agree.
 */
export type DatePreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_7_days'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'day'
  | 'month'
  | 'year'
  | 'range';

export type PipelineFilterState = {
  datePreset: DatePreset;
  /** YYYY-MM-DD for 'day'; YYYY-MM for 'month'; YYYY for 'year'. */
  dateValue: string;
  /** YYYY-MM-DD, both inclusive, for 'range'. */
  rangeFrom: string;
  rangeTo: string;
  search: string;
  stage: string;
  assignee: string;
  minValue: string;
  maxValue: string;
  tag: string;
};

export const EMPTY_PIPELINE_FILTERS: PipelineFilterState = {
  datePreset: 'all',
  dateValue: '',
  rangeFrom: '',
  rangeTo: '',
  search: '',
  stage: 'all',
  assignee: 'all',
  minValue: '',
  maxValue: '',
  tag: 'all',
};

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  all: 'All time',
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This week',
  last_7_days: 'Last 7 days',
  this_month: 'This month',
  last_month: 'Last month',
  this_year: 'This year',
  day: 'Specific day',
  month: 'Specific month',
  year: 'Specific year',
  range: 'Custom range',
};

/** Dates follow Pakistan time (UTC+5, no daylight saving) to match the rest of the app. */
const OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Local midnight (Pakistan) of a calendar date, as a UTC timestamp. */
const localMidnight = (year: number, month: number, day: number) => Date.UTC(year, month, day) - OFFSET_MS;

export type DateRange = { start: number; end: number } | null;

/** Half-open [start, end) range in UTC milliseconds, or null for "no date limit". */
export function resolveDateRange(state: PipelineFilterState, now = Date.now()): DateRange {
  const local = new Date(now + OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  const today = localMidnight(y, m, d);

  switch (state.datePreset) {
    case 'today':
      return { start: today, end: today + DAY_MS };
    case 'yesterday':
      return { start: today - DAY_MS, end: today };
    case 'this_week': {
      const sinceMonday = (local.getUTCDay() + 6) % 7;
      return { start: today - sinceMonday * DAY_MS, end: today + DAY_MS };
    }
    case 'last_7_days':
      return { start: today - 6 * DAY_MS, end: today + DAY_MS };
    case 'this_month':
      return { start: localMidnight(y, m, 1), end: localMidnight(y, m + 1, 1) };
    case 'last_month':
      return { start: localMidnight(y, m - 1, 1), end: localMidnight(y, m, 1) };
    case 'this_year':
      return { start: localMidnight(y, 0, 1), end: localMidnight(y + 1, 0, 1) };
    case 'day': {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(state.dateValue);
      if (!match) return null;
      const start = localMidnight(+match[1], +match[2] - 1, +match[3]);
      return { start, end: start + DAY_MS };
    }
    case 'month': {
      const match = /^(\d{4})-(\d{2})$/.exec(state.dateValue);
      if (!match) return null;
      return { start: localMidnight(+match[1], +match[2] - 1, 1), end: localMidnight(+match[1], +match[2], 1) };
    }
    case 'year': {
      const match = /^(\d{4})$/.exec(state.dateValue);
      if (!match) return null;
      return { start: localMidnight(+match[1], 0, 1), end: localMidnight(+match[1] + 1, 0, 1) };
    }
    case 'range': {
      const from = /^(\d{4})-(\d{2})-(\d{2})$/.exec(state.rangeFrom);
      const to = /^(\d{4})-(\d{2})-(\d{2})$/.exec(state.rangeTo);
      if (!from && !to) return null;
      return {
        start: from ? localMidnight(+from[1], +from[2] - 1, +from[3]) : -Infinity,
        end: to ? localMidnight(+to[1], +to[2] - 1, +to[3]) + DAY_MS : Infinity,
      };
    }
    default:
      return null;
  }
}

const INQUIRY_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  sent_to_admin: 'Sent to admin',
  calculated_by_admin: 'Calculated',
  approved: 'Approved',
  rejected: 'Rejected',
};

export const inquiryStatusLabel = (status: string) => INQUIRY_STATUS_LABELS[status] ?? status;

/** Stage flags are not always set ("Won" without is_won), so the name counts too. */
export const isWonStage = (stage: Pick<CrmPipelineStage, 'name' | 'is_won'> | undefined) =>
  Boolean(stage && (stage.is_won || /^won$/i.test(stage.name.trim())));
export const isLostStage = (stage: Pick<CrmPipelineStage, 'name' | 'is_lost'> | undefined) =>
  Boolean(stage && (stage.is_lost || /^lost$/i.test(stage.name.trim())));

function dateWords(iso: string | null | undefined) {
  if (!iso) return '';
  const local = new Date(Date.parse(iso) + OFFSET_MS);
  if (Number.isNaN(local.getTime())) return '';
  const isoDay = local.toISOString().slice(0, 10);
  const long = local.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const short = local.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${isoDay} ${long} ${short}`;
}

/** Everything an opportunity can be found by, lower-cased into one string. */
export function searchableText(opp: CrmOpportunityCard): string {
  const inquiries = opp.inquiries ?? [];
  return [
    opp.id,
    opp.name,
    opp.customer_name,
    opp.customer_lead_id,
    opp.contact_person_name,
    opp.email,
    opp.phone,
    opp.mobile,
    opp.website,
    opp.salesperson_name,
    opp.sales_team,
    opp.organization_name,
    opp.stage_name,
    opp.priority,
    opp.source,
    opp.campaign,
    opp.medium,
    opp.lost_reason,
    opp.lead_inquiry_id,
    String(opp.expected_revenue ?? ''),
    Number(opp.expected_revenue || 0).toLocaleString('en-US'),
    ...(opp.tags ?? []),
    ...inquiries.flatMap((inq) => [inq.id, inq.status, inquiryStatusLabel(inq.status)]),
    dateWords(opp.created_at),
    dateWords(opp.updated_at),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Every word must appear somewhere in the record ("john approved"). */
export function matchesSearch(opp: CrmOpportunityCard, search: string) {
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = searchableText(opp);
  return terms.every((term) => text.includes(term));
}

const toNumber = (value: string) => {
  const n = Number(value.replace(/,/g, '').trim());
  return value.trim() !== '' && Number.isFinite(n) ? n : null;
};

export function applyPipelineFilters(
  opportunities: CrmOpportunityCard[],
  stages: CrmPipelineStage[],
  state: PipelineFilterState,
  options: { isGlobalAdminView: boolean; now?: number }
): CrmOpportunityCard[] {
  const range = resolveDateRange(state, options.now);
  const stage = state.stage === 'all' ? undefined : stages.find((s) => s.id === state.stage);
  const min = toNumber(state.minValue);
  const max = toNumber(state.maxValue);
  const tag = state.tag === 'all' ? null : state.tag.toLowerCase();

  // Only deals that sit in one of the board's stages, so counts match the columns.
  const boardStage = (opp: CrmOpportunityCard) =>
    options.isGlobalAdminView ? stages.some((s) => s.name === opp.stage_name) : stages.some((s) => s.id === opp.stage_id);

  return opportunities.filter((opp) => {
    if (!boardStage(opp)) return false;
    if (range) {
      const created = Date.parse(opp.created_at);
      if (!(created >= range.start && created < range.end)) return false;
    }
    if (stage) {
      // The Admin view's stages are shared names across organizations.
      const sameStage = options.isGlobalAdminView ? opp.stage_name === stage.name : opp.stage_id === stage.id;
      if (!sameStage) return false;
    }
    if (state.assignee !== 'all') {
      if (state.assignee === 'unassigned' ? opp.salesperson_id : opp.salesperson_id !== state.assignee) return false;
    }
    const value = Number(opp.expected_revenue || 0);
    if (min !== null && value < min) return false;
    if (max !== null && value > max) return false;
    if (tag && !(opp.tags ?? []).some((t) => t.toLowerCase() === tag)) return false;
    return matchesSearch(opp, state.search);
  });
}

export type PipelineSummary = {
  contacts: number;
  inquiriesSent: number;
  approved: number;
  rejected: number;
  won: number;
  lost: number;
};

export function summarizePipeline(
  opportunities: CrmOpportunityCard[],
  stages: CrmPipelineStage[],
  isGlobalAdminView: boolean
): PipelineSummary {
  const stageOf = (opp: CrmOpportunityCard) =>
    isGlobalAdminView ? stages.find((s) => s.name === opp.stage_name) : stages.find((s) => s.id === opp.stage_id);
  const contacts = new Set<string>();
  const summary: PipelineSummary = { contacts: 0, inquiriesSent: 0, approved: 0, rejected: 0, won: 0, lost: 0 };

  for (const opp of opportunities) {
    if (opp.contact_id) contacts.add(opp.contact_id);
    const stage = stageOf(opp);
    if (isWonStage(stage)) summary.won++;
    else if (isLostStage(stage)) summary.lost++;
    for (const inquiry of opp.inquiries ?? []) {
      if (inquiry.status !== 'draft') summary.inquiriesSent++;
      if (inquiry.status === 'approved') summary.approved++;
      if (inquiry.status === 'rejected') summary.rejected++;
    }
  }
  summary.contacts = contacts.size;
  return summary;
}

export function countActiveFilters(state: PipelineFilterState) {
  return (
    Number(state.datePreset !== 'all') +
    Number(state.search.trim() !== '') +
    Number(state.stage !== 'all') +
    Number(state.assignee !== 'all') +
    Number(state.minValue.trim() !== '' || state.maxValue.trim() !== '') +
    Number(state.tag !== 'all')
  );
}
