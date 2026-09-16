import type { SessionPayload } from '@/lib/auth/session';
import { isSuperAdminSession } from '@/lib/auth/super-admin';
import {
  isSalesPortalActor,
  isOperationsPortalActor,
  sessionHasCrmAccess,
} from '@/lib/auth/require-access';
import { createAdminClient } from '@/utils/supabase/server';
import { resolveCrmVisibilityScope, canAccessCrmOpportunityRow } from '@/lib/crm-visibility';

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminClient>>;

async function canAccessOpportunityForCrmInquiry(
  session: SessionPayload,
  supabase: SupabaseAdmin,
  opportunityId: string
): Promise<boolean> {
  if (isSuperAdminSession(session)) return true;
  if (!sessionHasCrmAccess(session)) return false;

  const { data: opp } = await supabase
    .from('crm_opportunities')
    .select('id, organization_id, salesperson_id, created_by')
    .eq('id', opportunityId)
    .maybeSingle();

  if (!opp) return false;

  const oppOrg = opp.organization_id ? String(opp.organization_id) : null;
  if (session.organizationId && oppOrg && oppOrg !== session.organizationId) {
    // Cross-org: still allow the assigned salesperson / creator (notification deep links).
    const visibility = await resolveCrmVisibilityScope(session);
    const username = String(session.username || '').trim();
    if (
      visibility.salesAgentId &&
      opp.salesperson_id &&
      String(opp.salesperson_id) === visibility.salesAgentId
    ) {
      return true;
    }
    if (username && opp.created_by && String(opp.created_by) === username) {
      return true;
    }
    return false;
  }

  // Null organization_id on the opportunity: allow via visibility ownership.
  if (session.organizationId && !oppOrg) {
    const visibility = await resolveCrmVisibilityScope(session);
    return canAccessCrmOpportunityRow(visibility, {
      salesperson_id: opp.salesperson_id ? String(opp.salesperson_id) : null,
      created_by: opp.created_by ? String(opp.created_by) : null,
    });
  }

  const visibility = await resolveCrmVisibilityScope(session);
  return canAccessCrmOpportunityRow(visibility, {
    salesperson_id: opp.salesperson_id ? String(opp.salesperson_id) : null,
    created_by: opp.created_by ? String(opp.created_by) : null,
  });
}

/** Resolve CRM opportunity linked to a legacy lead (bridge column or contact). */
export async function resolveCrmOpportunityIdForLead(
  supabase: SupabaseAdmin,
  leadId: string
): Promise<string | null> {
  const { data: lead } = await supabase
    .from('leads')
    .select('crm_opportunity_id, contact_id')
    .eq('id', leadId)
    .maybeSingle();

  if (lead?.crm_opportunity_id) return String(lead.crm_opportunity_id);

  if (lead?.contact_id) {
    const { data: opp } = await supabase
      .from('crm_opportunities')
      .select('id')
      .eq('contact_id', lead.contact_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (opp?.id) return String(opp.id);
  }

  const { data: inquiry } = await supabase
    .from('lead_inquiries')
    .select('crm_opportunity_id')
    .eq('lead_id', leadId)
    .not('crm_opportunity_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return inquiry?.crm_opportunity_id ? String(inquiry.crm_opportunity_id) : null;
}

/**
 * Extended lead access for inquiry workflow:
 * legacy sales-agent ownership OR CRM user with access to linked opportunity.
 */
export async function canAccessLeadForInquiry(
  session: SessionPayload | null,
  supabase: SupabaseAdmin,
  leadId: string,
  options?: { crmOpportunityId?: string | null }
): Promise<{ allowed: boolean; error?: string }> {
  if (!session) return { allowed: false, error: 'Unauthorized' };
  if (!leadId) return { allowed: false, error: 'Lead id is required' };

  if (isSuperAdminSession(session) || isOperationsPortalActor(session)) {
    return { allowed: true };
  }

  if (isSalesPortalActor(session)) {
    const { data: salesAgent } = await supabase
      .from('sales_agents')
      .select('id')
      .eq('username', session.username)
      .maybeSingle();

    if (!salesAgent) return { allowed: false, error: 'Unauthorized' };

    const { data: lead } = await supabase
      .from('leads')
      .select('id, sales_agent_id')
      .eq('id', leadId)
      .maybeSingle();

    if (lead && String(lead.sales_agent_id) === String(salesAgent.id)) {
      return { allowed: true };
    }
  }

  const opportunityId =
    options?.crmOpportunityId ||
    (await resolveCrmOpportunityIdForLead(supabase, leadId));

  if (opportunityId && sessionHasCrmAccess(session)) {
    const ok = await canAccessOpportunityForCrmInquiry(session, supabase, opportunityId);
    if (ok) return { allowed: true };
  }

  return { allowed: false, error: 'Unauthorized' };
}
