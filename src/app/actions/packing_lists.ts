'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

export type PackingListItem = {
  id: string;
  packing_list_id: string;
  product_name: string;
  hs_code: string;
  no_of_cartons: number;
  weight: number;
  net_weight: number;
  item_order: number;
  created_at: string;
  updated_at: string;
};

export type PackingList = {
  id: string;
  build_to?: string;
  ship_to?: string;
  invoice_no?: string;
  bill_to_name?: string;
  bill_to_address?: string;
  bill_to_ntn?: string;
  bill_to_phone?: string;
  bill_to_email?: string;
  ship_to_name?: string;
  ship_to_address?: string;
  ship_to_ntn?: string;
  ship_to_phone?: string;
  ship_to_email?: string;
  payment_terms?: string;
  shipped_via?: string;
  coo?: string;
  port_loading?: string;
  port_discharge?: string;
  shipping_terms?: string;
  product_name?: string; // Optional for backward compatibility
  hs_code?: string;
  no_of_cartons?: number;
  weight?: number;
  net_weight?: number;
  created_at: string;
  updated_at: string;
  items?: PackingListItem[]; // Products
};

export async function createPackingList(formData: FormData) {
  try {
    const session = await getSession();
    if (!session) {
      return { error: 'Unauthorized' };
    }

    // Allow admins or sales agents with "import-packing-list" permission
    if (session.role === 'admin') {
      // Admin has access
    } else if (session.role === 'sales_agent') {
      const { hasPermission } = await import('@/lib/auth/permissions');
      const hasAccess = await hasPermission('import-packing-list');
      if (!hasAccess) {
        return { error: 'Unauthorized' };
      }
    } else {
      return { error: 'Unauthorized' };
    }

    const invoice_no = formData.get('invoice_no') as string;
    const bill_to_name = formData.get('bill_to_name') as string;
    const bill_to_address = formData.get('bill_to_address') as string;
    const bill_to_ntn = formData.get('bill_to_ntn') as string;
    const bill_to_phone = formData.get('bill_to_phone') as string;
    const bill_to_email = formData.get('bill_to_email') as string;
    const ship_to_name = formData.get('ship_to_name') as string;
    const ship_to_address = formData.get('ship_to_address') as string;
    const ship_to_ntn = formData.get('ship_to_ntn') as string;
    const ship_to_phone = formData.get('ship_to_phone') as string;
    const ship_to_email = formData.get('ship_to_email') as string;
    const payment_terms = formData.get('payment_terms') as string;
    const shipped_via = formData.get('shipped_via') as string;
    const coo = formData.get('coo') as string;
    const port_loading = formData.get('port_loading') as string;
    const port_discharge = formData.get('port_discharge') as string;
    const shipping_terms = formData.get('shipping_terms') as string;

    if (!invoice_no?.trim() || !bill_to_name?.trim() || !ship_to_name?.trim()) {
      return { error: 'Invoice No., Bill To Name, and Ship To Name are required' };
    }

    // Parse products from formData
    const products: Array<{
      product_name: string;
      hs_code: string;
      no_of_cartons: number;
      weight: number;
      net_weight: number;
    }> = [];

    // Check for new format (products array)
    let index = 0;
    while (formData.get(`products[${index}][product_name]`)) {
      const product_name = formData.get(`products[${index}][product_name]`) as string;
      const hs_code = formData.get(`products[${index}][hs_code]`) as string;
      const no_of_cartons = parseInt(formData.get(`products[${index}][no_of_cartons]`) as string, 10);
      const weight = parseFloat(formData.get(`products[${index}][weight]`) as string);
      const net_weight = parseFloat(formData.get(`products[${index}][net_weight]`) as string);

      if (!product_name?.trim() || !hs_code?.trim()) {
        return { error: `Product ${index + 1}: Product Name and HS Code are required` };
      }

      if (no_of_cartons < 0 || weight < 0 || net_weight < 0) {
        return { error: `Product ${index + 1}: Cartons, weight, and net weight must be non-negative numbers` };
      }

      products.push({
        product_name: product_name.trim(),
        hs_code: hs_code.trim(),
        no_of_cartons,
        weight,
        net_weight,
      });
      index++;
    }

    // Fallback to old format for backward compatibility
    if (products.length === 0) {
      const product_name = formData.get('product_name') as string;
      const hs_code = formData.get('hs_code') as string;
      const no_of_cartons = formData.get('no_of_cartons') ? parseInt(formData.get('no_of_cartons') as string, 10) : 0;
      const weight = formData.get('weight') ? parseFloat(formData.get('weight') as string) : 0;
      const net_weight = formData.get('net_weight') ? parseFloat(formData.get('net_weight') as string) : 0;

      if (!product_name?.trim() || !hs_code?.trim()) {
        return { error: 'Product Name and HS Code are required' };
      }

      if (no_of_cartons < 0 || weight < 0 || net_weight < 0) {
        return { error: 'Cartons, weight, and net weight must be non-negative numbers' };
      }

      products.push({
        product_name: product_name.trim(),
        hs_code: hs_code.trim(),
        no_of_cartons,
        weight,
        net_weight,
      });
    }

    if (products.length === 0) {
      return { error: 'At least one product is required' };
    }

    const supabase = await createAdminClient();

    // Calculate totals for backward compatibility
    const totalCartons = products.reduce((sum, p) => sum + p.no_of_cartons, 0);
    const totalWeight = products.reduce((sum, p) => sum + p.weight, 0);
    const totalNetWeight = products.reduce((sum, p) => sum + p.net_weight, 0);

    // Create packing list
    const { data: packingListData, error: packingListError } = await supabase
      .from('packing_lists')
      .insert([{
        invoice_no: invoice_no.trim(),
        bill_to_name: bill_to_name.trim(),
        bill_to_address: bill_to_address?.trim() || null,
        bill_to_ntn: bill_to_ntn?.trim() || null,
        bill_to_phone: bill_to_phone?.trim() || null,
        bill_to_email: bill_to_email?.trim() || null,
        ship_to_name: ship_to_name.trim(),
        ship_to_address: ship_to_address?.trim() || null,
        ship_to_ntn: ship_to_ntn?.trim() || null,
        ship_to_phone: ship_to_phone?.trim() || null,
        ship_to_email: ship_to_email?.trim() || null,
        payment_terms: payment_terms?.trim() || null,
        shipped_via: shipped_via?.trim() || null,
        coo: coo?.trim() || null,
        port_loading: port_loading?.trim() || null,
        port_discharge: port_discharge?.trim() || null,
        shipping_terms: shipping_terms?.trim() || null,
        // Keep backward compatibility - use first product or totals
        product_name: products[0]?.product_name || null,
        hs_code: products[0]?.hs_code || null,
        no_of_cartons: totalCartons,
        weight: totalWeight,
        net_weight: totalNetWeight,
        build_to: bill_to_name.trim(),
        ship_to: ship_to_name.trim(),
      }])
      .select()
      .single();

    if (packingListError) {
      return { error: packingListError.message || 'Failed to create packing list' };
    }

    // Create packing list items
    const items = products.map((product, idx) => ({
      packing_list_id: packingListData.id,
      product_name: product.product_name,
      hs_code: product.hs_code,
      no_of_cartons: product.no_of_cartons,
      weight: product.weight,
      net_weight: product.net_weight,
      item_order: idx,
    }));

    const { error: itemsError } = await supabase
      .from('packing_list_items')
      .insert(items);

    if (itemsError) {
      // Rollback packing list if items insertion fails
      await supabase.from('packing_lists').delete().eq('id', packingListData.id);
      return { error: itemsError.message || 'Failed to create packing list items' };
    }

    // Fetch complete packing list with items
    const { data: completePackingList, error: fetchError } = await supabase
      .from('packing_lists')
      .select(`
        *,
        items:packing_list_items(*)
      `)
      .eq('id', packingListData.id)
      .single();

    if (fetchError) {
      return { error: fetchError.message || 'Failed to fetch packing list' };
    }

    revalidatePath('/admin/dashboard');
    return { success: true, packingList: completePackingList as PackingList };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred while creating packing list' };
  }
}

export async function getAllPackingLists() {
  try {
    const session = await getSession();
    if (!session) {
      return { error: 'Unauthorized' };
    }

    // Allow admins or sales agents with "import-packing-list" permission
    if (session.role === 'admin') {
      // Admin has access
    } else if (session.role === 'sales_agent') {
      const { hasPermission } = await import('@/lib/auth/permissions');
      const hasAccess = await hasPermission('import-packing-list');
      if (!hasAccess) {
        return { error: 'Unauthorized' };
      }
    } else {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('packing_lists')
      .select(`
        *,
        items:packing_list_items(*)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      return { error: error.message || 'Failed to fetch packing lists' };
    }

    return { packingLists: (data || []) as PackingList[] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred while fetching packing lists' };
  }
}

export async function deletePackingList(id: string) {
  try {
    const session = await getSession();
    if (!session) {
      return { error: 'Unauthorized' };
    }

    // Allow admins or sales agents with "import-packing-list" permission
    if (session.role === 'admin') {
      // Admin has access
    } else if (session.role === 'sales_agent') {
      const { hasPermission } = await import('@/lib/auth/permissions');
      const hasAccess = await hasPermission('import-packing-list');
      if (!hasAccess) {
        return { error: 'Unauthorized' };
      }
    } else {
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
