'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/utils/supabase/server';
import type { ChartOfAccountType } from '@/app/actions/chart_of_accounts';

export type JournalType = 'sales' | 'purchase' | 'bank' | 'cash' | 'general';

export type Journal = {
  id: string;
  name: string;
  code: string;
  type: JournalType;
  default_debit_account_id: string | null;
  default_credit_account_id: string | null;
  default_debit_account_name: string | null;
  default_credit_account_name: string | null;
  default_debit_account_code: string | null;
  default_credit_account_code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type JournalRow = {
  id: string;
  name: string;
  code: string;
  type: JournalType;
  default_debit_account_id: string | null;
  default_credit_account_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type AccountLookup = {
  id: string;
  name: string;
  code: string;
  type: ChartOfAccountType;
  is_active: boolean;
};

type UpsertJournalInput = {
  id?: string;
  name: string;
  code: string;
  type: JournalType;
  default_debit_account_id?: string | null;
  default_credit_account_id?: string | null;
  is_active?: boolean;
};

type JournalMutationValues = {
  name: string;
  code: string;
  type: JournalType;
  default_debit_account_id: string | null;
  default_credit_account_id: string | null;
  is_active: boolean;
};

const VALID_JOURNAL_TYPES: JournalType[] = ['sales', 'purchase', 'bank', 'cash', 'general'];

function ensureAdmin(session: { role: string } | null) {
  if (!session || session.role !== 'admin') {
    throw new Error('Unauthorized');
  }
}

function isJournalType(value: string): value is JournalType {
  return VALID_JOURNAL_TYPES.includes(value as JournalType);
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function normalizeName(name: string) {
  return name.trim();
}

async function getJournalData() {
  const supabase = await createAdminClient();

  const [{ data: journalsData, error: journalsError }, { data: accountsData, error: accountsError }] =
    await Promise.all([
      supabase.from('journals').select('*').order('name', { ascending: true }),
      supabase.from('chart_of_accounts').select('id, name, code, type, is_active').order('code', {
        ascending: true,
      }),
    ]);

  if (journalsError) {
    throw new Error(journalsError.message);
  }

  if (accountsError) {
    throw new Error(accountsError.message);
  }

  return {
    supabase,
    journals: (journalsData || []) as JournalRow[],
    accounts: (accountsData || []) as AccountLookup[],
  };
}

function formatJournalRows(journals: JournalRow[], accounts: AccountLookup[]): Journal[] {
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  return journals.map((journal) => {
    const debit = journal.default_debit_account_id
      ? accountById.get(journal.default_debit_account_id) ?? null
      : null;
    const credit = journal.default_credit_account_id
      ? accountById.get(journal.default_credit_account_id) ?? null
      : null;

    return {
      ...journal,
      default_debit_account_name: debit?.name ?? null,
      default_credit_account_name: credit?.name ?? null,
      default_debit_account_code: debit?.code ?? null,
      default_credit_account_code: credit?.code ?? null,
    };
  });
}

function validateAccountForJournal(
  account: AccountLookup | null,
  journalType: JournalType,
  side: 'debit' | 'credit'
): { success: true } | { error: string } {
  if (!account) {
    return { success: true as const };
  }

  if (!account.is_active) {
    return { error: `Default ${side} account must be active.` };
  }

  if (account.type === 'view') {
    return { error: `Default ${side} account cannot be a view account.` };
  }

  if ((journalType === 'bank' || journalType === 'cash') && account.type !== 'asset') {
    return { error: `${journalType === 'bank' ? 'Bank' : 'Cash'} journals must use asset accounts.` };
  }

  if (journalType === 'sales' && side === 'credit' && account.type !== 'income') {
    return { error: 'Sales journals should use an income account as the default credit account.' };
  }

  if (
    journalType === 'purchase' &&
    side === 'debit' &&
    account.type !== 'expense' &&
    account.type !== 'asset'
  ) {
    return { error: 'Purchase journals should use an expense or asset account as the default debit account.' };
  }

  return { success: true as const };
}

function validateJournalInput(
  input: UpsertJournalInput,
  journals: JournalRow[],
  accounts: AccountLookup[]
): { values: JournalMutationValues } | { error: string } {
  const name = normalizeName(String(input.name || ''));
  const code = normalizeCode(String(input.code || ''));
  const rawType = String(input.type || '').trim().toLowerCase();
  const defaultDebitAccountId = input.default_debit_account_id || null;
  const defaultCreditAccountId = input.default_credit_account_id || null;

  if (!name) {
    return { error: 'Journal name is required.' };
  }

  if (!code) {
    return { error: 'Journal code is required.' };
  }

  if (!isJournalType(rawType)) {
    return { error: 'Journal type must be valid.' };
  }

  const duplicateCode = journals.find(
    (journal) => journal.code === code && journal.id !== (input.id ?? '')
  );
  if (duplicateCode) {
    return { error: 'Journal code must be unique.' };
  }

  const duplicateName = journals.find(
    (journal) => journal.name.toLowerCase() === name.toLowerCase() && journal.id !== (input.id ?? '')
  );
  if (duplicateName) {
    return { error: 'Journal name must be unique.' };
  }

  const debitAccount = defaultDebitAccountId
    ? accounts.find((account) => account.id === defaultDebitAccountId) ?? null
    : null;
  const creditAccount = defaultCreditAccountId
    ? accounts.find((account) => account.id === defaultCreditAccountId) ?? null
    : null;

  if (defaultDebitAccountId && !debitAccount) {
    return { error: 'Default debit account must exist.' };
  }

  if (defaultCreditAccountId && !creditAccount) {
    return { error: 'Default credit account must exist.' };
  }

  const debitValidation = validateAccountForJournal(debitAccount, rawType, 'debit');
  if ('error' in debitValidation) {
    return debitValidation;
  }

  const creditValidation = validateAccountForJournal(creditAccount, rawType, 'credit');
  if ('error' in creditValidation) {
    return creditValidation;
  }

  return {
    values: {
      name,
      code,
      type: rawType,
      default_debit_account_id: defaultDebitAccountId,
      default_credit_account_id: defaultCreditAccountId,
      is_active: input.is_active ?? true,
    },
  };
}

function revalidateAccountingPaths() {
  revalidatePath('/admin/dashboard');
}

export async function getJournals(type?: JournalType | 'all') {
  try {
    const session = await getSession();
    ensureAdmin(session);

    const { journals, accounts } = await getJournalData();
    const normalizedType = type && type !== 'all' ? type : null;
    const filteredJournals = normalizedType
      ? journals.filter((journal) => journal.type === normalizedType)
      : journals;

    return {
      journals: formatJournalRows(filteredJournals, accounts),
      accounts,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    };
  }
}

export async function createJournal(input: UpsertJournalInput) {
  try {
    const session = await getSession();
    ensureAdmin(session);

    const { supabase, journals, accounts } = await getJournalData();
    const validation = validateJournalInput(input, journals, accounts);
    if ('error' in validation) {
      return validation;
    }

    const { data, error } = await supabase
      .from('journals')
      .insert([
        {
          ...validation.values,
          updated_at: new Date().toISOString(),
        },
      ])
      .select('*')
      .single();

    if (error || !data) {
      return { error: error?.message || 'Failed to create journal.' };
    }

    revalidateAccountingPaths();
    return { journal: data as JournalRow };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    };
  }
}

export async function updateJournal(input: UpsertJournalInput) {
  try {
    const session = await getSession();
    ensureAdmin(session);

    const journalId = String(input.id || '').trim();
    if (!journalId) {
      return { error: 'Journal id is required.' };
    }

    const { supabase, journals, accounts } = await getJournalData();
    const existing = journals.find((journal) => journal.id === journalId) ?? null;
    if (!existing) {
      return { error: 'Journal not found.' };
    }

    const validation = validateJournalInput(
      {
        ...input,
        id: journalId,
      },
      journals,
      accounts
    );
    if ('error' in validation) {
      return validation;
    }

    const { data, error } = await supabase
      .from('journals')
      .update({
        ...validation.values,
        updated_at: new Date().toISOString(),
      })
      .eq('id', journalId)
      .select('*')
      .single();

    if (error || !data) {
      return { error: error?.message || 'Failed to update journal.' };
    }

    revalidateAccountingPaths();
    return { journal: data as JournalRow };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    };
  }
}

export async function setJournalActiveState(journalId: string, isActive: boolean) {
  try {
    const session = await getSession();
    ensureAdmin(session);

    const normalizedId = String(journalId || '').trim();
    if (!normalizedId) {
      return { error: 'Journal id is required.' };
    }

    const { supabase, journals } = await getJournalData();
    const existing = journals.find((journal) => journal.id === normalizedId) ?? null;
    if (!existing) {
      return { error: 'Journal not found.' };
    }

    const { data, error } = await supabase
      .from('journals')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', normalizedId)
      .select('*')
      .single();

    if (error || !data) {
      return { error: error?.message || 'Failed to update journal status.' };
    }

    revalidateAccountingPaths();
    return { journal: data as JournalRow };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    };
  }
}
