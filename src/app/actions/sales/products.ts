'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { sessionHasSalesAccess } from '@/lib/auth/require-access';
import { uploadToInquiryImagesBucket } from '@/lib/inquiry-storage';

export type SalesProduct = {
  id: string;
  organization_id: string | null;
  name: string;
  default_code: string | null;
  category_id: string | null;
  category_name?: string | null;
  uom_id: string | null;
  uom: string;
  list_price: number;
  standard_price: number;
  description: string | null;
  description_sale: string | null;
  image_url: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type SalesProductCategory = {
  id: string;
  organization_id: string | null;
  parent_id: string | null;
  name: string;
  sequence: number;
  active: boolean;
};

export type SalesProductUom = {
  id: string;
  organization_id: string | null;
  name: string;
  code: string;
  active: boolean;
};

export type SalesProductListFilters = {
  search?: string;
  active?: 'all' | 'active' | 'archived';
  categoryId?: string | null;
  page?: number;
  pageSize?: number;
  sortBy?: 'name' | 'list_price' | 'default_code' | 'updated_at';
  sortDir?: 'asc' | 'desc';
};

async function resolveSalesOrgScope() {
  const { requireAdminOrganizationScope, sessionUsesOrganizationScope } = await import(
    '@/lib/admin-organization-context'
  );
  const session = await getSession();
  if (!session || !sessionHasSalesAccess(session)) {
    return { error: 'Unauthorized' as const };
  }

  if (!sessionUsesOrganizationScope(session.role)) {
    return { session, organizationId: null as string | null, isGlobalAdminView: false };
  }

  const scope = await requireAdminOrganizationScope();
  if ('error' in scope) {
    if (scope.status === 403) {
      return {
        session,
        organizationId: null as string | null,
        isGlobalAdminView: false,
        empty: true as const,
      };
    }
    return { error: scope.error };
  }

  const { isSuperAdminInAdminContext } = await import('@/lib/auth/super-admin');
  if (!scope.organizationId && isSuperAdminInAdminContext(scope.session)) {
    return { session: scope.session, organizationId: null, isGlobalAdminView: true };
  }

  if (!scope.organizationId) {
    return { error: 'Select an organization from the header switcher to use Sales.' };
  }

  return {
    session: scope.session,
    organizationId: scope.organizationId,
    isGlobalAdminView: false,
  };
}

function mapProduct(
  row: Record<string, unknown>,
  categoryName?: string | null
): SalesProduct {
  return {
    id: String(row.id),
    organization_id: row.organization_id ? String(row.organization_id) : null,
    name: String(row.name || ''),
    default_code: row.default_code ? String(row.default_code) : null,
    category_id: row.category_id ? String(row.category_id) : null,
    category_name: categoryName ?? null,
    uom_id: row.uom_id ? String(row.uom_id) : null,
    uom: String(row.uom || 'Units'),
    list_price: Number(row.list_price) || 0,
    standard_price: Number(row.standard_price) || 0,
    description: row.description ? String(row.description) : null,
    description_sale: row.description_sale ? String(row.description_sale) : null,
    image_url: row.image_url ? String(row.image_url) : null,
    active: row.active !== false,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

export async function getSalesProducts(filters: SalesProductListFilters = {}) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return { products: [] as SalesProduct[], total: 0, page: 1, pageSize: 40 };
    }

    const supabase = await createAdminClient();
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(100, Math.max(10, filters.pageSize || 40));
    const sortBy = filters.sortBy || 'name';
    const ascending = (filters.sortDir || 'asc') === 'asc';

    let query = supabase.from('products').select('*', { count: 'exact' });

    if (scope.organizationId && !scope.isGlobalAdminView) {
      query = query.or(
        `organization_id.eq.${scope.organizationId},organization_id.is.null`
      );
    }

    const activeFilter = filters.active || 'active';
    if (activeFilter === 'active') query = query.eq('active', true);
    if (activeFilter === 'archived') query = query.eq('active', false);

    if (filters.categoryId) query = query.eq('category_id', filters.categoryId);

    const needle = String(filters.search || '').trim();
    if (needle) {
      const like = `%${needle}%`;
      query = query.or(
        `name.ilike.${like},default_code.ilike.${like},description.ilike.${like},description_sale.ilike.${like}`
      );
    }

    query = query.order(sortBy, { ascending }).range((page - 1) * pageSize, page * pageSize - 1);

    const { data, error, count } = await query;
    if (error) {
      if (/relation|does not exist|schema cache/i.test(error.message)) {
        return {
          products: [] as SalesProduct[],
          total: 0,
          page,
          pageSize,
          error: 'Products table not found. Run sales_products_and_pdf_phase5_6.sql',
        };
      }
      return { error: error.message };
    }

    const rows = data || [];
    const catIds = [
      ...new Set(rows.map((r) => (r.category_id ? String(r.category_id) : '')).filter(Boolean)),
    ];
    const catMap = new Map<string, string>();
    if (catIds.length) {
      const { data: cats } = await supabase
        .from('product_categories')
        .select('id, name')
        .in('id', catIds);
      for (const c of cats || []) catMap.set(String(c.id), String(c.name));
    }

    return {
      products: rows.map((r) =>
        mapProduct(r as Record<string, unknown>, catMap.get(String(r.category_id || '')) || null)
      ),
      total: count ?? rows.length,
      page,
      pageSize,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load products' };
  }
}

/** Active products for quotation product picker. */
export async function searchSalesProductsForQuotation(query: string, limit = 20) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    let q = supabase
      .from('products')
      .select('id, name, default_code, uom, list_price, description_sale, description, image_url, active')
      .eq('active', true)
      .order('name', { ascending: true })
      .limit(Math.min(50, Math.max(5, limit)));

    if (scope.organizationId && !scope.isGlobalAdminView) {
      q = q.or(`organization_id.eq.${scope.organizationId},organization_id.is.null`);
    }

    const needle = String(query || '').trim();
    if (needle) {
      const like = `%${needle}%`;
      q = q.or(`name.ilike.${like},default_code.ilike.${like}`);
    }

    const { data, error } = await q;
    if (error) {
      if (/relation|does not exist/i.test(error.message)) return { products: [] as SalesProduct[] };
      return { error: error.message };
    }

    return {
      products: (data || []).map((r) => mapProduct(r as Record<string, unknown>)),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to search products' };
  }
}

