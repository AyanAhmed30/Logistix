import type { CrmActivityType } from '@/app/actions/crm/types';

/** Default lost reasons seeded per organization. */
export const DEFAULT_CRM_LOST_REASONS = [
  'Price',
  'Competitor',
  'Budget',
  'No Response',
  'Other',
] as const;

/** Fallback probability by stage name when stage.default_probability is missing. */
export const STAGE_PROBABILITY_BY_NAME: Record<string, number> = {
  new: 10,
  qualified: 40,
  proposition: 70,
  proposal: 70,
  won: 100,
  lost: 0,
};

export function probabilityForStageName(
  stageName: string,
  isWon: boolean,
  isLost: boolean,
  stageDefault?: number | null
): number {
  if (typeof stageDefault === 'number' && Number.isFinite(stageDefault)) {
    return Math.min(100, Math.max(0, stageDefault));
  }
  if (isWon) return 100;
  if (isLost) return 0;
  const key = String(stageName || '')
    .trim()
    .toLowerCase();
  return STAGE_PROBABILITY_BY_NAME[key] ?? 10;
}

/**
 * Simple lead score 0–100 from probability, revenue, stage, and activity completion.
 */
export function computeLeadScore(input: {
  probability: number;
  expectedRevenue: number;
  isWon: boolean;
  isLost: boolean;
  activitiesTotal?: number;
  activitiesDone?: number;
}): number {
  if (input.isWon) return 100;
  if (input.isLost) return 0;

  const probPart = Math.min(100, Math.max(0, input.probability)) * 0.45;

  // Revenue band: 0–30 pts (log-ish scale)
  const revenue = Math.max(0, input.expectedRevenue);
  let revenuePart = 0;
  if (revenue >= 1_000_000) revenuePart = 30;
  else if (revenue >= 250_000) revenuePart = 24;
  else if (revenue >= 50_000) revenuePart = 18;
  else if (revenue >= 10_000) revenuePart = 12;
  else if (revenue > 0) revenuePart = 6;

  const total = input.activitiesTotal ?? 0;
  const done = input.activitiesDone ?? 0;
  const activityPart =
    total > 0 ? Math.min(25, (done / total) * 25) : 5; // small base if no activities yet

  return Math.round(Math.min(100, Math.max(0, probPart + revenuePart + activityPart)));
}

/** Built-in stage → activity automation templates (seeded per org). */
export const DEFAULT_STAGE_ACTIVITY_RULES: Array<{
  stageName: string;
  activity_type: CrmActivityType;
  summary_template: string;
  due_in_days: number;
}> = [
  {
    stageName: 'Qualified',
    activity_type: 'follow-up',
    summary_template: 'Follow up after qualification',
    due_in_days: 2,
  },
  {
    stageName: 'Proposition',
    activity_type: 'call',
    summary_template: 'Call to discuss proposal',
    due_in_days: 1,
  },
];

/** Auto-assignment modes — round-robin reserved for later. */
export type CrmAutoAssignMode = 'manual' | 'round_robin_coming_soon';

export const CRM_AUTO_ASSIGN_MODES: Array<{
  value: CrmAutoAssignMode;
  label: string;
  enabled: boolean;
}> = [
  { value: 'manual', label: 'Manual assignment', enabled: true },
  {
    value: 'round_robin_coming_soon',
    label: 'Round-robin (Coming Soon)',
    enabled: false,
  },
];
