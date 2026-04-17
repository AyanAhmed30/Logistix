'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/utils/supabase/server';
import type { ChartOfAccountType } from '@/app/actions/chart_of_accounts';
import type { JournalType } from '@/app/actions/journals';
import {
  assertDraftForPosting,
  assertMutableEntry,
  buildReversalLines,
  validateJournalEntry as validateJournalEntryCore,
} from '@/lib/accounting/journalEngine';

export type JournalEntryStatus = 'draft' | 'posted' | 'reversed';

export type JournalEntryLineInput = {
  id?: string;
  account_id: string;
  partner_reference?: string | null;
  description?: string;
  debit_amount: number;
  credit_amount: number;
};

export type JournalEntryLine = {
  id: string;
  journal_entry_id: string;
  line_order: number;
  account_id: string;
  account_code: string | null;
  account_name: string | null;
  account_type: ChartOfAccountType | null;
  partner_reference: string | null;
  description: string;
  debit_amount: number;
  credit_amount: number;
  created_at: string;
  updated_at: string;
};

export type JournalEntry = {
  id: string;
  reference: string;
  entry_date: string;
  journal_id: string;
  journal_name: string | null;
  journal_code: string | null;
  journal_type: JournalType | null;
  status: JournalEntryStatus;
  total_debit: number;
  total_credit: number;
  created_at: string;
  updated_at: string;
  lines: JournalEntryLine[];
};

type JournalEntryRow = {
  id: string;
  reference: string;
  entry_date: string;
  journal_id: string;
  status: JournalEntryStatus;
  total_debit: number | string;
  total_credit: number | string;
  created_at: string;
  updated_at: string;
};

type JournalEntryLineRow = {
  id: string;
  journal_entry_id: string;
  line_order: number;
  account_id: string;
  partner_reference: string | null;
  description: string;
  debit_amount: number | string;
  credit_amount: number | string;
  created_at: string;
  updated_at: string;
};

type JournalLookup = {
  id: string;
  name: string;
  code: string;
  type: JournalType;
  is_active: boolean;
};

type AccountLookup = {
  id: string;
  name: string;
  code: string;
  type: ChartOfAccountType;
  is_active: boolean;
  allow_reconciliation: boolean;
};

type PartnerLookup = {
  id: string;
  name: string;
  partner_type: 'customer' | 'vendor' | 'agent' | 'both';
  status: 'active' | 'inactive';
};

type NormalizedLine = {
  account_id: string;
  partner_reference: string | null;
  description: string;
  debit_amount: number;
  credit_amount: number;
  line_order: number;
};

type UpsertJournalEntryInput = {
  id?: string;
  reference: string;
  entry_date: string;
  journal_id: string;
  lines: JournalEntryLineInput[];
};

function ensureAdmin(session: { role: string } | null) {
  if (!session || session.role !== 'admin') {
    throw new Error('Unauthorized');
  }
}

function revalidateAccountingPaths() {
  revalidatePath('/admin/dashboard');
}

function toAmount(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundAmount(value: number) {
  return Math.round(value * 100) / 100;
}

function isValidDateInput(value: string) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return false;
  }
  const parsed = new Date(normalized);
  return !Number.isNaN(parsed.getTime());
}

async function getJournalEntryData(options?: { status?: JournalEntryStatus | 'all' }) {
  const supabase = await createAdminClient();
  const normalizedStatus = options?.status && options.status !== 'all' ? options.status : null;

  let entriesQuery = supabase
    .from('journal_entries')
    .select('*')
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (normalizedStatus) {
    entriesQuery = entriesQuery.eq('status', normalizedStatus);
  }

  const [{ data: entriesData, error: entriesError }, { data: journalsData, error: journalsError }, { data: accountsData, error: accountsError }] =
    await Promise.all([
      entriesQuery,
      supabase.from('journals').select('id, name, code, type, is_active').order('name', {
        ascending: true,
      }),
      supabase
        .from('chart_of_accounts')
        .select('id, name, code, type, is_active, allow_reconciliation')
        .order('code', {
          ascending: true,
        }),
    ]);

  if (entriesError) {
    throw new Error(entriesError.message);
  }
  if (journalsError) {
    throw new Error(journalsError.message);
  }
  if (accountsError) {
    throw new Error(accountsError.message);
  }

  const { data: partnersData, error: partnersError } = await supabase
    .from('partners')
    .select('id, name, partner_type, status');

  if (partnersError) {
    throw new Error(partnersError.message);
  }

  const entryIds = ((entriesData || []) as JournalEntryRow[]).map((entry) => entry.id);
  let linesData: JournalEntryLineRow[] = [];
  if (entryIds.length > 0) {
    const { data, error } = await supabase
      .from('journal_entry_lines')
      .select('*')
      .in('journal_entry_id', entryIds)
      .order('journal_entry_id', { ascending: true })
      .order('line_order', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }
    linesData = (data || []) as JournalEntryLineRow[];
  }

  return {
    supabase,
    entries: (entriesData || []) as JournalEntryRow[],
    lines: linesData,
    journals: (journalsData || []) as JournalLookup[],
    accounts: (accountsData || []) as AccountLookup[],
    partners: (partnersData || []) as PartnerLookup[],
  };
}