export async function getSalesProductById(id: string) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
    if (error || !data) return { error: error?.message || 'Product not found' };

    let category_name: string | null = null;
    if (data.category_id) {
      const { data: cat } = await supabase
        .from('product_categories')
        .select('name')
        .eq('id', data.category_id)
        .maybeSingle();
      category_name = cat?.name ? String(cat.name) : null;
    }

    return { product: mapProduct(data as Record<string, unknown>, category_name) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load product' };
  }
}

export type SalesProductUpsertInput = {
  name: string;
  default_code?: string | null;
  category_id?: string | null;
  uom_id?: string | null;
  uom?: string;
  list_price?: number;
  standard_price?: number;
  description?: string | null;
  description_sale?: string | null;
  image_url?: string | null;
  active?: boolean;
};

export async function createSalesProduct(input: SalesProductUpsertInput) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (scope.isGlobalAdminView || !scope.organizationId) {
      return { error: 'Select a specific organization to create products' };
    }

    const name = String(input.name || '').trim();
    if (!name) return { error: 'Product name is required' };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('products')
      .insert([
        {
          organization_id: scope.organizationId,
          name,
          default_code: input.default_code?.trim() || null,
          category_id: input.category_id || null,
          uom_id: input.uom_id || null,
          uom: input.uom || 'Units',
          list_price: Number(input.list_price) || 0,
          standard_price: Number(input.standard_price) || 0,
          description: input.description || null,
          description_sale: input.description_sale || null,
          image_url: input.image_url || null,
          active: input.active !== false,
          created_by: scope.session!.username,
        },
      ])
      .select('*')
      .single();

    if (error || !data) return { error: error?.message || 'Failed to create product' };
    return { product: mapProduct(data as Record<string, unknown>) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create product' };
  }
}

export async function updateSalesProduct(id: string, input: SalesProductUpsertInput) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const name = String(input.name || '').trim();
    if (!name) return { error: 'Product name is required' };

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('products')
      .update({
        name,
        default_code: input.default_code?.trim() || null,
        category_id: input.category_id || null,
        uom_id: input.uom_id || null,
        uom: input.uom || 'Units',
        list_price: Number(input.list_price) || 0,
        standard_price: Number(input.standard_price) || 0,
        description: input.description || null,
        description_sale: input.description_sale || null,
        image_url: input.image_url ?? undefined,
        active: input.active !== false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) return { error: error?.message || 'Failed to update product' };
    return { product: mapProduct(data as Record<string, unknown>) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update product' };
  }
}

export async function setSalesProductActive(id: string, active: boolean) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('products')
      .update({ active, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) return { error: error?.message || 'Failed to update product' };
    return { product: mapProduct(data as Record<string, unknown>) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to archive product' };
  }
}

