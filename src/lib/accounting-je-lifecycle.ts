/**
 * Shared journal-entry lifecycle helpers for document cancel/reset.
 * Ensures posted GL entries are cancelled when source documents reverse.
 */

import type { createAdminClient } from '@/utils/supabase/server';

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>;

export async function cancelLinkedAccountingJournalEntry(
  supabase: AdminClient,
  opts: {
    journalEntryId?: string | null;
    sourceType: string;
    sourceId: string;
    organizationId?: string | null;
    performedBy: string;
    reason: string;
  }
): Promise<{ cancelledId: string | null }> {
  let targetId = opts.journalEntryId ? String(opts.journalEntryId) : null;

  if (targetId) {
    const { data: je } = await supabase
      .from('accounting_journal_entries')
      .select('id, status')
      .eq('id', targetId)
      .maybeSingle();
    if (!je || String(je.status) === 'cancelled') {
      targetId = null;
    }
  }

  if (!targetId) {
    const { data: bySource } = await supabase
      .from('accounting_journal_entries')
      .select('id, status')
      .eq('source_type', opts.sourceType)
      .eq('source_id', opts.sourceId)
      .neq('status', 'cancelled')
      .maybeSingle();
    targetId = bySource?.id ? String(bySource.id) : null;
  }

  if (!targetId) return { cancelledId: null };

  const { data: before } = await supabase
    .from('accounting_journal_entries')
    .select('status')
    .eq('id', targetId)
    .maybeSingle();

  await supabase
    .from('accounting_journal_entries')
    .update({
      status: 'cancelled',
      updated_by: opts.performedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetId);

  try {
    await supabase.from('accounting_journal_entry_logs').insert([
      {
        journal_entry_id: targetId,
        organization_id: opts.organizationId || null,
        action: 'cancelled',
        performed_by: opts.performedBy,
        previous_status: before?.status ? String(before.status) : null,
        new_status: 'cancelled',
        details: { reason: opts.reason, source_id: opts.sourceId },
      },
    ]);
  } catch {
    /* best-effort audit */
  }

  return { cancelledId: targetId };
}

/** Roll a document back to draft when automatic JE posting fails. */
export async function rollbackDocumentPostToDraft(
  supabase: AdminClient,
  table:
    | 'accounting_customer_invoices'
    | 'accounting_vendor_bills'
    | 'accounting_credit_notes',
  id: string,
  performedBy: string
) {
  const patch: Record<string, unknown> = {
    status: 'draft',
    posted_at: null,
    journal_entry_id: null,
    updated_by: performedBy,
    updated_at: new Date().toISOString(),
  };
  await supabase.from(table).update(patch).eq('id', id);
}