function formatJournalEntries(
  entries: JournalEntryRow[],
  lines: JournalEntryLineRow[],
  journals: JournalLookup[],
  accounts: AccountLookup[]
) {
  const journalById = new Map(journals.map((journal) => [journal.id, journal]));
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const linesByEntryId = new Map<string, JournalEntryLine[]>();

  for (const line of lines) {
    const account = accountById.get(line.account_id) ?? null;
    const mappedLine: JournalEntryLine = {
      id: line.id,
      journal_entry_id: line.journal_entry_id,
      line_order: line.line_order,
      account_id: line.account_id,
      account_code: account?.code ?? null,
      account_name: account?.name ?? null,
      account_type: account?.type ?? null,
      partner_reference: line.partner_reference,
      description: line.description,
      debit_amount: toAmount(line.debit_amount),
      credit_amount: toAmount(line.credit_amount),
      created_at: line.created_at,
      updated_at: line.updated_at,
    };

    const group = linesByEntryId.get(line.journal_entry_id) ?? [];
    group.push(mappedLine);
    linesByEntryId.set(line.journal_entry_id, group);
  }

  return entries.map((entry) => {
    const journal = journalById.get(entry.journal_id) ?? null;
    return {
      id: entry.id,
      reference: entry.reference,
      entry_date: entry.entry_date,
      journal_id: entry.journal_id,
      journal_name: journal?.name ?? null,
      journal_code: journal?.code ?? null,
      journal_type: journal?.type ?? null,
      status: entry.status,
      total_debit: toAmount(entry.total_debit),
      total_credit: toAmount(entry.total_credit),
      created_at: entry.created_at,
      updated_at: entry.updated_at,
      lines: linesByEntryId.get(entry.id) ?? [],
    } satisfies JournalEntry;
  });
}

