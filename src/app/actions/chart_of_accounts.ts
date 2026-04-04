'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/utils/supabase/server';

export type ChartOfAccountType =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'income'
  | 'expense'
  | 'view';

export type ChartOfAccount = {
  id: string;
  name: string;
  code: string;
  type: ChartOfAccountType;
  parent_id: string | null;
  parent_name: string | null;
  allow_reconciliation: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  depth: number;
  child_count: number;
  normal_balance: 'debit' | 'credit' | 'none';
  can_post: boolean;
};

type ChartOfAccountRow = Omit<
  ChartOfAccount,
  'parent_name' | 'depth' | 'child_count' | 'normal_balance' | 'can_post'
>;

type UpsertChartOfAccountInput = {
  id?: string;
  name: string;
  code: string;
  type: ChartOfAccountType;
  parent_id?: string | null;
  allow_reconciliation?: boolean;
  is_active?: boolean;
};

type AccountMutationValues = {
  name: string;
  code: string;
  type: ChartOfAccountType;
  parent_id: string | null;
  allow_reconciliation: boolean;
  is_active: boolean;
};

const VALID_ACCOUNT_TYPES: ChartOfAccountType[] = [
  'asset',
  'liability',
  'equity',
  'income',
  'expense',
  'view',
];

function ensureAdmin(session: { role: string } | null) {
  if (!session || session.role !== 'admin') {
    throw new Error('Unauthorized');
  }
}

