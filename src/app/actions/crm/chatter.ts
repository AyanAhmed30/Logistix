'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/utils/supabase/server';
import { requireAnyChildModule, isAccessDenied } from '@/lib/auth/require-access';
import {
  resolveCrmOrganizationScope,
  requireCrmOrganizationScope,
} from '@/app/actions/crm/shared';
import { uploadToInquiryImagesBucket } from '@/lib/inquiry-storage';
import type { CrmChatterEntry, CrmChatterEntryType } from '@/app/actions/crm/types';

const PAGE_SIZE = 40;

function mapEntry(row: Record<string, unknown>): CrmChatterEntry {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    opportunity_id: String(row.opportunity_id),
    entry_type: String(row.entry_type) as CrmChatterEntryType,
    body: String(row.body || ''),
    performed_by: String(row.performed_by || ''),
    parent_id: row.parent_id ? String(row.parent_id) : null,
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    created_at: String(row.created_at || ''),
  };
}

function extractMentions(body: string): string[] {
  const matches = body.match(/@([a-zA-Z0-9._-]+)/g) || [];
  return [...new Set(matches.map((m) => m.slice(1)))];
}

async function assertOpportunityAccess(opportunityId: string) {
  const scope = await resolveCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const supabase = await createAdminClient();
  let query = supabase
    .from('crm_opportunities')
    .select('id, organization_id, name')
    .eq('id', opportunityId);

  if (!scope.isGlobalAdminView) {
    query = query.eq('organization_id', scope.organizationId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'Opportunity not found.' };

  return {
    opportunity: data,
    organizationId: String(data.organization_id),
    session: scope.session,
    isGlobalAdminView: scope.isGlobalAdminView,
  };
}

export async function getOpportunityChatter(
  opportunityId: string,
  options?: { limit?: number; before?: string }
) {
  const auth = await requireAnyChildModule(['crm-pipeline', 'crm-activities']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const access = await assertOpportunityAccess(opportunityId);
  if ('error' in access) return { error: access.error };

  const limit = Math.min(options?.limit || PAGE_SIZE, 100);
  const supabase = await createAdminClient();

  let query = supabase
    .from('crm_opportunity_chatter')
    .select('*')
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!access.isGlobalAdminView) {
    query = query.eq('organization_id', access.organizationId);
  }
  if (options?.before) {
    query = query.lt('created_at', options.before);
  }

  const { data, error } = await query;
  if (error) return { error: error.message };

  const entries = (data || []).map((row) => mapEntry(row as Record<string, unknown>));
  return { entries, hasMore: entries.length >= limit };
}

export async function getOpportunityFollowers(opportunityId: string) {
  const auth = await requireAnyChildModule(['crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const access = await assertOpportunityAccess(opportunityId);
  if ('error' in access) return { error: access.error };

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('crm_opportunity_followers')
    .select('username, created_at')
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: true });

  if (error) return { error: error.message };
  return {
    followers: (data || []).map((r) => ({
      username: String(r.username),
      created_at: String(r.created_at),
    })),
    isFollowing: (data || []).some((r) => r.username === access.session.username),
  };
}

export async function toggleOpportunityFollower(opportunityId: string) {
  const auth = await requireAnyChildModule(['crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await requireCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const supabase = await createAdminClient();
  const { data: opp } = await supabase
    .from('crm_opportunities')
    .select('id')
    .eq('id', opportunityId)
    .eq('organization_id', scope.organizationId)
    .maybeSingle();

  if (!opp) return { error: 'Opportunity not found.' };

  const username = scope.session.username;
  const { data: existing } = await supabase
    .from('crm_opportunity_followers')
    .select('username')
    .eq('opportunity_id', opportunityId)
    .eq('username', username)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('crm_opportunity_followers')
      .delete()
      .eq('opportunity_id', opportunityId)
      .eq('username', username);
    if (error) return { error: error.message };
    return { following: false as const };
  }

  const { error } = await supabase.from('crm_opportunity_followers').insert({
    opportunity_id: opportunityId,
    username,
  });
  if (error) return { error: error.message };
  return { following: true as const };
}

async function insertChatterEntry(input: {
  organizationId: string;
  opportunityId: string;
  entryType: CrmChatterEntryType;
  body: string;
  performedBy: string;
  parentId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = await createAdminClient();
  const mentions = extractMentions(input.body);
  const metadata = {
    ...(input.metadata || {}),
    ...(mentions.length ? { mentions } : {}),
  };

  const { data, error } = await supabase
    .from('crm_opportunity_chatter')
    .insert({
      organization_id: input.organizationId,
      opportunity_id: input.opportunityId,
      entry_type: input.entryType,
      body: input.body,
      performed_by: input.performedBy,
      parent_id: input.parentId || null,
      metadata,
    })
    .select('*')
    .single();

  if (error || !data) return { error: error?.message || 'Failed to save entry.' };
  return { entry: mapEntry(data as Record<string, unknown>) };
}

export async function postOpportunityMessage(
  opportunityId: string,
  body: string,
  parentId?: string | null
) {
  const auth = await requireAnyChildModule(['crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await requireCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const text = String(body || '').trim();
  if (!text) return { error: 'Message cannot be empty.' };

  const supabase = await createAdminClient();
  const { data: opp } = await supabase
    .from('crm_opportunities')
    .select('id')
    .eq('id', opportunityId)
    .eq('organization_id', scope.organizationId)
    .maybeSingle();
  if (!opp) return { error: 'Opportunity not found.' };

  const result = await insertChatterEntry({
    organizationId: scope.organizationId,
    opportunityId,
    entryType: parentId ? 'reply' : 'message',
    body: text,
    performedBy: scope.session.username,
    parentId,
  });

  if ('error' in result && result.error) return result;
  revalidatePath(`/crm/opportunities/${opportunityId}`);
  return result;
}

export async function postOpportunityNote(opportunityId: string, body: string) {
  const auth = await requireAnyChildModule(['crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await requireCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const text = String(body || '').trim();
  if (!text) return { error: 'Note cannot be empty.' };

  const supabase = await createAdminClient();
  const { data: opp } = await supabase
    .from('crm_opportunities')
    .select('id')
    .eq('id', opportunityId)
    .eq('organization_id', scope.organizationId)
    .maybeSingle();
  if (!opp) return { error: 'Opportunity not found.' };

  const result = await insertChatterEntry({
    organizationId: scope.organizationId,
    opportunityId,
    entryType: 'note',
    body: text,
    performedBy: scope.session.username,
  });

  if ('error' in result && result.error) return result;
  revalidatePath(`/crm/opportunities/${opportunityId}`);
  return result;
}

export async function uploadOpportunityAttachment(opportunityId: string, formData: FormData) {
  const auth = await requireAnyChildModule(['crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const scope = await requireCrmOrganizationScope();
  if ('error' in scope) return { error: scope.error };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Please select a file to upload.' };
  }

  const supabase = await createAdminClient();
  const { data: opp } = await supabase
    .from('crm_opportunities')
    .select('id')
    .eq('id', opportunityId)
    .eq('organization_id', scope.organizationId)
    .maybeSingle();
  if (!opp) return { error: 'Opportunity not found.' };

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `crm-chatter/${scope.organizationId}/${opportunityId}/${Date.now()}-${safeName}`;

  const upload = await uploadToInquiryImagesBucket(supabase, filePath, file);
  if ('error' in upload) return { error: upload.error };

  const result = await insertChatterEntry({
    organizationId: scope.organizationId,
    opportunityId,
    entryType: 'attachment',
    body: file.name,
    performedBy: scope.session.username,
    metadata: {
      file_name: file.name,
      file_size: file.size,
      content_type: file.type || 'application/octet-stream',
      url: upload.url,
      storage_path: filePath,
    },
  });

  if ('error' in result && result.error) return result;
  revalidatePath(`/crm/opportunities/${opportunityId}`);
  return result;
}

export async function logOpportunityChatterAudit(input: {
  opportunityId: string;
  organizationId: string;
  performedBy: string;
  body: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('crm_opportunity_chatter')
    .insert({
      organization_id: input.organizationId,
      opportunity_id: input.opportunityId,
      entry_type: 'audit',
      body: input.body,
      performed_by: input.performedBy,
      metadata: input.metadata || {},
    })
    .select('*')
    .single();

  if (error || !data) return { error: error?.message || 'Failed to log audit.' };
  return { entry: mapEntry(data as Record<string, unknown>) };
}

export async function logOpportunityCreatedAudit(
  opportunityId: string,
  organizationId: string,
  performedBy: string,
  name: string
) {
  return logOpportunityChatterAudit({
    opportunityId,
    organizationId,
    performedBy,
    body: `Opportunity created: ${name}`,
    metadata: { event: 'opportunity_created' },
  });
}

export async function logOpportunityStageChangedAudit(
  opportunityId: string,
  organizationId: string,
  performedBy: string,
  fromStage: string,
  toStage: string
) {
  return logOpportunityChatterAudit({
    opportunityId,
    organizationId,
    performedBy,
    body: `${fromStage} → ${toStage} (Stage)`,
    metadata: { event: 'stage_changed', from: fromStage, to: toStage },
  });
}

export async function logOpportunityCustomerChangedAudit(
  opportunityId: string,
  organizationId: string,
  performedBy: string,
  fromName: string,
  toName: string
) {
  return logOpportunityChatterAudit({
    opportunityId,
    organizationId,
    performedBy,
    body: `${fromName || '—'} → ${toName || '—'} (Customer)`,
    metadata: { event: 'customer_changed', from: fromName, to: toName },
  });
}

export async function logOpportunityUpdatedAudit(
  opportunityId: string,
  organizationId: string,
  performedBy: string,
  changes: string[]
) {
  if (changes.length === 0) return { entry: null };
  return logOpportunityChatterAudit({
    opportunityId,
    organizationId,
    performedBy,
    body: changes.join('\n'),
    metadata: { event: 'record_updated' },
  });
}
