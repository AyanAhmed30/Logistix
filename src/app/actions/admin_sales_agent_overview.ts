'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import type { InquiryLog, LeadActivityLog } from '@/app/actions/inquiries';
import type { Lead, LeadComment } from '@/app/actions/leads';
import type { SalesAgent } from '@/app/actions/sales_agents';

export type SalesAgentDirectoryRow = {
  id: string;
  name: string;
  username: string | null;
  email: string | null;
  phone_number: string | null;
  total_leads: number;
  total_inquiries: number;
  won_deals: number;
  pending_leads: number;
  customers_count: number;
};

type InquiryConfirmationLite = { status: string };

export type SalesAgentOverviewInquiry = {
  id: string;
  lead_id: string;
  product_name: string;
  description: string;
  status: string;
  sent_to_accounting: boolean;
  sent_to_operations: boolean;
  sent_at: string | null;
  approval_status: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  inquiry_confirmations?: InquiryConfirmationLite[] | null;
};

export type SalesAgentOverviewCustomer = Record<string, unknown> & {
  id: string;
  sales_agent_id: string;
  lead_id: string | null;
  name: string;
  phone_number: string;
  customer_id_formatted: string;
  converted_at: string | null;
  created_at: string;
};

export type LeadInquiryBreakdownRow = {
  lead_id: string;
  lead_name: string;
  lead_id_formatted: string | null;
  lead_status: string;
  lead_converted: boolean;
  inquiry_count: number;
  approved_count: number;
  pending_count: number;
};

export type TimeBucket = { key: string; count: number };

export type SalesAgentOverviewDetail = {
  agent: SalesAgent;
  summary: {
    total_leads: number;
    total_customers_converted: number;
    total_inquiries: number;
    inquiries_sent: number;
    inquiries_approved: number;
    inquiries_pending: number;
    inquiries_rejected: number;
    inquiries_draft: number;
  };
  leads: Lead[];
  customers: SalesAgentOverviewCustomer[];
  inquiries: SalesAgentOverviewInquiry[];
  leadBreakdown: LeadInquiryBreakdownRow[];
  dailyLeads: TimeBucket[];
  dailyInquiriesSent: TimeBucket[];
  monthlyLeads: TimeBucket[];
  monthlyInquiriesSent: TimeBucket[];
  activityLogs: LeadActivityLog[];
  inquiryLogs: InquiryLog[];
  inquiryIdToMeta: Record<string, { lead_id: string; product_name: string }>;
  notes: Array<LeadComment & { lead_name: string; lead_id_formatted: string | null }>;
};

function inquiryIsSent(inq: Pick<SalesAgentOverviewInquiry, 'sent_to_accounting' | 'sent_to_operations' | 'sent_at'>) {
  return !!(inq.sent_at || inq.sent_to_accounting || inq.sent_to_operations);
}

function inquiryIsApproved(inq: SalesAgentOverviewInquiry) {
  if (inq.approval_status === 'approved') return true;
  return (inq.inquiry_confirmations || []).some((c) => c.status === 'approved');
}

function inquiryIsRejected(inq: SalesAgentOverviewInquiry) {
  if (inq.approval_status === 'rejected') return true;
  return (inq.inquiry_confirmations || []).some((c) => c.status === 'rejected');
}

function toDateKey(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toMonthKey(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7);
}

function bump(map: Map<string, number>, key: string | null, by = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + by);
}

function mapToSortedBuckets(map: Map<string, number>, chronological: boolean): TimeBucket[] {
  const arr = [...map.entries()].map(([key, count]) => ({ key, count }));
  arr.sort((a, b) => (chronological ? a.key.localeCompare(b.key) : b.count - a.count));
  return arr;
}

export async function getSalesAgentDirectoryForAdmin() {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }

    const supabase = await createAdminClient();

    const { data: agents, error: agentsErr } = await supabase
      .from('sales_agents')
      .select('id, name, username, email, phone_number, code, created_at, updated_at, permissions')
      .order('name', { ascending: true });

    if (agentsErr) {
      if (agentsErr.message.includes('permissions')) {
        const { data: retry, error: retryErr } = await supabase
          .from('sales_agents')
          .select('id, name, username, email, phone_number, code, created_at, updated_at')
          .order('name', { ascending: true });
        if (retryErr) return { error: retryErr.message };
        return await mergeAgentStats(supabase, retry as SalesAgent[]);
      }
      return { error: agentsErr.message };
    }

    return await mergeAgentStats(supabase, (agents || []) as SalesAgent[]);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}

