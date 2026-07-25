'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { requireSuperAdmin, isAccessDenied } from '@/lib/auth/require-access';

export type LegacyLeadMigrationResult = {
  created_count: number;
  merged_count: number;
  skipped_count: number;
  error_count: number;
  detail: string;
};

export type LegacyLeadMigrationStats = {
  total_leads: number;
  migrated_leads: number;
  pending_leads: number;
  contacts_created: number;
  contacts_merged: number;
  contacts_with_legacy_lead: number;
};

/**
 * Run (or re-run) the idempotent legacy Leads → Contacts migration.
 * Super Admin only. Safe to call multiple times — already-migrated leads are skipped.
 */
export async function runLegacyLeadsToContactsMigration(): Promise<
  | { result: LegacyLeadMigrationResult }
  | { error: string }
> {
  const auth = await requireSuperAdmin();
  if (isAccessDenied(auth)) return { error: auth.error };

  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc('migrate_legacy_leads_to_contacts');

  if (error) {
    return {
      error:
        error.message.includes('migrate_legacy_leads_to_contacts')
          ? 'Migration function missing. Run supabase/migrations/migrate_legacy_leads_to_contacts.sql in the SQL Editor first.'
          : error.message,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    return { error: 'Migration returned no result.' };
  }

  const r = row as Record<string, unknown>;
  return {
    result: {
      created_count: Number(r.created_count) || 0,
      merged_count: Number(r.merged_count) || 0,
      skipped_count: Number(r.skipped_count) || 0,
      error_count: Number(r.error_count) || 0,
      detail: String(r.detail || 'ok'),
    },
  };
}

/** Read-only migration progress for Super Admin. */
export async function getLegacyLeadsToContactsMigrationStats(): Promise<
  | { stats: LegacyLeadMigrationStats }
  | { error: string }
> {
  const auth = await requireSuperAdmin();
  if (isAccessDenied(auth)) return { error: auth.error };

  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc(
    'legacy_leads_to_contacts_migration_stats'
  );

  if (error) {
    return {
      error:
        error.message.includes('legacy_leads_to_contacts_migration_stats')
          ? 'Migration stats function missing. Run migrate_legacy_leads_to_contacts.sql first.'
          : error.message,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    return { error: 'No stats returned.' };
  }

  const r = row as Record<string, unknown>;
  return {
    stats: {
      total_leads: Number(r.total_leads) || 0,
      migrated_leads: Number(r.migrated_leads) || 0,
      pending_leads: Number(r.pending_leads) || 0,
      contacts_created: Number(r.contacts_created) || 0,
      contacts_merged: Number(r.contacts_merged) || 0,
      contacts_with_legacy_lead: Number(r.contacts_with_legacy_lead) || 0,
    },
  };
}
