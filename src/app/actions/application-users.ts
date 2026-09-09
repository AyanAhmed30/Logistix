'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

export type ApplicationUserListItem = {
  /** CRM contact id when linked; null for legacy mobile accounts without a contact yet. */
  contactId: string | null;
  userId: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  salespersonId: string | null;
  salespersonName: string | null;
  source: string | null;
  mobileRegisteredAt: string | null;
  createdAt: string | null;
};

export type ApplicationUserDetail = ApplicationUserListItem & {
  mobile: string | null;
  leadIdFormatted: string | null;
  organizationId: string | null;
  createdBy: string | null;
};

export type SalesAgentUserCount = {
  salesAgentId: string;
  name: string;
  userCount: number;
};

type MobileUserRow = {
  id: string;
  phone: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: string | null;
};

type ContactRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  salesperson_id: string | null;
  source: string | null;
  mobile_registered_at: string | null;
  mobile_user_id: string | null;
  created_at: string | null;
  created_by?: string | null;
  lead_id_formatted?: string | null;
  organization_id?: string | null;
};

function requireAdminSession() {
  return getSession().then((session) => {
    if (!session || session.role !== 'admin') {
      return null;
    }
    return session;
  });
}

function phoneDigits(value: string | null | undefined): string {
  return String(value || '').replace(/\D/g, '');
}

function phoneVariants(phone: string | null | undefined): string[] {
  const raw = String(phone || '').trim();
  const d = phoneDigits(raw);
  const variants = new Set<string>();
  if (raw) variants.add(raw);
  if (!d) return [...variants];

  variants.add(d);
  variants.add(`+${d}`);
  if (d.startsWith('92') && d.length >= 11) {
    variants.add(`0${d.slice(2)}`);
    variants.add(`+92${d.slice(2)}`);
  }
  if (d.startsWith('0') && d.length === 11) {
    variants.add(`92${d.slice(1)}`);
    variants.add(`+92${d.slice(1)}`);
  }
  return [...variants];
}

/** Mirrors DB phone_match_key / last-10 matching used by mobile RPCs. */
function phonesLikelyMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = phoneDigits(a);
  const db = phoneDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;

  const key = (d: string) =>
    d.length === 11 && d.startsWith('0') ? `92${d.slice(1)}` : d;
  const ka = key(da);
  const kb = key(db);
  if (ka && kb && ka === kb) return true;

  if (da.length >= 10 && db.length >= 10 && da.slice(-10) === db.slice(-10)) {
    return true;
  }
  return false;
}

function buildItem(
  user: MobileUserRow,
  contact: ContactRow | null,
  agentName: string | null
): ApplicationUserListItem {
  const firstName = user.first_name?.trim() || null;
  const lastName = user.last_name?.trim() || null;
  const name =
    `${firstName || ''} ${lastName || ''}`.trim() ||
    contact?.name?.trim() ||
    user.phone ||
    'Mobile customer';

  return {
    contactId: contact?.id ?? null,
    userId: user.id,
    name,
    firstName,
    lastName,
    phone: user.phone || contact?.phone || contact?.mobile || null,
    email: user.email || contact?.email || null,
    salespersonId: contact?.salesperson_id ?? null,
    salespersonName: contact?.salesperson_id ? agentName : null,
    source: contact?.source ?? (contact ? null : 'mobile_app'),
    mobileRegisteredAt: contact?.mobile_registered_at ?? user.created_at,
    createdAt: user.created_at,
  };
}

