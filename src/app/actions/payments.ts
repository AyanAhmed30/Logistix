'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/utils/supabase/server';
import {
  buildPaymentPosting,
  createAndPostJournalEntry,
  getActivePartner,
} from '@/app/actions/accounting_posting';

export type PaymentType = 'inbound' | 'outbound';
export type PaymentStatus = 'draft' | 'posted';

export type Payment = {
  id: string;
  payment_number: string;
  partner_id: string;
  payment_type: PaymentType;
  amount: number;
  payment_date: string;
  journal_id: string;
  receivable_account_id: string | null;
  payable_account_id: string | null;
  liquidity_account_id: string;
  status: PaymentStatus;
  posted_journal_entry_id: string | null;
  allocated_amount: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type UpsertPaymentInput = {
  id?: string;
  partner_id: string;
  payment_type: PaymentType;
  amount: number;
  payment_date: string;
  journal_id: string;
  liquidity_account_id: string;
};

function ensureAdmin(session: { role: string } | null) {
  if (!session || session.role !== 'admin') {
    throw new Error('Unauthorized');
  }
}

function parseAmount(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function generatePaymentNumber(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  year: number
) {
  const prefix = `PAY/${year}/`;
  const { data } = await supabase
    .from('payments')
    .select('payment_number')
    .like('payment_number', `${prefix}%`)
    .order('payment_number', { ascending: false })
    .limit(1);

  let seq = 1;
  if (data && data.length > 0) {
    const n = Number(String(data[0].payment_number || '').replace(prefix, ''));
    if (Number.isFinite(n) && n > 0) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

async function validateJournalAndLiquidity(journalId: string, liquidityAccountId: string) {
  const supabase = await createAdminClient();
  const { data: journal, error: journalError } = await supabase
    .from('journals')
    .select('id, type, is_active')
    .eq('id', journalId)
    .single();
  if (journalError || !journal) {
    throw new Error(journalError?.message || 'Payment journal not found.');
  }
  if (!journal.is_active || (journal.type !== 'bank' && journal.type !== 'cash')) {
    throw new Error('Payment journal must be active bank/cash journal.');
  }

  const { data: account, error: accountError } = await supabase
    .from('chart_of_accounts')
    .select('id, type, is_active')
    .eq('id', liquidityAccountId)
    .single();
  if (accountError || !account) {
    throw new Error(accountError?.message || 'Liquidity account not found.');
  }
  if (!account.is_active || account.type !== 'asset') {
    throw new Error('Liquidity account must be an active asset account.');
  }
}

export async function getPayments(status?: PaymentStatus | 'all', type?: PaymentType | 'all') {
  try {
    const session = await getSession();
    ensureAdmin(session);
    const supabase = await createAdminClient();
    let query = supabase.from('payments').select('*').order('created_at', { ascending: false });
    if (status && status !== 'all') query = query.eq('status', status);
    if (type && type !== 'all') query = query.eq('payment_type', type);
    const { data, error } = await query;
    if (error) return { error: error.message };
    return { payments: (data || []) as Payment[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function createPayment(input: UpsertPaymentInput) {
  try {
    const session = await getSession();
    ensureAdmin(session);
    const amount = parseAmount(input.amount);
    if (!input.partner_id) return { error: 'Partner is required.' };
    if (!input.payment_date) return { error: 'Payment date is required.' };
    if (!input.journal_id) return { error: 'Payment journal is required.' };
    if (!input.liquidity_account_id) return { error: 'Liquidity account is required.' };
    if (amount <= 0) return { error: 'Payment amount must be greater than zero.' };
    if (input.payment_type !== 'inbound' && input.payment_type !== 'outbound') {
      return { error: 'Payment type must be inbound or outbound.' };
    }

    const partner = await getActivePartner(input.partner_id);
    if (input.payment_type === 'inbound') {
      if (partner.partner_type !== 'customer' && partner.partner_type !== 'both') {
        return { error: `Partner "${partner.name}" is not valid for inbound payment.` };
      }
    } else if (partner.partner_type !== 'vendor' && partner.partner_type !== 'both') {
      return { error: `Partner "${partner.name}" is not valid for outbound payment.` };
    }

    await validateJournalAndLiquidity(input.journal_id, input.liquidity_account_id);

    const supabase = await createAdminClient();
    const paymentNumber = await generatePaymentNumber(supabase, new Date(input.payment_date).getFullYear());
    const { data, error } = await supabase
      .from('payments')
      .insert([
        {
          payment_number: paymentNumber,
          partner_id: input.partner_id,
          payment_type: input.payment_type,
          amount,
          payment_date: input.payment_date,
          journal_id: input.journal_id,
          liquidity_account_id: input.liquidity_account_id,
          status: 'draft',
          allocated_amount: 0,
          created_by: session.username,
          updated_at: new Date().toISOString(),
        },
      ])
      .select('*')
      .single();
    if (error || !data) return { error: error?.message || 'Failed to create payment.' };

    revalidatePath('/admin/dashboard');
    return { payment: data as Payment };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function postPayment(id: string) {
  try {
    const session = await getSession();
    ensureAdmin(session);
    if (!id) return { error: 'Payment id is required.' };

    const supabase = await createAdminClient();
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', id)
      .single();
    if (paymentError || !payment) return { error: paymentError?.message || 'Payment not found.' };
    if (payment.status !== 'draft') return { error: 'Only draft payments can be posted.' };

    const partner = await getActivePartner(payment.partner_id);
    if (payment.payment_type === 'inbound') {
      if (partner.partner_type !== 'customer' && partner.partner_type !== 'both') {
        return { error: `Partner "${partner.name}" is not valid for inbound payment.` };
      }
    } else if (partner.partner_type !== 'vendor' && partner.partner_type !== 'both') {
      return { error: `Partner "${partner.name}" is not valid for outbound payment.` };
    }

    await validateJournalAndLiquidity(payment.journal_id, payment.liquidity_account_id);
    const lines = await buildPaymentPosting({
      amount: parseAmount(payment.amount),
      partnerId: payment.partner_id,
      partnerName: partner.name,
      paymentType: payment.payment_type,
      liquidityAccountId: payment.liquidity_account_id,
    });
    const entryId = await createAndPostJournalEntry({
      reference: `PAY-${payment.payment_number}`,
      entryDate: payment.payment_date,
      journalId: payment.journal_id,
      lines,
    });

    const payableAccountId = lines.find((l) => l.partner_reference?.startsWith('vendor:'))?.account_id ?? null;
    const receivableAccountId = lines.find((l) => l.partner_reference?.startsWith('customer:'))?.account_id ?? null;

    const { data, error } = await supabase
      .from('payments')
      .update({
        status: 'posted',
        posted_journal_entry_id: entryId,
        receivable_account_id: receivableAccountId,
        payable_account_id: payableAccountId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) return { error: error?.message || 'Failed to post payment.' };

    revalidatePath('/admin/dashboard');
    return { payment: data as Payment, postedJournalEntryId: entryId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}