export async function uploadSalesProductImage(productId: string, formData: FormData) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const file = formData.get('file');
    if (!(file instanceof File)) return { error: 'Image file is required' };

    const supabase = await createAdminClient();
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `products/${scope.organizationId || 'shared'}/${productId || 'new'}_${Date.now()}.${ext}`;
    const uploaded = await uploadToInquiryImagesBucket(supabase, path, file);
    if ('error' in uploaded) return { error: uploaded.error };

    if (productId) {
      await supabase
        .from('products')
        .update({ image_url: uploaded.url, updated_at: new Date().toISOString() })
        .eq('id', productId);
    }

    return { url: uploaded.url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to upload image' };
  }
}

export async function getSalesProductCategories() {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    let query = supabase
      .from('product_categories')
      .select('*')
      .eq('active', true)
      .order('sequence', { ascending: true })
      .order('name', { ascending: true });

    if (scope.organizationId && !scope.isGlobalAdminView) {
      query = query.or(
        `organization_id.eq.${scope.organizationId},organization_id.is.null`
      );
    }

    const { data, error } = await query;
    if (error) {
      if (/relation|does not exist/i.test(error.message)) {
        return { categories: [] as SalesProductCategory[] };
      }
      return { error: error.message };
    }

    return {
      categories: (data || []).map((c) => ({
        id: String(c.id),
        organization_id: c.organization_id ? String(c.organization_id) : null,
        parent_id: c.parent_id ? String(c.parent_id) : null,
        name: String(c.name || ''),
        sequence: Number(c.sequence) || 10,
        active: c.active !== false,
      })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load categories' };
  }
}

export async function upsertSalesProductCategory(input: {
  id?: string | null;
  name: string;
  parent_id?: string | null;
}) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if (scope.isGlobalAdminView || !scope.organizationId) {
      return { error: 'Select a specific organization to manage categories' };
    }

    const name = String(input.name || '').trim();
    if (!name) return { error: 'Category name is required' };

    const supabase = await createAdminClient();
    if (input.id) {
      const { data, error } = await supabase
        .from('product_categories')
        .update({
          name,
          parent_id: input.parent_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id)
        .select('*')
        .single();
      if (error || !data) return { error: error?.message || 'Failed to update category' };
      return {
        category: {
          id: String(data.id),
          organization_id: data.organization_id ? String(data.organization_id) : null,
          parent_id: data.parent_id ? String(data.parent_id) : null,
          name: String(data.name),
          sequence: Number(data.sequence) || 10,
          active: data.active !== false,
        } as SalesProductCategory,
      };
    }

    const { data, error } = await supabase
      .from('product_categories')
      .insert([
        {
          organization_id: scope.organizationId,
          name,
          parent_id: input.parent_id || null,
        },
      ])
      .select('*')
      .single();
    if (error || !data) return { error: error?.message || 'Failed to create category' };
    return {
      category: {
        id: String(data.id),
        organization_id: data.organization_id ? String(data.organization_id) : null,
        parent_id: data.parent_id ? String(data.parent_id) : null,
        name: String(data.name),
        sequence: Number(data.sequence) || 10,
        active: data.active !== false,
      } as SalesProductCategory,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to save category' };
  }
}

export async function deleteSalesProductCategory(id: string) {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    const supabase = await createAdminClient();
    const { error } = await supabase.from('product_categories').delete().eq('id', id);
    if (error) return { error: error.message };
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to delete category' };
  }
}

export async function getSalesProductUoms() {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const supabase = await createAdminClient();
    let query = supabase
      .from('product_uoms')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true });

    if (scope.organizationId && !scope.isGlobalAdminView) {
      query = query.or(
        `organization_id.eq.${scope.organizationId},organization_id.is.null`
      );
    }

    const { data, error } = await query;
    if (error) {
      if (/relation|does not exist/i.test(error.message)) {
        return {
          uoms: [
            { id: 'u-units', organization_id: null, name: 'Units', code: 'Units', active: true },
            { id: 'u-piece', organization_id: null, name: 'Piece', code: 'Piece', active: true },
            { id: 'u-kg', organization_id: null, name: 'Kg', code: 'Kg', active: true },
            { id: 'u-box', organization_id: null, name: 'Box', code: 'Box', active: true },
            { id: 'u-hour', organization_id: null, name: 'Hour', code: 'Hour', active: true },
          ] as SalesProductUom[],
        };
      }
      return { error: error.message };
    }

    return {
      uoms: (data || []).map((u) => ({
        id: String(u.id),
        organization_id: u.organization_id ? String(u.organization_id) : null,
        name: String(u.name || ''),
        code: String(u.code || u.name || ''),
        active: u.active !== false,
      })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load UOMs' };
  }
}