async function mergeAgentStats(supabase: Awaited<ReturnType<typeof createAdminClient>>, agents: SalesAgent[]) {
  const { data: leadsMin, error: leadsErr } = await supabase
    .from('leads')
    .select('id, sales_agent_id, status');
  if (leadsErr) return { error: leadsErr.message };

  const leadIdToAgent = new Map<string, string>();
  const leadCountByAgent = new Map<string, number>();
  const wonByAgent = new Map<string, number>();
  const pendingByAgent = new Map<string, number>();
  for (const row of leadsMin || []) {
    const aid = row.sales_agent_id as string;
    const lid = row.id as string;
    const status = (row.status as string) || '';
    leadIdToAgent.set(lid, aid);
    leadCountByAgent.set(aid, (leadCountByAgent.get(aid) || 0) + 1);
    if (status === 'Win') {
      wonByAgent.set(aid, (wonByAgent.get(aid) || 0) + 1);
    } else if (status !== 'Lose') {
      pendingByAgent.set(aid, (pendingByAgent.get(aid) || 0) + 1);
    }
  }

  const { data: inqRows, error: inqErr } = await supabase.from('lead_inquiries').select('id, lead_id');
  if (inqErr) return { error: inqErr.message };

  const inquiryCountByAgent = new Map<string, number>();
  for (const row of inqRows || []) {
    const aid = leadIdToAgent.get(row.lead_id as string);
    if (!aid) continue;
    inquiryCountByAgent.set(aid, (inquiryCountByAgent.get(aid) || 0) + 1);
  }

  const { data: custRows, error: custErr } = await supabase
    .from('customers')
    .select('id, sales_agent_id');
  if (custErr) return { error: custErr.message };

  const customerCountByAgent = new Map<string, number>();
  for (const row of custRows || []) {
    const aid = row.sales_agent_id as string | null;
    if (!aid) continue;
    customerCountByAgent.set(aid, (customerCountByAgent.get(aid) || 0) + 1);
  }

  const rows: SalesAgentDirectoryRow[] = agents.map((a) => ({
    id: a.id,
    name: a.name,
    username: a.username,
    email: a.email,
    phone_number: a.phone_number,
    total_leads: leadCountByAgent.get(a.id) || 0,
    total_inquiries: inquiryCountByAgent.get(a.id) || 0,
    won_deals: wonByAgent.get(a.id) || 0,
    pending_leads: pendingByAgent.get(a.id) || 0,
    customers_count: customerCountByAgent.get(a.id) || 0,
  }));

  return { rows };
}