function validateJournalEntryLines(
  lines: JournalEntryLineInput[],
  accounts: AccountLookup[],
  partners: PartnerLookup[]
): { lines: NormalizedLine[]; totalDebit: number; totalCredit: number } | { error: string } {
  if (!Array.isArray(lines) || lines.length < 2) {
    return { error: 'Journal entry must have at least two lines' };
  }

  const normalizedLines: NormalizedLine[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const accountId = String(line.account_id || '').trim();
    const account = accounts.find((item) => item.id === accountId) ?? null;

    if (!account) {
      return { error: `Line ${index + 1}: account must exist.` };
    }

    if (!account.is_active) {
      return { error: `Line ${index + 1}: account must be active.` };
    }

    if (account.type === 'view') {
      return { error: `Line ${index + 1}: view accounts cannot be used in journal entries.` };
    }

    const debit = roundAmount(toAmount(line.debit_amount));
    const credit = roundAmount(toAmount(line.credit_amount));

    if (debit < 0 || credit < 0) {
      return { error: 'Invalid negative values in entry' };
    }

    if (debit > 0 && credit > 0) {
      return { error: `Line ${index + 1}: debit and credit cannot both be greater than zero.` };
    }

    if (debit === 0 && credit === 0) {
      return { error: `Line ${index + 1}: either debit or credit must be greater than zero.` };
    }

    const partnerReference = String(line.partner_reference || '').trim() || null;
    const expectedPartnerType =
      account.allow_reconciliation && account.type === 'asset'
        ? 'customer'
        : account.allow_reconciliation && account.type === 'liability'
          ? 'vendor'
          : null;
    const normalizedPartnerRef = partnerReference?.toLowerCase() ?? '';
    const detectedPartnerType = normalizedPartnerRef.startsWith('customer:')
      ? 'customer'
      : normalizedPartnerRef.startsWith('vendor:')
        ? 'vendor'
        : normalizedPartnerRef.startsWith('agent:')
          ? 'agent'
          : null;

    if (expectedPartnerType && !partnerReference) {
      return {
        error: `Line ${index + 1}: ${expectedPartnerType} partner is required for ${
          expectedPartnerType === 'customer' ? 'receivable' : 'payable'
        } account ${account.code} - ${account.name}.`,
      };
    }

    if (expectedPartnerType && partnerReference) {
      if (!detectedPartnerType) {
        return {
          error: `Line ${index + 1}: partner reference must start with "${expectedPartnerType}:" for account ${account.code} - ${account.name}.`,
        };
      }

      if (detectedPartnerType !== expectedPartnerType) {
        return {
          error: `Line ${index + 1}: partner type mismatch. Account ${account.code} - ${account.name} requires ${expectedPartnerType} partner.`,
        };
      }
    }

    if (!expectedPartnerType && detectedPartnerType) {
      return {
        error: `Line ${index + 1}: ${detectedPartnerType} partner is only allowed for reconciliation receivable/payable accounts.`,
      };
    }

    if (detectedPartnerType && partnerReference) {
      const partnerName = partnerReference.split(':').slice(1).join(':').trim();
      if (!partnerName) {
        return {
          error: `Line ${index + 1}: partner reference must include name after "${detectedPartnerType}:".`,
        };
      }

      const matchingPartner = partners.find((partner) => {
        if (partner.status !== 'active') return false;
        const typeMatches =
          detectedPartnerType === 'customer'
            ? partner.partner_type === 'customer' || partner.partner_type === 'both'
            : detectedPartnerType === 'vendor'
              ? partner.partner_type === 'vendor' || partner.partner_type === 'both'
              : partner.partner_type === 'agent';
        return typeMatches && partner.name.toLowerCase() === partnerName.toLowerCase();
      });

      if (!matchingPartner) {
        return {
          error: `Line ${index + 1}: active ${detectedPartnerType} partner "${partnerName}" was not found.`,
        };
      }
    }

    normalizedLines.push({
      account_id: accountId,
      partner_reference: partnerReference,
      description: String(line.description || '').trim(),
      debit_amount: debit,
      credit_amount: credit,
      line_order: index + 1,
    });

    totalDebit += debit;
    totalCredit += credit;
  }

  totalDebit = roundAmount(totalDebit);
  totalCredit = roundAmount(totalCredit);

  if (totalDebit <= 0 || totalCredit <= 0) {
    return { error: 'Entry must contain both debit and credit lines' };
  }

  if (totalDebit !== totalCredit) {
    return { error: 'Total debit and credit must be equal' };
  }

  return {
    lines: normalizedLines,
    totalDebit,
    totalCredit,
  };
}

function validateJournalEntryInput(
  input: UpsertJournalEntryInput,
  journals: JournalLookup[],
  accounts: AccountLookup[],
  partners: PartnerLookup[]
):
  | {
      values: {
        reference: string;
        entry_date: string;
        journal_id: string;
        total_debit: number;
        total_credit: number;
      };
      lines: NormalizedLine[];
    }
  | { error: string } {
  const reference = String(input.reference || '').trim();
  const entryDate = String(input.entry_date || '').trim();
  const journalId = String(input.journal_id || '').trim();

  if (!reference) {
    return { error: 'Reference is required.' };
  }

  if (!isValidDateInput(entryDate)) {
    return { error: 'Entry date must be valid.' };
  }

  const journal = journals.find((item) => item.id === journalId) ?? null;
  if (!journal) {
    return { error: 'Journal must exist.' };
  }

  if (!journal.is_active) {
    return { error: 'Journal must be active.' };
  }

  const linesValidation = validateJournalEntryLines(input.lines, accounts, partners);
  if ('error' in linesValidation) {
    return linesValidation;
  }

  return {
    values: {
      reference,
      entry_date: entryDate,
      journal_id: journalId,
      total_debit: linesValidation.totalDebit,
      total_credit: linesValidation.totalCredit,
    },
    lines: linesValidation.lines,
  };
}