async function loadMobileUsersAndContacts() {
  const supabase = await createAdminClient();

  const { data: usersData, error: usersError } = await supabase
    .from('users')
    .select('id, phone, email, first_name, last_name, created_at')
    .order('created_at', { ascending: false })
    .limit(2000);

  if (usersError) {
    return { error: usersError.message as string };
  }

  const users = (usersData || []) as MobileUserRow[];
  if (users.length === 0) {
    return { users: [] as ApplicationUserListItem[], agentMap: new Map<string, string>() };
  }

  const userIds = users.map((u) => u.id);

  // Contacts already linked to mobile accounts + any marked as mobile registrations
  const linkedBatches: ContactRow[] = [];
  const idChunk = 100;
  for (let i = 0; i < userIds.length; i += idChunk) {
    const chunk = userIds.slice(i, i + idChunk);
    const { data: byUserId } = await supabase
      .from('contacts')
      .select(
        'id, name, email, phone, mobile, salesperson_id, source, mobile_registered_at, mobile_user_id, created_at, created_by, lead_id_formatted, organization_id'
      )
      .in('mobile_user_id', chunk)
      .limit(1000);
    if (byUserId?.length) linkedBatches.push(...(byUserId as ContactRow[]));
  }

  const { data: mobileFlagged } = await supabase
    .from('contacts')
    .select(
      'id, name, email, phone, mobile, salesperson_id, source, mobile_registered_at, mobile_user_id, created_at, created_by, lead_id_formatted, organization_id'
    )
    .not('mobile_registered_at', 'is', null)
    .limit(2000);

  let contacts = [
    ...linkedBatches,
    ...((mobileFlagged || []) as ContactRow[]),
  ];

  // Also pull contacts matching user phones (existing CRM customers who later signed up)
  const phones = [
    ...new Set(
      users.flatMap((u) => phoneVariants(u.phone)).filter(Boolean)
    ),
  ];
  if (phones.length > 0) {
    const chunkSize = 80;
    for (let i = 0; i < phones.length; i += chunkSize) {
      const chunk = phones.slice(i, i + chunkSize);
      const [byPhone, byMobile] = await Promise.all([
        supabase
          .from('contacts')
          .select(
            'id, name, email, phone, mobile, salesperson_id, source, mobile_registered_at, mobile_user_id, created_at, created_by, lead_id_formatted, organization_id'
          )
          .in('phone', chunk)
          .limit(1000),
        supabase
          .from('contacts')
          .select(
            'id, name, email, phone, mobile, salesperson_id, source, mobile_registered_at, mobile_user_id, created_at, created_by, lead_id_formatted, organization_id'
          )
          .in('mobile', chunk)
          .limit(1000),
      ]);
      if (byPhone.data?.length) contacts = contacts.concat(byPhone.data as ContactRow[]);
      if (byMobile.data?.length) contacts = contacts.concat(byMobile.data as ContactRow[]);
    }
  }

  // Dedupe contacts by id
  const contactById = new Map<string, ContactRow>();
  for (const c of contacts) {
    if (c?.id) contactById.set(c.id, c);
  }
  const uniqueContacts = [...contactById.values()];

  const agentIds = [
    ...new Set(
      uniqueContacts.map((c) => c.salesperson_id).filter(Boolean) as string[]
    ),
  ];
  const agentMap = new Map<string, string>();
  if (agentIds.length) {
    const { data: agents } = await supabase
      .from('sales_agents')
      .select('id, name')
      .in('id', agentIds);
    for (const a of agents || []) {
      agentMap.set(String(a.id), String(a.name));
    }
  }

  const contactByUserId = new Map<string, ContactRow>();
  for (const c of uniqueContacts) {
    if (c.mobile_user_id) {
      contactByUserId.set(String(c.mobile_user_id), c);
    }
  }

  const items: ApplicationUserListItem[] = users.map((user) => {
    let contact = contactByUserId.get(user.id) || null;

    if (!contact && user.phone) {
      contact =
        uniqueContacts.find(
          (c) =>
            phonesLikelyMatch(c.phone, user.phone) ||
            phonesLikelyMatch(c.mobile, user.phone)
        ) || null;
    }

    const agentName = contact?.salesperson_id
      ? agentMap.get(contact.salesperson_id) || null
      : null;

    return buildItem(user, contact, agentName);
  });

  return { users: items, agentMap };
}

/** All mobile app accounts (public.users), with CRM assignment when a contact exists. */
export async function listApplicationUsers(opts?: {
  salesAgentId?: string | null;
  search?: string | null;
}) {
  try {
    const session = await requireAdminSession();
    if (!session) return { error: 'Unauthorized' as const };

    const loaded = await loadMobileUsersAndContacts();
    if ('error' in loaded && loaded.error) return { error: loaded.error };

    let users = loaded.users || [];
    const salesAgentId = String(opts?.salesAgentId || '').trim();
    const search = String(opts?.search || '').trim().toLowerCase();

    if (salesAgentId && salesAgentId !== 'all') {
      users = users.filter((u) => u.salespersonId === salesAgentId);
    }

    if (search) {
      users = users.filter((u) => {
        const hay =
          `${u.name} ${u.phone || ''} ${u.email || ''} ${u.salespersonName || ''}`.toLowerCase();
        return hay.includes(search);
      });
    }

    return { users };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load application users',
    };
  }
}

