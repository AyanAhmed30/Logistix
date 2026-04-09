import { createAdminClient } from '@/utils/supabase/server';
import { createAndPostJournalEntry, getAccountByCode } from '@/app/actions/accounting_posting';

function toAmount(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function get_exchange_rate(currencyCode: string, date?: string) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc('get_exchange_rate', {
    p_currency_code: String(currencyCode || '').toUpperCase(),
    p_rate_date: date || new Date().toISOString().slice(0, 10),
  });
  if (error) throw new Error(error.message);
  return toAmount(data);
}

export function convert_to_base(amount: number, rate: number) {
  const a = toAmount(amount);
  const r = toAmount(rate);
  if (a <= 0) throw new Error('Amount must be greater than zero.');
  if (r <= 0) throw new Error('Rate must be greater than zero.');
  return Math.round(a * r * 100) / 100;
}

export async function create_foreign_currency_entry(args: {
  reference: string;
  entryDate: string;
  journalId: string;
  accountId: string;
  side: 'debit' | 'credit';
  baseAmount: number;
  currencyCode: string;
  foreignAmount: number;
  exchangeRate: number;
  description: string;
}) {
  const base = toAmount(args.baseAmount);
  if (base <= 0) throw new Error('Base amount must be greater than zero.');
  const foreign = toAmount(args.foreignAmount);
  if (foreign <= 0) throw new Error('Foreign amount must be greater than zero.');
  const rate = toAmount(args.exchangeRate);
  if (rate <= 0) throw new Error('Exchange rate must be greater than zero.');

  const balancingAccount = await getAccountByCode('1002');

  return createAndPostJournalEntry({
    reference: args.reference,
    entryDate: args.entryDate,
    journalId: args.journalId,
    lines: [
      {
        account_id: args.accountId,
        description: args.description,
        debit_amount: args.side === 'debit' ? base : 0,
        credit_amount: args.side === 'credit' ? base : 0,
      },
      {
        account_id: balancingAccount.id,
        description: `${args.description} (balancing line)`,
        debit_amount: args.side === 'credit' ? base : 0,
        credit_amount: args.side === 'debit' ? base : 0,
      },
    ],
  });
}

export function calculate_exchange_difference(args: {
  settledBase: number;
  originalBase: number;
}) {
  const settled = toAmount(args.settledBase);
  const original = toAmount(args.originalBase);
  const difference = Math.round((settled - original) * 100) / 100;
  return {
    difference,
    type: difference > 0 ? ('loss' as const) : difference < 0 ? ('gain' as const) : ('none' as const),
    absolute: Math.abs(difference),
  };
}

export async function post_exchange_gain_loss(args: {
  reference: string;
  entryDate: string;
  journalId: string;
  arApAccountId: string;
  difference: number;
}) {
  const diff = Math.round(toAmount(args.difference) * 100) / 100;
  if (diff === 0) return { posted: false };

  const gainAccount = await getAccountByCode('4008');
  const lossAccount = await getAccountByCode('5008');
  const amount = Math.abs(diff);

  const lines =
    diff > 0
      ? [
          {
            account_id: lossAccount.id,
            description: 'Realized FX loss on settlement',
            debit_amount: amount,
            credit_amount: 0,
          },
          {
            account_id: args.arApAccountId,
            description: 'AR/AP adjustment for realized FX loss',
            debit_amount: 0,
            credit_amount: amount,
          },
        ]
      : [
          {
            account_id: args.arApAccountId,
            description: 'AR/AP adjustment for realized FX gain',
            debit_amount: amount,
            credit_amount: 0,
          },
          {
            account_id: gainAccount.id,
            description: 'Realized FX gain on settlement',
            debit_amount: 0,
            credit_amount: amount,
          },
        ];

  const entryId = await createAndPostJournalEntry({
    reference: args.reference,
    entryDate: args.entryDate,
    journalId: args.journalId,
    lines,
  });
  return { posted: true, journal_entry_id: entryId };
}
