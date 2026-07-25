'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { isSuperAdminSession } from '@/lib/auth/super-admin';
import { verifyPassword } from '@/lib/auth/password';
import { revalidatePath } from 'next/cache';
import {
  resolveInquiryAttachmentContentType,
  uploadToInquiryImagesBucket,
} from '@/lib/inquiry-storage';

export type OrganizationBranch = {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
};

export type Organization = {
  id: string;
  organization_name: string;
  email: string;
  phone: string;
  address: string;
  street: string;
  street_2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  website: string;
  logo_url: string | null;
  branches: OrganizationBranch[];
  description: string | null;
  username: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
};

const ORGANIZATION_SELECT =
  'id, organization_name, email, phone, address, street, street_2, city, state, zip, country, website, logo_url, branches, description, username, status, created_at, updated_at';

const ORGANIZATION_SELECT_BASIC =
  'id, organization_name, email, phone, address, city, country, description, username, status, created_at, updated_at';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isMissingOrganizationsTable(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  const msg = (error.message || '').toLowerCase();
  // Missing table — do NOT match "column X of relation organizations does not exist"
  return (
    (msg.includes('relation') && msg.includes('organizations') && msg.includes('does not exist')) ||
    (msg.includes("could not find the table") && msg.includes('organizations'))
  );
}

function isMissingOrganizationsColumn(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  const msg = (error.message || '').toLowerCase();
  return (
    (msg.includes('column') && msg.includes('does not exist')) ||
    (msg.includes('could not find the') && msg.includes('column'))
  );
}

function organizationSchemaMigrationHint() {
  return 'Organizations schema is incomplete. Please run supabase/migrations/ensure_organizations_company_schema.sql in the Supabase SQL Editor.';
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function parseBranchesInput(raw: string): OrganizationBranch[] {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const name = String(row.name || '').trim();
        if (!name) return null;
        return {
          name,
          street: String(row.street || '').trim(),
          city: String(row.city || '').trim(),
          state: String(row.state || '').trim(),
          zip: String(row.zip || '').trim(),
          country: String(row.country || '').trim(),
          phone: String(row.phone || '').trim(),
        };
      })
      .filter((item): item is OrganizationBranch => Boolean(item));
  } catch {
    return [];
  }
}

function normalizeOrganizationRow(row: Record<string, unknown>): Organization {
  return {
    ...(row as Organization),
    street: String(row.street || row.address || ''),
    street_2: String(row.street_2 || ''),
    state: String(row.state || ''),
    zip: String(row.zip || ''),
    website: String(row.website || ''),
    logo_url: typeof row.logo_url === 'string' ? row.logo_url : null,
    username: row.username == null || row.username === '' ? null : String(row.username),
    branches: parseBranchesInput(JSON.stringify(row.branches || [])),
  };
}

async function uploadOrganizationLogo(file: File) {
  const supabase = await createAdminClient();
  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png';
  const filePath = `organizations/logo_${Date.now()}.${fileExt}`;
  const contentType = resolveInquiryAttachmentContentType(file);
  const upload = await uploadToInquiryImagesBucket(supabase, filePath, file, contentType);
  if ('error' in upload) {
    return { error: upload.error };
  }
  return { url: upload.url };
}

function buildAddressSummary(input: {
  street: string;
  street_2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}) {
  return [input.street, input.street_2, input.city, input.state, input.zip, input.country]
    .filter(Boolean)
    .join(', ');
}

