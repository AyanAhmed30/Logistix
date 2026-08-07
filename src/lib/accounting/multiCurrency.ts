import { createAndPostJournalEntry, getAccountByCode } from '@/app/actions/accounting_posting';
import {
  calculateRealizedExchangeDifference,
  convertToBaseAmount,
  toFiniteAmount,
} from '@/lib/accounting-currencies';
import { resolveExchangeRateToBase } from '@/app/actions/accounting/currencies';

function toAmount(value: unknown) {
  return toFiniteAmount(value);
}

/** @deprecated Prefer resolveExchangeRateToBase from Currency Engine. */
export async function get_exchange_rate(currencyCode: string, date?: string) {
  const res = await resolveExchangeRateToBase(currencyCode, date);
  if ('error' in res) throw new Error(res.error);
  return res.rate;
}

/** @deprecated Prefer convertToBaseAmount from Currency Engine. */
export function convert_to_base(amount: number, rate: number) {
  const a = toAmount(amount);
  if (a <= 0) throw new Error('Amount must be greater than zero.');
  return convertToBaseAmount(a, rate, 2);
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

/** @deprecated Prefer calculateRealizedExchangeDifference from Currency Engine. */
export function calculate_exchange_difference(args: {
  settledBase: number;
  originalBase: number;
}) {
  return calculateRealizedExchangeDifference({
    settledCompanyAmount: args.settledBase,
    originalCompanyAmount: args.originalBase,
  });
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
