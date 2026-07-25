/**
 * Client-side memoization for CRM shared lookups.
 * Prevents duplicate getSalespersonOptions / getCrmPipelineStages calls
 * when multiple CRM views mount in the same session.
 *
 * Cache scopes:
 * - Pipeline stages (invalidated on stage CRUD + org switch)
 * - Salesperson options (invalidated on org switch)
 * - UI prefs: sort, activity section (sessionStorage)
 * Favorites live in CrmFavorites (localStorage) with hydrate-safe reads.
 */

import { getCrmPipelineStages } from '@/app/actions/crm/stages';
import { getSalespersonOptions, type SalespersonOption } from '@/app/actions/contacts';
import type { CrmPipelineStage } from '@/app/actions/crm/types';

type StagesResult = Awaited<ReturnType<typeof getCrmPipelineStages>>;
type SalesResult = Awaited<ReturnType<typeof getSalespersonOptions>>;

let stagesPromise: Promise<StagesResult> | null = null;
let salesPromise: Promise<SalesResult> | null = null;
let stagesCache: CrmPipelineStage[] | null = null;
let salesCache: SalespersonOption[] | null = null;

export function invalidateCrmClientCache(part?: 'stages' | 'salespersons' | 'all') {
  if (!part || part === 'all' || part === 'stages') {
    stagesPromise = null;
    stagesCache = null;
  }
  if (!part || part === 'all' || part === 'salespersons') {
    salesPromise = null;
    salesCache = null;
  }
}

export async function getCachedCrmPipelineStages(): Promise<StagesResult> {
  if (stagesCache) return { stages: stagesCache };
  if (!stagesPromise) {
    stagesPromise = getCrmPipelineStages().then((res) => {
      if ('stages' in res && res.stages) stagesCache = res.stages;
      else stagesPromise = null;
      return res;
    });
  }
  return stagesPromise;
}

export async function getCachedSalespersonOptions(): Promise<SalesResult> {
  if (salesCache) return { salespersons: salesCache };
  if (!salesPromise) {
    salesPromise = getSalespersonOptions().then((res) => {
      if ('salespersons' in res && res.salespersons) salesCache = res.salespersons;
      else salesPromise = null;
      return res;
    });
  }
  return salesPromise;
}

/** Persist CRM UI preferences (filters) in sessionStorage. */
const PREFS_KEY = 'crm_ui_prefs_v1';

export type CrmUiPrefs = {
  pipelineSortBy?: 'created_at' | 'expected_revenue';
  pipelineSortDir?: 'asc' | 'desc';
  activitiesSection?: string;
};

export function loadCrmUiPrefs(): CrmUiPrefs {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CrmUiPrefs;
  } catch {
    return {};
  }
}

export function saveCrmUiPrefs(patch: Partial<CrmUiPrefs>) {
  if (typeof window === 'undefined') return;
  try {
    const next = { ...loadCrmUiPrefs(), ...patch };
    sessionStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
}
