'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { requireAnyChildModule, isAccessDenied } from '@/lib/auth/require-access';
import { requireCrmOrganizationScope, revalidateCrmPipelinePaths } from '@/app/actions/crm/shared';
import { DEFAULT_CRM_PIPELINE_STAGES } from '@/lib/crm-pipeline-utils';
import type { CrmPipelineStage } from '@/app/actions/crm/types';

function mapStage(row: Record<string, unknown>): CrmPipelineStage {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    name: String(row.name || ''),
    sequence: Number(row.sequence) || 0,
    is_won: Boolean(row.is_won),
    is_lost: Boolean(row.is_lost),
    is_folded: Boolean(row.is_folded),
    default_probability: Number(row.default_probability ?? 10),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

export async function ensureDefaultCrmStages(organizationId: string) {
  const orgId = String(organizationId || '').trim();
  if (!orgId) return;

  const supabase = await createAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from('crm_pipeline_stages')
    .select('id, name')
    .eq('organization_id', orgId);

  if (existingError) {
    console.error('[ensureDefaultCrmStages] load failed', existingError.message);
    return;
  }

  const have = new Set(
    (existing || []).map((row) => String(row.name || '').trim().toLowerCase()).filter(Boolean)
  );

  // Always ensure the four core boards (+ Lost) exist for every organization.
  const missing = DEFAULT_CRM_PIPELINE_STAGES.filter(
    (stage) => !have.has(stage.name.toLowerCase())
  );
  if (missing.length === 0) return;

  const now = new Date().toISOString();
  const rowsWithProb = missing.map((stage) => ({
    ...stage,
    organization_id: orgId,
    is_folded: false,
    updated_at: now,
  }));

  const { error } = await supabase.from('crm_pipeline_stages').insert(rowsWithProb);
  if (!error) return;

  // Retry without default_probability when migration not applied yet
  if (/default_probability|column/i.test(error.message)) {
    const minimal = missing.map((stage) => ({
      name: stage.name,
      sequence: stage.sequence,
      is_won: stage.is_won,
      is_lost: stage.is_lost,
      organization_id: orgId,
      is_folded: false,
      updated_at: now,
    }));
    const retry = await supabase.from('crm_pipeline_stages').insert(minimal);
    if (retry.error) {
      console.error('[ensureDefaultCrmStages] insert failed', retry.error.message);
    }
    return;
  }

  console.error('[ensureDefaultCrmStages] insert failed', error.message);
}

export type CrmResolvedPipelineStage = {
  id: string;
  name: string;
  is_won: boolean;
  is_lost: boolean;
  default_probability?: number;
};

/**
 * Resolve a pipeline stage within an organization (create / move).
 * Handles virtual admin ids, cross-org stale ids, and name hints.
 */
export async function resolveCrmPipelineStageForOrg(
  organizationId: string,
  options?: { stageId?: string | null; stageNameHint?: string | null }
): Promise<CrmResolvedPipelineStage | null> {
  const orgId = String(organizationId || '').trim();
  if (!orgId) return null;

  await ensureDefaultCrmStages(orgId);

  const supabase = await createAdminClient();
  const stageId = String(options?.stageId || '').trim();
  const stageNameHint = String(options?.stageNameHint || '').trim();
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const { parseAdminVirtualStageName } = await import('@/lib/crm-pipeline-utils');

  async function fetchStageByName(name: string): Promise<CrmResolvedPipelineStage | null> {
    const trimmed = String(name || '').trim();
    if (!trimmed) return null;

    const withProb = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, is_won, is_lost, default_probability')
      .eq('organization_id', orgId)
      .eq('name', trimmed)
      .order('sequence', { ascending: true })
      .limit(1);

    let row = withProb.data?.[0] as Record<string, unknown> | undefined;
    if (withProb.error && /default_probability|column/i.test(withProb.error.message)) {
      const withoutProb = await supabase
        .from('crm_pipeline_stages')
        .select('id, name, is_won, is_lost')
        .eq('organization_id', orgId)
        .eq('name', trimmed)
        .order('sequence', { ascending: true })
        .limit(1);
      row = withoutProb.data?.[0] as Record<string, unknown> | undefined;
    }

    if (!row) return null;
    return {
      id: String(row.id),
      name: String(row.name),
      is_won: Boolean(row.is_won),
      is_lost: Boolean(row.is_lost),
      default_probability:
        row.default_probability != null ? Number(row.default_probability) : undefined,
    };
  }

  async function fetchStageById(id: string): Promise<CrmResolvedPipelineStage | null> {
    const withProb = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, is_won, is_lost, default_probability')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle();

    let row = withProb.data as Record<string, unknown> | null;
    if (withProb.error && /default_probability|column/i.test(withProb.error.message)) {
      const withoutProb = await supabase
        .from('crm_pipeline_stages')
        .select('id, name, is_won, is_lost')
        .eq('id', id)
        .eq('organization_id', orgId)
        .maybeSingle();
      row = withoutProb.data as Record<string, unknown> | null;
    }

    if (!row) {
      const anyOrg = await supabase
        .from('crm_pipeline_stages')
        .select('id, name')
        .eq('id', id)
        .maybeSingle();
      if (anyOrg.data?.name) {
        return fetchStageByName(String(anyOrg.data.name));
      }
      return null;
    }

    return {
      id: String(row.id),
      name: String(row.name),
      is_won: Boolean(row.is_won),
      is_lost: Boolean(row.is_lost),
      default_probability:
        row.default_probability != null ? Number(row.default_probability) : undefined,
    };
  }

  const virtualName = stageId ? parseAdminVirtualStageName(stageId) : null;
  let resolved: CrmResolvedPipelineStage | null = null;

  if (virtualName) {
    resolved = await fetchStageByName(virtualName);
  } else if (stageId && uuidRe.test(stageId)) {
    resolved = await fetchStageById(stageId);
  } else if (stageId) {
    resolved = await fetchStageByName(stageId);
  }

  if (!resolved && stageNameHint) {
    resolved = await fetchStageByName(stageNameHint);
  }

  if (!resolved) {
    const retryName =
      virtualName ||
      stageNameHint ||
      (stageId && !uuidRe.test(stageId) ? stageId : '');
    if (retryName) resolved = await fetchStageByName(retryName);
  }

  if (!resolved) {
    resolved = await fetchStageByName('New');
  }

  if (!resolved) {
    const { data: firstRow } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, is_won, is_lost, default_probability')
      .eq('organization_id', orgId)
      .order('sequence', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (firstRow) {
      resolved = {
        id: String(firstRow.id),
        name: String(firstRow.name),
        is_won: Boolean(firstRow.is_won),
        is_lost: Boolean(firstRow.is_lost),
        default_probability:
          firstRow.default_probability != null
            ? Number(firstRow.default_probability)
            : undefined,
      };
    }
  }

  return resolved;
}

export async function getCrmPipelineStages() {
  const auth = await requireAnyChildModule(['crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await requireCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  await ensureDefaultCrmStages(scope.organizationId);

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('crm_pipeline_stages')
    .select('*')
    .eq('organization_id', scope.organizationId)
    .order('sequence', { ascending: true });

  if (error) return { error: error.message };
  return { stages: (data || []).map(mapStage) };
}

export async function createCrmPipelineStage(input: {
  name: string;
  sequence?: number;
  is_won?: boolean;
  is_lost?: boolean;
}) {
  const auth = await requireAnyChildModule(['crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await requireCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const name = String(input.name || '').trim();
  if (!name) return { error: 'Stage name is required.' };

  const supabase = await createAdminClient();

  let sequence = Number(input.sequence);
  if (!Number.isFinite(sequence)) {
    const { data: maxRow } = await supabase
      .from('crm_pipeline_stages')
      .select('sequence')
      .eq('organization_id', scope.organizationId)
      .order('sequence', { ascending: false })
      .limit(1)
      .maybeSingle();
    sequence = (Number(maxRow?.sequence) || 0) + 10;
  }

  const { data, error } = await supabase
    .from('crm_pipeline_stages')
    .insert({
      organization_id: scope.organizationId,
      name,
      sequence,
      is_won: Boolean(input.is_won),
      is_lost: Boolean(input.is_lost),
      is_folded: false,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error || !data) return { error: error?.message || 'Failed to create stage.' };
  await revalidateCrmPipelinePaths();
  return { stage: mapStage(data as Record<string, unknown>) };
}

export async function updateCrmPipelineStage(
  stageId: string,
  input: {
    name?: string;
    sequence?: number;
    is_won?: boolean;
    is_lost?: boolean;
    is_folded?: boolean;
  }
) {
  const auth = await requireAnyChildModule(['crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await requireCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const supabase = await createAdminClient();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) payload.name = String(input.name).trim();
  if (input.sequence !== undefined) payload.sequence = Number(input.sequence);
  if (input.is_won !== undefined) payload.is_won = Boolean(input.is_won);
  if (input.is_lost !== undefined) payload.is_lost = Boolean(input.is_lost);
  if (input.is_folded !== undefined) payload.is_folded = Boolean(input.is_folded);

  const { data, error } = await supabase
    .from('crm_pipeline_stages')
    .update(payload)
    .eq('id', stageId)
    .eq('organization_id', scope.organizationId)
    .select('*')
    .single();

  if (error || !data) return { error: error?.message || 'Failed to update stage.' };
  await revalidateCrmPipelinePaths();
  return { stage: mapStage(data as Record<string, unknown>) };
}

export async function deleteCrmPipelineStage(stageId: string) {
  const auth = await requireAnyChildModule(['crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await requireCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const supabase = await createAdminClient();

  const { count } = await supabase
    .from('crm_opportunities')
    .select('id', { count: 'exact', head: true })
    .eq('stage_id', stageId)
    .eq('organization_id', scope.organizationId);

  if ((count || 0) > 0) {
    return { error: 'Cannot delete a stage that still has opportunities. Move them first.' };
  }

  const { error } = await supabase
    .from('crm_pipeline_stages')
    .delete()
    .eq('id', stageId)
    .eq('organization_id', scope.organizationId);

  if (error) return { error: error.message };
  await revalidateCrmPipelinePaths();
  return { success: true as const };
}

export async function reorderCrmPipelineStages(orderedStageIds: string[]) {
  const auth = await requireAnyChildModule(['crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await requireCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const supabase = await createAdminClient();
  const now = new Date().toISOString();

  for (let i = 0; i < orderedStageIds.length; i++) {
    const id = orderedStageIds[i];
    const { error } = await supabase
      .from('crm_pipeline_stages')
      .update({ sequence: (i + 1) * 10, updated_at: now })
      .eq('id', id)
      .eq('organization_id', scope.organizationId);
    if (error) return { error: error.message };
  }

  await revalidateCrmPipelinePaths();
  return { success: true as const };
}

export async function toggleCrmPipelineStageFold(stageId: string, folded: boolean) {
  return updateCrmPipelineStage(stageId, { is_folded: folded });
}