export async function getSalesAgentOverviewDetailForAdmin(salesAgentId: string) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { error: 'Unauthorized' };
    }
    if (!salesAgentId?.trim()) return { error: 'Sales agent id is required' };

    const supabase = await createAdminClient();

    const { data: agentRow, error: agentErr } = await supabase
      .from('sales_agents')
      .select('id, name, username, email, phone_number, code, created_at, updated_at, permissions')
      .eq('id', salesAgentId)
      .maybeSingle();

    if (agentErr) return { error: agentErr.message };
    if (!agentRow) return { error: 'Sales agent not found' };

    const agent = agentRow as SalesAgent;

    const { data: leads, error: leadsErr } = await supabase
      .from('leads')
      .select('*')
      .eq('sales_agent_id', salesAgentId)
      .order('created_at', { ascending: false });

    if (leadsErr) return { error: leadsErr.message };
    const leadList = (leads || []) as Lead[];
    const leadIds = leadList.map((l) => l.id);

    const { data: customers, error: custErr } = await supabase
      .from('customers')
      .select('*')
      .eq('sales_agent_id', salesAgentId)
      .order('converted_at', { ascending: false });

    if (custErr) return { error: custErr.message };

    let inquiries: SalesAgentOverviewInquiry[] = [];
    if (leadIds.length > 0) {
      const { data: inqData, error: inqErr } = await supabase
        .from('lead_inquiries')
        .select(
          `
          id,
          lead_id,
          product_name,
          description,
          status,
          sent_to_accounting,
          sent_to_operations,
          sent_at,
          approval_status,
          approved_at,
          created_at,
          updated_at,
          inquiry_confirmations ( status )
        `
        )
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false });

      if (inqErr) return { error: inqErr.message };
      inquiries = (inqData || []) as SalesAgentOverviewInquiry[];
    }

    const inquiryIds = inquiries.map((i) => i.id);
    const inquiryIdToMeta: Record<string, { lead_id: string; product_name: string }> = {};
    for (const i of inquiries) {
      inquiryIdToMeta[i.id] = { lead_id: i.lead_id, product_name: i.product_name || '' };
    }

    let activityLogs: LeadActivityLog[] = [];
    if (leadIds.length > 0) {
      const { data: act, error: actErr } = await supabase
        .from('lead_activity_logs')
        .select('*')
        .in('lead_id', leadIds)
        .order('performed_at', { ascending: false })
        .limit(4000);

      if (actErr) return { error: actErr.message };
      activityLogs = (act || []) as LeadActivityLog[];
    }

    let notes: Array<LeadComment & { lead_name: string; lead_id_formatted: string | null }> = [];
    if (leadIds.length > 0) {
      const { data: cmt, error: cmtErr } = await supabase
        .from('lead_comments')
        .select('*')
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false });
      if (cmtErr) return { error: cmtErr.message };
      const leadMeta = new Map(leadList.map((l) => [l.id, { name: l.name, fmt: l.lead_id_formatted }]));
      notes = ((cmt || []) as LeadComment[]).map((c) => {
        const meta = leadMeta.get(c.lead_id);
        return {
          ...c,
          lead_name: meta?.name || 'Unknown lead',
          lead_id_formatted: meta?.fmt || null,
        };
      });
    }

    let inquiryLogs: InquiryLog[] = [];
    if (inquiryIds.length > 0) {
      const { data: ilogs, error: ilErr } = await supabase
        .from('inquiry_logs')
        .select('*')
        .in('inquiry_id', inquiryIds)
        .order('performed_at', { ascending: false })
        .limit(4000);

      if (ilErr) return { error: ilErr.message };
      inquiryLogs = (ilogs || []) as InquiryLog[];
    }

    let inquiries_sent = 0;
    let inquiries_approved = 0;
    let inquiries_pending = 0;
    let inquiries_rejected = 0;
    let inquiries_draft = 0;

    for (const inq of inquiries) {
      if (inquiryIsSent(inq)) inquiries_sent += 1;
      if (inquiryIsApproved(inq)) {
        inquiries_approved += 1;
        continue;
      }
      if (inquiryIsRejected(inq)) {
        inquiries_rejected += 1;
        continue;
      }
      if (inquiryIsSent(inq)) inquiries_pending += 1;
      else inquiries_draft += 1;
    }

    const breakdownMap = new Map<string, { approved: number; pending: number; count: number }>();

    for (const l of leadList) {
      breakdownMap.set(l.id, { approved: 0, pending: 0, count: 0 });
    }
    for (const inq of inquiries) {
      const slot = breakdownMap.get(inq.lead_id);
      if (!slot) continue;
      slot.count += 1;
      if (inquiryIsApproved(inq)) slot.approved += 1;
      else slot.pending += 1;
    }

    const leadBreakdown: LeadInquiryBreakdownRow[] = leadList.map((l) => {
      const b = breakdownMap.get(l.id)!;
      return {
        lead_id: l.id,
        lead_name: l.name,
        lead_id_formatted: l.lead_id_formatted,
        lead_status: l.status,
        lead_converted: l.converted,
        inquiry_count: b.count,
        approved_count: b.approved,
        pending_count: b.pending,
      };
    });

    const dailyLeadsMap = new Map<string, number>();
    const monthlyLeadsMap = new Map<string, number>();
    for (const l of leadList) {
      bump(dailyLeadsMap, toDateKey(l.created_at));
      bump(monthlyLeadsMap, toMonthKey(l.created_at));
    }

    const dailyInqMap = new Map<string, number>();
    const monthlyInqMap = new Map<string, number>();
    for (const inq of inquiries) {
      if (!inquiryIsSent(inq)) continue;
      const ts = inq.sent_at || inq.updated_at;
      bump(dailyInqMap, toDateKey(ts));
      bump(monthlyInqMap, toMonthKey(ts));
    }

    const overview: SalesAgentOverviewDetail = {
      agent,
      summary: {
        total_leads: leadList.length,
        total_customers_converted: (customers || []).length,
        total_inquiries: inquiries.length,
        inquiries_sent,
        inquiries_approved,
        inquiries_pending,
        inquiries_rejected,
        inquiries_draft,
      },
      leads: leadList,
      customers: (customers || []) as SalesAgentOverviewCustomer[],
      inquiries,
      leadBreakdown,
      dailyLeads: mapToSortedBuckets(dailyLeadsMap, true),
      dailyInquiriesSent: mapToSortedBuckets(dailyInqMap, true),
      monthlyLeads: mapToSortedBuckets(monthlyLeadsMap, true),
      monthlyInquiriesSent: mapToSortedBuckets(monthlyInqMap, true),
      activityLogs,
      inquiryLogs,
      inquiryIdToMeta,
      notes,
    };

    return { overview };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}
