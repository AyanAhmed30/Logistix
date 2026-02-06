'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

export type PackingList = {
  id: string;
  build_to: string;
  ship_to: string;
  product_name: string;
  hs_code: string;
  no_of_cartons: number;
  weight: number;
  net_weight: number;
  created_at: string;
  updated_at: string;
};

export async function createPackingList(formData: FormData) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const build_to = formData.get('build_to') as string;
    const ship_to = formData.get('ship_to') as string;
    const product_name = formData.get('product_name') as string;
    const hs_code = formData.get('hs_code') as string;
    const no_of_cartons = formData.get('no_of_cartons') ? parseInt(formData.get('no_of_cartons') as string, 10) : 0;
    const weight = formData.get('weight') ? parseFloat(formData.get('weight') as string) : 0;
    const net_weight = formData.get('net_weight') ? parseFloat(formData.get('net_weight') as string) : 0;

    if (!build_to?.trim() || !ship_to?.trim() || !product_name?.trim() || !hs_code?.trim()) {
      return { error: 'All fields are required' };
    }

    if (no_of_cartons < 0 || weight < 0 || net_weight < 0) {
      return { error: 'Cartons, weight, and net weight must be non-negative numbers' };
    }

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('packing_lists')
      .insert([{
        build_to: build_to.trim(),
        ship_to: ship_to.trim(),
        product_name: product_name.trim(),
        hs_code: hs_code.trim(),
        no_of_cartons,
        weight,
        net_weight,
      }])
      .select()
      .single();

    if (error) {
      return { error: error.message || 'Failed to create packing list' };
    }

    revalidatePath('/admin/dashboard');
    return { success: true, packingList: data as PackingList };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred while creating packing list' };
  }
}

export async function getAllPackingLists() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('packing_lists')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return { error: error.message || 'Failed to fetch packing lists' };
    }

    return { packingLists: data || [] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred while fetching packing lists' };
  }
}

export async function deletePackingList(id: string) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    if (!id) {
      return { error: 'Packing list ID is required' };
    }

    const supabase = await createAdminClient();

    const { error } = await supabase
      .from('packing_lists')
      .delete()
      .eq('id', id);

    if (error) {
      return { error: error.message || 'Failed to delete packing list' };
    }

    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred while deleting packing list' };
  }
}