export async function getApplicationUserAgentCounts() {
  try {
    const session = await requireAdminSession();
    if (!session) return { error: 'Unauthorized' as const };

    const supabase = await createAdminClient();
    const { data: agents, error: agentsError } = await supabase
      .from('sales_agents')
      .select('id, name')
      .order('name', { ascending: true });

    if (agentsError) return { error: agentsError.message };

    const loaded = await loadMobileUsersAndContacts();
    if ('error' in loaded && loaded.error) return { error: loaded.error };

    const rows = loaded.users || [];
    const counts = new Map<string, number>();
    let unassigned = 0;
    for (const row of rows) {
      const id = row.salespersonId || '';
      if (!id) {
        unassigned += 1;
        continue;
      }
      counts.set(id, (counts.get(id) || 0) + 1);
    }

    const byAgent: SalesAgentUserCount[] = (agents || []).map((a) => ({
      salesAgentId: String(a.id),
      name: String(a.name),
      userCount: counts.get(String(a.id)) || 0,
    }));

    return {
      total: rows.length,
      unassigned,
      byAgent,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load agent counts',
    };
  }
}

export async function getApplicationUserDetail(userId: string) {
  try {
    const session = await requireAdminSession();
    if (!session) return { error: 'Unauthorized' as const };

    const id = String(userId || '').trim();
    if (!id) return { error: 'User id is required.' };

    const supabase = await createAdminClient();
    const { data: user, error } = await supabase
      .from('users')
      .select('id, phone, email, first_name, last_name, created_at')
      .eq('id', id)
      .maybeSingle();

    if (error) return { error: error.message };
    if (!user) return { error: 'Application user not found.' };

    const loaded = await loadMobileUsersAndContacts();
    if ('error' in loaded && loaded.error) return { error: loaded.error };

    const item = (loaded.users || []).find((u) => u.userId === id);
    if (!item) {
      // Fallback if list loader missed this user
      const fallback = buildItem(user as MobileUserRow, null, null);
      return {
        user: {
          ...fallback,
          mobile: null,
          leadIdFormatted: null,
          organizationId: null,
          createdBy: null,
        } satisfies ApplicationUserDetail,
      };
    }

    let contact: ContactRow | null = null;
    if (item.contactId) {
      const { data: c } = await supabase
        .from('contacts')
        .select(
          'id, name, email, phone, mobile, salesperson_id, source, mobile_registered_at, mobile_user_id, created_at, created_by, lead_id_formatted, organization_id'
        )
        .eq('id', item.contactId)
        .maybeSingle();
      contact = (c as ContactRow) || null;
    }

    return {
      user: {
        ...item,
        mobile: contact?.mobile ?? null,
        leadIdFormatted: contact?.lead_id_formatted ?? null,
        organizationId: contact?.organization_id ?? null,
        createdBy: contact?.created_by ?? null,
      } satisfies ApplicationUserDetail,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load application user',
    };
  }
}

/**
 * Admin reassignment — updates contacts.salesperson_id (authoritative ownership).
 * If the mobile user has no contact yet, creates one so assignment can be stored.
 * Does NOT run load balancing.
 */
