'use server';

import { revalidatePath } from 'next/cache';
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
