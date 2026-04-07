'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/utils/supabase/server';

export type PartnerType = 'customer' | 'vendor' | 'agent' | 'both';
export type PartnerStatus = 'active' | 'inactive';

export type Partner = {
  id: string;
  name: string;
  partner_type: PartnerType;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: PartnerStatus;
  created_at: string;
  updated_at: string;
};

type UpsertPartnerInput = {
  id?: string;
  name: string;
  partner_type: PartnerType;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  status?: PartnerStatus;
};

const VALID_PARTNER_TYPES: PartnerType[] = ['customer', 'vendor', 'agent', 'both'];
const VALID_STATUSES: PartnerStatus[] = ['active', 'inactive'];

function ensureAdmin(session: { role: string } | null) {
  if (!session || session.role !== 'admin') {
    throw new Error('Unauthorized');
  }
}

function isPartnerType(value: string): value is PartnerType {
  return VALID_PARTNER_TYPES.includes(value as PartnerType);
}

function isPartnerStatus(value: string): value is PartnerStatus {
  return VALID_STATUSES.includes(value as PartnerStatus);
}

function normalizeText(value: string | null | undefined) {
  const trimmed = String(value || '').trim();
  return trimmed || null;
}

function normalizeEmail(value: string | null | undefined) {
  const normalized = normalizeText(value);
  return normalized ? normalized.toLowerCase() : null;
}

function revalidateAccountingPaths() {
  revalidatePath('/admin/dashboard');
}

export async function getPartners(type?: PartnerType | 'all', status?: PartnerStatus | 'all') {
  try {
    const session = await getSession();
    ensureAdmin(session);

    const supabase = await createAdminClient();
    let query = supabase.from('partners').select('*').order('created_at', { ascending: false });

    if (type && type !== 'all') {
      query = query.eq('partner_type', type);
    }
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      return { error: error.message };
    }

    return { partners: (data || []) as Partner[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function createPartner(input: UpsertPartnerInput) {
  try {
    const session = await getSession();
    ensureAdmin(session);

    const name = String(input.name || '').trim();
    const rawType = String(input.partner_type || '').trim().toLowerCase();
    const rawStatus = String(input.status || 'active').trim().toLowerCase();
    const email = normalizeEmail(input.email);
    const phone = normalizeText(input.phone);
    const address = normalizeText(input.address);

    if (!name) {
      return { error: 'Partner name is required.' };
    }
    if (!isPartnerType(rawType)) {
      return { error: 'Partner type is invalid.' };
    }
    if (!isPartnerStatus(rawStatus)) {
      return { error: 'Partner status is invalid.' };
    }

    const supabase = await createAdminClient();
    const { data: duplicateRows, error: duplicateError } = await supabase
      .from('partners')
      .select('id')
      .eq('partner_type', rawType)
      .ilike('name', name)
      .limit(1);

    if (duplicateError) {
      return { error: duplicateError.message };
    }
    if ((duplicateRows || []).length > 0) {
      return { error: 'Partner with same name and type already exists.' };
    }

    const { data, error } = await supabase
      .from('partners')
      .insert([
        {
          name,
          partner_type: rawType,
          email,
          phone,
          address,
          status: rawStatus,
          updated_at: new Date().toISOString(),
        },
      ])
      .select('*')
      .single();

    if (error || !data) {
      return { error: error?.message || 'Failed to create partner.' };
    }

    revalidateAccountingPaths();
    return { partner: data as Partner };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function updatePartner(input: UpsertPartnerInput) {
  try {
    const session = await getSession();
    ensureAdmin(session);

    const partnerId = String(input.id || '').trim();
    if (!partnerId) {
      return { error: 'Partner id is required.' };
    }

    const name = String(input.name || '').trim();
    const rawType = String(input.partner_type || '').trim().toLowerCase();
    const rawStatus = String(input.status || 'active').trim().toLowerCase();
    const email = normalizeEmail(input.email);
    const phone = normalizeText(input.phone);
    const address = normalizeText(input.address);

    if (!name) {
      return { error: 'Partner name is required.' };
    }
    if (!isPartnerType(rawType)) {
      return { error: 'Partner type is invalid.' };
    }
    if (!isPartnerStatus(rawStatus)) {
      return { error: 'Partner status is invalid.' };
    }

    const supabase = await createAdminClient();

    const { data: existing, error: existingError } = await supabase
      .from('partners')
      .select('id')
      .eq('id', partnerId)
      .single();

    if (existingError || !existing) {
      return { error: existingError?.message || 'Partner not found.' };
    }

    const { data: duplicateRows, error: duplicateError } = await supabase
      .from('partners')
      .select('id')
      .eq('partner_type', rawType)
      .ilike('name', name)
      .neq('id', partnerId)
      .limit(1);

    if (duplicateError) {
      return { error: duplicateError.message };
    }
    if ((duplicateRows || []).length > 0) {
      return { error: 'Partner with same name and type already exists.' };
    }

    const { data, error } = await supabase
      .from('partners')
      .update({
        name,
        partner_type: rawType,
        email,
        phone,
        address,
        status: rawStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', partnerId)
      .select('*')
      .single();

    if (error || !data) {
      return { error: error?.message || 'Failed to update partner.' };
    }

    revalidateAccountingPaths();
    return { partner: data as Partner };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function setPartnerStatus(partnerId: string, status: PartnerStatus) {
  try {
    const session = await getSession();
    ensureAdmin(session);

    const id = String(partnerId || '').trim();
    if (!id) {
      return { error: 'Partner id is required.' };
    }
    if (!isPartnerStatus(String(status || '').trim().toLowerCase())) {
      return { error: 'Partner status is invalid.' };
    }

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('partners')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      return { error: error?.message || 'Failed to update partner status.' };
    }

    revalidateAccountingPaths();
    return { partner: data as Partner };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}
