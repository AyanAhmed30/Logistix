'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
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
  username: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
};

const ORGANIZATION_SELECT =
  'id, organization_name, email, phone, address, street, street_2, city, state, zip, country, website, logo_url, branches, description, username, status, created_at, updated_at';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '').trim();
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
    username,
    password,
    status,
    branches,
    logo_url,
    address: buildAddressSummary({ street, street_2, city, state, zip, country }),
  };
}

async function isUsernameTaken(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  username: string,
  excludeOrganizationId?: string
) {
  const trimmed = username.trim();

  let orgQuery = supabase.from('organizations').select('id').eq('username', trimmed);
  if (excludeOrganizationId) {
    orgQuery = orgQuery.neq('id', excludeOrganizationId);
  }
  const { data: existingOrg } = await orgQuery.maybeSingle();
  if (existingOrg) return 'Username already exists for an organization';

  const [{ data: existingOps }, { data: existingSales }, { data: existingApp }] = await Promise.all([
    supabase.from('operations_users').select('id').eq('username', trimmed).maybeSingle(),
    supabase.from('sales_agents').select('id').eq('username', trimmed).maybeSingle(),
    supabase.from('app_users').select('id').eq('username', trimmed).maybeSingle(),
  ]);

  if (existingOps) return 'Username already exists (used by an Operations user)';
  if (existingSales) return 'Username already exists (used by a Sales Agent)';
  if (existingApp) return 'Username already exists (used by another user)';

  return null;
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
    if (!session || session.role !== 'admin') {
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
      username,
      password,
      status,
      branches,
      logo_url,
      address,
    } = parsed;

    if (!organizationName || !email || !phone || !username || !password) {
      return { error: 'Company name, email, phone, username, and password are required' };
    }

    if (!EMAIL_PATTERN.test(email)) {
      return { error: 'Please enter a valid email address' };
    }

    if (password.length < 6) {
      return { error: 'Password must be at least 6 characters' };
    }

    const supabase = await createAdminClient();

    const usernameError = await isUsernameTaken(supabase, username);
    if (usernameError) return { error: usernameError };

    const emailError = await isEmailTaken(supabase, email);
    if (emailError) return { error: emailError };

    const { data, error } = await supabase
      .from('organizations')
      .insert([
        {
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
          username,
          password: hashPassword(password),
          status: status === 'inactive' ? 'inactive' : 'active',
        },
      ])
      .select(ORGANIZATION_SELECT)
      .single();

    if (error) {
      if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
        return { error: 'Organizations table does not exist. Please run the SQL migration in Supabase.' };
      }
      if (error.code === '23505') {
        return { error: 'Username or email already exists' };
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
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('organizations')
      .select(ORGANIZATION_SELECT)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === '42P01') {
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
    if (!session || session.role !== 'admin') {
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
      username,
      password,
      status,
      branches,
      logo_url,
      address,
    } = parsed;

    if (!organizationName || !email || !phone || !username) {
      return { error: 'Company name, email, phone, and username are required' };
    }

    if (!EMAIL_PATTERN.test(email)) {
      return { error: 'Please enter a valid email address' };
    }

    if (password && password.length < 6) {
      return { error: 'Password must be at least 6 characters' };
    }

    const supabase = await createAdminClient();

    const usernameError = await isUsernameTaken(supabase, username, id);
    if (usernameError) return { error: usernameError };

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
      username,
      status: status === 'inactive' ? 'inactive' : 'active',
      updated_at: new Date().toISOString(),
    };

    if (password) {
      updatePayload.password = hashPassword(password);
    }

    const { data, error } = await supabase
      .from('organizations')
      .update(updatePayload)
      .eq('id', id)
      .select(ORGANIZATION_SELECT)
      .single();

    if (error) return { error: error.message };

    revalidatePath('/admin/dashboard');
    return { success: true, organization: normalizeOrganizationRow(data as Record<string, unknown>) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

export async function deleteOrganization(formData: FormData) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
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

  if (!data || !verifyPassword(password, data.password)) {
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