function isChartOfAccountType(value: string): value is ChartOfAccountType {
  return VALID_ACCOUNT_TYPES.includes(value as ChartOfAccountType);
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function getNormalBalance(type: ChartOfAccountType): 'debit' | 'credit' | 'none' {
  if (type === 'asset' || type === 'expense') {
    return 'debit';
  }
  if (type === 'liability' || type === 'equity' || type === 'income') {
    return 'credit';
  }
  return 'none';
}

function sortAccounts(a: ChartOfAccountRow, b: ChartOfAccountRow) {
  return a.code.localeCompare(b.code) || a.name.localeCompare(b.name);
}

function buildHierarchy(accounts: ChartOfAccountRow[]): ChartOfAccount[] {
  const childrenByParent = new Map<string | null, ChartOfAccountRow[]>();
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const flattened: ChartOfAccount[] = [];

  for (const account of accounts) {
    const key = account.parent_id ?? null;
    const siblings = childrenByParent.get(key) ?? [];
    siblings.push(account);
    childrenByParent.set(key, siblings);
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort(sortAccounts);
  }

  function visit(parentId: string | null, depth: number) {
    const children = childrenByParent.get(parentId) ?? [];
    for (const account of children) {
      const childItems = childrenByParent.get(account.id) ?? [];
      const parent = account.parent_id ? accountById.get(account.parent_id) ?? null : null;
      flattened.push({
        ...account,
        parent_name: parent?.name ?? null,
        depth,
        child_count: childItems.length,
        normal_balance: getNormalBalance(account.type),
        can_post: account.type !== 'view',
      });
      visit(account.id, depth + 1);
    }
  }

  visit(null, 0);

  const orphanedAccounts = accounts.filter(
    (account) => account.parent_id && !accountById.has(account.parent_id)
  );
  for (const account of orphanedAccounts.sort(sortAccounts)) {
    if (flattened.some((item) => item.id === account.id)) {
      continue;
    }
    const childItems = childrenByParent.get(account.id) ?? [];
    flattened.push({
      ...account,
      parent_name: null,
      depth: 0,
      child_count: childItems.length,
      normal_balance: getNormalBalance(account.type),
      can_post: account.type !== 'view',
    });
  }

  return flattened;
}

async function getAllAccountsRaw() {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .order('code', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return { supabase, accounts: (data || []) as ChartOfAccountRow[] };
}

function validateParentAssignment(
  accounts: ChartOfAccountRow[],
  currentAccountId: string | null,
  parentId: string | null
): { parent: ChartOfAccountRow | null } | { error: string } {
  if (!parentId) {
    return { parent: null as ChartOfAccountRow | null };
  }

  const parent = accounts.find((account) => account.id === parentId) ?? null;
  if (!parent) {
    return { error: 'Parent account must exist.' };
  }

  if (!parent.is_active) {
    return { error: 'Parent account must be active.' };
  }

  if (parent.type !== 'view') {
    return { error: 'Parent account must be a view account.' };
  }

  if (!currentAccountId) {
    return { parent };
  }

  if (parent.id === currentAccountId) {
    return { error: 'An account cannot be its own parent.' };
  }

  let ancestorId: string | null = parent.parent_id;
  while (ancestorId) {
    if (ancestorId === currentAccountId) {
      return { error: 'Circular hierarchy is not allowed.' };
    }
    const ancestor = accounts.find((account) => account.id === ancestorId) ?? null;
    ancestorId = ancestor?.parent_id ?? null;
  }

  return { parent };
}

function validateAccountState(
  accounts: ChartOfAccountRow[],
  currentAccountId: string | null,
  nextType: ChartOfAccountType,
  isActive: boolean,
  parentId: string | null
): { success: true } | { error: string } {
  if (nextType !== 'view') {
    const childCount = accounts.filter((account) => account.parent_id === currentAccountId).length;
    if (currentAccountId && childCount > 0) {
      return { error: 'Only view accounts can have child accounts.' };
    }
  }

  if (!isActive && currentAccountId) {
    const activeChildren = accounts.filter(
      (account) => account.parent_id === currentAccountId && account.is_active
    );
    if (activeChildren.length > 0) {
      return { error: 'Deactivate child accounts before disabling this account.' };
    }
  }

  if (isActive && parentId) {
    const parent = accounts.find((account) => account.id === parentId) ?? null;
    if (parent && !parent.is_active) {
      return { error: 'Activate the parent account before activating this account.' };
    }
  }

  return { success: true as const };
}

function validateAccountInput(
  input: UpsertChartOfAccountInput,
  accounts: ChartOfAccountRow[]
): { values: AccountMutationValues } | { error: string } {
  const name = String(input.name || '').trim();
  const code = normalizeCode(String(input.code || ''));
  const rawType = String(input.type || '').trim().toLowerCase();
  const parentId = input.parent_id || null;

  if (!name) {
    return { error: 'Name is required.' };
  }

  if (!code) {
    return { error: 'Unique code is required.' };
  }

  if (!isChartOfAccountType(rawType)) {
    return { error: 'Type must be a valid account type.' };
  }

  const duplicate = accounts.find(
    (account) => account.code === code && account.id !== (input.id ?? '')
  );
  if (duplicate) {
    return { error: 'Account code must be unique.' };
  }

  const parentValidation = validateParentAssignment(accounts, input.id ?? null, parentId);
  if ('error' in parentValidation) {
    return parentValidation;
  }

  const isActive = input.is_active ?? true;
  const stateValidation = validateAccountState(
    accounts,
    input.id ?? null,
    rawType,
    isActive,
    parentId
  );
  if ('error' in stateValidation) {
    return stateValidation;
  }

  return {
    values: {
      name,
      code,
      type: rawType,
      parent_id: parentId,
      allow_reconciliation: rawType === 'view' ? false : Boolean(input.allow_reconciliation),
      is_active: isActive,
    },
  };
}

function revalidateAccountingPaths() {
  revalidatePath('/admin/dashboard');
}

export async function getChartOfAccounts() {
  try {
    const session = await getSession();
    ensureAdmin(session);

    const { accounts } = await getAllAccountsRaw();
    return { accounts: buildHierarchy(accounts) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    };
  }
}

export async function createChartOfAccount(input: UpsertChartOfAccountInput) {
  try {
    const session = await getSession();
    ensureAdmin(session);

    const { supabase, accounts } = await getAllAccountsRaw();
    const validation = validateAccountInput(input, accounts);
    if ('error' in validation) {
      return validation;
    }

    const { data, error } = await supabase
      .from('chart_of_accounts')
      .insert([
        {
          ...validation.values,
          updated_at: new Date().toISOString(),
        },
      ])
      .select('*')
      .single();

    if (error || !data) {
      return { error: error?.message || 'Failed to create account.' };
    }

    revalidateAccountingPaths();
    return { account: data as ChartOfAccountRow };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    };
  }
}

export async function updateChartOfAccount(input: UpsertChartOfAccountInput) {
  try {
    const session = await getSession();
    ensureAdmin(session);

    const accountId = String(input.id || '').trim();
    if (!accountId) {
      return { error: 'Account id is required.' };
    }

    const { supabase, accounts } = await getAllAccountsRaw();
    const existing = accounts.find((account) => account.id === accountId) ?? null;
    if (!existing) {
      return { error: 'Account not found.' };
    }

    const validation = validateAccountInput(
      {
        ...input,
        id: accountId,
      },
      accounts
    );
    if ('error' in validation) {
      return validation;
    }

    const { data, error } = await supabase
      .from('chart_of_accounts')
      .update({
        ...validation.values,
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId)
      .select('*')
      .single();

    if (error || !data) {
      return { error: error?.message || 'Failed to update account.' };
    }

    revalidateAccountingPaths();
    return { account: data as ChartOfAccountRow };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    };
  }
}

export async function setChartOfAccountActiveState(accountId: string, isActive: boolean) {
  try {
    const session = await getSession();
    ensureAdmin(session);

    const normalizedId = String(accountId || '').trim();
    if (!normalizedId) {
      return { error: 'Account id is required.' };
    }

    const { supabase, accounts } = await getAllAccountsRaw();
    const existing = accounts.find((account) => account.id === normalizedId) ?? null;
    if (!existing) {
      return { error: 'Account not found.' };
    }

    const validation = validateAccountState(
      accounts,
      normalizedId,
      existing.type,
      isActive,
      existing.parent_id
    );
    if ('error' in validation) {
      return validation;
    }

    const { data, error } = await supabase
      .from('chart_of_accounts')
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', normalizedId)
      .select('*')
      .single();

    if (error || !data) {
      return { error: error?.message || 'Failed to update account status.' };
    }

    revalidateAccountingPaths();
    return { account: data as ChartOfAccountRow };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    };
  }
}
