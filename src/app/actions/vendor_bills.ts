'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/utils/supabase/server';
import {
  buildVendorBillPosting,
  createAndPostJournalEntry,
  getActivePartner,
} from '@/app/actions/accounting_posting';

export type VendorBillStatus = 'draft' | 'posted' | 'paid';

export type VendorBill = {
  id: string;
  vendor_partner_id: string;
  bill_number: string;
  bill_date: string;
  due_date: string;
  total_amount: number;
  status: VendorBillStatus;
  expense_account_id: string | null;
  payable_account_id: string | null;
  posted_journal_entry_id: string | null;
  paid_amount: number;
  outstanding_amount: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type UpsertVendorBillInput = {
  id?: string;
  vendor_partner_id: string;
  bill_date: string;
  due_date: string;
  total_amount: number;
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

async function generateBillNumber(supabase: Awaited<ReturnType<typeof createAdminClient>>, year: number) {
  const prefix = `BILL/${year}/`;
  const { data } = await supabase
    .from('vendor_bills')
    .select('bill_number')
    .like('bill_number', `${prefix}%`)
    .order('bill_number', { ascending: false })
    .limit(1);

  let seq = 1;
  if (data && data.length > 0) {
    const n = Number(String(data[0].bill_number || '').replace(prefix, ''));
    if (Number.isFinite(n) && n > 0) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

export async function getVendorBills(status?: VendorBillStatus | 'all') {
  try {
    const session = await getSession();
    ensureAdmin(session);
    const supabase = await createAdminClient();
    let query = supabase.from('vendor_bills').select('*').order('created_at', { ascending: false });
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    const { data, error } = await query;
    if (error) return { error: error.message };
    return { bills: (data || []) as VendorBill[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function createVendorBill(input: UpsertVendorBillInput) {
  try {
    const session = await getSession();
    ensureAdmin(session);
    if (!session) return { error: 'Unauthorized' };
    const amount = parseAmount(input.total_amount);
    if (!input.vendor_partner_id) return { error: 'Vendor partner is required.' };
    if (!input.bill_date || !input.due_date) return { error: 'Bill date and due date are required.' };
    if (amount <= 0) return { error: 'Bill amount must be greater than zero.' };

    const partner = await getActivePartner(input.vendor_partner_id);
    if (partner.partner_type !== 'vendor' && partner.partner_type !== 'both') {
      return { error: `Partner "${partner.name}" is not a vendor.` };
    }

    const supabase = await createAdminClient();
    const billNumber = await generateBillNumber(supabase, new Date(input.bill_date).getFullYear());
    const { data, error } = await supabase
      .from('vendor_bills')
      .insert([
        {
          vendor_partner_id: input.vendor_partner_id,
          bill_number: billNumber,
          bill_date: input.bill_date,
          due_date: input.due_date,
          total_amount: amount,
          status: 'draft',
          paid_amount: 0,
          outstanding_amount: amount,
          created_by: session.username,
          updated_at: new Date().toISOString(),
        },
      ])
      .select('*')
      .single();
    if (error || !data) return { error: error?.message || 'Failed to create vendor bill.' };
    revalidatePath('/admin/dashboard');
    return { bill: data as VendorBill };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function updateVendorBill(input: UpsertVendorBillInput) {
  try {
    const session = await getSession();
    ensureAdmin(session);
    const id = String(input.id || '').trim();
    const amount = parseAmount(input.total_amount);
    if (!id) return { error: 'Bill id is required.' };
    if (!input.vendor_partner_id) return { error: 'Vendor partner is required.' };
    if (!input.bill_date || !input.due_date) return { error: 'Bill date and due date are required.' };
    if (amount <= 0) return { error: 'Bill amount must be greater than zero.' };

    const supabase = await createAdminClient();
    const { data: existing, error: existingError } = await supabase
      .from('vendor_bills')
      .select('*')
      .eq('id', id)
      .single();
    if (existingError || !existing) return { error: existingError?.message || 'Vendor bill not found.' };
    if (existing.status === 'posted' || existing.status === 'paid') {
      return { error: 'Posted/Paid bills cannot be modified.' };
    }

    const partner = await getActivePartner(input.vendor_partner_id);
    if (partner.partner_type !== 'vendor' && partner.partner_type !== 'both') {
      return { error: `Partner "${partner.name}" is not a vendor.` };
    }

    const { data, error } = await supabase
      .from('vendor_bills')
      .update({
        vendor_partner_id: input.vendor_partner_id,
        bill_date: input.bill_date,
        due_date: input.due_date,
        total_amount: amount,
        outstanding_amount: Math.max(amount - parseAmount(existing.paid_amount), 0),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) return { error: error?.message || 'Failed to update vendor bill.' };
    revalidatePath('/admin/dashboard');
    return { bill: data as VendorBill };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function postVendorBill(id: string) {
  try {
    const session = await getSession();
    ensureAdmin(session);
    if (!id) return { error: 'Bill id is required.' };
    const supabase = await createAdminClient();
    const { data: bill, error: billError } = await supabase.from('vendor_bills').select('*').eq('id', id).single();
    if (billError || !bill) return { error: billError?.message || 'Vendor bill not found.' };
    if (bill.status !== 'draft') return { error: 'Only draft bills can be posted.' };

    const posting = await buildVendorBillPosting({
      amount: parseAmount(bill.total_amount),
      partnerId: bill.vendor_partner_id,
      billNumber: bill.bill_number,
      entryDate: bill.bill_date,
    });
    const postedEntryId = await createAndPostJournalEntry({
      reference: `BILL-${bill.bill_number}`,
      entryDate: bill.bill_date,
      journalId: posting.journalId,
      lines: posting.lines,
    });

    const { data, error } = await supabase
      .from('vendor_bills')
      .update({
        status: 'posted',
        posted_journal_entry_id: postedEntryId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) return { error: error?.message || 'Failed to post vendor bill.' };

    revalidatePath('/admin/dashboard');
    return { bill: data as VendorBill, postedJournalEntryId: postedEntryId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}