async function readOrganizationForm(formData: FormData) {
  const organizationName = String(formData.get('organization_name') || '').trim();
  const email = String(formData.get('email') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const street = String(formData.get('street') || '').trim();
  const street_2 = String(formData.get('street_2') || '').trim();
  const city = String(formData.get('city') || '').trim();
  const state = String(formData.get('state') || '').trim();
  const zip = String(formData.get('zip') || '').trim();
  const country = String(formData.get('country') || '').trim();
  const website = String(formData.get('website') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const status = String(formData.get('status') || 'active').trim() as 'active' | 'inactive';
  const branches = parseBranchesInput(String(formData.get('branches_json') || '[]'));
  const existingLogoUrl = String(formData.get('existing_logo_url') || '').trim();
  const logoFile = formData.get('logo_file');

  let logo_url = existingLogoUrl || null;
  if (logoFile instanceof File && logoFile.size > 0) {
    const upload = await uploadOrganizationLogo(logoFile);
    if ('error' in upload) {
      return { error: upload.error };
    }
    logo_url = upload.url;
  }

  return {
    organizationName,
    email,
    phone,
    street,
    street_2,
    city,
    state,
    zip,
    country,
    website,
    description,
    status,
    branches,
    logo_url,
    address: buildAddressSummary({ street, street_2, city, state, zip, country }),
  };
}

async function isEmailTaken(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  email: string,
  excludeOrganizationId?: string
) {
  const normalized = normalizeEmail(email);
  let query = supabase.from('organizations').select('id').ilike('email', normalized);
  if (excludeOrganizationId) {
    query = query.neq('id', excludeOrganizationId);
  }
  const { data } = await query.maybeSingle();
  if (data) return 'Email already exists for another organization';
  return null;
}

export async function createOrganization(formData: FormData) {
  try {
    const session = await getSession();
    if (!session || !isSuperAdminSession(session)) {
      return { error: 'Unauthorized' };
    }

    const parsed = await readOrganizationForm(formData);
    if ('error' in parsed) return { error: parsed.error };

    const {
      organizationName,
      email,
      phone,
      street,
      street_2,
      city,
      state,
      zip,
      country,
      website,
      description,
      status,
      branches,
      logo_url,
      address,
    } = parsed;

    if (!organizationName || !email || !phone) {
      return { error: 'Company name, email, and phone are required' };
    }

    if (!EMAIL_PATTERN.test(email)) {
      return { error: 'Please enter a valid email address' };
    }

    const supabase = await createAdminClient();

    const emailError = await isEmailTaken(supabase, email);
    if (emailError) return { error: emailError };

    const fullPayload = {
      organization_name: organizationName,
      email,
      phone,
      address,
      street,
      street_2,
      city,
      state,
      zip,
      country,
      website,
      logo_url,
      branches,
      description: description || null,
      username: null as string | null,
      password: null as string | null,
      status: (status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive',
    };

    let { data, error } = await supabase
      .from('organizations')
      .insert([fullPayload])
      .select(ORGANIZATION_SELECT)
      .single();

    // Older DBs: username/password still NOT NULL — retry with placeholder login fields
    if (
      error &&
      error.message.includes('null value') &&
      (error.message.includes('username') || error.message.includes('password'))
    ) {
      const placeholderUser = `org_${Date.now().toString(36)}`;
      const retry = await supabase
        .from('organizations')
        .insert([
          {
            ...fullPayload,
            username: placeholderUser,
            password: placeholderUser,
          },
        ])
        .select(ORGANIZATION_SELECT)
        .single();
      data = retry.data;
      error = retry.error;
    }

    // Older DBs: profile columns missing — retry with core company fields only
    if (error && isMissingOrganizationsColumn(error)) {
      const basicRetry = await supabase
        .from('organizations')
        .insert([
          {
            organization_name: organizationName,
            email,
            phone,
            address,
            city,
            country,
            description: description || null,
            username: null,
            password: null,
            status: status === 'inactive' ? 'inactive' : 'active',
          },
        ])
        .select(ORGANIZATION_SELECT_BASIC)
        .single();

      if (
        basicRetry.error &&
        basicRetry.error.message.includes('null value') &&
        (basicRetry.error.message.includes('username') ||
          basicRetry.error.message.includes('password'))
      ) {
        const placeholderUser = `org_${Date.now().toString(36)}`;
        const lastRetry = await supabase
          .from('organizations')
          .insert([
            {
              organization_name: organizationName,
              email,
              phone,
              address,
              city,
              country,
              description: description || null,
              username: placeholderUser,
              password: placeholderUser,
              status: status === 'inactive' ? 'inactive' : 'active',
            },
          ])
          .select(ORGANIZATION_SELECT_BASIC)
          .single();
        data = lastRetry.data;
        error = lastRetry.error;
      } else {
        data = basicRetry.data;
        error = basicRetry.error;
      }
    }

    if (error) {
      if (isMissingOrganizationsTable(error)) {
        return {
          error:
            'Organizations table does not exist. Please run supabase/migrations/ensure_organizations_company_schema.sql in Supabase.',
        };
      }
      if (isMissingOrganizationsColumn(error)) {
        return { error: organizationSchemaMigrationHint() };
      }
      if (error.code === '23505') {
        return { error: 'Email already exists' };
      }
      return { error: error.message };
    }

    revalidatePath('/admin/dashboard');
    return { success: true, organization: normalizeOrganizationRow(data as Record<string, unknown>) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getAllOrganizations() {
  try {
    const session = await getSession();
    if (!session || !isSuperAdminSession(session)) {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();
    let { data, error } = await supabase
      .from('organizations')
      .select(ORGANIZATION_SELECT)
      .order('created_at', { ascending: false });

    if (error && isMissingOrganizationsColumn(error)) {
      const fallback = await supabase
        .from('organizations')
        .select(ORGANIZATION_SELECT_BASIC)
        .order('created_at', { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      if (isMissingOrganizationsTable(error)) {
        return { organizations: [] };
      }
      return { error: error.message };
    }

    return { organizations: (data || []).map((row) => normalizeOrganizationRow(row as Record<string, unknown>)) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function updateOrganization(formData: FormData) {
  try {
    const session = await getSession();
    if (!session || !isSuperAdminSession(session)) {
      return { error: 'Unauthorized' };
    }

    const id = String(formData.get('id') || '').trim();
    if (!id) return { error: 'Organization id is required' };

    const parsed = await readOrganizationForm(formData);
    if ('error' in parsed) return { error: parsed.error };

    const {
      organizationName,
      email,
      phone,
      street,
      street_2,
      city,
      state,
      zip,
      country,
      website,
      description,
      status,
      branches,
      logo_url,
      address,
    } = parsed;

    if (!organizationName || !email || !phone) {
      return { error: 'Company name, email, and phone are required' };
    }

    if (!EMAIL_PATTERN.test(email)) {
      return { error: 'Please enter a valid email address' };
    }

    const supabase = await createAdminClient();

    const emailError = await isEmailTaken(supabase, email, id);
    if (emailError) return { error: emailError };

    const updatePayload: Record<string, unknown> = {
      organization_name: organizationName,
      email,
      phone,
      address,
      street,
      street_2,
      city,
      state,
      zip,
      country,
      website,
      logo_url,
      branches,
      description: description || null,
      status: status === 'inactive' ? 'inactive' : 'active',
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('organizations')
      .update(updatePayload)
      .eq('id', id)
      .select(ORGANIZATION_SELECT)
      .single();

    if (error) {
      if (isMissingOrganizationsTable(error)) {
        return {
          error:
            'Organizations table does not exist. Please run supabase/migrations/ensure_organizations_company_schema.sql in Supabase.',
        };
      }
      if (isMissingOrganizationsColumn(error)) {
        return { error: organizationSchemaMigrationHint() };
      }
      return { error: error.message };
    }

    revalidatePath('/admin/dashboard');
    return { success: true, organization: normalizeOrganizationRow(data as Record<string, unknown>) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function deleteOrganization(formData: FormData) {
  try {
    const session = await getSession();
    if (!session || !isSuperAdminSession(session)) {
      return { error: 'Unauthorized' };
    }

    const id = String(formData.get('id') || '').trim();
    if (!id) {
      return { error: 'Organization id is required' };
    }

    const supabase = await createAdminClient();
    const { error } = await supabase.from('organizations').delete().eq('id', id);
    if (error) return { error: error.message };

    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function getOrganizationProfile() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'organization') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('organizations')
      .select(ORGANIZATION_SELECT)
      .eq('username', session.username)
      .maybeSingle();

    if (error) return { error: error.message };
    if (!data) return { error: 'Organization not found' };

    return { organization: normalizeOrganizationRow(data as Record<string, unknown>) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function authenticateOrganization(username: string, password: string) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('organizations')
    .select('username, password, organization_name, status')
    .eq('username', username)
    .maybeSingle();

  if (error) {
    if (error.message.includes('does not exist') || error.message.includes('relation')) {
      return null;
    }
    throw new Error(error.message);
  }

  if (!data || !data.password || !data.username) {
    return null;
  }

  if (!verifyPassword(password, data.password)) {
    return null;
  }

  if (data.status === 'inactive') {
    return { inactive: true as const };
  }

  return {
    username: data.username as string,
    organizationName: data.organization_name as string,
  };
}
