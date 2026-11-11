import test from 'node:test';
import assert from 'node:assert/strict';
import type { CrmOpportunityCard, CrmPipelineStage } from '@/app/actions/crm/types';
import {
  EMPTY_PIPELINE_FILTERS,
  applyPipelineFilters,
  countActiveFilters,
  matchesSearch,
  resolveDateRange,
  summarizePipeline,
  type PipelineFilterState,
} from './crm-pipeline-filter';

// Wednesday 12 Nov 2026, 10:00 in Pakistan (05:00 UTC).
const NOW = Date.parse('2026-11-12T05:00:00Z');
const filters = (overrides: Partial<PipelineFilterState>): PipelineFilterState => ({ ...EMPTY_PIPELINE_FILTERS, ...overrides });
const iso = (ms: number) => new Date(ms).toISOString();

const stage = (id: string, name: string, flags: Partial<CrmPipelineStage> = {}): CrmPipelineStage =>
  ({ id, name, organization_id: 'o', sequence: 0, is_won: false, is_lost: false, is_folded: false, default_probability: 10, created_at: '', updated_at: '', ...flags }) as CrmPipelineStage;

const STAGES = [stage('s-new', 'New'), stage('s-won', 'Won'), stage('s-lost', 'Lost', { is_lost: true })];

const opp = (overrides: Partial<CrmOpportunityCard>): CrmOpportunityCard =>
  ({
    id: 'opp-1',
    organization_id: 'o',
    stage_id: 's-new',
    stage_name: 'New',
    name: 'Deal',
    contact_id: 'c1',
    expected_revenue: 0,
    tags: [],
    salesperson_id: null,
    created_at: '2026-11-12T04:00:00Z',
    updated_at: '2026-11-12T04:00:00Z',
    inquiries: [],
    ...overrides,
  }) as CrmOpportunityCard;

test('date presets use Pakistan days', () => {
  const today = resolveDateRange(filters({ datePreset: 'today' }), NOW)!;
  assert.equal(iso(today.start), '2026-11-11T19:00:00.000Z', 'midnight in Pakistan');
  assert.equal(iso(today.end), '2026-11-12T19:00:00.000Z');
  const week = resolveDateRange(filters({ datePreset: 'this_week' }), NOW)!;
  assert.equal(iso(week.start), '2026-11-08T19:00:00.000Z', 'week starts Monday 9 Nov');
  const month = resolveDateRange(filters({ datePreset: 'this_month' }), NOW)!;
  assert.equal(iso(month.start), '2026-10-31T19:00:00.000Z');
  assert.equal(iso(month.end), '2026-11-30T19:00:00.000Z');
  const lastMonth = resolveDateRange(filters({ datePreset: 'last_month' }), NOW)!;
  assert.equal(iso(lastMonth.start), '2026-09-30T19:00:00.000Z');
  assert.equal(resolveDateRange(filters({ datePreset: 'all' }), NOW), null);
});

test('specific day, month, year and custom range', () => {
  const day = resolveDateRange(filters({ datePreset: 'day', dateValue: '2026-08-15' }))!;
  assert.equal(iso(day.start), '2026-08-14T19:00:00.000Z');
  const month = resolveDateRange(filters({ datePreset: 'month', dateValue: '2026-02' }))!;
  assert.equal(iso(month.end), '2026-02-28T19:00:00.000Z');
  const year = resolveDateRange(filters({ datePreset: 'year', dateValue: '2025' }))!;
  assert.equal(iso(year.start), '2024-12-31T19:00:00.000Z');
  const range = resolveDateRange(filters({ datePreset: 'range', rangeFrom: '2026-11-01', rangeTo: '2026-11-03' }))!;
  assert.equal(iso(range.end), '2026-11-03T19:00:00.000Z', 'end day included');
  assert.equal(resolveDateRange(filters({ datePreset: 'day', dateValue: '' })), null, 'incomplete input = no limit');
});

test('search: partial, case-insensitive, every word must match', () => {
  const record = opp({
    name: "John's Opportunity",
    customer_name: 'Acme Traders',
    email: 'john@acme.pk',
    phone: '0300-1234567',
    salesperson_name: 'Ayan',
    expected_revenue: 25000,
    tags: ['Priority'],
    inquiries: [{ id: 'inq-9', status: 'approved', sent_at: null }],
  });
  for (const query of ['john approved', 'ACME', '1234567', 'ayan priority', '25,000', 'inq-9', '12 nov 2026']) {
    assert.equal(matchesSearch(record, query), true, query);
  }
  assert.equal(matchesSearch(record, 'john rejected'), false);
  assert.equal(matchesSearch(record, 'zzz'), false);
});

test('filters combine: date, stage, assignee, value, tag', () => {
  const list = [
    opp({ id: 'a', expected_revenue: 100, salesperson_id: 'sp1', tags: ['VIP'] }),
    opp({ id: 'b', expected_revenue: 900, stage_id: 's-won', stage_name: 'Won' }),
    opp({ id: 'c', created_at: '2026-01-05T10:00:00Z' }),
  ];
  const ids = (state: Partial<PipelineFilterState>, global = false) =>
    applyPipelineFilters(list, STAGES, filters(state), { isGlobalAdminView: global, now: NOW }).map((o) => o.id);

  assert.deepEqual(ids({ datePreset: 'this_month' }), ['a', 'b']);
  assert.deepEqual(ids({ stage: 's-won' }), ['b']);
  assert.deepEqual(ids({ assignee: 'sp1' }), ['a']);
  assert.deepEqual(ids({ assignee: 'unassigned' }), ['b', 'c']);
  assert.deepEqual(ids({ tag: 'vip' }), ['a']);
  assert.deepEqual(ids({ stage: 's-won' }, true), ['b'], 'Admin view matches stages by name');
});

test('deals outside the board stages are not counted', () => {
  const list = [opp({ id: 'a' }), opp({ id: 'orphan', stage_id: 's-gone', stage_name: 'Gone' })];
  const ids = applyPipelineFilters(list, STAGES, EMPTY_PIPELINE_FILTERS, { isGlobalAdminView: false }).map((o) => o.id);
  assert.deepEqual(ids, ['a']);
});

test('summary counts the six numbers from the filtered list', () => {
  const list = [
    opp({ id: 'a', contact_id: 'c1', inquiries: [{ id: '1', status: 'approved', sent_at: 'x' }, { id: '2', status: 'draft', sent_at: null }] }),
    opp({ id: 'b', contact_id: 'c1', stage_id: 's-won', stage_name: 'Won', inquiries: [{ id: '3', status: 'rejected', sent_at: 'x' }] }),
    opp({ id: 'c', contact_id: 'c2', stage_id: 's-lost', stage_name: 'Lost', inquiries: [{ id: '4', status: 'sent', sent_at: 'x' }] }),
  ];
  assert.deepEqual(summarizePipeline(list, STAGES, false), {
    contacts: 2,
    inquiriesSent: 3,
    approved: 1,
    rejected: 1,
    won: 1,
    lost: 1,
  });
});

test('active filter count drives the Reset button', () => {
  assert.equal(countActiveFilters(EMPTY_PIPELINE_FILTERS), 0);
  assert.equal(countActiveFilters(filters({ search: 'x', tag: 'VIP' })), 2);
});