export async function reassignApplicationUserSalesAgent(input: {
  userId: string;
  contactId?: string | null;
  salesAgentId: string | null;
}) {
  try {
    const session = await requireAdminSession();
    if (!session) return { error: 'Unauthorized' as const };

    const userId = String(input.userId || '').trim();
    if (!userId) return { error: 'User id is required.' };

    const nextAgentId = input.salesAgentId
      ? String(input.salesAgentId).trim()
      : null;

    const supabase = await createAdminClient();

    const { data: mobileUser, error: userErr } = await supabase
      .from('users')
      .select('id, phone, email, first_name, last_name')
      .eq('id', userId)
      .maybeSingle();

    if (userErr || !mobileUser) {
      return { error: userErr?.message || 'Application user not found.' };
    }

    let contactId = String(input.contactId || '').trim() || null;
    let prevAgentId: string | null = null;

    if (contactId) {
      const { data: existing, error: existingErr } = await supabase
        .from('contacts')
        .select('id, salesperson_id, created_by')
        .eq('id', contactId)
        .maybeSingle();
      if (existingErr || !existing) {
        return { error: existingErr?.message || 'Contact not found.' };
      }
      prevAgentId = existing.salesperson_id
        ? String(existing.salesperson_id)
        : null;
    } else {
      // Resolve or create contact for this mobile user
      const { data: byLink } = await supabase
        .from('contacts')
        .select('id, salesperson_id, created_by')
        .eq('mobile_user_id', userId)
        .limit(1)
        .maybeSingle();

      if (byLink?.id) {
        contactId = String(byLink.id);
        prevAgentId = byLink.salesperson_id
          ? String(byLink.salesperson_id)
          : null;
      } else {
        const displayName =
          `${mobileUser.first_name || ''} ${mobileUser.last_name || ''}`.trim() ||
          String(mobileUser.phone || 'Mobile customer');

        const insertPayload: Record<string, unknown> = {
          contact_kind: 'contact',
          company_type: 'person',
          name: displayName,
          email: mobileUser.email,
          phone: mobileUser.phone,
          mobile: mobileUser.phone,
          source: 'mobile_app',
          mobile_registered_at: new Date().toISOString(),
          mobile_user_id: userId,
          customer_rank: 1,
          is_active: true,
        };

        const { data: created, error: createErr } = await supabase
          .from('contacts')
          .insert([insertPayload])
          .select('id, salesperson_id, created_by')
          .single();

        if (createErr || !created) {
          return {
            error:
              createErr?.message ||
              'Unable to create a contact for this mobile user.',
          };
        }
        contactId = String(created.id);
        prevAgentId = null;
      }
    }

    if (prevAgentId === nextAgentId) {
      return { success: true as const, unchanged: true as const, contactId };
    }

    if (!contactId) {
      return { error: 'Contact id is required for reassignment.' };
    }

    // Transfer contact + CRM opportunities to the new agent (no duplicates).
    // Call while contact still has the previous salesperson so ownership sync works.
    if (nextAgentId) {
      const { data: agent, error: agentErr } = await supabase
        .from('sales_agents')
        .select('id')
        .eq('id', nextAgentId)
        .maybeSingle();
      if (agentErr || !agent) {
        return { error: agentErr?.message || 'Sales Agent not found.' };
      }

      const { error: transferError } = await supabase.rpc(
        'transfer_contact_to_sales_agent',
        {
          p_contact_id: contactId,
          p_to_agent_id: nextAgentId,
          p_changed_by: session.username,
        }
      );
      if (transferError) {
        return {
          error:
            transferError.message ||
            'Failed to transfer contact and CRM ownership. Apply migration 028.',
        };
      }

      await supabase
        .from('contacts')
        .update({
          mobile_user_id: userId,
          mobile_registered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactId);
    } else {
      const { error: updateErr } = await supabase
        .from('contacts')
        .update({
          salesperson_id: null,
          mobile_user_id: userId,
          mobile_registered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactId);

      if (updateErr) return { error: updateErr.message };

      await supabase.from('contact_sales_assignments').insert([
        {
          contact_id: contactId,
          sales_agent_id: null,
          previous_sales_agent_id: prevAgentId,
          assignment_type: 'manual',
          changed_by: session.username,
          reason: 'admin_application_users_reassignment',
        },
      ]);
    }

    await supabase.from('contact_activity_logs').insert([
      {
        contact_id: contactId,
        action_type: 'updated',
        body: `Salesperson reassigned (Application Users)${
          prevAgentId ? ` from ${prevAgentId}` : ''
        }${nextAgentId ? ` to ${nextAgentId}` : ' (cleared)'}`,
        performed_by: session.username,
        metadata: {
          previous_sales_agent_id: prevAgentId,
          sales_agent_id: nextAgentId,
          source: 'application_users',
          mobile_user_id: userId,
        },
      },
    ]);

    revalidatePath('/admin/dashboard');
    return { success: true as const, contactId };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Failed to reassign Sales Agent',
    };
  }
}