async function replaceJournalEntryLines(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  entryId: string,
  lines: NormalizedLine[]
) {
  const { error: deleteError } = await supabase
    .from('journal_entry_lines')
    .delete()
    .eq('journal_entry_id', entryId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const payload = lines.map((line) => ({
    journal_entry_id: entryId,
    line_order: line.line_order,
    account_id: line.account_id,
    partner_reference: line.partner_reference,
    description: line.description,
    debit_amount: line.debit_amount,
    credit_amount: line.credit_amount,
    updated_at: new Date().toISOString(),
  }));

  const { error: insertError } = await supabase.from('journal_entry_lines').insert(payload);
  if (insertError) {
    throw new Error(insertError.message);
  }
}

export async function getJournalEntries(status?: JournalEntryStatus | 'all') {
  try {
    const session = await getSession();
    ensureAdmin(session);

    const { entries, lines, journals, accounts } = await getJournalEntryData({
      status: status || 'all',
    });

    return {
      entries: formatJournalEntries(entries, lines, journals, accounts),
      journals,
      accounts,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    };
  }
}

export async function createJournalEntry(input: UpsertJournalEntryInput) {
  try {
    const session = await getSession();
    ensureAdmin(session);

    const { supabase, journals, accounts, partners } = await getJournalEntryData();
    const validation = validateJournalEntryInput(input, journals, accounts, partners);
    if ('error' in validation) {
      return validation;
    }

    const { data, error } = await supabase
      .from('journal_entries')
      .insert([
        {
          ...validation.values,
          status: 'draft',
          updated_at: new Date().toISOString(),
        },
      ])
      .select('*')
      .single();

    if (error || !data) {
      return { error: error?.message || 'Failed to create journal entry.' };
    }

    try {
      await replaceJournalEntryLines(supabase, data.id, validation.lines);
    } catch (lineErr) {
      await supabase.from('journal_entries').delete().eq('id', data.id);
      return {
        error:
          lineErr instanceof Error
            ? `Failed to create journal entry lines: ${lineErr.message}`
            : 'Failed to create journal entry lines.',
      };
    }

    revalidateAccountingPaths();
    return { entry: data as JournalEntryRow };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    };
  }
}

export async function updateJournalEntry(input: UpsertJournalEntryInput) {
  try {
    const session = await getSession();
    ensureAdmin(session);

    const entryId = String(input.id || '').trim();
    if (!entryId) {
      return { error: 'Journal entry id is required.' };
    }

    const { supabase, entries, lines, journals, accounts, partners } = await getJournalEntryData();
    const existing = entries.find((entry) => entry.id === entryId) ?? null;
    if (!existing) {
      return { error: 'Journal entry not found.' };
    }

    try {
      assertMutableEntry(existing.status);
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Posted entries cannot be modified. Use reversal.' };
    }

    const validation = validateJournalEntryInput(input, journals, accounts, partners);
    if ('error' in validation) {
      return validation;
    }

    const previousLines = lines
      .filter((line) => line.journal_entry_id === entryId)
      .map((line) => ({
        account_id: line.account_id,
        partner_reference: line.partner_reference,
        description: line.description,
        debit_amount: toAmount(line.debit_amount),
        credit_amount: toAmount(line.credit_amount),
        line_order: line.line_order,
      }));

    const { data, error } = await supabase
      .from('journal_entries')
      .update({
        ...validation.values,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .select('*')
      .single();

    if (error || !data) {
      return { error: error?.message || 'Failed to update journal entry.' };
    }

    try {
      await replaceJournalEntryLines(supabase, entryId, validation.lines);
    } catch (lineErr) {
      // Best-effort rollback to keep draft entry consistent.
      await supabase
        .from('journal_entries')
        .update({
          reference: existing.reference,
          entry_date: existing.entry_date,
          journal_id: existing.journal_id,
          total_debit: toAmount(existing.total_debit),
          total_credit: toAmount(existing.total_credit),
          status: existing.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', entryId);

      try {
        await replaceJournalEntryLines(supabase, entryId, previousLines);
      } catch {
        return {
          error:
            lineErr instanceof Error
              ? `Failed to update journal entry lines and rollback could not fully restore previous lines: ${lineErr.message}`
              : 'Failed to update journal entry lines and rollback could not fully restore previous lines.',
        };
      }

      return {
        error:
          lineErr instanceof Error
            ? `Failed to update journal entry lines: ${lineErr.message}`
            : 'Failed to update journal entry lines.',
      };
    }

    revalidateAccountingPaths();
    return { entry: data as JournalEntryRow };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    };
  }
}

export async function postJournalEntry(entryId: string) {
  try {
    const session = await getSession();
    ensureAdmin(session);

    const normalizedId = String(entryId || '').trim();
    if (!normalizedId) {
      return { error: 'Journal entry id is required.' };
    }

    const { supabase, entries, lines, journals, accounts } = await getJournalEntryData();
    const existing = entries.find((entry) => entry.id === normalizedId) ?? null;
    if (!existing) {
      return { error: 'Journal entry not found.' };
    }

    try {
      assertDraftForPosting(existing.status);
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Only draft entries can be posted' };
    }

    const mappedEntry = formatJournalEntries([existing], lines, journals, accounts)[0];
    try {
      validateJournalEntryCore({
        lines: mappedEntry.lines.map((line) => ({
          debit_amount: toAmount(line.debit_amount),
          credit_amount: toAmount(line.credit_amount),
        })),
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to validate journal entry' };
    }

    const { data: postedRows, error } = await supabase.rpc('post_journal_entry_strict', {
      p_entry_id: normalizedId,
    });

    if (error) {
      return { error: error.message || 'Failed to post journal entry.' };
    }

    const posted = Array.isArray(postedRows) ? postedRows[0] : null;
    if (!posted) {
      return { error: 'Failed to post journal entry.' };
    }

    revalidateAccountingPaths();
    return {
      entry: {
        ...existing,
        status: 'posted' as JournalEntryStatus,
        total_debit: mappedEntry.total_debit,
        total_credit: mappedEntry.total_credit,
      } as JournalEntryRow,
      posting_reference: posted.posting_reference as string | null,
      posted_at: posted.posted_at as string | null,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    };
  }
}

export async function reverseJournalEntry(entryId: string) {
  try {
    const session = await getSession();
    ensureAdmin(session);

    const normalizedId = String(entryId || '').trim();
    if (!normalizedId) {
      return { error: 'Journal entry id is required.' };
    }

    const { supabase, entries, lines, journals, accounts } = await getJournalEntryData();
    const existing = entries.find((entry) => entry.id === normalizedId) ?? null;
    if (!existing) {
      return { error: 'Journal entry not found.' };
    }

    if (existing.status !== 'posted') {
      return { error: 'Only posted entries can be reversed.' };
    }

    const mappedEntry = formatJournalEntries([existing], lines, journals, accounts)[0];
    const reversalPreview = buildReversalLines(
      mappedEntry.lines.map((line) => ({
        debit_amount: toAmount(line.debit_amount),
        credit_amount: toAmount(line.credit_amount),
      }))
    );
    try {
      validateJournalEntryCore({ lines: reversalPreview });
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to validate reversal entry' };
    }

    const { data: reversalRows, error } = await supabase.rpc('reverse_journal_entry_strict', {
      p_original_entry_id: normalizedId,
    });

    if (error) {
      return { error: error.message || 'Failed to reverse journal entry.' };
    }

    const reversal = Array.isArray(reversalRows) ? reversalRows[0] : null;
    if (!reversal) {
      return { error: 'Failed to reverse journal entry.' };
    }

    revalidateAccountingPaths();
    return {
      success: true,
      original_entry_id: reversal.original_entry_id as string,
      reversal_entry_id: reversal.reversal_entry_id as string,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    };
  }
}

export async function deleteJournalEntry(entryId: string) {
  try {
    const session = await getSession();
    ensureAdmin(session);

    const normalizedId = String(entryId || '').trim();
    if (!normalizedId) {
      return { error: 'Journal entry id is required.' };
    }

    const { supabase, entries } = await getJournalEntryData();
    const existing = entries.find((entry) => entry.id === normalizedId) ?? null;
    if (!existing) {
      return { error: 'Journal entry not found.' };
    }

    if (existing.status === 'posted') {
      return { error: 'Posted entries cannot be modified. Use reversal.' };
    }

    const { error } = await supabase.from('journal_entries').delete().eq('id', normalizedId);
    if (error) {
      return { error: error.message };
    }

    revalidateAccountingPaths();
    return { success: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    };
  }
}
